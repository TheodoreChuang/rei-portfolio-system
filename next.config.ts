import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist must not be bundled by Turbopack — the worker
  // file path resolution breaks when bundled. Load them from node_modules.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // Uncomment when wiring Supabase Storage for PDF uploads:
  // images: {
  //   remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  // },
}

export default nextConfig
