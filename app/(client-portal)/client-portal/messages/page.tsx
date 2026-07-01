import { redirect } from 'next/navigation'

/** Legacy deep link — messages UI lives in ClientDashboard nav. */
export default async function ClientPortalMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams({ nav: 'messages' })
  if (sp.caseId) qs.set('caseId', sp.caseId)
  redirect(`/client-portal?${qs.toString()}`)
}
