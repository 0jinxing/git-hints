/**
 * Providers 注册模块 - 统一入口
 * 负责所有 VSCode Providers 的注册和管理
 */

import * as vscode from 'vscode';
import { registerTerminalLinkProvider } from './terminal-link-provider';

/**
 * 注册所有 Providers
 */
export const registerProviders = (
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
): vscode.Disposable[] => {
  const terminalLinkProvider = registerTerminalLinkProvider(workspaceFolders);

  const providers: vscode.Disposable[] = [];
  if (terminalLinkProvider) {
    providers.push(terminalLinkProvider);
  }

  return providers;
};