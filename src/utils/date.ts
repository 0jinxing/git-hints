// 纯函数：日期格式化工具

/**
 * 将时间戳转换为标准日期格式
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 将日期字符串转换为 humanized 格式（如 "2 hours ago", "3 days ago"）
 */
export const formatDateFriendly = (dateStr: string): string => {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');

    const commitDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes)
    );

    return humanizeDate(commitDate);
  } catch {
    return dateStr;
  }
};

/**
 * 将日期转换为人性化的相对时间格式
 * 例如: "just now", "2 minutes ago", "3 hours ago", "2 days ago", "3 months ago"
 */
export const humanizeDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  } else {
    return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  }
};

/**
 * 检查日期是否为今天
 */
export const isToday = (dateStr: string): boolean => {
  try {
    const [datePart] = dateStr.split(' ');
    const [year, month, day] = datePart.split('-');

    const commitDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day)
    );

    const today = new Date();

    return commitDate.getFullYear() === today.getFullYear() &&
           commitDate.getMonth() === today.getMonth() &&
           commitDate.getDate() === today.getDate();
  } catch {
    return false;
  }
};

/**
 * 获取今天的日期字符串（用于显示）
 */
export const getTodayDisplay = (): string => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `today ${hours}:${minutes}`;
};

/**
 * 格式化日期为 YYYY/MM/DD HH:MM 格式
 */
export const formatDateDisplay = (dateStr: string): string => {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
};