/**
 * Git 命令执行器 - 基础设施层
 * 负责执行 Git 命令并返回结果
 */

import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface GitExecutorOptions {
  cwd: string;
  maxBuffer?: number;
}

export interface GitExecutionResult {
  stdout: string;
  stderr: string;
}

/**
 * Git 命令执行器
 */
export class GitExecutor {
  private gitPath: string;

  constructor(gitPath = 'git') {
    this.gitPath = gitPath;
  }

  /**
   * 执行 Git 命令
   */
  async execute(command: string, options: GitExecutorOptions): Promise<GitExecutionResult> {
    const execOptions: ExecOptions = {
      cwd: options.cwd,
      maxBuffer: options.maxBuffer || 10 * 1024 * 1024 // 默认 10MB
    };

    const result = await execAsync(command, execOptions);
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString()
    };
  }

  /**
   * 检查路径是否为 Git 仓库
   */
  async isInsideWorkTree(filePath: string): Promise<boolean> {
    const directoryPath = path.dirname(filePath);
    try {
      const { stdout } = await this.execute(this.buildRevParseCommand(), { cwd: directoryPath });
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 构建 blame 命令
   */
  buildBlameCommand(filePath: string): string {
    return `"${this.gitPath}" blame --porcelain --line-porcelain "${filePath}"`;
  }

  /**
   * 构建 show 命令
   */
  buildShowCommand(commitId: string): string {
    return `"${this.gitPath}" show --stat ${commitId}`;
  }

  /**
   * 构建 rev-parse 命令
   */
  buildRevParseCommand(): string {
    return `"${this.gitPath}" rev-parse --is-inside-work-tree`;
  }

  /**
   * 构建 diff --cached 命令
   */
  buildDiffCachedCommand(filePath: string): string {
    return `"${this.gitPath}" diff --cached --unified=0 "${filePath}"`;
  }

  /**
   * 构建 diff-tree 命令
   */
  buildDiffTreeCommand(commitId: string): string {
    return `"${this.gitPath}" -c core.quotePath=false diff-tree --no-commit-id --name-status -r -z ${commitId}`;
  }

  /**
   * 构建 file log 命令
   */
  buildFileLogCommand(relativePath: string): string {
    return `"${this.gitPath}" -c core.quotePath=false log --follow --name-status --format="%H|%an|%ai|%s" -- "${relativePath}"`;
  }

}
