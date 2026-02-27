export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function formatMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return new Date(year, mon - 1).toLocaleDateString('en-AU', {
    month: 'short',
    year: 'numeric',
  })
}

export function lastDayOfMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon, 0)
  return `${year}-${String(mon).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns the last `count` months from today, newest first, as 'YYYY-MM' strings.
export function recentMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
