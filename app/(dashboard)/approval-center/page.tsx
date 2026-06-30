import { redirect } from 'next/navigation'

/** Legacy route — unified HR approvals live at /approvals */
export default function ApprovalCenterRedirect() {
  redirect('/approvals')
}
