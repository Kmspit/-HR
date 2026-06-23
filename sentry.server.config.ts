import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

// Skip init when DSN is not configured (dev environment)
if (dsn) {
  Sentry.init({
    dsn,

    // Capture all server-side errors
    tracesSampleRate: 0.1,

    // Log to console in development
    debug: process.env.NODE_ENV === 'development',

    // Ignore noisy errors that aren't actionable
    ignoreErrors: [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
    ],
  })
}
