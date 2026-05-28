import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import type { Role, UserStatus } from '@prisma/client'
import { authConfig } from './auth.config'
import { verifyLoginCredentials } from './login-credentials'

declare module 'next-auth' {
  interface User {
    id: string
    role: Role
    status: UserStatus
    department: string | null
    branchId: string | null
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      image?: string | null
      role: Role
      status: UserStatus
      department: string | null
      branchId: string | null
    }
  }
}

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const result = await verifyLoginCredentials(email, password)

        if (!result.ok) {
          throw new Error(result.error)
        }

        return result.user
      },
    }),
  ],
})
