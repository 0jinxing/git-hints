/**
 * Tree Provider 模块
 * 负责提交文件树的显示和管理
 * 优化：提取公共逻辑消除重复代码
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getCommitChangedFiles } from '../core/git';
import { FileHistoryCommit, initFileHistory } from '../core/file-history';

export interface CommitFileChange {
  uri: vscode.Uri;
  originalUri?: vscode.Uri;
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';
  path: string;
  oldPath?: string;
  commitHash?: string; // 用于文件历史视图，直接传递 commit hash
}

/**
 * 文件变更 TreeItem
 */
export class CommitFileItem extends vscode.TreeItem {
  constructor(
    public readonly change: CommitFileChange,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    let label = change.path;
    if (change.status === 'R' && change.oldPath) {
      label = `${change.oldPath} → ${change.path}`;
    }
    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon(this._getChangeIcon(change.status));
    this.description = this._getChangeStatusText(change.status);
    this.tooltip = `${this._getChangeStatusText(change.status)}: ${label}`;
    this.command = {
      command: 'git-hints.openFileAtCommit',
      title: '查看文件变更',
      arguments: [this.change],
    };
  }

  private _getChangeIcon(status: string): string {
    switch (status) {
      case 'A':
        return 'diff-added';
      case 'D':
        return 'diff-removed';
      case 'R':
        return 'diff-renamed';
      case 'M':
      default:
        return 'diff-modified';
    }
  }

  private _getChangeStatusText(status: string): string {
    switch (status) {
      case 'A':
        return '新增';
      case 'D':
        return '删除';
      case 'R':
        return '重命名';
      case 'M':
      default:
        return '修改';
    }
  }
}

/**
 * 文件历史 TreeItem
 */
export class FileHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly commit: FileHistoryCommit,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None
  ) {
    const label = `${commit.hash.substring(0, 7)} - ${commit.message}`;
    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon('git-commit');
    this.description = `${commit.author} · ${commit.date.toLocaleString()}`;
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

/**
 * 提交文件树 Provider
 */
export class CommitTreeProvider implements vscode.TreeDataProvider<CommitFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommitFileItem | undefined | null | void> =
    new vscode.EventEmitter<CommitFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CommitFileItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _currentCommitId: string = '';
  private _currentCommitMessage: string = '';
  private _workspacePath: string = '';
  private _fileChanges: CommitFileChange[] = [];

  constructor() {
    // 初始化时显示提示信息
    this._onDidChangeTreeData.fire();
  }

  setCommit(commitId: string, commitMessage: string, workspacePath: string): void {
    this._currentCommitId = commitId;
    this._currentCommitMessage = commitMessage;
    this._workspacePath = workspacePath;
    this._fileChanges = [];
  }

  async loadCommitFiles(): Promise<void> {
    if (!this._currentCommitId || !this._workspacePath) {
      return;
    }

    try {
      const changedFiles = await getCommitChangedFiles(this._currentCommitId, this._workspacePath);

      if (changedFiles) {
        this._fileChanges = changedFiles.map(change => ({
          uri: vscode.Uri.file(path.join(this._workspacePath, change.path)),
          originalUri: change.oldPath
            ? vscode.Uri.file(path.join(this._workspacePath, change.oldPath))
            : undefined,
          status: change.status,
          path: change.path,
          oldPath: change.oldPath,
        }));
      } else {
        this._fileChanges = [];
      }
    } catch {
      this._fileChanges = [];
    }

    // 通知树视图刷新
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitFileItem): vscode.TreeItem {
    return element;
  }

  getParent(): Thenable<CommitFileItem | undefined> {
    // 所有文件项都是根级别的子项，没有父级
    return Promise.resolve(undefined);
  }

  getChildren(element?: CommitFileItem): Thenable<CommitFileItem[]> {
    if (!element) {
      if (!this._currentCommitId) {
        // 没有选择提交时显示提示
        const hintItem = new vscode.TreeItem('请点击提交详情链接查看文件变更');
        hintItem.iconPath = new vscode.ThemeIcon('info');
        hintItem.description = '点击代码行末尾的提交链接';
        hintItem.contextValue = 'hint';
        return Promise.resolve([hintItem as CommitFileItem]);
      }

      // 返回根节点 - 所有文件
      const items = this._fileChanges.map(change => new CommitFileItem(change));
      return Promise.resolve(items);
    }

    // 文件节点没有子节点
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
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
    this._onDidChangeTreeData.fire();
  }

  getFileChanges(): CommitFileChange[] {
    return this._fileChanges;
  }
}

/**
 * 文件历史树 Provider
 */
export class FileHistoryTreeProvider implements vscode.TreeDataProvider<FileHistoryItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileHistoryItem | undefined | null | void> =
    new vscode.EventEmitter<FileHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileHistoryItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _currentFilePath: string = '';
  private _workspacePath: string = '';
  private _commits: FileHistoryCommit[] = [];

  constructor() {
    // 初始化时显示提示信息
    this._onDidChangeTreeData.fire();
  }

  setFile(filePath: string, workspacePath: string): void {
    this._currentFilePath = filePath;
    this._workspacePath = workspacePath;
    this._commits = [];
  }

  async loadFileHistory(): Promise<void> {
    if (!this._currentFilePath || !this._workspacePath) {
      return;
    }

    try {
      const historyState = await initFileHistory(this._currentFilePath, this._workspacePath);

      if (historyState) {
        this._commits = historyState.commits;
      } else {
        this._commits = [];
      }
    } catch {
      this._commits = [];
    }

    // 通知树视图刷新
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileHistoryItem): vscode.TreeItem {
    return element;
  }

  getParent(): Thenable<FileHistoryItem | undefined> {
    // 所有提交项都是根级别的子项，没有父级
    return Promise.resolve(undefined);
  }

  getChildren(element?: FileHistoryItem): Thenable<FileHistoryItem[]> {
    if (!element) {
      if (!this._currentFilePath) {
        // 没有选择文件时显示提示
        const hintItem = new vscode.TreeItem('请选择一个文件查看其历史');
        hintItem.iconPath = new vscode.ThemeIcon('info');
        hintItem.description = '在编辑器中打开文件后右键选择查看历史';
        hintItem.contextValue = 'hint';
        return Promise.resolve([hintItem as FileHistoryItem]);
      }

      // 返回根节点 - 所有提交
      const items = this._commits.map(commit => new FileHistoryItem(commit));
      return Promise.resolve(items);
    }

    // 提交节点没有子节点
    return Promise.resolve([]);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getCurrentFileInfo(): { filePath: string } {
    return {
      filePath: this._currentFilePath,
    };
  }

  clear(): void {
    this._currentFilePath = '';
    this._workspacePath = '';
    this._commits = [];
    this._onDidChangeTreeData.fire();
  }

  getCommits(): FileHistoryCommit[] {
    return this._commits;
  }
}
