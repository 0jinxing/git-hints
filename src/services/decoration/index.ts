/**
 * 装饰器服务
 * 负责管理编辑器装饰器的创建和应用
 */

import * as vscode from 'vscode';
import { GitBlameInfo } from '../../types';
import { formatDateFriendly } from '../../utils';

// ==================== 装饰器构建函数 ====================

/**
 * 构建装饰器内容文本
 */
const getGitBlameDecorationContent = (blameInfo: GitBlameInfo): string => {
  if (blameInfo.isUncommitted) {
    return 'Uncommitted';
  }

  const formattedDate = formatDateFriendly(blameInfo.date);
  const author = blameInfo.author;

  if (formattedDate) {
    return `${formattedDate} @${author}`;
  }

  return author;
};

/**
 * 构建 hover 消息
 */
const buildHoverMessage = (blameInfo: GitBlameInfo): vscode.MarkdownString => {
  const hoverMessage = new vscode.MarkdownString();
  hoverMessage.isTrusted = true;
  hoverMessage.supportHtml = true;
  hoverMessage.supportThemeIcons = true;

  if (blameInfo.date) {
    const formattedDate = new Date(blameInfo.date).toLocaleString();
    hoverMessage.appendMarkdown(`$(clock) ${formattedDate}\n\n`);
  }

  hoverMessage.appendMarkdown(
    `[$(git-commit)${blameInfo.commitId}](command:git-hints.showCommitDetails?${encodeURIComponent(JSON.stringify(blameInfo.commitId))} "show commit detail") @${blameInfo.author}\n\n`
  );

  if (blameInfo.message && blameInfo.message.trim()) {
    hoverMessage.appendMarkdown(`${blameInfo.message}\n\n`);
  }

  return hoverMessage;
};

/**
 * 创建装饰器选项
 */
const buildDecorationOption = (
  line: number,
  lineText: string,
  blameInfo: GitBlameInfo
): vscode.DecorationOptions | null => {
  if (lineText.trim().length === 0) {
    return null;
  }

  const contentText = getGitBlameDecorationContent(blameInfo);
  const range = new vscode.Range(line, lineText.length, line, lineText.length);

  if (blameInfo.isUncommitted) {
    return {
      range,
      renderOptions: {
        after: {
          contentText,
          color: 'rgba(255, 255, 255, 0.1)',
          fontStyle: 'italic',
          fontWeight: 'normal',
        },
      },
    };
  }

  const hoverMessage = buildHoverMessage(blameInfo);

  return {
    range,
    renderOptions: {
      after: {
        contentText,
        color: 'rgba(255, 255, 255, 0.2)',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    },
    hoverMessage,
  };
};

// ==================== 装饰器管理器 ====================

export interface DecorationManager {
  updateDecorations(
    editor: vscode.TextEditor,
    blameInfos: Map<number, GitBlameInfo>,
    currentLine?: number
  ): void;
  clearDecorations(editor: vscode.TextEditor): void;
  dispose(): void;
}

/**
 * 创建装饰器管理器
 */
export const createDecorationManager = (): DecorationManager => {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 3em',
      color: 'rgba(153, 153, 153, 0.6)',
      fontStyle: 'italic',
      fontWeight: 'normal'
    }
  });

  const buildLineDecorations = (
    editor: vscode.TextEditor,
    blameInfos: Map<number, GitBlameInfo>,
    currentLine?: number
  ): vscode.DecorationOptions[] => {
    const decorations: vscode.DecorationOptions[] = [];

    if (currentLine !== undefined) {
      const blameInfo = blameInfos.get(currentLine + 1);
      if (blameInfo) {
        const lineText = editor.document.lineAt(currentLine).text;
        const decoration = buildDecorationOption(currentLine, lineText, blameInfo);
        if (decoration) {
          decorations.push(decoration);
        }
      }
    } else {
      for (let line = 0; line < editor.document.lineCount; line++) {
        const blameInfo = blameInfos.get(line + 1);
        if (blameInfo) {
          const lineText = editor.document.lineAt(line).text;
          const decoration = buildDecorationOption(line, lineText, blameInfo);
          if (decoration) {
            decorations.push(decoration);
          }
        }
      }
    }

    return decorations;
  };

  return {
    updateDecorations: (
      editor: vscode.TextEditor,
      blameInfos: Map<number, GitBlameInfo>,
      currentLine?: number
    ) => {
      const decorations = buildLineDecorations(editor, blameInfos, currentLine);
      editor.setDecorations(decorationType, decorations);
    },
    clearDecorations: (editor: vscode.TextEditor) => {
      editor.setDecorations(decorationType, []);
    },
    dispose: () => {
      decorationType.dispose();
    }
  };
};
