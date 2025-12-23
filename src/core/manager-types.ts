/**
 * 管理器类型定义
 * 定义各种管理器的接口
 */

import * as vscode from 'vscode';
import { GitBlameInfo } from '../types';

export interface BlameManager {
  getBlameInfo(filePath: string): Promise<Map<number, GitBlameInfo> | undefined>;
  clearCache(filePath?: string): void;
  dispose(): void;
}

export interface DecorationManager {
  updateDecorations(
    editor: vscode.TextEditor,
    blameInfos: Map<number, GitBlameInfo>,
    currentLine?: number
  ): void;
  clearDecorations(editor: vscode.TextEditor): void;
  dispose(): void;
}