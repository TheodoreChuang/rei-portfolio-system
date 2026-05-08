import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  // unpdf / pdfjs-dist must not be bundled by Turbopack — the worker
  // file path resolution breaks when bundled. Load them from node_modules.
  serverExternalPackages: ['unpdf', 'pdfjs-dist'],
}

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: '/monitoring',
  org: 'reiko-chuang',
  project: 'folio',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
})
