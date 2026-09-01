import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { notifyRole, sendLineNotify } from '@/lib/notifications'
import { generateEmployeeId } from '@/lib/utils'
import { apiError, runNotify } from '@/lib/api-handler'
import { assertLineFieldsUnique, parseLineFields } from '@/lib/line-profile'
import { rateLimit } from '@/lib/rate-limit'
import { assertEnglishCredential } from '@/lib/english-input'
import { normalizeNationalId, parseBirthDate } from '@/lib/profile-update'
import { formatThaiAddress } from '@/lib/thai-address-format'
import { encryptField, FIELD_SALTS } from '@/lib/field-crypto'

const addressSchema = z.object({
  houseNo:    z.string().min(1, 'กรุณากรอกบ้านเลขที่'),
  moo:        z.string().optional(),
  soi:        z.string().optional(),
  road:       z.string().min(1, 'กรุณากรอกถนน'),
  tambon:     z.string().min(1, 'กรุณากรอกตำบล/แขวง'),
  amphoe:     z.string().min(1, 'กรุณากรอกอำเภอ/เขต'),
  province:   z.string().min(1, 'กรุณากรอกจังหวัด'),
  postalCode: z.string().regex(/^\d{5}$/, 'รหัสไปรษณีย์ 5 หลัก'),
})

const emergencyContactSchema = z.object({
  name:         z.string().min(1, 'กรุณากรอกชื่อผู้ติดต่อฉุกเฉิน'),
  relationship: z.string().min(1, 'กรุณากรอกความสัมพันธ์'),
  phone:        z.string().regex(/^0[0-9]{9}$/, 'เบอร์ผู้ติดต่อฉุกเฉินต้อง 10 หลัก ขึ้นต้นด้วย 0'),
  altPhone:     z.string().optional(),
})

// nationalId is deliberately unvalidated here (format or presence) — a
// foreign dependent may have no 13-digit Thai ID at all (see the Dependent
// model's own schema comment).
const dependentSchema = z.object({
  name:           z.string().min(1, 'กรุณากรอกชื่อผู้อยู่ในอุปการะ'),
  relationType:   z.enum(['SPOUSE', 'CHILD', 'PARENT', 'OTHER'], { message: 'กรุณาเลือกความสัมพันธ์' }),
  birthDate:      z.string().optional(),
  nationalId:     z.string().optional(),
  isTaxAllowance: z.boolean().default(false),
})

const bankAccountSchema = z.object({
  bankCode:      z.string().min(1, 'กรุณาเลือกธนาคาร'),
  accountNumber: z.string().min(1, 'กรุณากรอกเลขบัญชี'),
  accountName:   z.string().min(1, 'กรุณากรอกชื่อบัญชี'),
  accountType:   z.string().optional(),
  isPrimary:     z.boolean().default(false),
})

// baseSalary/startDate removed entirely (not just optional) — HR sets both
// at approval time now (Phase 1 step 7's unified approve+org-assign modal).
// nationalId is now required+validated (was optional pre-Phase-1).
const registerSchema = z.object({
  name:              z.string().min(2, 'กรุณากรอกชื่อ-นามสกุล'),
  prefix:            z.string().optional(),
  firstName:         z.string().min(1, 'กรุณากรอกชื่อจริง'),
  lastName:          z.string().min(1, 'กรุณากรอกนามสกุล'),
  nickname:          z.string().optional(),
  email:             z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:             z.string().regex(/^0[0-9]{9}$/, 'เบอร์โทรต้อง 10 หลัก ขึ้นต้นด้วย 0 (เช่น 0812345678)'),
  birthDate:         z.string().optional(),
  nationalId:        z.string().min(1, 'กรุณากรอกเลขบัตรประชาชน'),
  nationality:       z.string().optional(),
  maritalStatus:     z.string().optional(),
  role:              z.enum(['EMPLOYEE', 'LAWYER'], { message: 'กรุณาเลือกตำแหน่ง' }),
  socialSecurity:    z.boolean().default(true),
  password:          z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  branchId:          z.string().min(1, 'กรุณาเลือกสาขา'),
  lineId:            z.string().min(1, 'กรุณากรอก LINE ID'),
  currentAddress:    addressSchema,
  registeredAddress: addressSchema,
  sameAsCurrentAddress: z.boolean().default(false),
  emergencyContacts: z.array(emergencyContactSchema).min(1, 'กรุณาระบุผู้ติดต่อฉุกเฉินอย่างน้อย 1 คน'),
  dependents:        z.array(dependentSchema).default([]),
  bankAccounts:      z.array(bankAccountSchema).default([]),
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
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed } = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
    if (!allowed) {
      return NextResponse.json(
        { error: 'คำขอมากเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่' },
        { status: 429 },
      )
    }
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: zodFirstError(parsed.error) }, { status: 400 })
    }

    const data = parsed.data
    const email = data.email.trim().toLowerCase()
    const phone = data.phone.replace(/\D/g, '')

    const emailErr = assertEnglishCredential(email, 'email')
    const pwErr = assertEnglishCredential(data.password, 'password')
    if (emailErr || pwErr) {
      return NextResponse.json({ error: emailErr ?? pwErr }, { status: 400 })
    }

    const nationalId = normalizeNationalId(data.nationalId)
    if (!nationalId) {
      return NextResponse.json({ error: 'เลขบัตรประชาชนต้อง 13 หลัก' }, { status: 400 })
    }

    // Generic on purpose — this endpoint is public/unauthenticated (anyone can
    // reach it, no session at all), so a field-specific message here would let
    // an outside caller enumerate which emails/phone numbers/national IDs
    // already belong to an employee. Same generic message regardless of which
    // field actually collided.
    const DUPLICATE_MSG = 'ข้อมูลนี้มีอยู่ในระบบแล้ว'

    const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existingEmail) {
      return NextResponse.json({ error: DUPLICATE_MSG }, { status: 409 })
    }

    const existingPhone = await prisma.user.findFirst({ where: { phone }, select: { id: true } })
    if (existingPhone) {
      return NextResponse.json({ error: DUPLICATE_MSG }, { status: 409 })
    }

    const existingId = await prisma.user.findFirst({ where: { nationalId }, select: { id: true } })
    if (existingId) {
      return NextResponse.json({ error: DUPLICATE_MSG }, { status: 409 })
    }

    const branch = await prisma.companyBranch.findFirst({
      where: { id: data.branchId, isActive: true },
      select: { id: true, name: true },
    })
    if (!branch) {
      return NextResponse.json({ error: 'สาขาที่เลือกไม่ถูกต้องหรือปิดใช้งาน' }, { status: 400 })
    }

    const lineParsed = parseLineFields({ lineId: data.lineId }, { requireLineId: true, allowUserId: false, allowDisplayName: false })
    if (!lineParsed.ok) {
      return NextResponse.json({ error: lineParsed.error }, { status: 400 })
    }
    const lineUnique = await assertLineFieldsUnique(lineParsed)
    if (!lineUnique.ok) {
      // Same generic message here too — assertLineFieldsUnique's own message
      // ("LINE ID นี้มีในระบบแล้ว") is fine for its other (authenticated)
      // callers in profile/users routes, just not for this public endpoint.
      return NextResponse.json({ error: DUPLICATE_MSG }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)
    const employeeId   = generateEmployeeId()

    // Never trust the client's copy of "registered = current" — re-derive
    // server-side so a stale/mismatched registeredAddress in the payload
    // can't slip through when sameAsCurrentAddress is true.
    const effectiveRegistered = data.sameAsCurrentAddress ? data.currentAddress : data.registeredAddress

    const birthDate = parseBirthDate(data.birthDate)
    if (birthDate === 'invalid') {
      return NextResponse.json({ error: 'วันเกิดไม่ถูกต้อง' }, { status: 400 })
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          employeeId,
          email,
          passwordHash,
          name:          data.name.trim(),
          prefix:        emptyToNull(data.prefix),
          nickname:      emptyToNull(data.nickname),
          phone,
          birthDate,
          // Legacy free-text cache columns — still read directly by the
          // employee edit page, self-profile page, and both audit-snapshot
          // systems (see Phase 1 step 1's grep sweep). EmployeeProfile below
          // is the real structured source of truth; these stay in sync so
          // those existing surfaces don't go blank for new registrants.
          address:       formatThaiAddress({ ...data.currentAddress, moo: data.currentAddress.moo ?? '', soi: data.currentAddress.soi ?? '' }) || null,
          addressIdCard: formatThaiAddress({ ...effectiveRegistered, moo: effectiveRegistered.moo ?? '', soi: effectiveRegistered.soi ?? '' }) || null,
          nationalId,
          role:          data.role,
          status:        'PENDING',
          department:    null,
          branchId:      branch.id,
          baseSalary:    null,
          startDate:     null,
          socialSecurity: data.socialSecurity,
          lineId:          lineParsed.lineId,
        },
        select: { id: true },
      })

      await tx.leaveBalance.create({
        data: {
          userId:   created.id,
          year:     new Date().getFullYear(),
          sick:     30,
          vacation: 6,
          personal: 3,
        },
      })

      await tx.employeeProfile.create({
        data: {
          userId:        created.id,
          nationality:   emptyToNull(data.nationality),
          maritalStatus: emptyToNull(data.maritalStatus),
          currentHouseNo: data.currentAddress.houseNo.trim(),
          currentMoo:     emptyToNull(data.currentAddress.moo),
          currentSoi:     emptyToNull(data.currentAddress.soi),
          currentRoad:    data.currentAddress.road.trim(),
          currentTambon:  data.currentAddress.tambon.trim(),
          currentAmphoe:  data.currentAddress.amphoe.trim(),
          currentProvince: data.currentAddress.province.trim(),
          currentPostalCode: data.currentAddress.postalCode.trim(),
          sameAsCurrentAddress: data.sameAsCurrentAddress,
          regHouseNo: effectiveRegistered.houseNo.trim(),
          regMoo:     emptyToNull(effectiveRegistered.moo),
          regSoi:     emptyToNull(effectiveRegistered.soi),
          regRoad:    effectiveRegistered.road.trim(),
          regTambon:  effectiveRegistered.tambon.trim(),
          regAmphoe:  effectiveRegistered.amphoe.trim(),
          regProvince: effectiveRegistered.province.trim(),
          regPostalCode: effectiveRegistered.postalCode.trim(),
        },
      })

      await tx.emergencyContact.createMany({
        data: data.emergencyContacts.map((c, i) => ({
          userId:       created.id,
          name:         c.name.trim(),
          relationship: c.relationship.trim(),
          phone:        c.phone.replace(/\D/g, ''),
          altPhone:     emptyToNull(c.altPhone),
          isPrimary:    i === 0,
          sortOrder:    i,
        })),
      })

      if (data.dependents.length) {
        await tx.dependent.createMany({
          data: data.dependents.map((d, i) => {
            const rawNationalId = d.nationalId?.trim() || null
            const depBirthDate = parseBirthDate(d.birthDate)
            return {
              userId:          created.id,
              name:            d.name.trim(),
              relationType:    d.relationType,
              nationalIdEnc:   rawNationalId ? encryptField(rawNationalId, FIELD_SALTS.DEPENDENT_NATIONAL_ID) : null,
              nationalIdLast4: rawNationalId ? rawNationalId.slice(-4) : null,
              birthDate:       depBirthDate === 'invalid' ? null : depBirthDate,
              isTaxAllowance:  d.isTaxAllowance,
              sortOrder:       i,
            }
          }),
        })
      }

      if (data.bankAccounts.length) {
        await tx.bankAccount.createMany({
          data: data.bankAccounts.map((b, i) => {
            const accountNumber = b.accountNumber.replace(/\D/g, '')
            return {
              userId:             created.id,
              bankCode:           b.bankCode,
              accountNameEnc:     encryptField(b.accountName.trim(), FIELD_SALTS.BANK_ACCOUNT),
              accountNumberEnc:   encryptField(accountNumber, FIELD_SALTS.BANK_ACCOUNT),
              accountNumberLast4: accountNumber.slice(-4),
              accountType:        emptyToNull(b.accountType),
              isPrimary:          b.isPrimary,
              sortOrder:          i,
            }
          }),
        })
      }

      return created
    })

    await runNotify(() =>
      notifyRole(
        'MANAGER_HR',
        'REGISTER_REQUEST',
        '📋 มีคำขอสมัครใหม่',
        `${data.name} (${email}) ขอสมัคร [${branch.name}] · ${data.role} — รอ HR กำหนดฝ่าย/แผนก/ส่วนงาน`,
        '/employees?tab=pending',
      ),
    )

    await runNotify(() =>
      sendLineNotify(
        `\n🔔 [เค เอ็ม เซอร์วิส พลัส] คำขอสมัครใหม่\nสาขา: ${branch.name}\nชื่อ: ${data.name}\nตำแหน่ง: ${data.role}\nอีเมล: ${email}\n\n⚠️ อนุมัติและกำหนดฝ่าย/แผนก/ส่วนงานที่ระบบ HR`,
      ),
    )

    return NextResponse.json({
      success: true,
      message: 'สมัครสำเร็จ รอการอนุมัติจาก HR',
      userId: user.id,
    })
  } catch (err) {
    console.error('[REGISTER ERROR]', err)
    return apiError(err)
  }
}
