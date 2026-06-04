'use client'

import { useSession } from 'next-auth/react'
import type { Role } from '@prisma/client'
import {
  hasPermission,
  hasAnyPermission,
  getRolePermissions,
  type AppPermission,
} from '@/lib/rbac'

/** Returns true if the current user's role has the given permission. */
export function usePermission(permission: AppPermission): boolean {
  const { data: session } = useSession()
  const role = session?.user?.role as Role | undefined
  if (!role) return false
  return hasPermission(role, permission)
}

/** Returns true if the current user's role has ANY of the given permissions. */
export function useAnyPermission(permissions: AppPermission[]): boolean {
  const { data: session } = useSession()
  const role = session?.user?.role as Role | undefined
  if (!role) return false
  return hasAnyPermission(role, permissions)
}

/** Returns the current user's Role, or null if not authenticated. */
export function useRole(): Role | null {
  const { data: session } = useSession()
  return (session?.user?.role as Role) ?? null
}

/** Returns all permissions the current user's role has. */
export function useRolePermissions(): AppPermission[] {
  const { data: session } = useSession()
  const role = session?.user?.role as Role | undefined
  if (!role) return []
  return getRolePermissions(role)
}
