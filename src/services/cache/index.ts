/**
 * 统一缓存服务
 * 负责管理应用中的各种缓存
 */

import { GitBlameInfo, FileChange } from '../../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * 缓存服务
 */
export class CacheService {
  private blameCache = new Map<string, CacheEntry<Map<number, GitBlameInfo>>>();
  private gitRepoCache = new Map<string, boolean>();
  private commitFileCache = new Map<string, CacheEntry<FileChange[]>>();

  // 配置
  private cacheTTL: number = 5000;
  private maxRepoCacheSize: number = 100;

  /**
   * 更新缓存配置
   */
  updateConfig(config: { cacheTTL: number; maxRepoCacheSize?: number }): void {
    this.cacheTTL = config.cacheTTL;
    if (config.maxRepoCacheSize) {
      this.maxRepoCacheSize = config.maxRepoCacheSize;
    }
  }

  /**
   * 获取 Blame 缓存
   */
  getBlameCache(filePath: string): Map<number, GitBlameInfo> | undefined {
    const entry = this.blameCache.get(filePath);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data;
    }
    this.blameCache.delete(filePath);
    return undefined;
  }

  /**
   * 设置 Blame 缓存
   */
  setBlameCache(filePath: string, data: Map<number, GitBlameInfo>): void {
    this.blameCache.set(filePath, { data, timestamp: Date.now() });
  }

  /**
   * 清除 Blame 缓存
   */
  clearBlameCache(filePath?: string): void {
    if (filePath) {
      this.blameCache.delete(filePath);
    } else {
      this.blameCache.clear();
    }
  }

  /**
   * 获取 Git 仓库状态缓存
   */
  getGitRepoCache(directoryPath: string): boolean | undefined {
    return this.gitRepoCache.get(directoryPath);
  }

  /**
   * 设置 Git 仓库状态缓存
   */
  setGitRepoCache(directoryPath: string, isRepo: boolean): void {
    // 清理旧缓存
    if (this.gitRepoCache.size > this.maxRepoCacheSize) {
      const keysToDelete = Array.from(this.gitRepoCache.keys())
        .slice(0, this.gitRepoCache.size - this.maxRepoCacheSize);
      for (const key of keysToDelete) {
        this.gitRepoCache.delete(key);
      }
    }
    this.gitRepoCache.set(directoryPath, isRepo);
  }

  /**
   * 获取提交文件变更缓存
   */
  getCommitFileCache(commitId: string): FileChange[] | undefined {
    const entry = this.commitFileCache.get(commitId);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data;
    }
    this.commitFileCache.delete(commitId);
    return undefined;
  }

  /**
   * 设置提交文件变更缓存
   */
  setCommitFileCache(commitId: string, data: FileChange[]): void {
    this.commitFileCache.set(commitId, { data, timestamp: Date.now() });
  }

  /**
   * 清除所有过期缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();

    // 清理过期的 blame 缓存
    for (const [key, entry] of this.blameCache.entries()) {
      if (now - entry.timestamp >= this.cacheTTL) {
        this.blameCache.delete(key);
      }
    }

    // 清理提交文件缓存
    for (const [key, entry] of this.commitFileCache.entries()) {
      if (now - entry.timestamp >= this.cacheTTL) {
        this.commitFileCache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.blameCache.clear();
    this.gitRepoCache.clear();
    this.commitFileCache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { blameCacheSize: number; gitRepoCacheSize: number; commitFileCacheSize: number } {
    return {
      blameCacheSize: this.blameCache.size,
      gitRepoCacheSize: this.gitRepoCache.size,
      commitFileCacheSize: this.commitFileCache.size
    };
  }
}
