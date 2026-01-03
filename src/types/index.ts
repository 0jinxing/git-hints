/**
 * Git 相关的类型定义
 */

export interface GitBlameInfo {
  commitId: string;
  author: string;
  date: string;
  line: number;
  content: string;
  message?: string;
  isUncommitted?: boolean;
}

export interface GitCommandOptions {
  cwd: string;
  maxBuffer?: number;
}

export type BlameCache = Map<string, Map<number, GitBlameInfo>>;

// 文件变更状态类型
export type FileChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface FileChange {
  status: FileChangeStatus;
  path: string;
  oldPath?: string;
}

export interface CommitDetails {
  hash: string;
  author: string;
  date: Date;
  message: string;
  filePath: string;
  oldFilePath?: string;
  status: FileChangeStatus;
}
