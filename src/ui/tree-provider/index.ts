/**
 * Tree Provider 模块
 * 负责提交文件树和文件历史的显示
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { CommitDetails } from '../../types';
import { GitService } from '../../services/git';

// ==================== 类型定义 ====================

export interface CommitFileChange {
  uri: vscode.Uri;
  originalUri?: vscode.Uri;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';
  path: string;
  oldPath?: string;
  commitHash?: string;
}

// ==================== 常量映射表 ====================

const CHANGE_ICON_MAP: Record<string, string> = {
  'A': 'diff-added',
  'D': 'diff-removed',
  'R': 'diff-renamed',
};

const CHANGE_STATUS_MAP: Record<string, string> = {
  'A': 'added',
  'D': 'removed',
  'R': 'renamed',
};

// ==================== Tree Item 类 ====================

export class CommitFileItem extends vscode.TreeItem {
  constructor(
    public readonly change: CommitFileChange,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    const label = change.status === 'R' && change.oldPath
      ? `${change.oldPath} → ${change.path}`
      : change.path;

    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon(CHANGE_ICON_MAP[change.status] ?? 'diff-modified');
    this.description = CHANGE_STATUS_MAP[change.status] ?? '修改';
    this.tooltip = `${this.description}: ${label}`;
    this.command = {
      command: 'git-hints.openFileAtCommit',
      title: '查看文件变更',
      arguments: [this.change],
    };
  }
}

export class FileHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly commit: CommitDetails,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    const label = `${commit.hash.substring(0, 7)} - ${commit.message}`;
    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.description = `${commit.author} · ${commit.date.toLocaleDateString()}`;
    this.tooltip = `${commit.hash}\n${commit.message}\n${commit.author} · ${commit.date.toLocaleString()}`;
    this.command = {
      command: 'git-hints.openFileAtCommit',
      title: '查看文件版本',
      arguments: [{
        uri: vscode.Uri.file(commit.filePath),
        originalUri: commit.oldFilePath ? vscode.Uri.file(commit.oldFilePath) : undefined,
        path: commit.filePath,
        oldPath: commit.oldFilePath,
        status: commit.status,
        commitHash: commit.hash,
      } as CommitFileChange],
    };
  }
}

// ==================== 基类 ====================

abstract class BaseTreeProvider<T extends vscode.TreeItem> implements vscode.TreeDataProvider<T> {
  protected _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected abstract get hasData(): boolean;
  protected abstract getEmptyHint(): { label: string; description: string };
  abstract getChildren(): Promise<T[]>;

  protected createEmptyHintItem(): T {
    const hint = this.getEmptyHint();
    const item = new vscode.TreeItem(hint.label);
    item.iconPath = new vscode.ThemeIcon('info');
    item.description = hint.description;
    item.contextValue = 'hint';
    return item as T;
  }

  getTreeItem(element: T): vscode.TreeItem {
    return element;
  }

  getParent(): Promise<T | undefined> {
    return Promise.resolve(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  protected fire(): void {
    this._onDidChangeTreeData.fire();
  }
}

// ==================== 提交文件树 Provider ====================

export class CommitTreeProvider extends BaseTreeProvider<CommitFileItem> {
  private _currentCommitId = '';
  private _currentCommitMessage = '';
  private _workspacePath = '';
  private _fileChanges: CommitFileChange[] = [];

  protected get hasData(): boolean {
    return !!this._currentCommitId;
  }

  protected getEmptyHint(): { label: string; description: string } {
    return {
      label: '请点击提交详情链接查看文件变更',
      description: '点击代码行末尾的提交链接',
    };
  }

  setCommit(commitId: string, commitMessage: string, workspacePath: string): void {
    this._currentCommitId = commitId;
    this._currentCommitMessage = commitMessage;
    this._workspacePath = workspacePath;
    this._fileChanges = [];
  }

  async loadCommitFiles(gitService: GitService): Promise<void> {
    if (!this._currentCommitId || !this._workspacePath) {
      return;
    }

    try {
      const changes = await gitService.getCommitChangedFiles(this._currentCommitId, this._workspacePath);
      this._fileChanges = changes.map(change => ({
        uri: vscode.Uri.file(path.join(this._workspacePath, change.path)),
        originalUri: change.oldPath ? vscode.Uri.file(path.join(this._workspacePath, change.oldPath)) : undefined,
        status: change.status,
        path: change.path,
        oldPath: change.oldPath,
      }));
    } catch {
      this._fileChanges = [];
    }

    this.fire();
  }

  getChildren(): Promise<CommitFileItem[]> {
    if (!this.hasData) {
      return Promise.resolve([this.createEmptyHintItem()]);
    }
    return Promise.resolve(this._fileChanges.map(change => new CommitFileItem(change)));
  }

  getCurrentCommitInfo(): { commitId: string; commitMessage: string } {
    return {
      commitId: this._currentCommitId,
      commitMessage: this._currentCommitMessage,
    };
  }

  clear(): void {
    this._currentCommitId = '';
    this._currentCommitMessage = '';
    this._workspacePath = '';
    this._fileChanges = [];
    this.fire();
  }

  getFileChanges(): CommitFileChange[] {
    return this._fileChanges;
  }
}

// ==================== 文件历史树 Provider ====================

export class FileHistoryTreeProvider extends BaseTreeProvider<FileHistoryItem> {
  private _currentFilePath = '';
  private _commits: CommitDetails[] = [];

  protected get hasData(): boolean {
    return !!this._currentFilePath;
  }

  protected getEmptyHint(): { label: string; description: string } {
    return {
      label: '请选择一个文件查看其历史',
      description: '在编辑器中打开文件后右键选择查看历史',
    };
  }

  setFile(filePath: string): void {
    this._currentFilePath = filePath;
    this._commits = [];
  }

  async loadFileHistory(commits: CommitDetails[]): Promise<void> {
    this._commits = commits;
    this.fire();
  }

  getChildren(): Promise<FileHistoryItem[]> {
    if (!this.hasData) {
      return Promise.resolve([this.createEmptyHintItem()]);
    }
    return Promise.resolve(this._commits.map(commit => new FileHistoryItem(commit)));
  }

  clear(): void {
    this._currentFilePath = '';
    this._commits = [];
    this.fire();
  }
}
