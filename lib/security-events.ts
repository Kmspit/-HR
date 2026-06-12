/**
 * Security event logger — Phase 15
 * Fire-and-forget safe; never throws.
 */
import { prisma } from '@/lib/prisma'

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'
  | 'TWO_FACTOR_ENABLED'
  | 'TWO_FACTOR_DISABLED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'NEW_DEVICE'
  | 'SESSION_REVOKED'
  | 'BACKUP_CREATED'
  | 'DOCUMENT_EXPORTED'

export type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export async function logSecurityEvent(params: {
  userId?: string
  eventType: SecurityEventType | string
  severity?: SecuritySeverity
  description: string
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        userId:      params.userId,
        eventType:   params.eventType,
        severity:    params.severity ?? 'INFO',
        description: params.description,
        ip:          params.ip,
        userAgent:   params.userAgent,
        metadata:    params.metadata ? JSON.stringify(params.metadata) : null,
      },
    })
  } catch (err) {
    console.error('[logSecurityEvent]', err)
  }
}
