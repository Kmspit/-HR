import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  fallbacks: {
    document: '/offline.html',
  },
  customWorkerDir: 'worker',
  // app-build-manifest.json is an internal Next.js App Router build artifact —
  // it isn't served publicly under /_next/*, so precaching it 404s on every
  // deploy (its revision hash changes on every build) and fails SW install.
  buildExcludes: [/app-build-manifest\.json$/],
})

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/prototype', destination: '/prototype/login.html', permanent: false },
      { source: '/approvals', destination: '/approval-center', permanent: true },
    ]
  },
  eslint: {
    ignoreDuringBuilds: false,
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

const configWithPwa = withPWA(nextConfig) as NextConfig

const sentryOptions = {
  org:            process.env.SENTRY_ORG,
  project:        process.env.SENTRY_PROJECT,
  silent:         true,
  disableLogger:  true,
  hideSourceMaps: true,
  telemetry:      false,
}

export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(configWithPwa, sentryOptions)
  : configWithPwa
