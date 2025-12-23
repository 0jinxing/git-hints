/**
 * 核心命令模块
 * 负责 Git Hints 的核心功能命令
 */

import * as vscode from 'vscode';
import { CommitFileChange, CommitFileItem } from '../providers/tree-provider';
import { toGitUri, ErrorHandler } from '../utils';
import { clearFileCache, clearExpiredCache } from '../core/git';
import { updateDecorations, updateAllVisibleEditors } from '../core/editor-manager';
import { ExtensionContext } from '../core/types';

/**
 * 切换 Git Hints 显示状态
 */
export const createToggleCommand = (context: ExtensionContext): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.toggleGitHints', () => {
    context.state.isEnabled = !context.state.isEnabled;
    updateAllVisibleEditors(context);
    vscode.window.showInformationMessage(
      `Git Hints ${context.state.isEnabled ? '已启用' : '已禁用'}`
    );
  });
};

/**
 * 复制提交 ID 到剪贴板
 */
export const createCopyCommitIdCommand = (): vscode.Disposable => {
  return vscode.commands.registerCommand(
    'git-hints.copyCommitId',
    async (commitId: string) => {
      if (!commitId) {
        vscode.window.showErrorMessage('无法获取提交ID');
        return;
      }

      try {
        await vscode.env.clipboard.writeText(commitId);
        vscode.window.showInformationMessage(`Copied!`);
      } catch (error) {
        ErrorHandler.handle(error, '复制提交ID');
      }
    }
  );
};

/**
 * 显示提交详情
 */
export const createShowCommitDetailsCommand = (context: ExtensionContext): vscode.Disposable => {
  return vscode.commands.registerCommand(
    'git-hints.showCommitDetails',
    async (commitId: string) => {
      if (!commitId) {
        vscode.window.showErrorMessage('无法获取提交ID');
        return;
      }

      try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }

        const filePath = editor.document.uri.fsPath;

        // 使用 Git 扩展 API
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) {
          vscode.window.showErrorMessage('Git 扩展未安装');
          return;
        }

        const git = gitExtension.getAPI(1);
        const repository = git.repositories.find((repo: any) =>
          filePath.startsWith(repo.rootUri.fsPath)
        );

        if (!repository) {
          vscode.window.showErrorMessage('未找到 Git 仓库');
          return;
        }

        // 获取 commit 对象
        const commit = await repository.getCommit(commitId);

        // 设置 TreeView 的提交信息
        context.commitTreeProvider.setCommit(commitId, commit.message, repository.rootUri.fsPath);
        await context.commitTreeProvider.loadCommitFiles();

        // 等待 TreeView 刷新完成
        await new Promise(resolve => setTimeout(resolve, 200));

        // 自动展开并聚焦到 Commit Files TreeView
        const fileChanges = context.commitTreeProvider.getFileChanges();
        if (fileChanges.length > 0) {
          const firstFile = fileChanges[0];
          const firstItem = new CommitFileItem(firstFile);
          await context.commitTreeView.reveal(firstItem, {
            focus: true,
            expand: true,
            select: true,
          });
        }

        vscode.window.showInformationMessage(
          `提交 ${commitId.substring(0, 7)} 的文件已显示，可直接点击查看变更`
        );
      } catch (error) {
        ErrorHandler.handle(error, '显示提交详情');
      }
    }
  );
};

/**
 * 打开特定提交的文件
 */
export const createOpenFileAtCommitCommand = (context: ExtensionContext): vscode.Disposable => {
  return vscode.commands.registerCommand(
    'git-hints.openFileAtCommit',
    async (changeOrCommit: CommitFileChange | any) => {
      if (!changeOrCommit) {
        vscode.window.showErrorMessage('无法获取文件变更信息');
        return;
      }

      try {
        // 检查是否有 commitHash 字段（来自文件历史视图）
        if ((changeOrCommit as any).commitHash) {
          // 文件历史视图的参数格式
          const { commitHash, uri, path, status } = changeOrCommit;
          const fileUri = uri || vscode.Uri.file(path);
          const fileName = path.split(/[\\/]/).pop() || 'unknown';

          // 根据文件状态执行不同操作
          switch (status) {
            case 'A': // ADDED - 新增的文件，直接打开
              {
                const gitUri = toGitUri(fileUri, commitHash);
                await vscode.commands.executeCommand('vscode.open', gitUri);
              }
              break;

            case 'D': // DELETED - 删除的文件，显示删除前的内容
              {
                const gitUri = toGitUri(fileUri, `${commitHash}~1`);
                await vscode.commands.executeCommand('vscode.open', gitUri);
              }
              break;

            case 'R': // RENAMED - 重命名的文件，显示重命名前后的对比
              {
                // 注意：文件历史中的重命名可能需要特殊处理
                const leftUri = toGitUri(fileUri, `${commitHash}~1`);
                const rightUri = toGitUri(fileUri, commitHash);
                const title = `${fileName} (重命名: ${commitHash.substring(0, 7)}^ ↔ ${commitHash.substring(0, 7)})`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
              }
              break;

            case 'M': // MODIFIED - 修改的文件，显示对比
            default:
              {
                const leftUri = toGitUri(fileUri, `${commitHash}~1`);
                const rightUri = toGitUri(fileUri, commitHash);
                const title = `${fileName} (${commitHash.substring(0, 7)}^ ↔ ${commitHash.substring(0, 7)})`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
              }
              break;
          }
        } else {
          // Commit Files 视图的参数格式（CommitFileChange）
          const change = changeOrCommit as CommitFileChange;
          const commitInfo = context.commitTreeProvider.getCurrentCommitInfo();
          const commitId = commitInfo.commitId;
          const fileUri = change.uri;
          const relativePath = vscode.workspace.asRelativePath(fileUri.fsPath);
          const status = change.status;

          // 根据文件状态执行不同操作
          switch (status) {
            case 'A': // ADDED - 新增的文件，直接打开
              {
                const gitUri = toGitUri(fileUri, commitId);
                await vscode.commands.executeCommand('vscode.open', gitUri);
              }
              break;

            case 'D': // DELETED - 删除的文件，显示删除前的内容
              {
                const gitUri = toGitUri(fileUri, `${commitId}~1`);
                await vscode.commands.executeCommand('vscode.open', gitUri);
              }
              break;

            case 'R': // RENAMED - 重命名的文件，显示重命名前后的对比
              {
                const oldUri = change.originalUri || fileUri;
                const leftUri = toGitUri(oldUri, `${commitId}~1`);
                const rightUri = toGitUri(fileUri, commitId);

                const oldRelativePath = vscode.workspace.asRelativePath(oldUri);
                const title = `${oldRelativePath} → ${relativePath}`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
              }
              break;

            case 'M': // MODIFIED - 修改的文件，显示对比
            default:
              {
                const leftUri = toGitUri(fileUri, `${commitId}~1`);
                const rightUri = toGitUri(fileUri, commitId);

                const title = `${relativePath} (${commitId.substring(0, 7)}^ ↔ ${commitId.substring(0, 7)})`;
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
              }
              break;
          }
        }
      } catch (error) {
        ErrorHandler.handle(error, '打开文件对比');
      }
    }
  );
};

/**
 * 手动刷新 Git Hints
 */
export const createRefreshCommand = (context: ExtensionContext): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.refreshGitHints', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      clearFileCache(filePath);
      context.blameManager.clearCache(filePath);
      await updateDecorations(editor, context);
      vscode.window.showInformationMessage('Git Hints 已刷新');
    } else {
      clearExpiredCache();
      context.blameManager.clearCache();
      updateAllVisibleEditors(context);
      vscode.window.showInformationMessage('Git Hints 已全部刷新');
    }
  });
};

/**
 * 注册核心命令
 */
export const registerCoreCommands = (context: ExtensionContext): vscode.Disposable[] => {
  return [
    createToggleCommand(context),
    createCopyCommitIdCommand(),
    createShowCommitDetailsCommand(context),
    createOpenFileAtCommitCommand(context),
    createRefreshCommand(context),
  ];
};