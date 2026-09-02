import type { RegisterAddress } from '@/lib/register-form-validation'

/** Shared between the registration wizard (RegisterForm.tsx) and the HR
 *  employee-edit "ข้อมูลส่วนตัวเพิ่มเติม" tab (EmployeeProfileTab.tsx) — same
 *  field set/order/required-flags in both places, so neither form can drift
 *  from lib/register-form-validation.ts's REQUIRED_ADDRESS_MSG (moo/soi
 *  optional, the rest required) without both UIs being updated together. */
export const ADDRESS_FIELD_LABELS: { key: keyof RegisterAddress; label: string; required: boolean }[] = [
  { key: 'houseNo', label: 'บ้านเลขที่', required: true },
  { key: 'moo', label: 'หมู่', required: false },
  { key: 'soi', label: 'ซอย', required: false },
  { key: 'road', label: 'ถนน', required: true },
  { key: 'tambon', label: 'ตำบล/แขวง', required: true },
  { key: 'amphoe', label: 'อำเภอ/เขต', required: true },
  { key: 'province', label: 'จังหวัด', required: true },
  { key: 'postalCode', label: 'รหัสไปรษณีย์', required: true },
]
