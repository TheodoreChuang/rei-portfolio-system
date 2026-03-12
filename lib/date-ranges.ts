export function firstDayOfMonth(month: string): string {
  return `${month}-01`
}

// Active-in-month rule: startDate <= lastDay AND (endDate IS NULL OR endDate >= firstDay)
export function isActiveInMonth(
  startDate: string,
  endDate: string | null,
  firstDay: string,
  lastDay: string,
): boolean {
  return startDate <= lastDay && (endDate === null || endDate >= firstDay)
}

// Returns the Australian financial year (Jul 1 – Jun 30) that contains the given date.
// e.g. 2026-03-15 → { from: '2025-07-01', to: '2026-06-30', label: 'FY 2025–26' }
export function currentFY(today = new Date()): { from: string; to: string; label: string } {
  const year = today.getFullYear()
  const month = today.getMonth() + 1 // 1-indexed
  const startYear = month >= 7 ? year : year - 1
  const endYear = startYear + 1
  return {
    from: `${startYear}-07-01`,
    to: `${endYear}-06-30`,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
  }
}

// Returns the previous Australian financial year bounds (one year back from currentFY).
export function prevFY(today = new Date()): { from: string; to: string; label: string } {
  const startYear = Number(currentFY(today).from.slice(0, 4)) - 1
  const endYear = startYear + 1
  return {
    from: `${startYear}-07-01`,
    to: `${endYear}-06-30`,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
  }
}
