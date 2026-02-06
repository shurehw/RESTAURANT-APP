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
    const month = targetDate.getMonth() + 1;
    const quarter = Math.ceil(month / 3);

    // Get Monday of the current week
    const dayOfWeek = targetDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(targetDate);
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return {
      fiscalYear: year,
      fiscalQuarter: quarter,
      fiscalPeriod: month,
      periodStartDate: weekStart.toISOString().split('T')[0],
      periodEndDate: weekEnd.toISOString().split('T')[0],
      weekInPeriod: 1,
    };
  }

  // Determine the fiscal year start that applies to this date
  let fyStart = new Date(fyStartDate);
  let fiscalYear = fyStart.getFullYear() + 1; // FY named for year it ends in

  // Adjust to find the correct fiscal year
  while (targetDate < fyStart) {
    fyStart.setDate(fyStart.getDate() - 364); // Go back 52 weeks
    fiscalYear--;
  }
  while (targetDate >= new Date(fyStart.getTime() + 364 * 24 * 60 * 60 * 1000)) {
    fyStart.setDate(fyStart.getDate() + 364); // Go forward 52 weeks
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
    // Standard: just go back 52 weeks for the same day of week
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const lastYear = new Date(targetDate);
    lastYear.setDate(lastYear.getDate() - 364); // 52 weeks

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
  lyFyStart.setDate(lyFyStart.getDate() - 364); // 52 weeks earlier

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
