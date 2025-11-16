// Git 操作的函数式封装（副作用隔离）

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { GitBlameInfo, GitCommandOptions } from '../types';
import { parseBlameOutput, buildBlameCommand, buildShowCommand, buildRevParseCommand, buildDiffCachedCommand, parseDiffOutput, buildDiffTreeCommand, parseDiffTreeOutput, FileChange } from '../utils/git';

const execAsync = promisify(exec);

// 调试输出通道（副作用）
const debugChannel = vscode.window.createOutputChannel('Git Hints Debug');

// 性能优化：缓存
const gitRepoCache = new Map<string, boolean>();
const blameCache = new Map<string, { data: Map<number, GitBlameInfo>; timestamp: number }>();

// 获取缓存 TTL 配置
const getCacheTTL = (): number => {
  const config = vscode.workspace.getConfiguration('gitHints.performance');
  return config.get<number>('cacheTTL') || 5000;
};

// 性能优化：调试日志开关
let isDebugEnabled = false;

export const setDebugEnabled = (enabled: boolean) => {
  isDebugEnabled = enabled;
};

const debugLog = (message: string) => {
  if (isDebugEnabled) {
    debugChannel.appendLine(message);
  }
};

/**
 * 执行 git 命令（副作用函数）
 */
const executeGitCommand = async (
  command: string,
  options: GitCommandOptions
): Promise<{ stdout: string; stderr: string }> => {
  debugLog(`执行命令: ${command}`);
  debugLog(`工作目录: ${options.cwd}`);

  try {
    const result = await execAsync(command, options);
    debugLog(`命令执行成功`);
    return result;
  } catch (error: any) {
    debugLog(`命令执行失败: ${error.message}`);
    throw error;
  }
};

/**
 * 检查是否为 git 仓库（带缓存）
 */
export const isGitRepository = async (filePath: string): Promise<boolean> => {
  try {
    const directoryPath = path.dirname(filePath);

    // 检查缓存
    if (gitRepoCache.has(directoryPath)) {
      return gitRepoCache.get(directoryPath)!;
    }

    const command = buildRevParseCommand('git');
    const { stdout } = await executeGitCommand(command, { cwd: directoryPath });

    const result = stdout.trim() === 'true';
    debugLog(`git仓库检查结果: ${result}`);

    // 缓存结果
    gitRepoCache.set(directoryPath, result);

    return result;
  } catch (error: any) {
    debugLog(`git仓库检查失败: ${error.message}`);
    gitRepoCache.set(path.dirname(filePath), false);
    return false;
  }
};

/**
 * 获取暂存区修改的行号
 */
export const getStagedLines = async (filePath: string): Promise<Set<number>> => {
  try {
    debugLog(`获取暂存区信息: ${filePath}`);

    const directoryPath = path.dirname(filePath);
    const command = buildDiffCachedCommand('git', filePath);

    const { stdout } = await executeGitCommand(command, {
      cwd: directoryPath
    });

    const stagedLines = parseDiffOutput(stdout);
    debugLog(`解析完成，暂存区修改了 ${stagedLines.size} 行`);

    return stagedLines;
  } catch (error: any) {
    debugLog(`获取暂存区信息失败: ${error.message}`);
    return new Set();
  }
};

/**
 * 获取文件的 blame 信息（包含暂存区状态）- 带缓存
 */
export const getFileBlameInfo = async (filePath: string): Promise<Map<number, GitBlameInfo>> => {
  try {
    debugLog(`获取文件blame信息: ${filePath}`);

    // 检查缓存
    const cached = blameCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < getCacheTTL()) {
      debugLog(`使用缓存的blame信息: ${filePath}`);
      return cached.data;
    }

    const directoryPath = path.dirname(filePath);
    const command = buildBlameCommand('git', filePath);

    // 并行获取 blame 信息和暂存区信息
    const [blameResult, stagedLines] = await Promise.all([
      executeGitCommand(command, {
        cwd: directoryPath,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }),
      getStagedLines(filePath)
    ]);

    const blameMap = parseBlameOutput(blameResult.stdout);
    debugLog(`解析完成，获取到 ${blameMap.size} 行blame信息`);

    // 优化：只在有暂存区修改时才遍历
    if (stagedLines.size > 0) {
      // 优化：直接遍历暂存区的行，而不是遍历所有blame行
      for (const lineNumber of stagedLines) {
        const blameInfo = blameMap.get(lineNumber);
        if (blameInfo) {
          blameInfo.isUncommitted = true;
          debugLog(`行 ${lineNumber} 在暂存区`);
        }
      }
    }

    // 缓存结果
    blameCache.set(filePath, {
      data: blameMap,
      timestamp: Date.now()
    });

    return blameMap;
  } catch (error: any) {
    debugLog(`获取文件blame信息失败: ${error.message}`);
    return new Map();
  }
};

/**
 * 获取提交详情
 */
export const getCommitDetails = async (commitId: string, workspacePath?: string): Promise<string> => {
  try {
    debugLog(`获取提交详情: ${commitId}`);

    const cwd = workspacePath || vscode.workspace.rootPath || process.cwd();
    const command = buildShowCommand('git', commitId);

    const { stdout } = await executeGitCommand(command, { cwd });

    debugLog(`成功获取提交详情，长度: ${stdout.length}`);
    return stdout;
  } catch (error: any) {
    debugLog(`获取提交详情失败: ${error.message}`);
    return `无法获取提交 ${commitId} 的详细信息`;
  }
};

/**
 * 获取提交的文件变更列表（包括删除的文件）
 */
export const getCommitChangedFiles = async (commitId: string, workspacePath: string): Promise<FileChange[]> => {
  try {
    debugLog(`获取提交的文件变更列表: ${commitId}`);

    const command = buildDiffTreeCommand('git', commitId);
    const { stdout } = await executeGitCommand(command, { cwd: workspacePath });

    const changes = parseDiffTreeOutput(stdout);
    debugLog(`成功获取 ${changes.length} 个文件变更`);

    return changes;
  } catch (error: any) {
    debugLog(`获取文件变更列表失败: ${error.message}`);
    return [];
  }
};

/**
 * 清除指定文件的缓存
 */
export const clearFileCache = (filePath: string) => {
  blameCache.delete(filePath);
  debugLog(`清除文件缓存: ${filePath}`);
};

/**
 * 清除所有缓存
 */
export const clearAllCache = () => {
  gitRepoCache.clear();
  blameCache.clear();
  debugLog('清除所有缓存');
};

/**
 * 清除过期的缓存
 */
export const clearExpiredCache = () => {
  const now = Date.now();
  let blameCleared = 0;
  let repoCleared = 0;

  // 清理过期的 blame 缓存
  for (const [key, value] of blameCache.entries()) {
    if (now - value.timestamp >= getCacheTTL()) {
      blameCache.delete(key);
      blameCleared++;
    }
  }

  // 清理 gitRepoCache - 设置最大缓存大小
  const MAX_REPO_CACHE_SIZE = 100;
  if (gitRepoCache.size > MAX_REPO_CACHE_SIZE) {
    // 使用简单的 LRU 策略：删除前 N 个条目
    const keysToDelete = Array.from(gitRepoCache.keys()).slice(0, gitRepoCache.size - MAX_REPO_CACHE_SIZE);
    for (const key of keysToDelete) {
      gitRepoCache.delete(key);
      repoCleared++;
    }
  }

  if (blameCleared > 0 || repoCleared > 0) {
    debugLog(`清除了 ${blameCleared} 个过期blame缓存和 ${repoCleared} 个仓库缓存`);
  }
};

/**
 * 创建 git 服务（返回函数集合）
 */
export const createGitService = () => ({
  isGitRepository,
  getFileBlameInfo,
  getCommitDetails,
  getCommitChangedFiles,
  clearFileCache,
  clearAllCache,
  clearExpiredCache,
  setDebugEnabled
});
