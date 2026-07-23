/**
 * Centralized Timezone and Date Utility Module for Asia/Baghdad (GMT+3)
 */

export const DEFAULT_TIMEZONE = 'Asia/Baghdad';
export const BAGHDAD_OFFSET = '+03:00';

export interface BaghdadParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Extracts date and time components of any Date object in Asia/Baghdad timezone.
 */
export function getBaghdadParts(date: Date = new Date()): BaghdadParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  }).formatToParts(date);

  const getVal = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);

  return {
    year: getVal('year'),
    month: getVal('month'),
    day: getVal('day'),
    hour: getVal('hour'),
    minute: getVal('minute'),
    second: getVal('second')
  };
}

/**
 * Creates a Date object from local components specified in Asia/Baghdad timezone.
 */
export function createDateFromBaghdadParts(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  sec = 0
): Date {
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoStr = `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(sec)}${BAGHDAD_OFFSET}`;
  return new Date(isoStr);
}

/**
 * Parses any local datetime string (e.g., YYYY-MM-DDTHH:mm:ss) as Asia/Baghdad local time.
 * If the string already has a timezone indicator (+/- offset or Z), it parses it as-is.
 */
export function parseLocalTimeString(dateTimeStr: string): Date {
  const clean = dateTimeStr.trim();
  if (/[+-]\d{2}:?\d{2}$/.test(clean) || clean.endsWith('Z')) {
    return new Date(clean);
  }

  // Ensure it has a time component
  let target = clean;
  if (clean.includes('T')) {
    const parts = clean.split('T');
    const datePart = parts[0];
    let timePart = parts[1];
    // Strip milliseconds, offsets or Z if any
    timePart = timePart.split('.')[0].split('+')[0].split('-')[0];
    target = `${datePart}T${timePart}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    // If date-only, append start of day time
    target = `${clean}T00:00:00`;
  }

  return new Date(`${target}${BAGHDAD_OFFSET}`);
}

/**
 * Formats any Date object to a readable string in Asia/Baghdad local time.
 */
export function formatBaghdadDateTime(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return date.toLocaleString('ar-SA', {
    timeZone: DEFAULT_TIMEZONE,
    ...options
  });
}
