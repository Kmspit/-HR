import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Noto_Sans_Thai } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LoadingProvider } from '@/components/LoadingProvider'
import NavigationProgress from '@/components/NavigationProgress'
import PWARegister from '@/components/PWARegister'

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-thai',
})

export const metadata: Metadata = {
  title: { default: 'เค เอ็ม เซอร์วิส พลัส', template: '%s — เค เอ็ม เซอร์วิส พลัส' },
  description: 'ระบบ HR — บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'KM HR',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let session = null
  try {
    session = await auth()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('Dynamic server usage')) {
      console.error('[RootLayout] auth', err)
    }
  }

  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#22c55e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KM HR" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className={`${notoSansThai.variable} font-sans antialiased`}>
        <PWARegister />
        <ThemeProvider>
          <SessionProvider session={session}>
            <LoadingProvider>
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
              {children}
            </LoadingProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                classNames: {
                  toast:
                    'dark:bg-slate-800 dark:border-slate-600 dark:text-slate-50 bg-white border-slate-300 text-slate-900 shadow-lg',
                  success: 'dark:border-green-500/40 border-green-300',
                  error: 'dark:border-red-500/40 border-red-300',
                  warning: 'dark:border-amber-500/40 border-amber-300',
                },
              }}
            />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
