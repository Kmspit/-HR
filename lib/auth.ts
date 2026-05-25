import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { Role, UserStatus } from '@prisma/client'

declare module 'next-auth' {
  interface User {
    id: string
    role: Role
    status: UserStatus
    department: string | null
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
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    status: UserStatus
    department: string | null
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        })

        if (!user) return null
        if (user.status === 'PENDING') throw new Error('PENDING_APPROVAL')
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
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.status = user.status
        token.department = user.department
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.status = token.status
        session.user.department = token.department
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
})
