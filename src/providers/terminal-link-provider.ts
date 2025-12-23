/**
 * 终端链接提供者模块
 * 负责终端中 Git commit hash 的点击功能
 */

import * as vscode from 'vscode';

/**
 * Git Commit 链接提供者
 * 用于在终端中检测和点击 commit hash
 */
export class GitCommitLinkProvider implements vscode.TerminalLinkProvider {
  private readonly _commitHashes = new Map<vscode.TerminalLink, string>();

  constructor(private _workspaceRoot: string) {}

  /**
   * 提供链接的方法 - 检测 commit hash
   */
  provideTerminalLinks(
    context: vscode.TerminalLinkContext
  ): vscode.TerminalLink[] {
    const line = context.line;
    const links: vscode.TerminalLink[] = [];

    // 匹配 Git commit hash 格式 (7-40 位十六进制)
    const commitRegex = /\b([0-9a-f]{7,40})\b/gi;
    let match;

    while ((match = commitRegex.exec(line)) !== null) {
      const commitHash = match[1];
      const startIndex = match.index;
      const length = match[0].length;

      // 创建链接
      const link: vscode.TerminalLink = {
        startIndex,
        length,
        tooltip: `点击查看提交 ${commitHash.substring(0, 7)} 的详情`,
      };

      // 存储对应的 commit hash
      this._commitHashes.set(link, commitHash);
      links.push(link);
    }

    return links;
  }

  /**
   * 处理链接点击
   */
  handleTerminalLink(link: vscode.TerminalLink): vscode.ProviderResult<void> {
    const commitHash = this._commitHashes.get(link);
    if (!commitHash) {
      return;
    }

    // 先将 commit hash 写入剪贴板，然后执行命令
    return vscode.env.clipboard.writeText(commitHash).then(() => {
      return vscode.commands.executeCommand('git-hints.showCommitFromInput');
    });
  }
}

/**
 * 注册终端链接提供者
 */
export const registerTerminalLinkProvider = (
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): vscode.Disposable | undefined => {
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const linkProvider = new GitCommitLinkProvider(workspaceRoot);

  return vscode.window.registerTerminalLinkProvider(linkProvider);
};