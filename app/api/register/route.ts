import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { generateEmployeeId } from '@/lib/utils'
import { apiError, runNotify } from '@/lib/api-handler'

const registerSchema = z.object({
  name:          z.string().min(2, 'กรุณากรอกชื่อ-นามสกุล'),
  prefix:        z.string().optional(),
  firstName:     z.string().min(1, 'กรุณากรอกชื่อจริง'),
  lastName:      z.string().min(1, 'กรุณากรอกนามสกุล'),
  nickname:      z.string().optional(),
  email:         z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:         z.string().regex(/^0[0-9]{9}$/, 'เบอร์โทรต้อง 10 หลัก ขึ้นต้นด้วย 0 (เช่น 0812345678)'),
  birthDate:     z.string().optional(),
  address:       z.string().optional(),
  nationalId:    z.string().optional(),
  role:          z.enum(['EMPLOYEE', 'ADMIN', 'LAWYER'], { message: 'กรุณาเลือกตำแหน่ง' }),
  department:    z.string().min(1, 'กรุณาเลือกแผนก'),
  baseSalary:    z.number().optional().nullable(),
  startDate:     z.string().min(1, 'กรุณาเลือกวันที่เริ่มงาน'),
  socialSecurity:z.boolean().default(true),
  password:      z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  branchId:      z.string().min(1, 'กรุณาเลือกสาขา'),
})

function zodFirstError(err: z.ZodError): string {
  const first = err.errors[0]
  return first?.message ?? 'ข้อมูลไม่ถูกต้อง'
}

function emptyToNull(v?: string | null) {
  if (v == null || String(v).trim() === '') return null
  return String(v).trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: zodFirstError(parsed.error) }, { status: 400 })
    }

    const data = parsed.data
    const email = data.email.trim().toLowerCase()
    const phone = data.phone.replace(/\D/g, '')
    const nationalId = emptyToNull(data.nationalId)

    const existingEmail = await prisma.user.findUnique({ where: { email } })
    if (existingEmail) {
      return NextResponse.json({ error: 'อีเมลนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
    }

    const existingPhone = await prisma.user.findFirst({ where: { phone } })
    if (existingPhone) {
      return NextResponse.json({ error: 'เบอร์โทรนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
    }

    if (nationalId) {
      const existingId = await prisma.user.findFirst({ where: { nationalId } })
      if (existingId) {
        return NextResponse.json({ error: 'เลขบัตรประชาชนนี้มีในระบบแล้ว' }, { status: 409 })
      }
    }

    const branch = await prisma.companyBranch.findFirst({
      where: { id: data.branchId, isActive: true },
    })
    if (!branch) {
      return NextResponse.json({ error: 'สาขาที่เลือกไม่ถูกต้องหรือปิดใช้งาน' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const employeeId   = generateEmployeeId()

    const user = await prisma.user.create({
      data: {
        employeeId,
        email,
        passwordHash,
        name:          data.name.trim(),
        prefix:        emptyToNull(data.prefix),
        nickname:      emptyToNull(data.nickname),
        phone,
        birthDate:     data.birthDate ? new Date(data.birthDate) : null,
        address:       emptyToNull(data.address),
        nationalId,
        role:          data.role,
        status:        'PENDING',
        department:    data.department,
        branchId:      branch.id,
        baseSalary:    data.baseSalary ?? null,
        startDate:     new Date(data.startDate),
        socialSecurity:data.socialSecurity,
      },
    })

    await prisma.leaveBalance.create({
      data: {
        userId:   user.id,
        year:     new Date().getFullYear(),
        sick:     30,
        vacation: 6,
        personal: 3,
      },
    })

    await runNotify(() =>
      notifyRole(
        'MANAGER_HR',
        'REGISTER_REQUEST',
        '📋 มีคำขอสมัครใหม่',
        `${data.name} (${email}) ขอสมัคร ${branch.name} · ${data.role} แผนก ${data.department}`,
        '/employees?tab=pending',
      ),
    )

    await runNotify(() =>
      sendLineNotify(
        `\n🔔 [เค เอ็ม เซอร์วิส พลัส] คำขอสมัครใหม่\nชื่อ: ${data.name}\nตำแหน่ง: ${data.role}\nแผนก: ${data.department}\nอีเมล: ${email}\n\n⚠️ กรุณาอนุมัติที่ระบบ HR`,
      ),
    )

    return NextResponse.json({
      success: true,
      message: 'สมัครสำเร็จ รอการอนุมัติจาก HR',
      userId: user.id,
    })
  } catch (err) {
    return apiError(err, 'สมัครไม่สำเร็จ กรุณาลองใหม่หรือติดต่อ HR')
  }
}

