import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { DEFAULT_COMPANY_BRANCHES, registerBranchLabel } from '@/lib/company-branches'

const TAG_BY_CODE = Object.fromEntries(
  DEFAULT_COMPANY_BRANCHES.map((b) => [b.code, b.registerTag]),
)

/** รายการสาขาสำหรับหน้าสมัคร (ไม่ต้องล็อกอิน) */
export async function GET() {
  try {    const branches = await prisma.companyBranch.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, nameEn: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
    const payload = branches.map((b) => {
      const registerTag = TAG_BY_CODE[b.code] ?? (b.isDefault ? 'สาขาหลัก' : 'สาขาย่อย')
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        nameEn: b.nameEn,
        registerTag,
        label: registerBranchLabel(b.name, registerTag),
      }
    })
    return NextResponse.json({ branches: payload })
  } catch (err) {
    return apiError(err)
  }
}
