import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { Role, UserStatus } from '@prisma/client'
import { authConfig } from './auth.config'

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
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const identifier = email.trim().toLowerCase()

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { employeeId: identifier },
              { employeeId: email.trim() },
            ],
          },
        })

        if (!user) return null
        if (user.status === 'PENDING')  throw new Error('PENDING_APPROVAL')
        if (user.status === 'DISABLED') throw new Error('ACCOUNT_DISABLED')
        if (user.status === 'REJECTED') throw new Error('ACCOUNT_REJECTED')

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          department: user.department,
          branchId: user.branchId,
        }
      },
    }),
  ],
})
