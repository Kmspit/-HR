import type { PrismaClient } from '@prisma/client'

/** รหัสส่วนงานภายในแผนก — unique ต่อ departmentId */
export type OrgSectionSeed = { code: string; name: string; sortOrder?: number }

export type OrgDepartmentSeed = {
  code: string
  name: string
  sortOrder?: number
  sections?: OrgSectionSeed[]
}

export type OrgDivisionSeed = {
  code: string
  name: string
  sortOrder?: number
  departments: OrgDepartmentSeed[]
}

/**
 * โครงสร้างมาตรฐาน ฝ่าย/แผนก/ส่วนงาน — เค เอ็ม เซอร์วิสพลัส
 * ใช้ seed ลงทุกสาขา (HQ + NMA) แบบ idempotent
 */
export const KMSP_DEFAULT_ORG_STRUCTURE: OrgDivisionSeed[] = [
  {
    code: 'COLLECTION',
    name: 'ฝ่ายเร่งรัดหนี้สิน',
    sortOrder: 1,
    departments: [
      {
        code: 'TEL',
        name: 'แผนกติดตามหนี้โทรศัพท์',
        sortOrder: 1,
        sections: [
          { code: 'ADMIN', name: 'ส่วนงานแอดมิน', sortOrder: 1 },
          { code: 'STAFF', name: 'ส่วนงานพนักงานเร่งรัดหนี้ทางโทรศัพท์', sortOrder: 2 },
        ],
      },
      {
        code: 'FIELD',
        name: 'แผนกติดตามภาคสนาม',
        sortOrder: 2,
        sections: [
          { code: 'ADMIN', name: 'แอดมินภาคสนาม', sortOrder: 1 },
          { code: 'COLLECT', name: 'ติดตามหนี้ภาคสนาม', sortOrder: 2 },
          { code: 'REPO', name: 'ติดตามยึดรถ', sortOrder: 3 },
        ],
      },
    ],
  },
  {
    code: 'LEGAL',
    name: 'ฝ่ายกฎหมาย',
    sortOrder: 2,
    departments: [
      {
        code: 'CASE',
        name: 'แผนกงานคดี',
        sortOrder: 1,
        sections: [
          { code: 'ADMIN', name: 'ส่วนงานแอดมิน', sortOrder: 1 },
          { code: 'LAWYER', name: 'ส่วนงานทนายความ', sortOrder: 2 },
        ],
      },
      {
        code: 'EXEC',
        name: 'แผนกบังคดี',
        sortOrder: 2,
        sections: [
          { code: 'ADMIN', name: 'ส่วนงานแอดมิน', sortOrder: 1 },
          { code: 'STAFF', name: 'ส่วนพนักงานแอดมินบังคับคดี', sortOrder: 2 },
        ],
      },
    ],
  },
  {
    code: 'SUPPORT',
    name: 'ฝ่ายสนับสนุน',
    sortOrder: 3,
    departments: [
      {
        code: 'ACC',
        name: 'แผนกบัญชี',
        sortOrder: 1,
        sections: [{ code: 'MAIN', name: 'ส่วนงานบัญชี', sortOrder: 1 }],
      },
      {
        code: 'HR',
        name: 'แผนกบุคคล',
        sortOrder: 2,
        sections: [
          { code: 'HOUSEKEEP', name: 'ส่วนงานแม่บ้าน', sortOrder: 1 },
          { code: 'IT', name: 'ส่วนงานIT', sortOrder: 2 },
          { code: 'SCAN', name: 'ส่วนงานพนักงานสแกนเอกสาร', sortOrder: 3 },
        ],
      },
    ],
  },
]

function orgId(branchId: string, kind: 'div' | 'dep' | 'sec', code: string) {
  return `org-${kind}-${branchId}-${code}`
}

/** Upsert โครงสร้างมาตรฐานให้สาขา — ไม่ลบ/ไม่ทับข้อมูลที่ HR สร้างเอง (เฉพาะ id ที่กำหนดไว้) */
export async function seedDefaultOrgStructure(
  prisma: PrismaClient,
  branchId: string,
  structure: OrgDivisionSeed[] = KMSP_DEFAULT_ORG_STRUCTURE,
): Promise<{ divisions: number; departments: number; sections: number }> {
  let divisions = 0
  let departments = 0
  let sections = 0

  for (const div of structure) {
    const divisionId = orgId(branchId, 'div', div.code)
    await prisma.division.upsert({
      where: { id: divisionId },
      update: {
        name: div.name,
        sortOrder: div.sortOrder ?? 0,
        isActive: true,
        branchId,
      },
      create: {
        id: divisionId,
        branchId,
        code: div.code,
        name: div.name,
        sortOrder: div.sortOrder ?? 0,
        isActive: true,
      },
    })
    divisions++

    for (const dep of div.departments) {
      const departmentId = orgId(branchId, 'dep', `${div.code}-${dep.code}`)
      await prisma.department.upsert({
        where: { id: departmentId },
        update: {
          name: dep.name,
          sortOrder: dep.sortOrder ?? 0,
          isActive: true,
          branchId,
          divisionId,
        },
        create: {
          id: departmentId,
          branchId,
          divisionId,
          code: dep.code,
          name: dep.name,
          sortOrder: dep.sortOrder ?? 0,
          isActive: true,
        },
      })
      departments++

      for (const sec of dep.sections ?? []) {
        const sectionId = orgId(branchId, 'sec', `${div.code}-${dep.code}-${sec.code}`)
        await prisma.section.upsert({
          where: { id: sectionId },
          update: {
            name: sec.name,
            sortOrder: sec.sortOrder ?? 0,
            isActive: true,
            branchId,
            departmentId,
          },
          create: {
            id: sectionId,
            branchId,
            departmentId,
            code: sec.code,
            name: sec.name,
            sortOrder: sec.sortOrder ?? 0,
            isActive: true,
          },
        })
        sections++
      }
    }
  }

  return { divisions, departments, sections }
}
