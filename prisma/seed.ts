import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env from project root
config({ path: resolve(process.cwd(), '.env') })

function makePrisma() {
  const url   = process.env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (url && token) {
    console.log('Using Turso:', url)
    const adapter = new PrismaLibSQL({ url, authToken: token })
    return new PrismaClient({ adapter })
  }
  console.log('Using local SQLite')
  return new PrismaClient()
}

const prisma = makePrisma()

async function main() {
  console.log('🌱 Seeding database...')

  const PASS = await bcrypt.hash('demo1234', 12)

  const users = [
    { email: 'manager@demo.com', name: 'สมหญิง ประสาน', role: 'MANAGER_HR' as const, dept: 'HR', pos: 'HR Manager' },
    { email: 'admin@demo.com',   name: 'สมชาย อนุมัติ',  role: 'ADMIN' as const,      dept: 'IT', pos: 'System Admin' },
    { email: 'employee@demo.com',name: 'มานี รักงาน',    role: 'EMPLOYEE' as const,   dept: 'Marketing', pos: 'Marketing Executive' },
    { email: 'lawyer@demo.com',  name: 'วิชัย กฎหมาย',  role: 'LAWYER' as const,     dept: 'Legal', pos: 'Corporate Lawyer' },
  ]

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email:        u.email,
        passwordHash: PASS,
        name:         u.name,
        role:         u.role,
        status:       'ACTIVE',
        department:   u.dept,
        position:     u.pos,
        baseSalary:   35000,
        startDate:    new Date('2024-01-01'),
        socialSecurity: true,
        employeeId:   `EMP24${Math.floor(Math.random() * 9000) + 1000}`,
      },
    })

    await prisma.leaveBalance.upsert({
      where: { userId_year: { userId: user.id, year: 2026 } },
      update: {},
      create: { userId: user.id, year: 2026, sick: 30, vacation: 6, personal: 3 },
    })

    console.log(`✅ Created: ${u.email}`)
  }

  // Company settings — KM Serviceplus
  await prisma.companySettings.upsert({
    where: { id: 'singleton' },
    update: {
      companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
      companyNameEn: 'KM Service Plus Co., Ltd.',
      officeAddress: '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
      geofenceLat: 13.8253,
      geofenceLng: 100.6785,
      geofenceRadius: 250,
    },
    create: {
      id: 'singleton',
      companyName: 'บริษัท เค เอ็ม เซอร์วิส พลัส จำกัด',
      companyNameEn: 'KM Service Plus Co., Ltd.',
      officeAddress: '16 ซอย รามอินทรา 93 แขวงคันนายาว เขตคันนายาว กรุงเทพมหานคร 10230',
      geofenceLat: 13.8253,
      geofenceLng: 100.6785,
      geofenceRadius: 250,
      workStartTime: '08:30',
      workEndTime: '17:30',
      lateGraceMin: 15,
      sickDaysYear: 30,
      vacationDaysYear: 6,
      personalDaysYear: 3,
    },
  })

  console.log('✅ Seeding complete!')
  console.log('\n📋 Demo accounts:')
  console.log('  manager@demo.com / demo1234 → Manager/HR dashboard')
  console.log('  admin@demo.com   / demo1234 → Admin dashboard')
  console.log('  employee@demo.com / demo1234 → Attendance page')
  console.log('  lawyer@demo.com  / demo1234 → Weekly Plan page')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
