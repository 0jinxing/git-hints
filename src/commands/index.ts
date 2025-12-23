/**
 * 命令注册模块 - 统一入口
 * 负责所有 VSCode 命令的注册和管理
 */

import * as vscode from 'vscode';
import { registerCoreCommands } from './core-commands';
import { registerNavigationCommands } from './navigation-commands';
import { ExtensionContext } from '../core/types';

/**
 * 注册所有命令
 */
export const registerCommands = (context: ExtensionContext): vscode.Disposable[] => {
  const coreCommands = registerCoreCommands(context);
  const navigationCommands = registerNavigationCommands(context);

  return [...coreCommands, ...navigationCommands];
};