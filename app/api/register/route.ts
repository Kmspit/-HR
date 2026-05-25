import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { generateEmployeeId } from '@/lib/utils'

const registerSchema = z.object({
  name:          z.string().min(2),
  prefix:        z.string().optional(),
  firstName:     z.string().min(1),
  lastName:      z.string().min(1),
  nickname:      z.string().optional(),
  email:         z.string().email(),
  phone:         z.string().regex(/^0[0-9]{8,9}$/, 'รูปแบบเบอร์โทรไม่ถูกต้อง'),
  birthDate:     z.string().optional(),
  address:       z.string().optional(),
  nationalId:    z.string().optional(),
  role:          z.enum(['EMPLOYEE', 'ADMIN', 'LAWYER']),
  department:    z.string().min(1),
  baseSalary:    z.number().optional().nullable(),
  startDate:     z.string(),
  socialSecurity:z.boolean().default(true),
  password:      z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    const data = parsed.data

    // Check email duplicate
    const existingEmail = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existingEmail) {
      return NextResponse.json({ error: 'อีเมลนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
    }

    // Check phone duplicate
    if (data.phone) {
      const existingPhone = await prisma.user.findFirst({ where: { phone: data.phone } })
      if (existingPhone) {
        return NextResponse.json({ error: 'เบอร์โทรนี้มีการลงทะเบียนแล้ว' }, { status: 409 })
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const employeeId   = generateEmployeeId()

    const user = await prisma.user.create({
      data: {
        employeeId,
        email:         data.email.toLowerCase(),
        passwordHash,
        name:          data.name,
        prefix:        data.prefix,
        nickname:      data.nickname,
        phone:         data.phone,
        birthDate:     data.birthDate ? new Date(data.birthDate) : null,
        address:       data.address,
        nationalId:    data.nationalId || null,
        role:          data.role,
        status:        'PENDING',
        department:    data.department,
        baseSalary:    data.baseSalary,
        startDate:     new Date(data.startDate),
        socialSecurity:data.socialSecurity,
      },
    })

    // Create leave balance for new year
    await prisma.leaveBalance.create({
      data: {
        userId:   user.id,
        year:     new Date().getFullYear(),
        sick:     30,
        vacation: 6,
        personal: 3,
      },
    })

    // Notify HR/Manager in-app
    await notifyRole(
      'MANAGER_HR',
      'REGISTER_REQUEST',
      '📋 มีคำขอสมัครใหม่',
      `${data.name} (${data.email}) ขอสมัครในตำแหน่ง ${data.role} แผนก ${data.department}`,
      '/employees?tab=pending',
    )

    // LINE notification (mock)
    await sendLineNotify(
      `\n🔔 [HRFlow] คำขอสมัครใหม่\nชื่อ: ${data.name}\nตำแหน่ง: ${data.role}\nแผนก: ${data.department}\nอีเมล: ${data.email}\n\n⚠️ กรุณาอนุมัติที่ระบบ HRFlow`
    )

    return NextResponse.json({
      success: true,
      message: 'สมัครสำเร็จ รอการอนุมัติจาก HR',
      userId: user.id,
    })
  } catch (err) {
    console.error('[Register Error]', err)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในระบบ' }, { status: 500 })
  }
}
