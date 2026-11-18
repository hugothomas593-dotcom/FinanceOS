export type DateRange = { start: string; endExclusive: string };

/**
 * Convert a validated YYYY-MM reporting period into a half-open date range.
 * The end is exclusive so month-end and leap-year records are always included.
 */
export function monthDateRange(period: string): DateRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error('Period must use YYYY-MM');
  }

  const [yearPart, monthPart] = period.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    start: `${yearPart}-${monthPart}-01`,
    endExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  };
}
