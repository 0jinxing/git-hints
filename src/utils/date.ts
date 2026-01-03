/**
 * 将时间戳转换为标准日期格式
 */
export const parseTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString();
};


/**
 * 将日期转换为人性化的相对时间格式
 */
export const formatDateFriendly = (date: Date | string): string => {
   date = date instanceof Date ? date : new Date(date)

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now ' + date;
  }

  const units = [
    { value: Math.floor(days / 365), name: 'year' },
    { value: Math.floor(days / 30), name: 'month' },
    { value: Math.floor(days / 7), name: 'week' },
    { value: days, name: 'day' },
    { value: hours, name: 'hour' },
    { value: minutes, name: 'minute' },

  ];

  for (const { value, name } of units) {
    if (value > 0) {
      return `${value} ${name}${value > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
};
