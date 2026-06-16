import { auth } from '@/lib/auth'
import { getPortalSession } from '@/lib/portal-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'
import PortalDashboard from './PortalDashboard'

export default async function ClientPortalPage() {
  // 1. Check new portal JWT (cp_token)
  const jar          = await cookies()
  const cpToken      = jar.get('cp_token')?.value
  const portalSession = cpToken ? await (async () => {
    const { verifyPortalToken } = await import('@/lib/portal-auth')
    return verifyPortalToken(cpToken)
  })() : null

  if (portalSession) {
    return (
      <PortalDashboard
        fullName={portalSession.fullName}
        email={portalSession.email}
        clientCompanyId={portalSession.clientCompanyId}
      />
    )
  }

  // 2. Legacy NextAuth CLIENT role (backward compat)
  const session = await auth()
  if (session?.user?.id && session.user.role === 'CLIENT') {
    return (
      <ClientDashboard
        userId={session.user.id}
        userName={session.user.name ?? ''}
      />
    )
  }

  // 3. Not authenticated — send to portal login
  redirect('/client-portal/login')
}
