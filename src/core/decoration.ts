// 装饰器管理（函数式风格）

import * as vscode from 'vscode';
import { GitBlameInfo } from '../types';
import { buildLineDecorations } from '../utils/decoration';

/**
 * 创建装饰器类型
 */
export const createDecorationType = (): vscode.TextEditorDecorationType => {
  return vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 3em',
      color: 'rgba(153, 153, 153, 0.6)',
      fontStyle: 'italic',
      fontWeight: 'normal'
    }
  });
};

/**
 * 应用装饰器到编辑器
 */
export const applyDecorations = (
  editor: vscode.TextEditor,
  decorationType: vscode.TextEditorDecorationType,
  blameInfos: Map<number, GitBlameInfo>,
  currentLine?: number
): void => {
  const decorations = buildLineDecorations(editor, blameInfos, currentLine);
  editor.setDecorations(decorationType, decorations);
};

/**
 * 清除装饰器
 */
export const clearDecorations = (
  editor: vscode.TextEditor,
  decorationType: vscode.TextEditorDecorationType
): void => {
  editor.setDecorations(decorationType, []);
};

/**
 * 创建装饰器管理器
 */
export const createDecorationManager = () => {
  const decorationType = createDecorationType();

  return {
    updateDecorations: (
      editor: vscode.TextEditor,
      blameInfos: Map<number, GitBlameInfo>,
      currentLine?: number
    ) => {
      applyDecorations(editor, decorationType, blameInfos, currentLine);
    },
    clearDecorations: (editor: vscode.TextEditor) => {
      clearDecorations(editor, decorationType);
    },
    dispose: () => {
      decorationType.dispose();
    }
  };
};
