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
