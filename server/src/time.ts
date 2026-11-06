export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 22;
export const MAX_HOURS = 8;
export const MAX_DAYS_AHEAD = 60;

// Vietnam has a fixed UTC+7 offset with no daylight saving.
const OFFSET_MS = 7 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface Range {
  start: Date;
  end: Date;
}

export interface Slot {
  start: string;
  end: string;
  state: 'free' | 'busy' | 'past';
}

export type RangeIssue =
  | 'NOT_ON_THE_HOUR'
  | 'END_BEFORE_START'
  | 'IN_THE_PAST'
  | 'TOO_FAR_AHEAD'
  | 'OUTSIDE_HOURS'
  | 'TOO_LONG';

const toLocal = (date: Date): Date => new Date(date.getTime() + OFFSET_MS);

export const localDay = (date: Date): string => toLocal(date).toISOString().slice(0, 10);

export const atLocalHour = (day: string, hour: number): Date =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`);

export const nextDay = (day: string): string =>
  localDay(new Date(atLocalHour(day, 12).getTime() + DAY_MS));

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const noon = atLocalHour(day, 12);
  return !Number.isNaN(noon.getTime()) && localDay(noon) === day;
}

export function rangeIssue({ start, end }: Range, now: Date): RangeIssue | null {
  if (start.getTime() % HOUR_MS !== 0 || end.getTime() % HOUR_MS !== 0) return 'NOT_ON_THE_HOUR';
  if (end <= start) return 'END_BEFORE_START';
  if (start <= now) return 'IN_THE_PAST';
  if (start.getTime() - now.getTime() > MAX_DAYS_AHEAD * DAY_MS) return 'TOO_FAR_AHEAD';

  const day = localDay(start);
  if (start < atLocalHour(day, OPEN_HOUR) || end > atLocalHour(day, CLOSE_HOUR)) {
    return 'OUTSIDE_HOURS';
  }
  if (hoursBetween({ start, end }) > MAX_HOURS) return 'TOO_LONG';
  return null;
}

export const hoursBetween = ({ start, end }: Range): number =>
  (end.getTime() - start.getTime()) / HOUR_MS;

export function buildSlots(day: string, busy: readonly Range[], now: Date): Slot[] {
  const slots: Slot[] = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
    const start = atLocalHour(day, hour);
    const end = atLocalHour(day, hour + 1);
    const isBusy = busy.some((range) => range.start < end && start < range.end);
    const state = start <= now ? 'past' : isBusy ? 'busy' : 'free';
    slots.push({ start: start.toISOString(), end: end.toISOString(), state });
  }
  return slots;
}
