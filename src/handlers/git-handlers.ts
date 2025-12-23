/**
 * Git 事件处理器模块
 * 负责 Git 相关的事件处理
 */

import * as vscode from 'vscode';
import { clearExpiredCache } from '../core/git';
import { BlameManager, DecorationManager } from '../core/manager-types';

/**
 * 事件处理器上下文接口
 */
export interface EventHandlersContext {
  blameManager: BlameManager;
  decorationManager: DecorationManager;
  state: {
    isEnabled: boolean;
    lastCurrentLine: Map<string, number>;
  };
  debouncedDocumentUpdate: (editor: vscode.TextEditor) => void;
  debouncedSelectionUpdate: (editor: vscode.TextEditor, currentLine: number) => void;
  updateDecorations: (editor: vscode.TextEditor, currentLine?: number) => Promise<void>;
  updateAllVisibleEditors: () => void;
  updateNavigationContext: (editor: vscode.TextEditor | undefined) => void;
}

/**
 * 监听 Git 仓库变更
 */
export const createGitRepositoryHandler = (context: EventHandlersContext): vscode.Disposable | undefined => {
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  if (!gitExtension) {
    return undefined;
  }

  const git = gitExtension.getAPI(1);
  const disposables: vscode.Disposable[] = [];

  // 监听所有仓库的变更
  git.repositories.forEach((repo: any) => {
    const disposable = repo.state.onDidChange(() => {
      // 清除所有缓存并更新所有可见编辑器
      clearExpiredCache();
      context.blameManager.clearCache();
      context.updateAllVisibleEditors();
    });
    disposables.push(disposable);
  });

  // 监听新仓库添加
  const openRepoDisposable = git.onDidOpenRepository((repo: any) => {
    const disposable = repo.state.onDidChange(() => {
      clearExpiredCache();
      context.blameManager.clearCache();
      context.updateAllVisibleEditors();
    });
    disposables.push(disposable);
  });
  disposables.push(openRepoDisposable);

  // 返回一个组合的 disposable
  return vscode.Disposable.from(...disposables);
};

/**
 * 注册 Git 相关事件处理器
 */
export const registerGitHandlers = (context: EventHandlersContext): vscode.Disposable[] => {
  const gitHandler = createGitRepositoryHandler(context);
  return gitHandler ? [gitHandler] : [];
};