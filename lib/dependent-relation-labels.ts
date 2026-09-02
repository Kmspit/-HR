import { DEPENDENT_RELATION_TYPES } from '@/lib/register-form-validation'

/** Shared between the registration wizard (RegisterForm.tsx) and the HR
 *  employee-edit "ผู้ติดต่อ & บัญชีธนาคาร" tab so both display the same Thai
 *  labels for DependentRelationType. */
export const DEPENDENT_RELATION_LABELS: Record<(typeof DEPENDENT_RELATION_TYPES)[number], string> = {
  SPOUSE: 'คู่สมรส',
  CHILD: 'บุตร',
  PARENT: 'บิดา/มารดา',
  OTHER: 'อื่นๆ',
}
