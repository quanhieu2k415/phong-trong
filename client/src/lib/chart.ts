const EMPTY_AXIS_MAX = 1_000_000;
const TARGET_INTERVALS = 3;
const NICE_STEPS = [1, 2, 5, 10];

function niceStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const multiple = NICE_STEPS.find((step) => step * magnitude >= rawStep) ?? 10;
  return multiple * magnitude;
}

export function axisTicks(largest: number): number[] {
  const top = largest > 0 ? largest : EMPTY_AXIS_MAX;
  const step = niceStep(top / TARGET_INTERVALS);
  const count = Math.ceil(top / step);
  return Array.from({ length: count + 1 }, (_, index) => index * step);
}

export function extremeIndex(values: number[]): number {
  const highest = Math.max(...values, 0);
  return highest > 0 ? values.indexOf(highest) : -1;
}
