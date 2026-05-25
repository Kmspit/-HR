import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import RulesClient from './RulesClient'

export default async function RulesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isManager = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)

  const rules = await prisma.companyRule.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <RulesClient
      isManager={isManager}
      rules={rules.map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content ?? '',
        fileUrl: r.fileUrl ?? '',
        category: r.category,
        version: r.version ?? '',
        publishedAt: r.publishedAt.toISOString(),
      }))}
    />
  )
}
