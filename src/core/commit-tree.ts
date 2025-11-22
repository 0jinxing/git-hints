import * as vscode from 'vscode';
import * as path from 'path';
import { getCommitChangedFiles } from './git';
import { toGitUri } from '../utils/git';

export interface CommitFileChange {
    uri: vscode.Uri;
    originalUri?: vscode.Uri;
    status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';
    path: string;
    oldPath?: string;
}

export class CommitFileItem extends vscode.TreeItem {
    constructor(
        public readonly change: CommitFileChange,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        // 根据文件状态设置标签
        let label = change.path;
        if (change.status === 'R' && change.oldPath) {
            label = `${change.oldPath} → ${change.path}`;
        }
        super(label, collapsibleState);

        // 设置图标和描述
        this.iconPath = new vscode.ThemeIcon(this.getChangeIcon(change.status));
        this.description = this.getChangeStatusText(change.status);

        // 设置工具提示
        this.tooltip = `${this.getChangeStatusText(change.status)}: ${label}`;

        // 设置命令（点击时触发）
        this.command = {
            command: 'git-hints.openFileAtCommit',
            title: '查看文件变更',
            arguments: [this.change]
        };

        console.log('创建 CommitFileItem:', {
            label: this.label,
            status: change.status,
            description: this.description
        });
    }

    private getChangeIcon(status: string): string {
        switch (status) {
            case 'A': // ADDED
                return 'diff-added';
            case 'D': // DELETED
                return 'diff-removed';
            case 'R': // RENAMED
                return 'diff-renamed';
            case 'M': // MODIFIED
            default:
                return 'diff-modified';
        }
    }

    private getChangeStatusText(status: string): string {
        switch (status) {
            case 'A': // ADDED
                return '新增';
            case 'D': // DELETED
                return '删除';
            case 'R': // RENAMED
                return '重命名';
            case 'M': // MODIFIED
            default:
                return '修改';
        }
    }
}

export class CommitTreeProvider implements vscode.TreeDataProvider<CommitFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommitFileItem | undefined | null | void> = new vscode.EventEmitter<CommitFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommitFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _currentCommitId: string = '';
    private _currentCommitMessage: string = '';
    private _workspacePath: string = '';
    private _fileChanges: CommitFileChange[] = [];

    constructor() {
        // 初始化时显示提示信息
        this._onDidChangeTreeData.fire();
    }

    setCommit(commitId: string, commitMessage: string, workspacePath: string) {
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
            console.log('开始加载提交文件:', this._currentCommitId, this._workspacePath);
            const changedFiles = await getCommitChangedFiles(this._currentCommitId, this._workspacePath);
            console.log('获取到的变更文件:', changedFiles);

            if (changedFiles) {
                this._fileChanges = changedFiles.map(change => ({
                    uri: vscode.Uri.file(path.join(this._workspacePath, change.path)),
                    originalUri: change.oldPath ? vscode.Uri.file(path.join(this._workspacePath, change.oldPath)) : undefined,
                    status: change.status,
                    path: change.path,
                    oldPath: change.oldPath
                }));
                console.log('处理后的文件变更数量:', this._fileChanges.length);
            } else {
                console.log('没有找到变更文件');
                this._fileChanges = [];
            }
        } catch (error) {
            console.error('加载提交文件失败:', error);
            this._fileChanges = [];
        }

        // 通知树视图刷新
        this._onDidChangeTreeData.fire();
        console.log('TreeView 刷新事件已触发');
    }

    getTreeItem(element: CommitFileItem): vscode.TreeItem {
        return element;
    }

    getParent(element: CommitFileItem): Thenable<CommitFileItem | undefined> {
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
                return Promise.resolve([hintItem as any]);
            }

            console.log('TreeView.getChildren 被调用，返回文件列表，数量:', this._fileChanges.length);
            // 返回根节点 - 所有文件
            const items = this._fileChanges.map(change => new CommitFileItem(change));
            console.log('创建的 TreeItem 数量:', items.length);
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
            commitMessage: this._currentCommitMessage
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