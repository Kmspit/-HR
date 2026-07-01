import type { Role } from '@prisma/client'
import { canAccessPage } from '@/lib/page-access'
import type { SmartAlert } from './types'

/** Drop alert links the viewer cannot access (middleware would block). */
export function gateSmartAlerts(alerts: SmartAlert[], role: Role): SmartAlert[] {
  return alerts.map((a) => {
    if (!a.href || a.count <= 0) return a
    return canAccessPage(role, a.href) ? a : { ...a, href: undefined }
  })
}
