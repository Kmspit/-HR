import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { canAccessModule, HR_ADMIN } from '@/lib/module-gates'
import Topbar from '@/components/dashboard/Topbar'
import AnnouncementsClient from './AnnouncementsClient'

export const metadata = { title: 'ประกาศ' }

export default async function AnnouncementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/')

  const { role, id: userId } = session.user
  const isHR = canAccessModule(role, HR_ADMIN)
  const now = new Date()

  const [rawAnnouncements, branches, divisions, departments, sections] = await Promise.all([
    prisma.announcement.findMany({
      where: { isArchived: false, publishAt: { lte: now } },
      orderBy: { publishAt: 'desc' },
      take: 50,
    }),
    isHR ? prisma.companyBranch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    isHR ? prisma.division.findMany({ where: { isActive: true }, select: { id: true, name: true, branchId: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    isHR ? prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, divisionId: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    isHR ? prisma.section.findMany({ where: { isActive: true }, select: { id: true, name: true, departmentId: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
  ])

  // For non-HR: filter by targeting
  let userOrgIds = { branchId: null as string | null, divisionId: null as string | null, departmentId: null as string | null, sectionId: null as string | null }
  if (!isHR) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { branchId: true, divisionId: true, departmentId: true, sectionId: true },
    })
    if (u) userOrgIds = u
  }

  const announcements = rawAnnouncements
    .filter((a) => {
      if (isHR) return true
      if (a.targetType === 'ALL') return true
      const ids: string[] = a.targetIds ? JSON.parse(a.targetIds) : []
      if (ids.length === 0) return a.targetType === 'ALL'
      switch (a.targetType) {
        case 'INDIVIDUAL':   return ids.includes(userId)
        case 'BRANCH':       return !!userOrgIds.branchId && ids.includes(userOrgIds.branchId)
        case 'DIVISION':     return !!userOrgIds.divisionId && ids.includes(userOrgIds.divisionId)
        case 'DEPARTMENT':   return !!userOrgIds.departmentId && ids.includes(userOrgIds.departmentId)
        case 'SECTION':      return !!userOrgIds.sectionId && ids.includes(userOrgIds.sectionId)
        default:             return true
      }
    })
    .map((a) => {
      const readByIds: string[] = a.readByIds ? JSON.parse(a.readByIds) : []
      const targetIds: string[] = a.targetIds ? JSON.parse(a.targetIds) : []
      return {
        id: a.id,
        title: a.title,
        body: a.body,
        type: a.type,
        targetType: a.targetType,
        targetIds,
        publishAt: a.publishAt.toISOString(),
        isRead: readByIds.includes(userId),
        readCount: readByIds.length,
        createdById: a.createdById,
        createdAt: a.createdAt.toISOString(),
        isArchived: a.isArchived,
        attachmentName: a.attachmentName ?? null,
        attachmentUrl: a.attachmentUrl ?? null,
        attachmentType: a.attachmentType ?? null,
        attachmentPublicId: a.attachmentPublicId ?? null,
      }
    })

  const unread = announcements.filter((a) => !a.isRead).length

  return (
    <div className="flex flex-col">
      <Topbar
        title="ประกาศ & ข่าวสาร"
        subtitle={unread > 0 ? `ยังไม่อ่าน ${unread} รายการ` : 'ข้อมูลสำคัญจากบริษัท'}
      />
      <AnnouncementsClient
        announcements={announcements}
        role={role}
        userId={userId}
        orgData={{ branches, divisions, departments, sections }}
      />
    </div>
  )
}
