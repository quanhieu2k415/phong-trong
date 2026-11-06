import type { Slot } from './types';

const UTC_OFFSET_HOURS = 7;
const MAX_HOURS = 8;

export type Selection = { startHour: number; endHour: number } | null;

const hourOf = (slot: Slot): number => (new Date(slot.start).getUTCHours() + UTC_OFFSET_HOURS) % 24;

export const hourLabels = (slots: Slot[]): number[] => slots.map(hourOf);

function allFree(startHour: number, endHour: number, slots: Slot[]): boolean {
  for (let hour = startHour; hour < endHour; hour += 1) {
    const slot = slots.find((item) => hourOf(item) === hour);
    if (slot?.state !== 'free') return false;
  }
  return true;
}

export function pickSlot(selection: Selection, hour: number, slots: Slot[]): Selection {
  if (!allFree(hour, hour + 1, slots)) return selection;
  const single = { startHour: hour, endHour: hour + 1 };
  if (!selection) return single;

  const { startHour, endHour } = selection;
  const isInside = hour >= startHour && hour < endHour;
  if (isInside) return endHour - startHour === 1 ? null : single;

  const next = { startHour: Math.min(startHour, hour), endHour: Math.max(endHour, hour + 1) };
  const fits = next.endHour - next.startHour <= MAX_HOURS;
  return fits && allFree(next.startHour, next.endHour, slots) ? next : single;
}

export const selectionIsFree = (selection: NonNullable<Selection>, slots: Slot[]): boolean =>
  allFree(selection.startHour, selection.endHour, slots);

const atLocalHour = (day: string, hour: number): string =>
  new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString();

export const selectionRange = (day: string, selection: NonNullable<Selection>) => ({
  start: atLocalHour(day, selection.startHour),
  end: atLocalHour(day, selection.endHour),
});

export function parseSelection(start: string | null, end: string | null): Selection {
  const startHour = Number(start);
  const endHour = Number(end);
  const isValid = Number.isInteger(startHour) && Number.isInteger(endHour) && startHour >= 0 && endHour > startHour;
  return start && end && isValid ? { startHour, endHour } : null;
}
