import type { NextConfig } from 'next'

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

export default nextConfig
