import type { NextAuthConfig } from 'next-auth'
import type { Role, UserStatus } from '@prisma/client'

// Edge-compatible auth config (no Prisma, no bcrypt)
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id         = user.id as string
        token.role       = user.role as Role
        token.status     = user.status as UserStatus
        token.department = user.department as string | null
        token.branchId   = user.branchId as string | null
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id         = token.id         as string
        session.user.role       = token.role       as Role
        session.user.status     = token.status     as UserStatus
        session.user.department = token.department as string | null
        session.user.branchId   = token.branchId   as string | null
      }
      return session
    },
  },
  providers: [],   // providers are added in lib/auth.ts
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
}
