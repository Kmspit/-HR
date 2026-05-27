import type { Prisma } from '@prisma/client'

/** พนักงานที่ออกใบเตือนได้ — ทุกบัญชี ACTIVE (รวม Admin, ทนาย, HR) */
export const WARNING_TARGET_USER_WHERE: Prisma.UserWhereInput = {
  status: 'ACTIVE',
}

export const WARNING_TARGET_USER_SELECT = {
  id: true,
  name: true,
  department: true,
  employeeId: true,
  position: true,
  role: true,
  _count: { select: { warnings: true } },
} as const
