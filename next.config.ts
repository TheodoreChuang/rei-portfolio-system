import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist must not be bundled by Turbopack — the worker
  // file path resolution breaks when bundled. Load them from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
}

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: '/monitoring',
  // Populate for source map uploads in CI:
  // org: 'your-sentry-org',
  // project: 'folio',
  // authToken: process.env.SENTRY_AUTH_TOKEN,
  // widenClientFileUpload: true,
})
