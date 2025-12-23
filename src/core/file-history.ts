import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { toGitUri } from '../utils/git';

const execAsync = promisify(exec);

export interface FileHistoryCommit {
    hash: string;
    author: string;
    date: Date;
    message: string;
    filePath: string; // 该提交时的文件路径
    oldFilePath?: string; // 重命名时的旧文件路径
    status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U'; // 文件在该提交中的状态
}

export interface FileHistoryState {
    filePath: string;
    commits: FileHistoryCommit[];
}

// 文件历史状态管理 - 使用 LRU 缓存策略
const fileHistoryStates = new Map<string, FileHistoryState>();

// 获取性能配置
const getPerformanceConfig = (): { maxFileHistoryCache: number; maxDisplayCommits: number } => {
    const config = vscode.workspace.getConfiguration('gitHints.performance');
    return {
        maxFileHistoryCache: config.get<number>('maxFileHistoryCache') || 50,
        maxDisplayCommits: config.get<number>('maxDisplayCommits') || 100
    };
};

const MAX_CACHE_SIZE = getPerformanceConfig().maxFileHistoryCache;

/**
 * LRU 缓存管理 - 添加条目并清理最久未使用的
 */
function addToCache(filePath: string, state: FileHistoryState): void {
    // 如果缓存已满，删除最久未使用的条目
    if (fileHistoryStates.size >= MAX_CACHE_SIZE) {
        // 获取第一个（最久未使用的）条目
        const firstKey = fileHistoryStates.keys().next().value;
        if (firstKey) {
            fileHistoryStates.delete(firstKey);
        }
    }

    // 添加新条目
    fileHistoryStates.set(filePath, state);
}

/**
 * 获取缓存条目并更新使用顺序
 */
function getFromCache(filePath: string): FileHistoryState | undefined {
    const state = fileHistoryStates.get(filePath);
    if (state) {
        // 更新使用顺序：删除并重新添加
        fileHistoryStates.delete(filePath);
        fileHistoryStates.set(filePath, state);
    }
    return state;
}

/**
 * 获取文件的 Git 历史提交列表
 */
export async function getFileHistory(filePath: string, workspaceRoot: string): Promise<FileHistoryCommit[]> {
    try {
        // 获取相对路径
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

        // 使用 git log 获取文件历史，包含文件名和状态以追踪重命名
        // 设置 core.quotePath=false 确保中文文件名不被转义
        // 使用 --name-status 获取文件状态（A/M/D/R等）
        const command = `git -c core.quotePath=false log --follow --name-status --format="%H|%an|%ai|%s" -- "${relativePath}"`;

        const { stdout, stderr } = await execAsync(command, { cwd: workspaceRoot });

        if (stderr) {
            console.error('Git log stderr:', stderr);
        }

        const commits: FileHistoryCommit[] = [];
        const lines = stdout.trim().split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) {continue;}

            const parts = line.split('|');
            if (parts.length >= 4) {
                // 跳过空行找到文件状态和路径
                let commitFilePath = relativePath;
                let oldFilePath: string | undefined;
                let status: FileHistoryCommit['status'] = 'M';

                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine) {
                        // --name-status 输出格式: "M\tfile.txt" 或 "R100\told.txt\tnew.txt"
                        const statusMatch = nextLine.match(/^([AMDRTCU])\d*\t(.+)$/);
                        if (statusMatch) {
                            status = statusMatch[1] as FileHistoryCommit['status'];
                            const paths = statusMatch[2].split('\t');
                            if (status === 'R' && paths.length >= 2) {
                                // 重命名：第一个是旧路径，第二个是新路径
                                oldFilePath = paths[0];
                                commitFilePath = paths[1];
                            } else {
                                commitFilePath = paths[paths.length - 1];
                            }
                        } else {
                            commitFilePath = nextLine;
                        }
                        i = j; // 跳到文件路径行
                        break;
                    }
                }

                commits.push({
                    hash: parts[0],
                    author: parts[1],
                    date: new Date(parts[2]),
                    message: parts.slice(3).join('|'),
                    filePath: path.join(workspaceRoot, commitFilePath),
                    oldFilePath: oldFilePath ? path.join(workspaceRoot, oldFilePath) : undefined,
                    status
                });
            }
        }

        return commits;
    } catch (error: any) {
        console.error('Git log execution failed:', error);
        throw error;
    }
}

/**
 * 初始化文件历史状态
 */
export async function initFileHistory(filePath: string, workspaceRoot: string): Promise<FileHistoryState | undefined> {
    try {
        // 首先检查缓存
        const cachedState = getFromCache(filePath);
        if (cachedState) {
            return cachedState;
        }

        const commits = await getFileHistory(filePath, workspaceRoot);

        if (commits.length === 0) {
            return undefined;
        }

        const state: FileHistoryState = {
            filePath,
            commits
        };

        addToCache(filePath, state);
        return state;
    } catch (error) {
        console.error('Failed to get file history:', error);
        return undefined;
    }
}

/**
 * 从编辑器获取文件路径
 */
function getFilePathFromEditor(editor: vscode.TextEditor): string {
    if (editor.document.uri.scheme === 'git') {
        const query = JSON.parse(editor.document.uri.query);
        return query.path;
    }
    return editor.document.uri.fsPath;
}

/**
 * 从编辑器获取当前 commit hash
 */
export function getCurrentCommitHash(editor: vscode.TextEditor): string | undefined {
    if (editor.document.uri.scheme === 'git') {
        const query = JSON.parse(editor.document.uri.query);
        return query.ref;
    }
    return undefined;
}

/**
 * 计算当前索引
 */
export function getCurrentIndex(state: FileHistoryState, commitHash: string | undefined): number {
    if (!commitHash) {
        return -1; // 工作区版本
    }
    return state.commits.findIndex(c => c.hash === commitHash);
}

/**
 * 获取文件历史状态
 */
export function getFileHistoryState(filePath: string): FileHistoryState | undefined {
    return getFromCache(filePath);
}

/**
 * 导航到上一个版本
 */
export async function navigateToPreviousVersion(editor: vscode.TextEditor): Promise<boolean> {
    const filePath = getFilePathFromEditor(editor);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('文件不在工作区中');
        return false;
    }

    let state = getFileHistoryState(filePath);

    // 如果没有状态，初始化
    if (!state) {
        state = await initFileHistory(filePath, workspaceFolder.uri.fsPath);
        if (!state) {
            vscode.window.showInformationMessage('该文件没有历史记录');
            return false;
        }
    }

    // 计算当前索引
    const currentCommitHash = getCurrentCommitHash(editor);
    const currentIndex = getCurrentIndex(state, currentCommitHash);
    const nextIndex = currentIndex + 1;

    // 检查是否可以前进到更旧的版本
    if (nextIndex >= state.commits.length) {
        vscode.window.showInformationMessage('已经是最早的版本');
        return false;
    }

    const commit = state.commits[nextIndex];
    const isFirstCommit = nextIndex === state.commits.length - 1;
    const prevCommit = nextIndex + 1 < state.commits.length ? state.commits[nextIndex + 1] : undefined;

    // 打开该版本的文件
    await openFileAtCommit(commit, isFirstCommit, prevCommit);

    // 显示版本信息
    const totalCommits = state.commits.length;
    const position = nextIndex + 1;
    vscode.window.showInformationMessage(
        `${commit.hash.substring(0, 7)} - ${commit.message} (${position}/${totalCommits})`
    );

    return true;
}

/**
 * 导航到下一个版本（更新的版本）
 */
export async function navigateToNextVersion(editor: vscode.TextEditor): Promise<boolean> {
    const filePath = getFilePathFromEditor(editor);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('文件不在工作区中');
        return false;
    }

    const state = getFileHistoryState(filePath);

    // 如果没有状态，说明在当前版本
    if (!state) {
        vscode.window.showInformationMessage('已经是最新版本');
        return false;
    }

    // 计算当���索引
    const currentCommitHash = getCurrentCommitHash(editor);
    const currentIndex = getCurrentIndex(state, currentCommitHash);
    const nextIndex = currentIndex - 1;

    // 检查是否回到工作区版本
    if (nextIndex < 0) {
        // 关闭 git 版本，打开工作区版本
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        vscode.window.showInformationMessage('已回到当前工作区版本');
        return true;
    }

    const commit = state.commits[nextIndex];
    const isFirstCommit = nextIndex === state.commits.length - 1;
    const prevCommit = nextIndex + 1 < state.commits.length ? state.commits[nextIndex + 1] : undefined;

    // 打开该版本的文件
    await openFileAtCommit(commit, isFirstCommit, prevCommit);

    // 显示版本信息
    const totalCommits = state.commits.length;
    const position = nextIndex + 1;
    vscode.window.showInformationMessage(
        `${commit.hash.substring(0, 7)} - ${commit.message} (${position}/${totalCommits})`
    );

    return true;
}

/**
 * 在指定提交打开文件对比
 */
async function openFileAtCommit(commit: FileHistoryCommit, isFirstCommit: boolean, prevCommit?: FileHistoryCommit): Promise<void> {
    const commitFilePath = commit.filePath;
    const decodedPath = decodeURIComponent(commitFilePath);
    console.log('Opening file at commit:', commit.hash, 'Path:', decodedPath);

    // 关闭当前编辑器
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    // 如果是第一个 commit（文件新增），直接打开文件
    if (isFirstCommit) {
        const gitUri = toGitUri(vscode.Uri.file(commitFilePath), commit.hash);
        await vscode.commands.executeCommand('vscode.open', gitUri);
        return;
    }

    // 获取上一个版本的文件路径（处理重命名）
    const prevFilePath = prevCommit ? prevCommit.filePath : commitFilePath;

    // 创建左侧 URI（上一个版本）
    const leftUri = toGitUri(vscode.Uri.file(prevFilePath), `${commit.hash}~1`, true);

    // 创建右侧 URI（当前版本）
    const rightUri = toGitUri(vscode.Uri.file(commitFilePath), commit.hash, true);

    // 打开对比视图
    const fileName = path.basename(commitFilePath);
    const title = `${fileName} (${commit.hash.substring(0, 7)}^ ↔ ${commit.hash.substring(0, 7)})`;
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
}

/**
 * 显示文件历史列表
 */
export async function showFileHistoryList(editor: vscode.TextEditor): Promise<void> {
    const filePath = editor.document.uri.scheme === 'git'
        ? JSON.parse(editor.document.uri.query).path
        : editor.document.uri.fsPath;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('文件不在工作区中');
        return;
    }

    const commits = await getFileHistory(filePath, workspaceFolder.uri.fsPath);

    if (commits.length === 0) {
        vscode.window.showInformationMessage('该文件没有历史记录');
        return;
    }

    // 性能优化：限制显示的提交数量
    const MAX_DISPLAY_COMMITS = getPerformanceConfig().maxDisplayCommits;
    const displayCommits = commits.slice(0, MAX_DISPLAY_COMMITS);

    const items = displayCommits.map(commit => ({
        label: `$(git-commit) ${commit.hash.substring(0, 7)} - ${commit.message}`,
        description: `${commit.author} · ${commit.date.toLocaleString()}`,
        commit
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `选择要查看的版本 (共 ${commits.length} 个提交，显示前 ${MAX_DISPLAY_COMMITS} 个)`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selected) {
        const commit = selected.commit;
        const commitIndex = commits.indexOf(commit);
        const isFirstCommit = commitIndex === commits.length - 1;
        const prevCommit = commitIndex + 1 < commits.length ? commits[commitIndex + 1] : undefined;
        await openFileAtCommit(commit, isFirstCommit, prevCommit);
    }
}

/**
 * 清除文件历史状态
 */
export function clearFileHistoryState(filePath?: string): void {
    if (filePath) {
        fileHistoryStates.delete(filePath);
    } else {
        fileHistoryStates.clear();
    }
}
