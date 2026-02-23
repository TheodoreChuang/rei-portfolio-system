const isDebug = process.env.LOG_LEVEL === 'debug'

export const logger = {
  debug: (...args: unknown[]) => { if (isDebug) console.log('[debug]', ...args) },
  info:  (...args: unknown[]) => console.log('[info]', ...args),
  error: (...args: unknown[]) => console.error('[error]', ...args),
}
