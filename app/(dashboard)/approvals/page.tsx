import { redirect } from 'next/navigation'

/** Canonical Approval Center is at /approval-center */
export default function ApprovalsLegacyRedirect() {
  redirect('/approval-center')
}
