export { computeReport } from './services/compute'
export type { ReportTotals, ReportFlags, PropertyTotals, MissingMortgage } from './services/compute'

export { computePortfolioLVR } from './services/portfolio'
export type { PortfolioLVR } from './services/portfolio'

export { fetchTrendData } from './repositories/trends'
export type { TrendRow } from './repositories/trends'

export { fetchPortfolioData } from './repositories/portfolio'
export type { ValuationSnapshot, BalanceSnapshot } from './repositories/portfolio'

export {
  fetchPropertiesActiveInRange,
  fetchLoansActiveInRange,
  fetchLedgerEntriesInRange,
} from './repositories/ledger'
