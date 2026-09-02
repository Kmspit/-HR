/**
 * Shared between the registration wizard (RegisterForm.tsx) and the
 * employee-edit page (EmployeeEditClient.tsx, which used a free-text input
 * before this list existed) — same reasoning as MARITAL_STATUS_OPTIONS.
 * Deliberately a closed list with no "อื่นๆ" (other) option: that field's
 * whole reason for existing is standardizing values that used to be typed
 * freely (originally "อื่นๆ" had no follow-up text field either, so it was
 * already silently discarding which prefix a person actually had — closing
 * the list properly instead of reopening free text for the fallback case).
 * If a real prefix turns up that isn't here, add it to this one file.
 */
export const PREFIX_OPTIONS = [
  'นาย', 'นาง', 'นางสาว', 'ดร.',
  'ว่าที่ร้อยตรี', 'ว่าที่ร้อยโท', 'ว่าที่ร้อยเอก',
  'ร้อยตรี', 'ร้อยโท', 'ร้อยเอก',
  'พันตรี', 'พันโท', 'พันเอก',
]
