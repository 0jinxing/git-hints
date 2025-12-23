/**
 * 导航命令模块
 * 负责文件历史导航相关的命令
 */

import * as vscode from 'vscode';
import {
  navigateToPreviousVersion,
  navigateToNextVersion,
  getFileHistoryState,
  getCurrentCommitHash,
  getCurrentIndex,
} from '../core/file-history';
import { ErrorHandler } from '../utils';
import { ExtensionContext } from '../core/types';

/**
 * 更新导航按钮状态
 */
export const updateNavigationContext = (editor: vscode.TextEditor | undefined): void => {
  if (!editor) {
    vscode.commands.executeCommand('setContext', 'git-hints.canNavigatePrevious', false);
    vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', false);
    return;
  }

  let filePath: string;
  if (editor.document.uri.scheme === 'git') {
    const query = JSON.parse(editor.document.uri.query);
    filePath = query.path;
  } else {
    filePath = editor.document.uri.fsPath;
  }

  const state = getFileHistoryState(filePath);
  const currentCommitHash = getCurrentCommitHash(editor);

  if (!state) {
    vscode.commands.executeCommand('setContext', 'git-hints.canNavigatePrevious', true);
    vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', false);
  } else {
    const currentIndex = getCurrentIndex(state, currentCommitHash);
    vscode.commands.executeCommand(
      'setContext',
      'git-hints.canNavigatePrevious',
      currentIndex + 1 < state.commits.length
    );
    vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', currentIndex >= 0);
  }
};

/**
 * 文件历史导航：上一个版本（更旧）
 */
export const createPreviousVersionCommand = (): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.previousVersion', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('没有打开的编辑器');
      return;
    }

    try {
      await navigateToPreviousVersion(editor);
      updateNavigationContext(vscode.window.activeTextEditor);
    } catch (error) {
      ErrorHandler.handle(error, '导航到上一个版本');
    }
  });
};

/**
 * 文件历史导航：下一个版本（更新）
 */
export const createNextVersionCommand = (): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.nextVersion', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('没有打开的编辑器');
      return;
    }

    try {
      await navigateToNextVersion(editor);
      updateNavigationContext(vscode.window.activeTextEditor);
    } catch (error) {
      ErrorHandler.handle(error, '导航到下一个版本');
    }
  });
};

/**
 * 显示文件历史列表
 */
export const createShowFileHistoryCommand = (context: ExtensionContext): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.showFileHistory', async () => {
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

      // 设置文件并加载历史到树视图
      context.fileHistoryTreeProvider.setFile(filePath, workspaceFolder.uri.fsPath);
      await context.fileHistoryTreeProvider.loadFileHistory();

      // 聚焦到文件历史视图
      await vscode.commands.executeCommand('gitHintsFileHistoryExplorer.focus');

      vscode.window.showInformationMessage(`已加载文件历史: ${filePath}`);
    } catch (error) {
      ErrorHandler.handle(error, '显示文件历史列表');
    }
  });
};

/**
 * 手动输入提交ID查看提交详情 - 支持终端联动
 */
export const createShowCommitFromInputCommand = (): vscode.Disposable => {
  return vscode.commands.registerCommand('git-hints.showCommitFromInput', async () => {
    try {
      // 尝试从剪贴板获取 commit hash
      let commitId = '';
      try {
        const clipboardText = await vscode.env.clipboard.readText();
        // 检查剪贴板内容是否像 commit hash (7-40 位十六进制)
        const hashMatch = clipboardText.trim().match(/^([0-9a-f]{7,40})$/i);
        if (hashMatch) {
          commitId = hashMatch[1];
        }
      } catch (clipboardError) {
        console.log(clipboardError);
        // 忽略剪贴板错误
      }

      // 如果剪贴板中没有有效的 commit hash，提示用户输入
      if (!commitId) {
        const input = await vscode.window.showInputBox({
          placeHolder: '请输入提交 hash (如: a1b2c3d)',
          prompt: '输入要查看的 Git 提交 hash',
          value: commitId, // 如果从剪贴板获取到了，作为默认值
        });

        if (!input) {
          return; // 用户取消输入
        }

        commitId = input.trim();
      }

      // 验证 commit hash 格式
      if (!/^[0-9a-f]{7,40}$/i.test(commitId)) {
        vscode.window.showErrorMessage('无效的提交 hash 格式');
        return;
      }

      // 获取当前工作区路径
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('没有打开的工作区');
        return;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;

      // 验证 commit 是否存在
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // 获取提交信息用于验证
        await execAsync(`git show --format="%s" --no-patch ${commitId}`, {
          cwd: workspacePath,
          timeout: 10000,
        });

        // 调用 showCommitDetails 显示提交详情
        await vscode.commands.executeCommand('git-hints.showCommitDetails', commitId);
      } catch (gitError: unknown) {
        if (gitError instanceof Error && (gitError.message.includes('not found') || (gitError as any).code === 128)) {
          vscode.window.showErrorMessage(`提交 ${commitId} 不存在`);
        } else if (gitError instanceof Error) {
          vscode.window.showErrorMessage(`Git 错误: ${gitError.message}`);
        } else {
          vscode.window.showErrorMessage('未知的 Git 错误');
        }
        return;
      }
    } catch (error: unknown) {
      ErrorHandler.handle(error, '从输入显示提交详情');
    }
  });
};

/**
 * 注册所有导航命令
 */
export const registerNavigationCommands = (context: ExtensionContext): vscode.Disposable[] => {
  return [
    createPreviousVersionCommand(),
    createNextVersionCommand(),
    createShowFileHistoryCommand(context),
    createShowCommitFromInputCommand(),
  ];
};