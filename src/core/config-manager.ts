/**
 * 统一配置管理模块
 * 负责所有配置的获取和管理
 */

import * as vscode from 'vscode';

export interface PerformanceConfig {
  debounceDelay: number;
  cacheTTL: number;
  maxFileHistoryCache: number;
  maxDisplayCommits: number;
}

export interface GitHintsConfig {
  performance: PerformanceConfig;
  debug: {
    enabled: boolean;
  };
  features: {
    blameEnabled: boolean;
    decorationEnabled: boolean;
    treeViewEnabled: boolean;
  };
}

/**
 * 获取完整的 Git Hints 配置
 */
export const getGitHintsConfig = (): GitHintsConfig => {
  const performanceConfig = vscode.workspace.getConfiguration('gitHints.performance');
  const debugConfig = vscode.workspace.getConfiguration('gitHints.debug');
  const featuresConfig = vscode.workspace.getConfiguration('gitHints.features');

  return {
    performance: {
      debounceDelay: performanceConfig.get<number>('debounceDelay') || 300,
      cacheTTL: performanceConfig.get<number>('cacheTTL') || 5000,
      maxFileHistoryCache: performanceConfig.get<number>('maxFileHistoryCache') || 50,
      maxDisplayCommits: performanceConfig.get<number>('maxDisplayCommits') || 100,
    },
    debug: {
      enabled: debugConfig.get<boolean>('enabled') || false,
    },
    features: {
      blameEnabled: featuresConfig.get<boolean>('blameEnabled') ?? true,
      decorationEnabled: featuresConfig.get<boolean>('decorationEnabled') ?? true,
      treeViewEnabled: featuresConfig.get<boolean>('treeViewEnabled') ?? true,
    },
  };
};

/**
 * 获取性能配置
 */
export const getPerformanceConfig = (): PerformanceConfig => {
  return getGitHintsConfig().performance;
};

/**
 * 获取调试配置
 */
export const getDebugConfig = () => {
  return getGitHintsConfig().debug;
};

/**
 * 获取功能配置
 */
export const getFeaturesConfig = () => {
  return getGitHintsConfig().features;
};

/**
 * 监听配置变化
 */
export const onConfigChange = (callback: (config: GitHintsConfig) => void): vscode.Disposable => {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('gitHints')) {
      callback(getGitHintsConfig());
    }
  });
};