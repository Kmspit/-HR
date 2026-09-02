import { nationalIdFingerprint } from '@/lib/national-id'
import { formatLast4 } from '@/lib/last4-mask'
import { THAI_BANKS } from '@/lib/thai-banks'
import { DEPENDENT_RELATION_LABELS } from '@/lib/dependent-relation-labels'
import type { DependentRelationType } from '@prisma/client'
import type { SubrecordAuditEvent, SubrecordEntityType } from '@/lib/employee-audit'

/**
 * Phase 1 step 8b follow-up — EmergencyContact/Dependent/BankAccount CRUD
 * now writes into the SAME "ประวัติการแก้ไข" trail as User field edits,
 * per explicit request after the reveal-only audit trail (the first cut of
 * this step) was judged to leave the actual money-movement path — someone
 * silently changing another employee's bank account — untraceable.
 *
 * Every summarizer here returns pre-computed, human-readable lines (never a
 * raw before/after object dump — that was explicitly asked against) and
 * wraps them in a { subrecordEvent: true, ... } marker so
 * mapEmployeeAuditLogs() in lib/employee-audit.ts can render them without
 * running the User-field diffing logic, which doesn't apply here (these
 * aren't fields of the User row).
 *
 * nationalId/accountNumber use the SAME masked+fingerprint approach as
 * snapshotEmployeeForAudit()'s own nationalId handling — the plaintext must
 * never reach the audit log, only a mask (last 4, already stored unencrypted
 * for display) and a SHA-256 fingerprint (to still catch a real change even
 * when two different numbers happen to share the same last 4 digits).
 * Unlike the employee's OWN nationalId (stored plaintext, so both snapshots
 * can always fingerprint it for free), Dependent/BankAccount's sensitive
 * fields are encrypted at rest — fingerprinting them on every edit would
 * mean decrypting on every save, even ones that never touch the number. So
 * `nationalIdPlain`/`accountNumberPlain` below are deliberately OPTIONAL:
 * the caller only supplies them (and only then decrypts the stored "before"
 * value) when that specific field was actually part of the edit — an
 * edit that never touches nationalId/accountNumber skips this comparison
 * entirely rather than decrypting to prove nothing changed.
 */

function wrap(entityType: SubrecordEntityType, lines: string[]): SubrecordAuditEvent {
  return { subrecordEvent: true, entityType, lines }
}

function bankName(bankCode: string): string {
  return THAI_BANKS.find((b) => b.code === bankCode)?.name ?? bankCode
}

// ── EmergencyContact ──────────────────────────────────────────────────────

export type ContactAuditRow = {
  name: string
  relationship: string
  phone: string
  altPhone: string | null
  address: string | null
  isPrimary: boolean
}

export function summarizeContactCreate(row: ContactAuditRow): SubrecordAuditEvent {
  return wrap('EmergencyContact', [`เพิ่มผู้ติดต่อฉุกเฉิน: ${row.name} (${row.relationship})`])
}

export function summarizeContactDelete(row: ContactAuditRow): SubrecordAuditEvent {
  return wrap('EmergencyContact', [`ลบผู้ติดต่อฉุกเฉิน: ${row.name} (${row.relationship})`])
}

export function summarizeContactUpdate(before: ContactAuditRow, after: ContactAuditRow): SubrecordAuditEvent | null {
  const lines: string[] = []
  const label = after.name || before.name
  if (before.name !== after.name) lines.push(`ชื่อผู้ติดต่อฉุกเฉิน: ${before.name} → ${after.name}`)
  if (before.relationship !== after.relationship) lines.push(`ความสัมพันธ์ (${label}): ${before.relationship} → ${after.relationship}`)
  if (before.phone !== after.phone) lines.push(`เบอร์โทรผู้ติดต่อฉุกเฉิน (${label}): ${before.phone} → ${after.phone}`)
  if ((before.altPhone ?? '') !== (after.altPhone ?? '')) lines.push(`เบอร์สำรอง (${label}): ${before.altPhone ?? '—'} → ${after.altPhone ?? '—'}`)
  if ((before.address ?? '') !== (after.address ?? '')) lines.push(`ที่อยู่ผู้ติดต่อฉุกเฉิน (${label}): ${before.address ?? '—'} → ${after.address ?? '—'}`)
  if (before.isPrimary !== after.isPrimary) lines.push(`ผู้ติดต่อหลัก (${label}): ${before.isPrimary ? 'ใช่' : 'ไม่ใช่'} → ${after.isPrimary ? 'ใช่' : 'ไม่ใช่'}`)
  if (lines.length === 0) return null
  return wrap('EmergencyContact', lines)
}

// ── Dependent ────────────────────────────────────────────────────────────

export type DependentAuditRow = {
  name: string
  relationType: DependentRelationType
  birthDate: string | null
  /** Always available (stored unencrypted) — used for the masked display. */
  nationalIdLast4: string | null
  /** Only set (on both before and after) when nationalId was actually part
   *  of this edit — see this file's header comment. Undefined on either
   *  side means "not part of this operation, skip this field entirely." */
  nationalIdPlain?: string | null
  isTaxAllowance: boolean
  note: string | null
}

export function summarizeDependentCreate(row: DependentAuditRow): SubrecordAuditEvent {
  const idPart = row.nationalIdLast4 ? ` — เลขบัตร ${formatLast4(row.nationalIdLast4)}` : ''
  return wrap('Dependent', [`เพิ่มผู้อยู่ในอุปการะ: ${row.name} (${DEPENDENT_RELATION_LABELS[row.relationType]})${idPart}`])
}

export function summarizeDependentDelete(row: DependentAuditRow): SubrecordAuditEvent {
  return wrap('Dependent', [`ลบผู้อยู่ในอุปการะ: ${row.name} (${DEPENDENT_RELATION_LABELS[row.relationType]})`])
}

export function summarizeDependentUpdate(before: DependentAuditRow, after: DependentAuditRow): SubrecordAuditEvent | null {
  const lines: string[] = []
  const label = after.name || before.name
  if (before.name !== after.name) lines.push(`ชื่อผู้อยู่ในอุปการะ: ${before.name} → ${after.name}`)
  if (before.relationType !== after.relationType) {
    lines.push(`ความสัมพันธ์ (${label}): ${DEPENDENT_RELATION_LABELS[before.relationType]} → ${DEPENDENT_RELATION_LABELS[after.relationType]}`)
  }
  if ((before.birthDate ?? '') !== (after.birthDate ?? '')) lines.push(`วันเกิด (${label}): ${before.birthDate ?? '—'} → ${after.birthDate ?? '—'}`)
  if (before.isTaxAllowance !== after.isTaxAllowance) {
    lines.push(`สิทธิ์ลดหย่อนภาษี (${label}): ${before.isTaxAllowance ? 'ใช่' : 'ไม่ใช่'} → ${after.isTaxAllowance ? 'ใช่' : 'ไม่ใช่'}`)
  }
  if ((before.note ?? '') !== (after.note ?? '')) lines.push(`หมายเหตุ (${label}): ${before.note ?? '—'} → ${after.note ?? '—'}`)

  if (before.nationalIdPlain !== undefined || after.nationalIdPlain !== undefined) {
    const beforeFp = nationalIdFingerprint(before.nationalIdPlain ?? null)
    const afterFp = nationalIdFingerprint(after.nationalIdPlain ?? null)
    if (beforeFp !== afterFp) {
      const beforeMasked = formatLast4(before.nationalIdLast4)
      const afterMasked = formatLast4(after.nationalIdLast4)
      lines.push(
        beforeMasked === afterMasked
          ? `เลขบัตรประชาชน (${label}): เปลี่ยนแปลง (${afterMasked})`
          : `เลขบัตรประชาชน (${label}): ${beforeMasked} → ${afterMasked}`,
      )
    }
  }

  if (lines.length === 0) return null
  return wrap('Dependent', lines)
}

// ── BankAccount ──────────────────────────────────────────────────────────

export type BankAccountAuditRow = {
  bankCode: string
  accountName: string
  /** Always available (stored unencrypted) — used for the masked display. */
  accountNumberLast4: string
  /** Only set (on both before and after) when accountNumber was actually
   *  part of this edit — see this file's header comment. */
  accountNumberPlain?: string | null
  accountType: string | null
  isPrimary: boolean
  isActive: boolean
}

export function summarizeBankAccountCreate(row: BankAccountAuditRow): SubrecordAuditEvent {
  return wrap('BankAccount', [`เพิ่มบัญชีธนาคาร: ${bankName(row.bankCode)} ${row.accountName} ${formatLast4(row.accountNumberLast4)}`])
}

export function summarizeBankAccountDisable(row: BankAccountAuditRow): SubrecordAuditEvent {
  return wrap('BankAccount', [`ปิดใช้งานบัญชีธนาคาร: ${bankName(row.bankCode)} ${row.accountName} ${formatLast4(row.accountNumberLast4)}`])
}

export function summarizeBankAccountReactivate(row: BankAccountAuditRow): SubrecordAuditEvent {
  return wrap('BankAccount', [`เปิดใช้งานบัญชีธนาคารอีกครั้ง: ${bankName(row.bankCode)} ${row.accountName} ${formatLast4(row.accountNumberLast4)}`])
}

export function summarizeBankAccountUpdate(before: BankAccountAuditRow, after: BankAccountAuditRow): SubrecordAuditEvent | null {
  const lines: string[] = []
  const label = `${bankName(after.bankCode)} ${after.accountName}`
  if (before.bankCode !== after.bankCode) lines.push(`ธนาคาร (${after.accountName}): ${bankName(before.bankCode)} → ${bankName(after.bankCode)}`)
  if (before.accountName !== after.accountName) lines.push(`ชื่อบัญชี: ${before.accountName} → ${after.accountName}`)
  if ((before.accountType ?? '') !== (after.accountType ?? '')) lines.push(`ประเภทบัญชี (${label}): ${before.accountType ?? '—'} → ${after.accountType ?? '—'}`)
  if (before.isPrimary !== after.isPrimary) lines.push(`บัญชีหลัก (${label}): ${before.isPrimary ? 'ใช่' : 'ไม่ใช่'} → ${after.isPrimary ? 'ใช่' : 'ไม่ใช่'}`)

  if (before.accountNumberPlain !== undefined || after.accountNumberPlain !== undefined) {
    const beforeFp = nationalIdFingerprint(before.accountNumberPlain ?? null)
    const afterFp = nationalIdFingerprint(after.accountNumberPlain ?? null)
    if (beforeFp !== afterFp) {
      const beforeMasked = formatLast4(before.accountNumberLast4)
      const afterMasked = formatLast4(after.accountNumberLast4)
      lines.push(
        beforeMasked === afterMasked
          ? `เลขบัญชี (${label}): เปลี่ยนแปลง (${afterMasked})`
          : `เลขบัญชี (${label}): ${beforeMasked} → ${afterMasked}`,
      )
    }
  }

  if (lines.length === 0) return null
  return wrap('BankAccount', lines)
}
