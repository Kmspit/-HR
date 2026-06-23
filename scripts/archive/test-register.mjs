import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN
const prisma = url && token
  ? new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken: token }) })
  : new PrismaClient()

const registerSchema = z.object({
  name: z.string().min(2),
  prefix: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nickname: z.string().optional(),
  email: z.string().email(),
  phone: z.string().regex(/^0[0-9]{8,9}$/, 'รูปแบบเบอร์โทรไม่ถูกต้อง'),
  birthDate: z.string().optional(),
  address: z.string().optional(),
  nationalId: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'ADMIN', 'LAWYER']),
  department: z.string().min(1),
  baseSalary: z.number().optional().nullable(),
  startDate: z.string(),
  socialSecurity: z.boolean().default(true),
  password: z.string().min(8),
})

const body = {
  prefix: 'นาย',
  firstName: 'ทดสอบ',
  lastName: 'สมัคร',
  nickname: '',
  email: `test${Date.now()}@test.com`,
  phone: '0891234567',
  birthDate: '',
  address: '',
  nationalId: '',
  role: 'EMPLOYEE',
  department: 'IT',
  baseSalary: null,
  startDate: '2026-05-01',
  socialSecurity: true,
  password: 'testpass123',
  confirmPassword: 'testpass123',
  name: 'นายทดสอบ สมัคร',
}

try {
  const parsed = registerSchema.safeParse(body)
  console.log('zod:', parsed.success, parsed.success ? 'ok' : parsed.error.errors)
  if (!parsed.success) process.exit(1)

  const data = parsed.data
  const passwordHash = await bcrypt.hash(data.password, 12)
  const user = await prisma.user.create({
    data: {
      employeeId: `EMP26${Math.floor(Math.random() * 9000) + 1000}`,
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      prefix: data.prefix,
      nickname: data.nickname || null,
      phone: data.phone,
      birthDate: null,
      address: data.address || null,
      nationalId: null,
      role: data.role,
      status: 'PENDING',
      department: data.department,
      baseSalary: data.baseSalary,
      startDate: new Date(data.startDate),
      socialSecurity: data.socialSecurity,
    },
  })
  await prisma.leaveBalance.create({
    data: { userId: user.id, year: new Date().getFullYear(), sick: 30, vacation: 6, personal: 3 },
  })
  console.log('created user:', user.id, user.email)
  await prisma.user.delete({ where: { id: user.id } })
  console.log('cleanup ok')
} catch (e) {
  console.error('FAIL:', e)
} finally {
  await prisma.$disconnect()
}
