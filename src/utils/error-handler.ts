/**
 * 统一的错误处理机制
 */

import * as vscode from 'vscode';

/**
 * 错误处理器类
 */
export class ErrorHandler {
  /**
   * 处理错误并显示用户友好的消息
   */
  static handle(error: unknown, context: string): void {
    console.error(`[Git Hints] ${context}:`, error);

    if (error instanceof Error) {
      vscode.window.showErrorMessage(`${context}: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`${context}: 发生未知错误`);
    }
  }

  /**
   * 处理 Git 命令执行错误
   */
  static handleGitError(error: unknown, command: string): void {
    if (error instanceof Error) {
      if (error.message.includes('not found') || (error as any).code === 128) {
        vscode.window.showErrorMessage(`Git 命令执行失败: 未找到 ${command}`);
      } else if (error.message.includes('permission denied')) {
        vscode.window.showErrorMessage(`Git 命令执行失败: 权限不足`);
      } else {
        vscode.window.showErrorMessage(`Git 命令执行失败: ${error.message}`);
      }
    } else {
      vscode.window.showErrorMessage(`Git 命令执行失败: 未知错误`);
    }
  }

  /**
   * 处理文件操作错误
   */
  static handleFileError(error: unknown, filePath: string): void {
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
      } else if (error.message.includes('EACCES')) {
        vscode.window.showErrorMessage(`文件访问权限不足: ${filePath}`);
      } else {
        vscode.window.showErrorMessage(`文件操作失败: ${error.message}`);
      }
    } else {
      vscode.window.showErrorMessage(`文件操作失败: 未知错误`);
    }
  }

  /**
   * 处理网络错误
   */
  static handleNetworkError(error: unknown, operation: string): void {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        vscode.window.showErrorMessage(`网络连接被拒绝: ${operation}`);
      } else if (error.message.includes('ETIMEDOUT')) {
        vscode.window.showErrorMessage(`网络连接超时: ${operation}`);
      } else {
        vscode.window.showErrorMessage(`网络错误: ${error.message}`);
      }
    } else {
      vscode.window.showErrorMessage(`网络错误: 未知错误`);
    }
  }

  /**
   * 处理配置错误
   */
  static handleConfigError(error: unknown, configKey: string): void {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(`配置错误 (${configKey}): ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`配置错误 (${configKey}): 未知错误`);
    }
  }

  /**
   * 静默处理错误（仅记录到控制台，不显示给用户）
   */
  static handleSilently(error: unknown, context: string): void {
    console.error(`[Git Hints] ${context}:`, error);
  }

  /**
   * 包装异步函数，自动处理错误
   */
  static wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: string
  ): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
    return async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(error, context);
        return undefined;
      }
    };
  }

  /**
   * 包装同步函数，自动处理错误
   */
  static wrapSync<T extends (...args: any[]) => any>(
    fn: T,
    context: string
  ): (...args: Parameters<T>) => ReturnType<T> | undefined {
    return (...args: Parameters<T>): ReturnType<T> | undefined => {
      try {
        return fn(...args);
      } catch (error) {
        this.handle(error, context);
        return undefined;
      }
    };
  }
}