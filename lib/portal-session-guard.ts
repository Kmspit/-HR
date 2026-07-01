import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPortalSession, type PortalSession } from '@/lib/portal-auth'

/** Re-validates portal user + company from DB on every request. */
export async function requireActivePortalSession(
  req?: NextRequest,
): Promise<
  { ok: true; session: PortalSession } | { ok: false; status: 401 | 403; error: string }
> {
  const tokenSession = await getPortalSession(req)
  if (!tokenSession) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const user = await prisma.clientPortalUser.findUnique({
    where: { id: tokenSession.portalUserId },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      clientCompanyId: true,
      clientCompany: { select: { status: true } },
    },
  })

  if (!user || !user.isActive) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  if (user.clientCompany.status !== 'ACTIVE') {
    return { ok: false, status: 403, error: 'บัญชีบริษัทถูกระงับ' }
  }
  if (
    user.clientCompanyId !== tokenSession.clientCompanyId ||
    user.email !== tokenSession.email
  ) {
    return { ok: false, status: 401, error: 'Session expired' }
  }

  return {
    ok: true,
    session: {
      portalUserId: user.id,
      clientCompanyId: user.clientCompanyId,
      email: user.email,
      fullName: user.fullName,
    },
  }
}
