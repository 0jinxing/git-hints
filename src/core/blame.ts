// Blame 缓存管理（函数式风格）

import { GitBlameInfo } from '../types';
import { getFileBlameInfo, isGitRepository } from './git';

/**
 * 创建缓存
 */
export type Cache = Map<string, Map<number, GitBlameInfo>>;
export const createCache = () => new Map<string, Map<number, GitBlameInfo>>();

/**
 * 从缓存中获取数据（纯函数）
 */
export const getCached = (cache: Cache, filePath: string): Map<number, GitBlameInfo> | undefined => {
  return cache.get(filePath);
};

/**
 * 设置缓存（返回新的缓存）
 */
export const setCache = (
  cache: Cache,
  filePath: string,
  blameInfo: Map<number, GitBlameInfo>
): Cache => {
  cache.set(filePath, blameInfo);
  return cache;
};

/**
 * 清除缓存（返回新的缓存）
 */
export const clearCache = (cache: Cache, filePath?: string): Cache => {
  if (filePath) {
    cache.delete(filePath);
    return cache;
  }
  return createCache();
};

/**
 * 获取 blame 信息（带缓存）
 */
export const getBlameInfo = async (
  cache: Cache,
  filePath: string
): Promise<{ blameInfo: Map<number, GitBlameInfo> | null; newCache: Cache }> => {
  try {
    // 检查是否为 git 仓库
    const isRepo = await isGitRepository(filePath);
    if (!isRepo) {
      return { blameInfo: null, newCache: cache };
    }

    // 检查缓存
    const cached = getCached(cache, filePath);
    if (cached) {
      return { blameInfo: cached, newCache: cache };
    }

    // 获取新数据
    const blameMap = await getFileBlameInfo(filePath);

    if (blameMap.size > 0) {
      const newCache = setCache(cache, filePath, blameMap);
      return { blameInfo: blameMap, newCache };
    }

    return { blameInfo: null, newCache: cache };
  } catch (error) {
    console.error('获取blame信息失败:', error);
    return { blameInfo: null, newCache: cache };
  }
};

/**
 * 创建 blame 管理器（返回函数集合和状态管理）
 */
export const createBlameManager = () => {
  let cache: Cache = createCache();

  return {
    getBlameInfo: async (filePath: string) => {
      const result = await getBlameInfo(cache, filePath);
      cache = result.newCache;
      return result.blameInfo;
    },
    clearCache: (filePath?: string) => {
      cache = clearCache(cache, filePath);
    },
    dispose: () => {
      cache = createCache();
    }
  };
};
