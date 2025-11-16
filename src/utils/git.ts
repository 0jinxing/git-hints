// 纯函数：Git 相关的数据解析和处理

import { GitBlameInfo } from '../types';
import { formatTimestamp } from './date';
import * as vscode from 'vscode';

/**
 * 检查是否为未提交的 commit ID（全0）
 */
const isUncommittedCommit = (commitId: string): boolean => {
  return commitId === '0000000000000000000000000000000000000000';
};

/**
 * 解析 git blame porcelain 格式的输出
 */
export const parseBlameOutput = (output: string): Map<number, GitBlameInfo> => {
  const blameMap = new Map<number, GitBlameInfo>();
  const lines = output.split('\n');

  // 缓存每个 commit 的信息，避免重复解析
  const commitCache = new Map<string, { author: string; date: string; message: string; isUncommitted: boolean }>();

  let currentCommitId = '';
  let currentFullCommitId = '';
  let currentAuthor = '';
  let currentDate = '';
  let currentMessage = '';
  let currentLineNumber = 0;
  let isUncommitted = false;
  let hasCommitInfo = false;

  for (const line of lines) {
    // 优化：跳过空行
    if (!line.trim()) {
      continue;
    }

    // 解析 commit ID 和行号
    if (/^[0-9a-f]{40}/.test(line)) {
      const parts = line.split(' ');
      currentFullCommitId = parts[0];
      currentLineNumber = parseInt(parts[2]);

      // 检查是否为未提交的修改
      isUncommitted = isUncommittedCommit(currentFullCommitId);

      if (isUncommitted) {
        currentCommitId = 'Not Committed Yet';
        currentAuthor = 'You';
        currentDate = new Date().toISOString().slice(0, 16).replace('T', ' ');
        currentMessage = '';
        hasCommitInfo = true;
      } else {
        currentCommitId = currentFullCommitId.substring(0, 8);

        // 检查缓存中是否已有该 commit 的信息
        const cached = commitCache.get(currentFullCommitId);
        if (cached) {
          currentAuthor = cached.author;
          currentDate = cached.date;
          currentMessage = cached.message;
          isUncommitted = cached.isUncommitted;
          hasCommitInfo = true;
        } else {
          // 重置状态，等待解析完整的 commit 信息
          hasCommitInfo = false;
        }
      }
    } else if (line.startsWith('author ')) {
      currentAuthor = line.substring(7);
    } else if (line.startsWith('author-time ')) {
      const timestamp = parseInt(line.substring(12));
      currentDate = formatTimestamp(timestamp);
    } else if (line.startsWith('summary ')) {
      currentMessage = line.substring(8);

      // 缓存该 commit 的信息
      if (currentFullCommitId && !isUncommitted) {
        commitCache.set(currentFullCommitId, {
          author: currentAuthor,
          date: currentDate,
          message: currentMessage,
          isUncommitted
        });
      }
      hasCommitInfo = true;
    } else if (line.startsWith('\t')) {
      // 代码内容行，保存当前行的 blame 信息
      if (hasCommitInfo && currentCommitId && currentAuthor && currentLineNumber > 0) {
        blameMap.set(currentLineNumber, {
          commitId: currentCommitId,
          author: currentAuthor,
          date: currentDate,
          message: currentMessage,
          line: currentLineNumber,
          content: line.substring(1),
          isUncommitted
        });
      }
    }
  }

  return blameMap;
};

/**
 * 检查文件路径是否应该被忽略
 */
export const shouldIgnoreFile = (filePath: string): boolean => {
  return (
    filePath.includes('.git\\') ||
    filePath.includes('.git/') ||
    filePath.endsWith('.gitignore')
  );
};

/**
 * 构建 git blame 命令
 */
export const buildBlameCommand = (gitPath: string, filePath: string): string => {
  return `"${gitPath}" blame --porcelain --line-porcelain "${filePath}"`;
};

/**
 * 构建 git show 命令
 */
export const buildShowCommand = (gitPath: string, commitId: string): string => {
  return `"${gitPath}" show --stat ${commitId}`;
};

/**
 * 构建 git rev-parse 命令
 */
export const buildRevParseCommand = (gitPath: string): string => {
  return `"${gitPath}" rev-parse --is-inside-work-tree`;
};

/**
 * 构建 git diff --cached 命令（获取暂存区的修改）
 */
export const buildDiffCachedCommand = (gitPath: string, filePath: string): string => {
  return `"${gitPath}" diff --cached --unified=0 "${filePath}"`;
};

/**
 * 解析 git diff 输出，获取暂存区修改的行号
 */
export const parseDiffOutput = (output: string): Set<number> => {
  const stagedLines = new Set<number>();
  const lines = output.split('\n');

  for (const line of lines) {
    // 匹配 @@ -a,b +c,d @@ 格式
    // +c,d 表示新文件中的行号范围
    const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (match) {
      const startLine = parseInt(match[1]);
      const lineCount = match[2] ? parseInt(match[2]) : 1;

      // 添加所有修改的行号
      for (let i = 0; i < lineCount; i++) {
        stagedLines.add(startLine + i);
      }
    }
  }

  return stagedLines;
};

/**
 * 构建 git diff-tree 命令（获取提交的文件变更列表，包括删除的文件）
 */
export const buildDiffTreeCommand = (gitPath: string, commitId: string): string => {
  // 添加 -z 参数使用 NUL 字符分隔，避免中文文件名被转义
  // 添加 -c core.quotePath=false 确保中文路径不被转义
  return `"${gitPath}" -c core.quotePath=false diff-tree --no-commit-id --name-status -r -z ${commitId}`;
};

/**
 * 文件变更信息
 */
export interface FileChange {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';
  path: string;
  oldPath?: string; // 用于重命名的情况
}

/**
 * 解析 git diff-tree 输出，获取文件变更列表
 * 使用 -z 参数时，输出格式为：status\0oldPath\0newPath\0（重命名）或 status\0path\0
 */
export const parseDiffTreeOutput = (output: string): FileChange[] => {
  const changes: FileChange[] = [];

  // 使用 NUL 字符分隔（因为使用了 -z 参数）
  const parts = output.split('\0').filter(part => part.trim());

  let i = 0;
  while (i < parts.length) {
    const statusPart = parts[i];
    if (!statusPart) {
      i++;
      continue;
    }

    const status = statusPart[0] as FileChange['status'];

    // 处理重命名的情况 (R100, R095 等)
    if (status === 'R' && i + 2 < parts.length) {
      changes.push({
        status: 'R',
        oldPath: parts[i + 1],
        path: parts[i + 2]
      });
      i += 3; // 跳过 status, oldPath, newPath
    } else if (i + 1 < parts.length) {
      changes.push({
        status,
        path: parts[i + 1]
      });
      i += 2; // 跳过 status, path
    } else {
      i++;
    }
  }

  return changes;
};

/**
 * 创建 Git URI，正确处理中文文件名
 */
export function toGitUri(uri: vscode.Uri, ref: string, replaceFileExtension = false) {
    // 尝试使用 VSCode 内置的 Git 扩展的 API
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (gitExtension && gitExtension.exports) {
        try {
            const api = gitExtension.exports.getAPI(1);
            if (api && api.toGitUri) {
                return api.toGitUri(uri, ref);
            }
        } catch (error) {
            console.warn('Failed to use Git extension API, falling back to manual implementation:', error);
        }
    }

    // 回退到手动实现
    const query = JSON.stringify({
        path: uri.fsPath,
        ref
    });

    let path = uri.path;
    if (replaceFileExtension) {
        path = `${path}.git`;
    }

    return uri.with({
        scheme: 'git',
        path,
        query
    });
}