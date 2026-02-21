import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next.js 16 (no config needed)
  // Uncomment when wiring Supabase Storage for PDF uploads:
  // images: {
  //   remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  // },
}

export default nextConfig
