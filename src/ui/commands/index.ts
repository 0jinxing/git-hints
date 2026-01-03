import * as vscode from 'vscode';
import { GitService } from '../../services/git';
import { CommitTreeProvider, FileHistoryTreeProvider, CommitFileChange, CommitFileItem } from '../tree-provider';

/**
 * 创建 Git URI
 */
function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  return gitExtension?.exports.getAPI(1).toGitUri(uri, ref);
}

export interface CommandHandlerOptions {
  gitService: GitService;
  commitTreeProvider: CommitTreeProvider;
  commitTreeView: vscode.TreeView<any>;
  fileHistoryTreeProvider: FileHistoryTreeProvider;
}

/**
 * 注册所有命令
 */
export const registerCommands = (
  context: vscode.ExtensionContext,
  options: CommandHandlerOptions
): void => {
  // 显示提交详情
  const showCommitDetailsCommand = vscode.commands.registerCommand(
    'git-hints.showCommitDetails',
    async (commitId: string) => {
      if (!commitId) {
        vscode.window.showErrorMessage('无法获取提交ID');
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const filePath = editor.document.uri.fsPath;
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

      try {
        const commit = await repository.getCommit(commitId);
        options.commitTreeProvider.setCommit(commitId, commit.message, repository.rootUri.fsPath);
        await options.commitTreeProvider.loadCommitFiles(options.gitService);

        await new Promise(resolve => setTimeout(resolve, 200));

        const fileChanges = options.commitTreeProvider.getFileChanges();
        if (fileChanges.length > 0) {
          await options.commitTreeView.reveal(new CommitFileItem(fileChanges[0]), {
            focus: true,
            expand: true,
            select: true
          });
        }

        vscode.window.showInformationMessage(`提交 ${commitId.substring(0, 7)} 的文件已显示`);
      } catch (error) {
        vscode.window.showErrorMessage(`加载提交详情失败: ${error}`);
      }
    }
  );

  // 打开特定提交的文件
  const openFileAtCommitCommand = vscode.commands.registerCommand(
    'git-hints.openFileAtCommit',
    async (change: CommitFileChange) => {
      if (!change) {
        vscode.window.showErrorMessage('无法获取文件变更信息');
        return;
      }

      try {
        const commitId = change.commitHash || options.commitTreeProvider.getCurrentCommitInfo().commitId;
        if (!commitId) {
          vscode.window.showErrorMessage('无法获取提交ID');
          return;
        }

        const fileUri = change.uri;
        const relativePath = vscode.workspace.asRelativePath(fileUri.fsPath);
        const status = change.status;

        switch (status) {
          case 'A':
            await vscode.commands.executeCommand('vscode.open', toGitUri(fileUri, commitId));
            break;
          case 'D':
            await vscode.commands.executeCommand('vscode.open', toGitUri(fileUri, `${commitId}~1`));
            break;
          case 'R': {
            const oldUri = change.originalUri || fileUri;
            const oldRelativePath = vscode.workspace.asRelativePath(oldUri);
            const title = `${oldRelativePath} → ${relativePath}`;
            await vscode.commands.executeCommand('vscode.diff',
              toGitUri(oldUri, `${commitId}~1`),
              toGitUri(fileUri, commitId),
              title);
            break;
          }
          case 'M':
          default:
            await vscode.commands.executeCommand('vscode.diff',
              toGitUri(fileUri, `${commitId}~1`),
              toGitUri(fileUri, commitId),
              `${relativePath} (${commitId.substring(0, 7)}^ ↔ ${commitId.substring(0, 7)})`);
            break;
        }
      } catch (error) {
        vscode.window.showErrorMessage(`打开文件对比失败: ${error}`);
      }
    }
  );

  // 显示文件历史
  const showFileHistoryCommand = vscode.commands.registerCommand(
    'git-hints.showFileHistory',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('没有打开的编辑器');
        return;
      }

      try {
        const filePath = editor.document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('文件不在工作区中');
          return;
        }

        options.fileHistoryTreeProvider.setFile(filePath);

        const commits = await options.gitService.getFileHistory(filePath, workspaceFolder.uri.fsPath);
        await options.fileHistoryTreeProvider.loadFileHistory(commits);

        await vscode.commands.executeCommand('gitHintsFileHistoryExplorer.focus');
      } catch (error) {
        vscode.window.showErrorMessage(`加载文件历史失败: ${error}`);
      }
    }
  );

  context.subscriptions.push(
    showCommitDetailsCommand,
    openFileAtCommitCommand,
    showFileHistoryCommand
  );
};
