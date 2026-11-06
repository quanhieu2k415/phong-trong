const BASE = 'http://phongtrong.invalid';

// Parsing like the browser does catches what a pattern misses, such as a tab inside "/\t/evil.test".
const isLocal = (value: string): boolean =>
  value.startsWith('/') && URL.canParse(value, BASE) && new URL(value, BASE).origin === BASE;

export const safeNext = (value: string | null): string => (value && isLocal(value) ? value : '/');
