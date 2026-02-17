/**
 * Fiscal Calendar Utilities
 * Supports 4-4-5, 4-5-4, 5-4-4, and standard calendar types
 */

export type FiscalCalendarType = 'standard' | '4-4-5' | '4-5-4' | '5-4-4';

export interface FiscalPeriodInfo {
  fiscalYear: number;
  fiscalQuarter: number;
  fiscalPeriod: number; // 1-12
  periodStartDate: string; // YYYY-MM-DD
  periodEndDate: string;
  weekInPeriod: number;
}

// Week patterns for each calendar type (weeks per period in a quarter)
const WEEK_PATTERNS: Record<FiscalCalendarType, number[]> = {
  'standard': [4, 4, 5], // Not used for standard, but default
  '4-4-5': [4, 4, 5],
  '4-5-4': [4, 5, 4],
  '5-4-4': [5, 4, 4],
};

/**
 * Get fiscal period information for a given date
 */
export function getFiscalPeriod(
  date: string | Date,
  calendarType: FiscalCalendarType,
  fyStartDate: string | null
): FiscalPeriodInfo {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  // For standard calendar, use calendar months
  if (calendarType === 'standard' || !fyStartDate) {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed
    const quarter = Math.ceil((month + 1) / 3);

    // Period = calendar month (1st of month → last day of month)
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0); // last day of month

    // Calculate week in period
    const dayOfMonth = targetDate.getDate();
    const weekInPeriod = Math.ceil(dayOfMonth / 7);

    return {
      fiscalYear: year,
      fiscalQuarter: quarter,
      fiscalPeriod: month + 1,
      periodStartDate: monthStart.toISOString().split('T')[0],
      periodEndDate: monthEnd.toISOString().split('T')[0],
      weekInPeriod,
    };
  }

  // Determine the fiscal year start that applies to this date
  let fyStart = new Date(fyStartDate);
  let fiscalYear = fyStart.getFullYear() + 1; // FY named for year it ends in

  // Adjust to find the correct fiscal year
  // Use full year increments instead of 52-week approximations to avoid drift
  while (targetDate < fyStart) {
    fyStart.setFullYear(fyStart.getFullYear() - 1);
    fiscalYear--;
  }
  const nextYearStart = new Date(fyStart);
  nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
  while (targetDate >= nextYearStart) {
    fyStart.setFullYear(fyStart.getFullYear() + 1);
    nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
    fiscalYear++;
  }

  // Calculate week number from FY start (1-based)
  const daysFromStart = Math.floor((targetDate.getTime() - fyStart.getTime()) / (24 * 60 * 60 * 1000));
  const weekNum = Math.floor(daysFromStart / 7) + 1;

  // Find which period the week falls into
  const pattern = WEEK_PATTERNS[calendarType];
  let cumulativeWeeks = 0;
  let period = 0;
  let periodStart = new Date(fyStart);

  for (let quarter = 1; quarter <= 4; quarter++) {
    for (let periodInQuarter = 0; periodInQuarter < 3; periodInQuarter++) {
      period++;
      const weeksInPeriod = pattern[periodInQuarter];
      cumulativeWeeks += weeksInPeriod;

      if (weekNum <= cumulativeWeeks) {
        // Found the period
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + weeksInPeriod * 7 - 1);
        const weekInPeriod = weekNum - (cumulativeWeeks - weeksInPeriod);

        return {
          fiscalYear,
          fiscalQuarter: quarter,
          fiscalPeriod: period,
          periodStartDate: periodStart.toISOString().split('T')[0],
          periodEndDate: periodEnd.toISOString().split('T')[0],
          weekInPeriod,
        };
      }

      periodStart.setDate(periodStart.getDate() + weeksInPeriod * 7);
    }
  }

  // Fallback (shouldn't reach here for valid dates within the FY)
  return {
    fiscalYear,
    fiscalQuarter: 4,
    fiscalPeriod: 12,
    periodStartDate: periodStart.toISOString().split('T')[0],
    periodEndDate: periodStart.toISOString().split('T')[0],
    weekInPeriod: 1,
  };
}

/**
 * Get the same period from last year for comparison
 * Returns the date range for the corresponding fiscal period last year
 */
export function getSamePeriodLastYear(
  date: string | Date,
  calendarType: FiscalCalendarType,
  fyStartDate: string | null
): { startDate: string; endDate: string } {
  if (calendarType === 'standard' || !fyStartDate) {
    // Standard: go back 1 year
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const lastYear = new Date(targetDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    const dayOfWeek = lastYear.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(lastYear);
    weekStart.setDate(weekStart.getDate() - daysFromMonday);

    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate: lastYear.toISOString().split('T')[0],
    };
  }

  // For fiscal calendars, get the same period info and go back one fiscal year
  const currentPeriod = getFiscalPeriod(date, calendarType, fyStartDate);

  // Calculate last year's FY start
  const lyFyStart = new Date(fyStartDate);
  lyFyStart.setFullYear(lyFyStart.getFullYear() - 1);

  // Find the same period in last year
  const lastYearPeriod = getFiscalPeriod(
    currentPeriod.periodStartDate,
    calendarType,
    lyFyStart.toISOString().split('T')[0]
  );

  // Calculate the equivalent date within that period
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const daysIntoPeriod = Math.floor(
    (targetDate.getTime() - new Date(currentPeriod.periodStartDate).getTime()) / (24 * 60 * 60 * 1000)
  );

  const lyEquivalentDate = new Date(lastYearPeriod.periodStartDate);
  lyEquivalentDate.setDate(lyEquivalentDate.getDate() + daysIntoPeriod);

  return {
    startDate: lastYearPeriod.periodStartDate,
    endDate: lyEquivalentDate.toISOString().split('T')[0],
  };
}

/**
 * Get the fiscal year start date that applies to a given date.
 * For standard calendars returns Jan 1 of that year.
 * For 4-4-5 / 4-5-4 / 5-4-4 returns the FY start derived from fyStartDate.
 */
export function getFiscalYearStart(
  date: string | Date,
  calendarType: FiscalCalendarType,
  fyStartDate: string | null
): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  if (calendarType === 'standard' || !fyStartDate) {
    return `${targetDate.getFullYear()}-01-01`;
  }

  let fyStart = new Date(fyStartDate);
  while (targetDate < fyStart) {
    fyStart.setFullYear(fyStart.getFullYear() - 1);
  }
  const nextYearStart = new Date(fyStart);
  nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
  while (targetDate >= nextYearStart) {
    fyStart.setFullYear(fyStart.getFullYear() + 1);
    nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
  }

  return fyStart.toISOString().split('T')[0];
}

/**
 * Enumerate all 12 periods in a fiscal year.
 * For standard calendar, returns calendar months.
 * For 4-4-5 etc., walks the week pattern to compute period boundaries.
 */
export function getAllPeriodsInFiscalYear(
  fyStartDate: string,
  calendarType: FiscalCalendarType
): Array<{ period: number; startDate: string; endDate: string; weeksInPeriod: number }> {
  if (calendarType === 'standard') {
    const year = new Date(fyStartDate).getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0);
      const weeks = Math.ceil((end.getDate()) / 7);
      return {
        period: i + 1,
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        weeksInPeriod: weeks,
      };
    });
  }

  const pattern = WEEK_PATTERNS[calendarType];
  const periods: Array<{ period: number; startDate: string; endDate: string; weeksInPeriod: number }> = [];
  const cursor = new Date(fyStartDate);

  for (let q = 0; q < 4; q++) {
    for (let p = 0; p < 3; p++) {
      const periodNum = q * 3 + p + 1;
      const weeksInPeriod = pattern[p];
      const startDate = cursor.toISOString().split('T')[0];
      cursor.setDate(cursor.getDate() + weeksInPeriod * 7 - 1);
      const endDate = cursor.toISOString().split('T')[0];
      periods.push({ period: periodNum, startDate, endDate, weeksInPeriod });
      cursor.setDate(cursor.getDate() + 1); // move to next period start
    }
  }

  return periods;
}
