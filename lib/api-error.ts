import * as Sentry from '@sentry/nextjs'
import { logger } from './logger'

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err)
  logger.error('unhandled error', { error: message, ...context })
  Sentry.captureException(err, { extra: context })
}
