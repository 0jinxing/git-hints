/**
 * 事件处理器注册模块 - 统一入口
 * 负责所有 VSCode 事件处理器的注册和管理
 */

import * as vscode from 'vscode';
import { registerEditorHandlers } from './editor-handlers';
import { registerGitHandlers } from './git-handlers';

/**
 * 事件处理器上下文接口
 */
export interface EventHandlersContext {
  blameManager: any;
  decorationManager: any;
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
 * 注册所有事件处理器
 */
export const registerEventHandlers = (context: EventHandlersContext): vscode.Disposable[] => {
  const editorHandlers = registerEditorHandlers(context);
  const gitHandlers = registerGitHandlers(context);

  return [...editorHandlers, ...gitHandlers];
};