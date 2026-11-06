const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const clock = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const formatVnd = (value: number): string => vnd.format(value);

export function compactVnd(value: number): string {
  if (value >= 1_000_000) {
    const millions = (value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    return `${millions}Tr`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export const localDay = (date: Date): string => dayParts.format(date);

export const today = (): string => localDay(new Date());

const dayToUtc = (day: string): Date => new Date(`${day}T00:00:00Z`);

export const addDays = (day: string, days: number): string =>
  new Date(dayToUtc(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export const shortDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export const weekday = (day: string): string => WEEKDAYS[dayToUtc(day).getUTCDay()] ?? '';

export const dayLabel = (day: string): string => `${weekday(day)}, ${shortDay(day)}`;

export const timeRange = (start: string, end: string): string =>
  `${clock.format(new Date(start))} – ${clock.format(new Date(end))}`;

export const bookingDay = (start: string): string => dayLabel(localDay(new Date(start)));

export const clockHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;
