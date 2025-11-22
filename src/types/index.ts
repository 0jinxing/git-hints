// 类型定义

export interface GitBlameInfo {
  commitId: string;
  author: string;
  date: string;
  line: number;
  content: string;
  message?: string;  // 提交消息
  isUncommitted?: boolean;  // 未提交的修改（包括暂存区和工作区）
}

export interface GitCommandOptions {
  cwd: string;
  maxBuffer?: number;
}

export type BlameCache = Map<string, Map<number, GitBlameInfo>>;
