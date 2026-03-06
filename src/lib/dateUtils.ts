/**
 * Parse a YYYY-MM-DD string as a local date (not UTC).
 * new Date('2026-04-02') is parsed as UTC midnight, which can shift
 * to the previous day in negative-offset timezones. This avoids that.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
