/**
 * 应用状态类型定义
 */

import * as vscode from 'vscode';
import { BlameManager, DecorationManager } from './manager-types';
import { CommitTreeProvider, CommitFileItem, FileHistoryTreeProvider, FileHistoryItem } from '../providers/tree-provider';

export interface AppState {
  isEnabled: boolean;
  lastCurrentLine: Map<string, number>;
  cacheCleanupInterval?: NodeJS.Timeout;
}

export interface ExtensionContext {
  blameManager: BlameManager;
  decorationManager: DecorationManager;
  commitTreeProvider: CommitTreeProvider;
  commitTreeView: vscode.TreeView<CommitFileItem>;
  fileHistoryTreeProvider: FileHistoryTreeProvider;
  fileHistoryTreeView: vscode.TreeView<FileHistoryItem>;
  state: AppState;
  debouncedDocumentUpdate: (editor: vscode.TextEditor) => void;
  debouncedSelectionUpdate: (editor: vscode.TextEditor, currentLine: number) => void;
  updateDecorations: (editor: vscode.TextEditor, currentLine?: number) => Promise<void>;
  updateAllVisibleEditors: () => void;
  updateNavigationContext: (editor: vscode.TextEditor | undefined) => void;
}