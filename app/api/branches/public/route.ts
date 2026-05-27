import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { ensureDbSchema } from '@/lib/ensure-db-schema'

/** รายการสาขาสำหรับหน้าสมัคร (ไม่ต้องล็อกอิน) */
export async function GET() {
  try {
    await ensureDbSchema()
    const branches = await prisma.companyBranch.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, nameEn: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
    return NextResponse.json({ branches })
  } catch (err) {
    return apiError(err)
  }
}
