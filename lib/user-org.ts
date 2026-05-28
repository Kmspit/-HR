import type { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export function needsOrgAssignment(role: Role): boolean {
  return role === 'EMPLOYEE' || role === 'LAWYER'
}

/** พนักงานต้องมีฝ่าย + แผนก (ส่วนงานไม่บังคับ — บางแผนกไม่มีส่วนงาน) */
export function hasOrgAssignment(user: {
  divisionId?: string | null
  departmentId?: string | null
  sectionId?: string | null
}): boolean {
  return Boolean(user.divisionId && user.departmentId)
}

/** Sync legacy text field `department` from org department name */
export async function syncUserLegacyDepartment(userId: string, departmentId: string) {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { name: true },
  })
  if (!dept) return
  await prisma.user.update({
    where: { id: userId },
    data: { department: dept.name },
  })
}

export async function validateOrgAssignment(
  branchId: string | null | undefined,
  divisionId: string,
  departmentId: string,
  sectionId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    include: { division: true },
  })
  if (!department?.isActive) {
    return { ok: false, error: 'แผนกไม่ถูกต้องหรือปิดใช้งาน' }
  }
  if (department.divisionId !== divisionId) {
    return { ok: false, error: 'แผนกไม่ตรงกับฝ่าย' }
  }
  if (branchId && department.branchId !== branchId) {
    return { ok: false, error: 'แผนกไม่อยู่ในสาขาของพนักงาน' }
  }

  if (!sectionId) return { ok: true }

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { department: { include: { division: true } } },
  })
  if (!section?.isActive) return { ok: false, error: 'ส่วนงานไม่ถูกต้องหรือปิดใช้งาน' }
  if (section.departmentId !== departmentId) {
    return { ok: false, error: 'ส่วนงานไม่ตรงกับแผนก' }
  }
  if (section.department.divisionId !== divisionId) {
    return { ok: false, error: 'แผนกไม่ตรงกับฝ่าย' }
  }
  if (branchId && section.branchId !== branchId) {
    return { ok: false, error: 'ส่วนงานไม่อยู่ในสาขาของพนักงาน' }
  }
  return { ok: true }
}
