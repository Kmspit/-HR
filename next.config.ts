import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/prototype', destination: '/prototype/login.html', permanent: false },
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001', 'localhost:3002'],
      bodySizeLimit: '3mb',
    },
  },
  outputFileTracingIncludes: {
    '/api/attendance/work-log/export': [
      './assets/fonts/**/*',
      './node_modules/@expo-google-fonts/noto-sans-thai/**/*',
    ],
  },
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-libsql',
    '@libsql/client',
    'libsql',
    'bcryptjs',
  ],
  transpilePackages: ['@vladmandic/face-api'],
}

// Wrap with Sentry only when DSN is configured (skips source-map upload in dev)
const sentryOptions = {
  org:            process.env.SENTRY_ORG,
  project:        process.env.SENTRY_PROJECT,
  silent:         true,   // suppress build-time Sentry log output
  disableLogger:  true,   // strip Sentry logger from client bundle
  hideSourceMaps: true,   // don't expose source maps publicly
  telemetry:      false,  // don't send build telemetry to Sentry
}

export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig
