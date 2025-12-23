/**
 * 编辑器事件处理器模块
 * 负责编辑器相关的事件处理
 */

import * as vscode from 'vscode';
import { clearFileCache } from '../core/git';
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
 * 监听编辑器激活变化
 */
export const createActiveEditorHandler = (context: EventHandlersContext): vscode.Disposable => {
  return vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      // 切换文件时，清除旧文件缓存并重新获取
      const filePath = editor.document.uri.fsPath;
      clearFileCache(filePath);
      context.blameManager.clearCache(filePath);
      const currentLine = getCurrentLine(editor);
      context.updateDecorations(editor, currentLine);
    }
    context.updateNavigationContext(editor);
  });
};

/**
 * 监听文档变化
 */
export const createDocumentChangeHandler = (context: EventHandlersContext): vscode.Disposable => {
  return vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      context.debouncedDocumentUpdate(editor);
    }
  });
};

/**
 * 监听配置变化
 */
export const createConfigurationChangeHandler = (context: EventHandlersContext): vscode.Disposable => {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('gitHints')) {
      context.updateAllVisibleEditors();
    }
  });
};

/**
 * 监听光标位置变化
 */
export const createSelectionChangeHandler = (context: EventHandlersContext): vscode.Disposable => {
  return vscode.window.onDidChangeTextEditorSelection(event => {
    const editor = event.textEditor;
    const currentLine = editor.selection.active.line;
    context.debouncedSelectionUpdate(editor, currentLine);
  });
};

/**
 * 监听保存事件
 */
export const createSaveHandler = (context: EventHandlersContext): vscode.Disposable => {
  return vscode.workspace.onDidSaveTextDocument(document => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      const filePath = document.uri.fsPath;
      clearFileCache(filePath);
      context.blameManager.clearCache(filePath);
      context.updateDecorations(editor);
    }
  });
};

/**
 * 注册编辑器相关事件处理器
 */
export const registerEditorHandlers = (context: EventHandlersContext): vscode.Disposable[] => {
  return [
    createActiveEditorHandler(context),
    createDocumentChangeHandler(context),
    createConfigurationChangeHandler(context),
    createSelectionChangeHandler(context),
    createSaveHandler(context),
  ];
};

// 辅助函数
const getCurrentLine = (editor: vscode.TextEditor): number | undefined => {
  return editor.selection.active.line;
};