/**
 * Git Hints 扩展入口
 * Composition Root - 组装所有服务
 */

import * as vscode from 'vscode';
import { GitExecutor } from './infrastructure/git-executor';
import { GitService } from './services/git';
import { CacheService } from './services/cache';
import { createDecorationManager } from './services/decoration';
import { CommitTreeProvider, FileHistoryTreeProvider } from './ui/tree-provider';
import { registerCommands } from './ui/commands';
import { shouldIgnoreFile, debounce } from './utils';

// ==================== 类型定义 ====================

type AppState = {
  isEnabled: boolean;
  lastCurrentLine: Map<string, number>;
};

// ==================== 辅助函数 ====================

/**
 * 检查编辑器是否应该被处理
 */
const shouldProcessEditor = (editor: vscode.TextEditor): boolean => {
  let filePath: string;
  if (editor.document.uri.scheme === 'git') {
    const query = JSON.parse(editor.document.uri.query);
    filePath = query.path;
  } else {
    filePath = editor.document.uri.fsPath;
  }

  const fileUri = vscode.Uri.file(filePath);
  if (!vscode.workspace.getWorkspaceFolder(fileUri)) {
    return false;
  }

  if (shouldIgnoreFile(filePath) || editor.document.languageId === 'Log') {
    return false;
  }

  return true;
};

/**
 * 获取性能配置
 */
const getPerformanceConfig = () => {
  const config = vscode.workspace.getConfiguration('gitHints.performance');
  return {
    debounceDelay: config.get<number>('debounceDelay') || 300,
    cacheTTL: config.get<number>('cacheTTL') || 5000,
    maxFileHistoryCache: config.get<number>('maxFileHistoryCache') || 50,
    maxDisplayCommits: config.get<number>('maxDisplayCommits') || 100
  };
};

// ==================== 扩展激活 ====================

export function activate(context: vscode.ExtensionContext) {
  // 读取配置
  const perfConfig = getPerformanceConfig();

  // 创建基础设施
  const gitExecutor = new GitExecutor();
  const cacheService = new CacheService();
  cacheService.updateConfig({ cacheTTL: perfConfig.cacheTTL });

  // 创建服务
  const gitService = new GitService(gitExecutor, cacheService);
  const decorationManager = createDecorationManager();

  // 创建 TreeView
  const commitTreeProvider = new CommitTreeProvider();
  const commitTreeView = vscode.window.createTreeView('gitHintsCommitExplorer', {
    treeDataProvider: commitTreeProvider,
    showCollapseAll: true
  });

  const fileHistoryTreeProvider = new FileHistoryTreeProvider();
  vscode.window.createTreeView('gitHintsFileHistoryExplorer', {
    treeDataProvider: fileHistoryTreeProvider,
    showCollapseAll: true
  });

  // 注册 Terminal Link Provider
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const { GitCommitLinkProvider } = require('./ui/terminal-link');
    const linkProvider = new GitCommitLinkProvider(workspaceFolders[0].uri.fsPath);
    context.subscriptions.push(vscode.window.registerTerminalLinkProvider(linkProvider));
  }

  // 应用状态
  const state: AppState = {
    isEnabled: true,
    lastCurrentLine: new Map()
  };

  // 定期缓存清理
  const cacheCleanupInterval = setInterval(() => {
    cacheService.clearExpiredCache();
  }, 30000);

  // 注册命令
  registerCommands(context, {
    gitService,
    commitTreeProvider,
    commitTreeView,
    fileHistoryTreeProvider
  });

  // ==================== 编辑器事件处理 ====================

  /**
   * 更新装饰器
   */
  const updateDecorations = async (editor: vscode.TextEditor, currentLine?: number): Promise<void> => {
    if (!state.isEnabled) {
      decorationManager.clearDecorations(editor);
      return;
    }

    if (!shouldProcessEditor(editor)) {
      return;
    }

    let filePath: string;
    if (editor.document.uri.scheme === 'git') {
      const query = JSON.parse(editor.document.uri.query);
      filePath = query.path;
    } else {
      filePath = editor.document.uri.fsPath;
    }

    let lineToUse = currentLine;
    if (lineToUse === undefined) {
      const lastLine = state.lastCurrentLine.get(filePath);
      if (lastLine === undefined) {
        return;
      }
      lineToUse = lastLine;
    } else {
      state.lastCurrentLine.set(filePath, lineToUse);
    }

    const blameInfo = await gitService.getBlameInfo(filePath);
    if (blameInfo) {
      decorationManager.updateDecorations(editor, blameInfo, lineToUse);
    }
  };

  /**
   * 更新所有可见编辑器
   */
  const updateAllVisibleEditors = (): void => {
    vscode.window.visibleTextEditors
      .filter(editor => editor.document.languageId !== 'Log')
      .forEach(editor => {
        const currentLine = editor.selection.active.line;
        updateDecorations(editor, currentLine);
      });
  };

  // 防抖更新函数
  const debouncedDocumentUpdate = debounce((editor: vscode.TextEditor) => {
    const filePath = editor.document.uri.fsPath;
    cacheService.clearBlameCache(filePath);
    gitService.clearCache(filePath);
    updateDecorations(editor, editor.selection.active.line);
  }, perfConfig.debounceDelay);

  const debouncedSelectionUpdate = debounce((editor: vscode.TextEditor, currentLine: number) => {
    const filePath = editor.document.uri.fsPath;
    const lastLine = state.lastCurrentLine.get(filePath);
    if (lastLine !== currentLine) {
      updateDecorations(editor, currentLine);
    }
  }, perfConfig.debounceDelay);

  // 注册编辑器事件
  context.subscriptions.push(
    // 切换活动编辑器
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const filePath = editor.document.uri.fsPath;
        cacheService.clearBlameCache(filePath);
        gitService.clearCache(filePath);
        updateDecorations(editor, editor.selection.active.line);
      }
    }),

    // 文档变化
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        debouncedDocumentUpdate(editor);
      }
    }),

    // 配置变化
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('gitHints')) {
        const newConfig = getPerformanceConfig();
        cacheService.updateConfig({ cacheTTL: newConfig.cacheTTL });
        updateAllVisibleEditors();
      }
    }),

    // 光标位置变化
    vscode.window.onDidChangeTextEditorSelection(event => {
      debouncedSelectionUpdate(event.textEditor, event.textEditor.selection.active.line);
    }),

    // 保存文档
    vscode.workspace.onDidSaveTextDocument(document => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        const filePath = document.uri.fsPath;
        cacheService.clearBlameCache(filePath);
        gitService.clearCache(filePath);
        updateDecorations(editor);
      }
    })
  );

  // 监听 Git 仓库变更
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (gitExtension) {
    const git = gitExtension.getAPI(1);

    git.repositories.forEach((repo: any) => {
      repo.state.onDidChange(() => {
        cacheService.clearExpiredCache();
        gitService.clearCache();
        updateAllVisibleEditors();
      });
    });

    git.onDidOpenRepository((repo: any) => {
      repo.state.onDidChange(() => {
        cacheService.clearExpiredCache();
        gitService.clearCache();
        updateAllVisibleEditors();
      });
    });
  }

  // 初始化编辑器
  updateAllVisibleEditors();

  // 清理订阅
  context.subscriptions.push({
    dispose: () => {
      clearInterval(cacheCleanupInterval);
      commitTreeProvider.clear();
      decorationManager.dispose();
    }
  });
}

export function deactivate() { }
