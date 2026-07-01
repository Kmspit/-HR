import type { Role, UserStatus } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      status: UserStatus
      department: string | null
      branchId: string | null
      sessionEpoch?: number
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role: Role
    status: UserStatus
    department: string | null
    branchId: string | null
    sessionEpoch?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: Role
    status?: UserStatus
    department?: string | null
    branchId?: string | null
    sessionEpoch?: number
  }
}

export {}
