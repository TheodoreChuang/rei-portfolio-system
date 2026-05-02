import { env } from './env'

const isProd = process.env.NODE_ENV === 'production'
const isDebug = env.LOG_LEVEL === 'debug'

function log(level: 'debug' | 'info' | 'error', message: string, context?: Record<string, unknown>): void {
  if (level === 'debug' && !isDebug) return
  if (isProd) {
    const entry = JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...context })
    if (level === 'error') {
      console.error(entry)
    } else {
      console.log(entry)
    }
  } else {
    const args: unknown[] = [`[${level}]`, message]
    if (context) args.push(context)
    if (level === 'error') {
      console.error(...args)
    } else {
      console.log(...args)
    }
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info:  (message: string, context?: Record<string, unknown>) => log('info',  message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
}
