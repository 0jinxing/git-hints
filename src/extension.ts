import * as vscode from 'vscode';
import { createBlameManager } from './core/blame';
import { createDecorationManager } from './core/decoration';
import { shouldIgnoreFile } from './utils/git';
import { clearFileCache, clearExpiredCache } from './core/git';
import { navigateToPreviousVersion, navigateToNextVersion, clearFileHistoryState, getFileHistoryState, getCurrentCommitHash, getCurrentIndex, showFileHistoryList } from './core/file-history';
import { CommitTreeProvider, CommitFileChange, CommitFileItem } from './core/commit-tree';

// Terminal Link Provider 用于终端 commit hash 点击
class GitCommitLinkProvider implements vscode.TerminalLinkProvider {
    private readonly commitHashes = new Map<vscode.TerminalLink, string>();

    constructor(private workspaceRoot: string) {}

    // 提供链接的方法 - 检测 commit hash
    provideTerminalLinks(context: vscode.TerminalLinkContext, token: vscode.CancellationToken): vscode.TerminalLink[] {
        const line = context.line;
        const links: vscode.TerminalLink[] = [];

        // 匹配 Git commit hash 格式 (7-40 位十六进制)
        const commitRegex = /\b([0-9a-f]{7,40})\b/gi;
        let match;

        while ((match = commitRegex.exec(line)) !== null) {
            const commitHash = match[1];
            const startIndex = match.index;
            const length = match[0].length;

            // 创建链接
            const link: vscode.TerminalLink = {
                startIndex,
                length,
                tooltip: `点击查看提交 ${commitHash.substring(0, 7)} 的详情`
            };

            // 存储对应的 commit hash
            this.commitHashes.set(link, commitHash);
            links.push(link);
        }

        return links;
    }

    // 处理链接点击
    handleTerminalLink(link: vscode.TerminalLink): vscode.ProviderResult<void> {
        const commitHash = this.commitHashes.get(link);
        if (!commitHash) {
            console.error('无法找到对应的 commit hash');
            return;
        }

        console.log('Terminal link clicked:', commitHash);

        // 先将 commit hash 写入剪贴板，然后执行命令
        return vscode.env.clipboard.writeText(commitHash).then(() => {
            return vscode.commands.executeCommand('git-hints.showCommitFromInput');
        });
    }
}

// 应用状态（使用闭包管理）
type AppState = {
    isEnabled: boolean;
    debounceTimer?: NodeJS.Timeout;
    lastCurrentLine: Map<string, number>; // 记录每个文件的上一次 currentLine
    cacheCleanupInterval?: NodeJS.Timeout; // 定期清理过期缓存的定时器
};

function toGitUri(uri: vscode.Uri, ref: string, replaceFileExtension = false) {
    return uri.with({
        scheme: 'git',
        path: replaceFileExtension ? `${uri.path}.git` : uri.path,
        query: JSON.stringify({
            path: uri.fsPath,
            ref
        })
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Git Hints 扩展已激活');
    console.log('激活上下文:', context);
    console.log('扩展路径:', context.extensionPath);

    // 创建管理器（函数式）
    const blameManager = createBlameManager();
    const decorationManager = createDecorationManager();

    // 创建 TreeView 提供者
    const commitTreeProvider = new CommitTreeProvider();
    const commitTreeView = vscode.window.createTreeView('gitHintsCommitExplorer', {
        treeDataProvider: commitTreeProvider,
        showCollapseAll: true
    });

    // 注册 Terminal Link Provider - 用于点击终端 commit hash
    let terminalLinkProvider: vscode.Disposable | undefined;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const linkProvider = new GitCommitLinkProvider(workspaceRoot);
        terminalLinkProvider = vscode.window.registerTerminalLinkProvider(linkProvider);
        console.log('Terminal Link Provider 已注册，工作区:', workspaceRoot);
    }

    // 应用状态
    const state: AppState = {
        isEnabled: true,
        debounceTimer: undefined,
        lastCurrentLine: new Map<string, number>(),
        cacheCleanupInterval: undefined
    };

    // 启动定期缓存清理（每30秒清理一次过期缓存）
    state.cacheCleanupInterval = setInterval(() => {
        clearExpiredCache();
    }, 30000);

    // 纯函数：切换启用状态
    const toggleEnabled = (currentState: boolean): boolean => !currentState;

    // 切换显示状态
    console.log('开始注册 toggleGitHints 命令...');
    const toggleCommand = vscode.commands.registerCommand('git-hints.toggleGitHints', () => {
        console.log('toggleGitHints 命令被执行');
        state.isEnabled = toggleEnabled(state.isEnabled);
        updateAllVisibleEditors();
        vscode.window.showInformationMessage(`Git Hints ${state.isEnabled ? '已启用' : '已禁用'}`);
    });
    console.log('toggleGitHints 命令注册完成:', toggleCommand);

    // 复制提交ID
    console.log('开始注册 copyCommitId 命令...');
    const copyCommitIdCommand = vscode.commands.registerCommand('git-hints.copyCommitId', async (commitId: string) => {
        console.log('copyCommitId 命令被执行，参数:', commitId);
        if (!commitId) {
            vscode.window.showErrorMessage('无法获取提交ID');
            return;
        }

        try {
            await vscode.env.clipboard.writeText(commitId);
            vscode.window.showInformationMessage(`Copied!`);
        } catch (error) {
            vscode.window.showErrorMessage(`复制失败: ${error}`);
        }
    });
    console.log('copyCommitId 命令注册完成:', copyCommitIdCommand);

    // 显示提交详情 - 自动切换视图并聚焦
    console.log('开始注册 showCommitDetails 命令...');
    const showCommitDetailsCommand = vscode.commands.registerCommand('git-hints.showCommitDetails', async (commitId: string) => {
        console.log('showCommitDetails 命令被执行，参数:', commitId);
        if (!commitId) {
            vscode.window.showErrorMessage('无法获取提交ID');
            return;
        }

        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const filePath = editor.document.uri.fsPath;

            // 使用 Git 扩展 API
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) {
                vscode.window.showErrorMessage('Git 扩展未安装');
                return;
            }

            const git = gitExtension.getAPI(1);
            const repository = git.repositories.find((repo: any) =>
                filePath.startsWith(repo.rootUri.fsPath)
            );

            if (!repository) {
                vscode.window.showErrorMessage('未找到 Git 仓库');
                return;
            }

            // 获取 commit 对象
            const commit = await repository.getCommit(commitId);

            // 设置 TreeView 的提交信息
            commitTreeProvider.setCommit(commitId, commit.message, repository.rootUri.fsPath);
            await commitTreeProvider.loadCommitFiles();

            // 等待 TreeView 刷新完成
            await new Promise(resolve => setTimeout(resolve, 200));

            // 强制切换到资源管理器视图
            // await vscode.commands.executeCommand('workbench.view.explorer');

            // 等待视图切换完成
            await new Promise(resolve => setTimeout(resolve, 300));

            // 自动展开并聚焦到 Commit Files TreeView
            const fileChanges = commitTreeProvider.getFileChanges();
            if (fileChanges.length > 0) {
                // 聚焦到第一个文件项，这会自动展开 TreeView
                const firstFile = fileChanges[0];
                const firstItem = new CommitFileItem(firstFile);
                await commitTreeView.reveal(firstItem, {
                    focus: true,
                    expand: true,
                    select: true
                });
            }

            // 显示消息
            vscode.window.showInformationMessage(`提交 ${commitId.substring(0, 7)} 的文件已显示，可直接点击查看变更`);

        } catch (error) {
            vscode.window.showErrorMessage(`加载提交详情失败: ${error}`);
        }
    });
    console.log('showCommitDetails 命令注册完成:', showCommitDetailsCommand);

    // 打开特定提交的文件
    console.log('开始注册 openFileAtCommit 命令...');
    const openFileAtCommitCommand = vscode.commands.registerCommand('git-hints.openFileAtCommit', async (change: CommitFileChange) => {
        console.log('openFileAtCommit 命令被执行，参数:', change);
        if (!change) {
            vscode.window.showErrorMessage('无法获取文件变更信息');
            return;
        }

        try {
            const commitInfo = commitTreeProvider.getCurrentCommitInfo();
            const commitId = commitInfo.commitId;
            const fileUri = change.uri;
            const relativePath = vscode.workspace.asRelativePath(fileUri.fsPath);
            const status = change.status;

            // 根据文件状态执行不同操作
            switch (status) {
                case 'A': // ADDED - 新增的文件，直接打开
                    {
                        const gitUri = toGitUri(fileUri, commitId);
                        await vscode.commands.executeCommand('vscode.open', gitUri);
                    }
                    break;

                case 'D': // DELETED - 删除的文件，显示删除前的内容
                    {
                        const gitUri = toGitUri(fileUri, `${commitId}~1`);
                        await vscode.commands.executeCommand('vscode.open', gitUri);
                    }
                    break;

                case 'R': // RENAMED - 重命名的文件，显示重命名前后的对比
                    {
                        const oldUri = change.originalUri || fileUri;
                        const leftUri = toGitUri(oldUri, `${commitId}~1`);
                        const rightUri = toGitUri(fileUri, commitId);

                        const oldRelativePath = vscode.workspace.asRelativePath(oldUri);
                        const title = `${oldRelativePath} → ${relativePath}`;
                        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
                    }
                    break;

                case 'M': // MODIFIED - 修改的文件，显示对比
                default:
                    {
                        const leftUri = toGitUri(fileUri, `${commitId}~1`);
                        const rightUri = toGitUri(fileUri, commitId);

                        const title = `${relativePath} (${commitId.substring(0, 7)}^ ↔ ${commitId.substring(0, 7)})`;
                        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
                    }
                    break;
            }

        } catch (error) {
            vscode.window.showErrorMessage(`打开文件对比失败: ${error}`);
        }
    });
    console.log('openFileAtCommit 命令注册完成:', openFileAtCommitCommand);

    // 纯函数：检查编辑器是否应该被处理
    const shouldProcessEditor = (editor: vscode.TextEditor): boolean => {
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

    // 更新装饰器
    const updateDecorations = async (editor: vscode.TextEditor, currentLine?: number) => {
        if (!state.isEnabled) {
            decorationManager.clearDecorations(editor);
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
                const lastLine = state.lastCurrentLine.get(filePath);
                if (lastLine === undefined) {
                    // 第一次打开文件且没有传入 currentLine，不执行任何操作
                    return;
                }
                lineToUse = lastLine;
            } else {
                // 记录当前行号
                state.lastCurrentLine.set(filePath, lineToUse);
            }

            const blameInfo = await blameManager.getBlameInfo(filePath);

            if (blameInfo && blameInfo instanceof Map) {
                decorationManager.updateDecorations(editor, blameInfo, lineToUse);
            }
        } catch (error) {
            console.error('更新装饰器失败:', error);
        }
    };

    // 更新所有可见编辑器
    const updateAllVisibleEditors = () => {
        vscode.window.visibleTextEditors
            .filter(editor => editor.document.languageId !== 'Log')
            .forEach(editor => {
                const currentLine = getCurrentLine(editor);
                updateDecorations(editor, currentLine);
            });
    };

    // 纯函数：获取当前行号（如果需要）
    const getCurrentLine = (editor: vscode.TextEditor): number | undefined => {
        return editor.selection.active.line;
    };

    // 监听编辑器变化
    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            // 切换文件时，清除旧文件缓存并重新获取
            const filePath = editor.document.uri.fsPath;
            clearFileCache(filePath); // 清除 git.ts 中的缓存
            blameManager.clearCache(filePath);
            const currentLine = getCurrentLine(editor);
            updateDecorations(editor, currentLine);
        }
        updateNavigationContext(editor);
    });

    // 纯函数：创建延迟执行函数
    const debounce = <T extends (...args: any[]) => void>(
        fn: T,
        delay: number
    ): ((...args: Parameters<T>) => void) => {
        return (...args: Parameters<T>) => {
            if (state.debounceTimer) {
                clearTimeout(state.debounceTimer);
            }
            state.debounceTimer = setTimeout(() => fn(...args), delay);
        };
    };

    // 创建文档变化的防抖更新函数
    const debouncedDocumentUpdate = debounce(
        (editor: vscode.TextEditor) => {
            const filePath = editor.document.uri.fsPath;
            clearFileCache(filePath); // 清除 git.ts 中的缓存
            blameManager.clearCache(filePath);
            updateDecorations(editor);
        },
        300
    );

    // 监听文档变化
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            debouncedDocumentUpdate(editor);
        }
    });

    // 监听配置变化
    const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('gitHints')) {
            updateAllVisibleEditors();
        }
    });

    // 获取性能配置
    const getPerformanceConfig = () => {
        const config = vscode.workspace.getConfiguration('gitHints.performance');
        return {
            debounceDelay: config.get<number>('debounceDelay') || 300,
            cacheTTL: config.get<number>('cacheTTL') || 5000,
            maxFileHistoryCache: config.get<number>('maxFileHistoryCache') || 50,
            maxDisplayCommits: config.get<number>('maxDisplayCommits') || 100
        };
    };

    // 监听光标位置变化（添加防抖处理和优化）
    const debouncedUpdateDecorations = debounce(
        (editor: vscode.TextEditor, currentLine: number) => {
            // 检查是否真的需要更新（行号是否改变）
            const filePath = editor.document.uri.fsPath;
            const lastLine = state.lastCurrentLine.get(filePath);

            if (lastLine !== currentLine) {
                updateDecorations(editor, currentLine);
            }
        },
        getPerformanceConfig().debounceDelay
    );

    const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;

        const currentLine = editor.selection.active.line;
        debouncedUpdateDecorations(editor, currentLine);
    });

    // 监听保存事件
    const onDidSaveTextDocument = vscode.workspace.onDidSaveTextDocument(document => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document) {
            const filePath = document.uri.fsPath;
            clearFileCache(filePath); // 清除 git.ts 中的缓存
            blameManager.clearCache(filePath);
            updateDecorations(editor);
        }
    });

    // 监听 git 仓库变更（提交、暂存、撤销等操作）
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitExtension) {
        const git = gitExtension.getAPI(1);

        // 监听所有仓库的变更
        git.repositories.forEach((repo: any) => {
            // 监听仓库状态变更
            repo.state.onDidChange(() => {
                // 清除所有缓存并更新所有可见编辑器
                clearExpiredCache(); // 清除 git.ts 中的所有缓存
                blameManager.clearCache();
                updateAllVisibleEditors();
            });
        });

        // 监听��仓库添加
        git.onDidOpenRepository((repo: any) => {
            repo.state.onDidChange(() => {
                clearExpiredCache(); // 清除 git.ts 中的所有缓存
                blameManager.clearCache();
                updateAllVisibleEditors();
            });
        });
    }

    // 手动刷新git hints
    console.log('开始注册 refreshGitHints 命令...');
    const refreshCommand = vscode.commands.registerCommand('git-hints.refreshGitHints', async () => {
        console.log('refreshGitHints 命令被执行');
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.uri.fsPath;
            clearFileCache(filePath); // 清除 git.ts 中的缓存
            blameManager.clearCache(filePath);
            await updateDecorations(editor);
            vscode.window.showInformationMessage('Git Hints 已刷新');
        } else {
            clearExpiredCache(); // 清除 git.ts 中的所有缓存
            blameManager.clearCache();
            updateAllVisibleEditors();
            vscode.window.showInformationMessage('Git Hints 已全部刷新');
        }
    });
    console.log('refreshGitHints 命令注册完成:', refreshCommand);

    // 更新导航按钮状态
    const updateNavigationContext = (editor: vscode.TextEditor | undefined) => {
        if (!editor) {
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigatePrevious', false);
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', false);
            return;
        }

        let filePath: string;
        if (editor.document.uri.scheme === 'git') {
            const query = JSON.parse(editor.document.uri.query);
            filePath = query.path;
        } else {
            filePath = editor.document.uri.fsPath;
        }

        const state = getFileHistoryState(filePath);
        const currentCommitHash = getCurrentCommitHash(editor);

        if (!state) {
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigatePrevious', true);
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', false);
        } else {
            const currentIndex = getCurrentIndex(state, currentCommitHash);
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigatePrevious', currentIndex + 1 < state.commits.length);
            vscode.commands.executeCommand('setContext', 'git-hints.canNavigateNext', currentIndex >= 0);
        }
    };

    // 文件历史导航：上一个版本（更旧）
    console.log('开始注册 previousVersion 命令...');
    const previousVersionCommand = vscode.commands.registerCommand('git-hints.previousVersion', async () => {
        console.log('previousVersion 命令被执行');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器');
            return;
        }

        await navigateToPreviousVersion(editor);
        updateNavigationContext(vscode.window.activeTextEditor);
    });
    console.log('previousVersion 命令注册完成:', previousVersionCommand);

    // 文件历史导航：下一个版本（更��）
    console.log('开始注册 nextVersion 命令...');
    const nextVersionCommand = vscode.commands.registerCommand('git-hints.nextVersion', async () => {
        console.log('nextVersion 命令被执行');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器');
            return;
        }

        await navigateToNextVersion(editor);
        updateNavigationContext(vscode.window.activeTextEditor);
    });
    console.log('nextVersion 命令注册完成:', nextVersionCommand);

    // 显示文件历史列表
    console.log('开始注册 showFileHistory 命令...');
    const showFileHistoryCommand = vscode.commands.registerCommand('git-hints.showFileHistory', async () => {
        console.log('showFileHistory 命令被执行');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的编辑器');
            return;
        }

        await showFileHistoryList(editor);
    });
    console.log('showFileHistory 命令注册完成:', showFileHistoryCommand);

    // 手动输入提交ID查看提交详情 - 支持终端联动
    console.log('开始注册 showCommitFromInput 命令...');
    const showCommitFromInputCommand = vscode.commands.registerCommand('git-hints.showCommitFromInput', async () => {
        console.log('showCommitFromInput 命令被执行');

        try {
            // 尝试从剪贴板获取 commit hash
            let commitId = '';
            try {
                const clipboardText = await vscode.env.clipboard.readText();
                // 检查剪贴板内容是否像 commit hash (7-40 位十六进制)
                const hashMatch = clipboardText.trim().match(/^([0-9a-f]{7,40})$/i);
                if (hashMatch) {
                    commitId = hashMatch[1];
                    console.log('从剪贴板获取到 commit hash:', commitId);
                }
            } catch (clipboardError) {
                console.log('无法访问剪贴板:', clipboardError);
            }

            // 如果剪贴板中没有有效的 commit hash，提示用户输入
            if (!commitId) {
                const input = await vscode.window.showInputBox({
                    placeHolder: '请输入提交 hash (如: a1b2c3d)',
                    prompt: '输入要查看的 Git 提交 hash',
                    value: commitId // 如果从剪贴板获取到了，作为默认值
                });

                if (!input) {
                    return; // 用户取消输入
                }

                commitId = input.trim();
            }

            // 验证 commit hash 格式
            if (!/^[0-9a-f]{7,40}$/i.test(commitId)) {
                vscode.window.showErrorMessage('无效的提交 hash 格式');
                return;
            }

            // 获取当前工作区路径
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('没有打开的工作区');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;

            // 验证 commit 是否存在
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            try {
                // 获取提交信息用于验证
                const { stdout } = await execAsync(`git show --format="%s" --no-patch ${commitId}`, {
                    cwd: workspacePath,
                    timeout: 10000
                });

                const commitMessage = stdout.trim();
                console.log('找到提交:', commitId, commitMessage);

                // 调用 showCommitDetails 显示提交详情
                await vscode.commands.executeCommand('git-hints.showCommitDetails', commitId);

            } catch (gitError: any) {
                if (gitError.message.includes('not found') || gitError.code === 128) {
                    vscode.window.showErrorMessage(`提交 ${commitId} 不存在`);
                } else {
                    vscode.window.showErrorMessage(`Git 错误: ${gitError.message}`);
                }
                return;
            }

        } catch (error: any) {
            console.error('showCommitFromInput 执行失败:', error);
            vscode.window.showErrorMessage(`执行失败: ${error.message}`);
        }
    });
    console.log('showCommitFromInput 命令注册完成:', showCommitFromInputCommand);

    // 初始化所有打开的编辑器
    updateAllVisibleEditors();
    updateNavigationContext(vscode.window.activeTextEditor);

    // 注册所有命令和监听器（函数式组合）
    console.log('开始创建订阅列表...');
    const subscriptions = [
        toggleCommand,
        copyCommitIdCommand,
        showCommitDetailsCommand,
        openFileAtCommitCommand,
        refreshCommand,
        previousVersionCommand,
        nextVersionCommand,
        showFileHistoryCommand,
        showCommitFromInputCommand,
        commitTreeView,
        ...(terminalLinkProvider ? [terminalLinkProvider] : []),
        onDidChangeActiveEditor,
        onDidChangeTextDocument,
        onDidChangeConfiguration,
        onDidSaveTextDocument,
        onDidChangeTextEditorSelection,
        { dispose: () => decorationManager.dispose() },
        { dispose: () => blameManager.dispose() },
        { dispose: () => {
            // 清理定时器
            if (state.cacheCleanupInterval) {
                clearInterval(state.cacheCleanupInterval);
            }
            // 清理文件历史状态
            clearFileHistoryState();
            // 清理 TreeView 状态
            commitTreeProvider.clear();
        }}
    ];

    console.log('订阅列表创建完成，包含', subscriptions.length, '个项目');
    console.log('开始将订阅推送到上下文...');
    context.subscriptions.push(...subscriptions);
    console.log('订阅推送完成，上下文订阅数量:', context.subscriptions.length);
    console.log('所有命令注册完成，扩展激活流程结束');
}

export function deactivate() {
    // 清理工作由 subscriptions 自动处理
}
