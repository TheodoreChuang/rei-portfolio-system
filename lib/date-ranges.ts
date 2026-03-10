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
