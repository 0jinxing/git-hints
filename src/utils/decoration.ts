// 纯函数：装饰器相关的工具函数

import * as vscode from 'vscode';
import { GitBlameInfo } from '../types';
import { formatDateFriendly } from './date';

/**
 * 检查行是否为空白行
 */
export const isBlankLine = (lineText: string): boolean => {
  return lineText.trim() === '';
};

/**
 * 截断作者名称
 */
export const truncateAuthor = (author: string, maxLength: number = 15): string => {
  return author.length > maxLength ? author.substring(0, maxLength) + '...' : author;
};

/**
 * 构建装饰器内容文本
 */
export const buildDecorationText = (
  blameInfo: GitBlameInfo,
): string => {
  // 未提交的修改（包括暂存区和工作区）
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
export const buildHoverMessage = (
  blameInfo: GitBlameInfo,
): vscode.MarkdownString => {
  const hoverMessage = new vscode.MarkdownString();
  hoverMessage.isTrusted = true;
  hoverMessage.supportHtml = true;
  hoverMessage.supportThemeIcons = true;  // 启用主题图标支持
  if (blameInfo.date) {
    const formattedDate = formatDateFriendly(blameInfo.date);
    hoverMessage.appendMarkdown(`$(clock) ${formattedDate} @${blameInfo.author}\n\n`);
  }

  // 提交ID - 使用代码块样式和操作按钮
  hoverMessage.appendMarkdown(`[$(git-commit)](command:git-hints.showCommitDetails?${encodeURIComponent(JSON.stringify(blameInfo.commitId))} "show commit detail")`);
  hoverMessage.appendMarkdown(`[\`${blameInfo.commitId}\`](command:git-hints.copyCommitId?${encodeURIComponent(JSON.stringify(blameInfo.commitId))} "copy commit id")\n\n`); // 换行

  // 提交消息 - 使用引用样式
  if (blameInfo.message && blameInfo.message.trim()) {
    hoverMessage.appendMarkdown(`${blameInfo.message}\n\n`);
  }

  return hoverMessage;
};

/**
 * 创建装饰器选项
 */
export const createDecorationOption = (
  line: number,
  lineText: string,
  blameInfo: GitBlameInfo,
): vscode.DecorationOptions | null => {
  if (isBlankLine(lineText)) {
    return null;
  }

  const contentText = buildDecorationText(blameInfo);
  const range = new vscode.Range(line, lineText.length, line, lineText.length);

  // 未提交的修改：不显示 hover message，使用半透明颜色
  if (blameInfo.isUncommitted) {
    return {
      range,
      renderOptions: {
        after: {
          contentText,
          color: 'rgba(255, 255, 255, 0.1)',
          fontStyle: 'italic',
          fontWeight: 'normal'
        }
      }
    };
  }

  // 已提交的代码：显示 hover message
  const hoverMessage = buildHoverMessage(blameInfo);

  return {
    range,
    renderOptions: {
      after: {
        contentText,
        color: 'rgba(255, 255, 255, 0.2)',
        fontStyle: 'italic',
        fontWeight: 'normal'
      }
    },
    hoverMessage
  };
};

/**
 * 为单行或所有行创建装饰器
 */
export const createLineDecorations = (
  editor: vscode.TextEditor,
  blameInfos: Map<number, GitBlameInfo>,
  currentLine?: number
): vscode.DecorationOptions[] => {
  const decorations: vscode.DecorationOptions[] = [];

  if (currentLine !== undefined) {
    // 只装饰当前行
    const blameInfo = blameInfos.get(currentLine + 1);
    if (blameInfo) {
      const lineText = editor.document.lineAt(currentLine).text;
      const decoration = createDecorationOption(currentLine, lineText, blameInfo);
      if (decoration) {
        decorations.push(decoration);
      }
    }
  } else {
    // 装饰所有行
    for (let line = 0; line < editor.document.lineCount; line++) {
      const blameInfo = blameInfos.get(line + 1);
      if (blameInfo) {
        const lineText = editor.document.lineAt(line).text;
        const decoration = createDecorationOption(line, lineText, blameInfo);
        if (decoration) {
          decorations.push(decoration);
        }
      }
    }
  }

  return decorations;
};
