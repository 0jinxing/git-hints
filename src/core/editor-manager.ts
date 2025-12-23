/**
 * 编辑器管理模块
 * 负责编辑器装饰器的更新和管理
 */

import * as vscode from 'vscode';
import { shouldIgnoreFile, ErrorHandler, debounce } from '../utils';
import { BlameManager, DecorationManager } from './manager-types';
import { clearFileCache } from './git';

export interface EditorManagerContext {
  blameManager: BlameManager;
  decorationManager: DecorationManager;
  state: {
    isEnabled: boolean;
    lastCurrentLine: Map<string, number>;
  };
}

/**
 * 检查编辑器是否应该被处理
 */
export const shouldProcessEditor = (editor: vscode.TextEditor): boolean => {
  // 获取真实文件路径
  let filePath: string;
  if (editor.document.uri.scheme === 'git') {
    const query = JSON.parse(editor.document.uri.query);
    filePath = query.path;
  } else {
    filePath = editor.document.uri.fsPath;
  }

  // 检查文件是否存在于工作区
  const fileUri = vscode.Uri.file(filePath);
  if (!vscode.workspace.getWorkspaceFolder(fileUri)) {
    return false;
  }

  // 忽略特殊文件和目录
  if (shouldIgnoreFile(filePath) || editor.document.languageId === 'Log') {
    return false;
  }

  return true;
};

/**
 * 获取当前行号
 */
export const getCurrentLine = (editor: vscode.TextEditor): number | undefined => {
  return editor.selection.active.line;
};

/**
 * 更新装饰器
 */
export const updateDecorations = async (
  editor: vscode.TextEditor,
  context: EditorManagerContext,
  currentLine?: number
): Promise<void> => {
  if (!context.state.isEnabled) {
    context.decorationManager.clearDecorations(editor);
    return;
  }

  try {
    if (!shouldProcessEditor(editor)) {
      return;
    }

    // 获取真实文件路径
    let filePath: string;
    if (editor.document.uri.scheme === 'git') {
      const query = JSON.parse(editor.document.uri.query);
      filePath = query.path;
    } else {
      filePath = editor.document.uri.fsPath;
    }

    // 如果没有传入 currentLine，尝试使用上一次的值
    let lineToUse = currentLine;
    if (lineToUse === undefined) {
      const lastLine = context.state.lastCurrentLine.get(filePath);
      if (lastLine === undefined) {
        // 第一次打开文件且没有传入 currentLine，不执行任何操作
        return;
      }
      lineToUse = lastLine;
    } else {
      // 记录当前行号
      context.state.lastCurrentLine.set(filePath, lineToUse);
    }

    const blameInfo = await context.blameManager.getBlameInfo(filePath);

    if (blameInfo && blameInfo instanceof Map) {
      context.decorationManager.updateDecorations(editor, blameInfo, lineToUse);
    }
  } catch (error) {
    ErrorHandler.handle(error, '更新装饰器');
  }
};

/**
 * 更新所有可见编辑器
 */
export const updateAllVisibleEditors = (context: EditorManagerContext): void => {
  vscode.window.visibleTextEditors
    .filter(editor => editor.document.languageId !== 'Log')
    .forEach(editor => {
      const currentLine = getCurrentLine(editor);
      updateDecorations(editor, context, currentLine);
    });
};


/**
 * 创建文档变化的防抖更新函数
 */
export const createDebouncedDocumentUpdate = (
  context: EditorManagerContext,
): ((editor: vscode.TextEditor) => void) => {
  return debounce((editor: vscode.TextEditor) => {
    const filePath = editor.document.uri.fsPath;
    clearFileCache(filePath);
    context.blameManager.clearCache(filePath);
    updateDecorations(editor, context);
  }, 300);
};

/**
 * 创建光标位置变化的防抖更新函数
 */
export const createDebouncedSelectionUpdate = (
  context: EditorManagerContext,
  debounceDelay: number
): ((editor: vscode.TextEditor, currentLine: number) => void) => {
  return debounce((editor: vscode.TextEditor, currentLine: number) => {
    // 检查是否真的需要更新（行号是否改变）
    const filePath = editor.document.uri.fsPath;
    const lastLine = context.state.lastCurrentLine.get(filePath);

    if (lastLine !== currentLine) {
      updateDecorations(editor, context, currentLine);
    }
  }, debounceDelay);
};