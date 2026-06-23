import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

// Skip init when DSN is not configured (dev environment)
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
  })
}
