import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { Noto_Sans_Thai, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LoadingProvider } from '@/components/LoadingProvider'
import NavigationProgress from '@/components/NavigationProgress'

const notoSansThai = Noto_Sans_Thai({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-thai',
})

const plusJakartaSans = Plus_Jakarta_Sans({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
})

export const metadata: Metadata = {
  title: { default: 'เค เอ็ม เซอร์วิส พลัส', template: '%s — เค เอ็ม เซอร์วิส พลัส' },
  description: 'ระบบ HR — บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
  icons: { icon: '/favicon.ico' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070b14' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
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
    <html lang="th" className="dark" suppressHydrationWarning>
      <body className={`${notoSansThai.variable} ${plusJakartaSans.variable} font-sans antialiased`}>
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
