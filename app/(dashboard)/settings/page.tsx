import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')
  if (!['MANAGER_HR', 'ADMIN'].includes(session.user.role)) redirect('/unauthorized')

  const settings = await prisma.companySettings.findUnique({ where: { id: 'singleton' } })

  return <SettingsClient settings={settings as any} />
}
