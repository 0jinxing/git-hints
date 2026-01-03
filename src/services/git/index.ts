/**
 * Git 服务层
 * 封装 Git 相关的业务逻辑
 */

import * as path from 'path';
import { GitBlameInfo, FileChange, CommitDetails } from '../../types';
import { GitExecutor } from '../../infrastructure/git-executor';
import { CacheService } from '../cache';

// ==================== 解析函数 ====================

/**
 * 检查是否为未提交的 commit ID
 */
const isUncommittedCommit = (commitId: string): boolean => {
  return commitId === '0000000000000000000000000000000000000000';
};

/**
 * 解析时间戳
 */
const parseTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
};

/**
 * 解析 git blame porcelain 输出
 */
const parseBlameOutput = (output: string): Map<number, GitBlameInfo> => {
  const blameMap = new Map<number, GitBlameInfo>();
  const lines = output.split('\n');

  const commitCache = new Map<string, { author: string; date: string; message: string }>();

  let currentCommitId = '';
  let currentFullCommitId = '';
  let currentAuthor = '';
  let currentDate = '';
  let currentMessage = '';
  let currentLineNumber = 0;
  let hasCommitInfo = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^[0-9a-f]{40}/.test(line)) {
      const parts = line.split(' ');
      currentFullCommitId = parts[0];
      currentLineNumber = parseInt(parts[2]);

      if (isUncommittedCommit(currentFullCommitId)) {
        currentCommitId = 'Not Committed Yet';
        currentAuthor = 'You';
        currentDate = parseTimestamp(Date.now() / 1000);
        currentMessage = '';
        hasCommitInfo = true;
      } else {
        currentCommitId = currentFullCommitId.substring(0, 8);
        const cached = commitCache.get(currentFullCommitId);
        if (cached) {
          currentAuthor = cached.author;
          currentDate = cached.date;
          currentMessage = cached.message;
          hasCommitInfo = true;
        } else {
          hasCommitInfo = false;
        }
      }
    } else if (line.startsWith('author ')) {
      currentAuthor = line.substring(7);
    } else if (line.startsWith('author-time ')) {
      const timestamp = parseInt(line.substring(12));
      currentDate = parseTimestamp(timestamp);
    } else if (line.startsWith('summary ')) {
      currentMessage = line.substring(8);
      if (currentFullCommitId && !isUncommittedCommit(currentFullCommitId)) {
        commitCache.set(currentFullCommitId, {
          author: currentAuthor,
          date: currentDate,
          message: currentMessage
        });
      }
      hasCommitInfo = true;
    } else if (line.startsWith('\t')) {
      if (hasCommitInfo && currentCommitId && currentAuthor && currentLineNumber > 0) {
        blameMap.set(currentLineNumber, {
          commitId: currentCommitId,
          author: currentAuthor,
          date: currentDate,
          message: currentMessage,
          line: currentLineNumber,
          content: line.substring(1)
        });
      }
    }
  }

  return blameMap;
};

/**
 * 解析 git diff 输出，获取暂存区修改的行号
 */
const parseDiffOutput = (output: string): Set<number> => {
  const stagedLines = new Set<number>();
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (match) {
      const startLine = parseInt(match[1]);
      const lineCount = match[2] ? parseInt(match[2]) : 1;
      for (let i = 0; i < lineCount; i++) {
        stagedLines.add(startLine + i);
      }
    }
  }

  return stagedLines;
};

/**
 * 解析 git diff-tree 输出
 */
const parseDiffTreeOutput = (output: string): FileChange[] => {
  const changes: FileChange[] = [];
  const parts = output.split('\0').filter(part => part.trim());

  let i = 0;
  while (i < parts.length) {
    const statusPart = parts[i];
    if (!statusPart) {
      i++;
      continue;
    }

    const status = statusPart[0] as FileChange['status'];

    if (status === 'R' && i + 2 < parts.length) {
      changes.push({ status: 'R', oldPath: parts[i + 1], path: parts[i + 2] });
      i += 3;
    } else if (i + 1 < parts.length) {
      changes.push({ status, path: parts[i + 1] });
      i += 2;
    } else {
      i++;
    }
  }

  return changes;
};

const parseFileHistory = (output: string, relativePath: string, workspaceRoot: string) => {
  const commits: CommitDetails[] = [];
  const lines = output.trim().split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('|');
    if (parts.length >= 4) {
      let commitFilePath = relativePath;
      let oldFilePath: string | undefined;
      let status: CommitDetails['status'] = 'M';

      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine) {
          const statusMatch = nextLine.match(/^([AMDRTCU])\d*\t(.+)$/);
          if (statusMatch) {
            status = statusMatch[1] as CommitDetails['status'];
            const paths = statusMatch[2].split('\t');
            if (status === 'R' && paths.length >= 2) {
              oldFilePath = paths[0];
              commitFilePath = paths[1];
            } else {
              commitFilePath = paths[paths.length - 1];
            }
          } else {
            commitFilePath = nextLine;
          }
          i = j;
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
}

// ==================== Git 服务实现 ====================

export class GitService {

  constructor(private executor: GitExecutor, private cache: CacheService) {
    // 使用 CacheService 确保导入不被优化
    void CacheService;
  }

  /**
   * 获取文件的 Blame 信息
   */
  async getBlameInfo(filePath: string): Promise<Map<number, GitBlameInfo> | undefined> {
    // 检查缓存
    const cached = this.cache.getBlameCache(filePath);
    if (cached) {
      return cached;
    }

    // 检查是否为 Git 仓库
    const isRepo = await this.executor.isInsideWorkTree(filePath);

    if (!isRepo) {
      return undefined;
    }

    const directoryPath = path.dirname(filePath);

    // 并行获取 blame 和暂存区信息
    const [blameResult, stagedResult] = await Promise.all([
      this.executor.execute(this.executor.buildBlameCommand(filePath), { cwd: directoryPath }),
      this.executor.execute(this.executor.buildDiffCachedCommand(filePath), { cwd: directoryPath })
    ]);

    const blameMap = parseBlameOutput(blameResult.stdout);
    const stagedLines = parseDiffOutput(stagedResult.stdout);

    // 标记暂存区修改
    if (stagedLines.size > 0) {
      for (const lineNumber of stagedLines) {
        const blameInfo = blameMap.get(lineNumber);
        if (blameInfo) {
          blameInfo.isUncommitted = true;
        }
      }
    }

    // 缓存结果
    this.cache.setBlameCache(filePath, blameMap);

    return blameMap.size > 0 ? blameMap : undefined;
  }

  /**
   * 获取提交的文件变更列表
   */
  async getCommitChangedFiles(commitId: string, workspacePath: string): Promise<FileChange[]> {
    // 检查缓存
    const cached = this.cache.getCommitFileCache(commitId);
    if (cached) {
      return cached;
    }

    const command = this.executor.buildDiffTreeCommand(commitId);
    const result = await this.executor.execute(command, { cwd: workspacePath });
    const changes = parseDiffTreeOutput(result.stdout);

    this.cache.setCommitFileCache(commitId, changes);
    return changes;
  }

  async getFileHistory(filePath: string, workspacePath: string) {
    const relativePath = path.relative(workspacePath, filePath).replace(/\\/g, '/');
    const command = this.executor.buildFileLogCommand(relativePath)

    const result = await this.executor.execute(command, { cwd: workspacePath })
    return parseFileHistory(result.stdout, relativePath, workspacePath)
  }

  /**
   * 清除缓存
   */
  clearCache(filePath?: string): void {
    this.cache.clearBlameCache(filePath);
  }
}
