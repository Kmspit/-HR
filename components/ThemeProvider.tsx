'use client'

import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

/** login/register/forgot-password are always styled dark in their own JSX
 *  (bg-slate-950 wrapper, white text), but the register/forgot-password
 *  cards use the theme-aware `.glass` class, which falls back to its light
 *  variant whenever `<html>` has no `.dark` class — true for any visitor
 *  with no next-themes preference stored yet (defaultTheme="light"), which
 *  is every one of the ~18 employees registering for the first time. Forcing
 *  dark here (not editing .glass itself) fixes it for all 3 routes at once
 *  without touching the dashboard's own user-controlled light/dark toggle. */
const FORCED_DARK_ROUTES = ['/login', '/register', '/forgot-password']

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const forcedTheme = FORCED_DARK_ROUTES.includes(pathname ?? '') ? 'dark' : undefined

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange={false}
      forcedTheme={forcedTheme}
    >
      {children}
    </NextThemesProvider>
  )
}
