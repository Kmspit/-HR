import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import { requireAuth, requireOrgScope, requireEditOrgScope, isGuardResponse } from '@/lib/api-guard'
import { formatThaiAddress } from '@/lib/thai-address-format'
import { normalizeEmail } from '@/lib/profile-update'
import {
  validateEmployeeProfile,
  employeeProfileHasErrors,
  firstEmployeeProfileError,
  coerceEmployeeProfileForm,
  type EmployeeProfileForm,
} from '@/lib/employee-profile-validation'
import { copyAddressIfSame, type RegisterAddress } from '@/lib/register-form-validation'
import { EMPLOYEE_AUDIT_SELECT, snapshotEmployeeForAudit, logEmployeeUpdateIfChanged } from '@/lib/employee-audit'

function requestIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

const PROFILE_SELECT = {
  nationality: true,
  maritalStatus: true,
  personalEmail: true,
  currentHouseNo: true,
  currentMoo: true,
  currentSoi: true,
  currentRoad: true,
  currentTambon: true,
  currentAmphoe: true,
  currentProvince: true,
  currentPostalCode: true,
  sameAsCurrentAddress: true,
  regHouseNo: true,
  regMoo: true,
  regSoi: true,
  regRoad: true,
  regTambon: true,
  regAmphoe: true,
  regProvince: true,
  regPostalCode: true,
} as const

/** Every field defaults to '' / false — a legacy employee (pre step 5/6)
 *  with no EmployeeProfile row yet must load a blank, editable form here,
 *  not a 404. Saving it for the first time upserts the row (see PUT below). */
function emptyProfileResponse(): EmployeeProfileForm {
  const emptyAddress: RegisterAddress = {
    houseNo: '', moo: '', soi: '', road: '', tambon: '', amphoe: '', province: '', postalCode: '',
  }
  return {
    nationality: '',
    maritalStatus: '',
    personalEmail: '',
    currentAddress: { ...emptyAddress },
    registeredAddress: { ...emptyAddress },
    sameAsCurrentAddress: false,
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const profile = await prisma.employeeProfile.findUnique({ where: { userId: id }, select: PROFILE_SELECT })
    if (!profile) {
      return NextResponse.json({ profile: emptyProfileResponse() })
    }

    return NextResponse.json({
      profile: {
        nationality: profile.nationality ?? '',
        maritalStatus: profile.maritalStatus ?? '',
        personalEmail: profile.personalEmail ?? '',
        currentAddress: {
          houseNo: profile.currentHouseNo ?? '',
          moo: profile.currentMoo ?? '',
          soi: profile.currentSoi ?? '',
          road: profile.currentRoad ?? '',
          tambon: profile.currentTambon ?? '',
          amphoe: profile.currentAmphoe ?? '',
          province: profile.currentProvince ?? '',
          postalCode: profile.currentPostalCode ?? '',
        },
        registeredAddress: {
          houseNo: profile.regHouseNo ?? '',
          moo: profile.regMoo ?? '',
          soi: profile.regSoi ?? '',
          road: profile.regRoad ?? '',
          tambon: profile.regTambon ?? '',
          amphoe: profile.regAmphoe ?? '',
          province: profile.regProvince ?? '',
          postalCode: profile.regPostalCode ?? '',
        },
        sameAsCurrentAddress: profile.sameAsCurrentAddress,
      } satisfies EmployeeProfileForm,
    })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (isGuardResponse(session)) return session

    const { id } = await params
    if (id !== session.user.id) {
      const scopeCheck = await requireEditOrgScope(id)
      if (isGuardResponse(scopeCheck)) return scopeCheck
    }

    const beforeAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
    if (!beforeAudit) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    const body = await req.json()
    const form = coerceEmployeeProfileForm(body)
    const errors = validateEmployeeProfile(form)
    if (employeeProfileHasErrors(errors)) {
      return NextResponse.json({ error: firstEmployeeProfileError(errors) }, { status: 400 })
    }

    let personalEmail: string | null = null
    if (form.personalEmail.trim()) {
      const normalized = normalizeEmail(form.personalEmail)
      if (!normalized) return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 })
      personalEmail = normalized
    }

    // Never trust the client's copy of "registered = current" — re-derive
    // server-side, same reasoning as app/api/register/route.ts.
    const effectiveRegistered = copyAddressIfSame(form.currentAddress, form.registeredAddress, form.sameAsCurrentAddress)

    const trimOrNull = (v: string) => v.trim() || null

    await prisma.$transaction([
      prisma.employeeProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          nationality: trimOrNull(form.nationality),
          maritalStatus: trimOrNull(form.maritalStatus),
          personalEmail,
          currentHouseNo: trimOrNull(form.currentAddress.houseNo),
          currentMoo: trimOrNull(form.currentAddress.moo),
          currentSoi: trimOrNull(form.currentAddress.soi),
          currentRoad: trimOrNull(form.currentAddress.road),
          currentTambon: trimOrNull(form.currentAddress.tambon),
          currentAmphoe: trimOrNull(form.currentAddress.amphoe),
          currentProvince: trimOrNull(form.currentAddress.province),
          currentPostalCode: trimOrNull(form.currentAddress.postalCode),
          sameAsCurrentAddress: form.sameAsCurrentAddress,
          regHouseNo: trimOrNull(effectiveRegistered.houseNo),
          regMoo: trimOrNull(effectiveRegistered.moo),
          regSoi: trimOrNull(effectiveRegistered.soi),
          regRoad: trimOrNull(effectiveRegistered.road),
          regTambon: trimOrNull(effectiveRegistered.tambon),
          regAmphoe: trimOrNull(effectiveRegistered.amphoe),
          regProvince: trimOrNull(effectiveRegistered.province),
          regPostalCode: trimOrNull(effectiveRegistered.postalCode),
        },
        update: {
          nationality: trimOrNull(form.nationality),
          maritalStatus: trimOrNull(form.maritalStatus),
          personalEmail,
          currentHouseNo: trimOrNull(form.currentAddress.houseNo),
          currentMoo: trimOrNull(form.currentAddress.moo),
          currentSoi: trimOrNull(form.currentAddress.soi),
          currentRoad: trimOrNull(form.currentAddress.road),
          currentTambon: trimOrNull(form.currentAddress.tambon),
          currentAmphoe: trimOrNull(form.currentAddress.amphoe),
          currentProvince: trimOrNull(form.currentAddress.province),
          currentPostalCode: trimOrNull(form.currentAddress.postalCode),
          sameAsCurrentAddress: form.sameAsCurrentAddress,
          regHouseNo: trimOrNull(effectiveRegistered.houseNo),
          regMoo: trimOrNull(effectiveRegistered.moo),
          regSoi: trimOrNull(effectiveRegistered.soi),
          regRoad: trimOrNull(effectiveRegistered.road),
          regTambon: trimOrNull(effectiveRegistered.tambon),
          regAmphoe: trimOrNull(effectiveRegistered.amphoe),
          regProvince: trimOrNull(effectiveRegistered.province),
          regPostalCode: trimOrNull(effectiveRegistered.postalCode),
        },
      }),
      // Legacy free-text cache — still read directly by the employee edit
      // page, self-profile page, and both audit-snapshot systems (see Phase 1
      // step 1's grep sweep). Kept in sync so those surfaces reflect this
      // structured data instead of going stale.
      prisma.user.update({
        where: { id },
        data: {
          address: formatThaiAddress(form.currentAddress) || null,
          addressIdCard: formatThaiAddress(effectiveRegistered) || null,
        },
      }),
    ])

    const afterAudit = await prisma.user.findUnique({ where: { id }, select: EMPLOYEE_AUDIT_SELECT })
    if (afterAudit) {
      await logEmployeeUpdateIfChanged({
        actorId: session.user.id,
        targetId: id,
        before: snapshotEmployeeForAudit(beforeAudit),
        after: snapshotEmployeeForAudit(afterAudit),
        ip: requestIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
