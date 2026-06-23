import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Skip init when DSN is not configured (dev environment)
if (dsn) {
  Sentry.init({
    dsn,

    // Capture 10% of sessions for performance tracing
    tracesSampleRate: 0.1,

    // Capture 100% of sessions where an error occurred
    replaysOnErrorSampleRate: 1.0,

    // Capture 1% of sessions for Session Replay
    replaysSessionSampleRate: 0.01,

    integrations: [
      Sentry.replayIntegration({
        maskAllText:   true,
        blockAllMedia: true,
      }),
    ],

    debug: false,
  })
}
