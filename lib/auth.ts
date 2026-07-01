import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

/**
 * NextAuth is used only for session/JWT reading via auth().
 * Login is exclusively via POST /api/auth/login (2FA, lockout, rate limits).
 * Credentials provider intentionally omitted to prevent bypass.
 */
export const { handlers, auth, signOut } = NextAuth({
  ...authConfig,
  providers: [],
})
