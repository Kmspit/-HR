/**
 * Build a payload containing only the fields that changed from `initial`, running each
 * changed field through its transform. Fields where `skip(key)` is true are always
 * excluded, even if changed (e.g. role/status on a self-edit, which the server rejects
 * anyway). Used so a full-form-submit UI never resends — and potentially silently
 * clears — a field the user never touched. See PROTECTED_CLEAR_FIELDS in
 * lib/profile-update.ts for why an untouched field must never be sent as blank.
 */
export function diffFormPayload<T extends Record<string, unknown>>(
  form: T,
  initial: T,
  transforms: { [K in keyof T]: () => unknown },
  skip: (key: keyof T) => boolean = () => false,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const key of Object.keys(form) as (keyof T)[]) {
    if (form[key] === initial[key]) continue
    if (skip(key)) continue
    payload[key as string] = transforms[key]()
  }
  return payload
}
