// 纯函数：日期格式化工具（使用 moment.js）

import moment from 'moment';

/**
 * 将时间戳转换为标准日期格式
 */
export const formatTimestamp = (timestamp: number): string => {
  return moment.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

/**
 * 将日期字符串转换为 humanized 格式（如 "2 hours ago", "3 days ago"）
 */
export const formatDateFriendly = (dateStr: string): string => {
  try {
    const [datePart, timePart] = dateStr.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');

    const commitDate = moment(
      `${year}-${month}-${day} ${hours}:${minutes}`,
      'YYYY-MM-DD HH:mm'
    );

    return commitDate.fromNow();
  } catch {
    return dateStr;
  }
};

/**
 * 将日期转换为人性化的相对时间格式
 * 例如: "just now", "2 minutes ago", "3 hours ago", "2 days ago", "3 months ago"
 */
export const humanizeDate = (date: Date): string => {
  return moment(date).fromNow();
};

/**
 * 检查日期是否为今天
 */
export const isToday = (dateStr: string): boolean => {
  try {
    const [datePart] = dateStr.split(' ');
    const commitDate = moment(datePart, 'YYYY-MM-DD');
    return commitDate.isSame(moment(), 'day');
  } catch {
    return false;
  }
};