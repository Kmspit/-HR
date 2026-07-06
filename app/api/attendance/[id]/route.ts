import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { canViewUserRecord } from '@/lib/org-scope'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const record = await prisma.attendance.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, department: true, employeeId: true } },
      branch: { select: { name: true, address: true } },
    },
  })

  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (record.userId !== session.user.id) {
    const allowed = await canViewUserRecord(
      prisma,
      session.user.id,
      session.user.role,
      session.user.branchId,
      record.userId,
    )
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve face-scan proxy URLs (avoids Cloudinary auth issues)
  const scans = await prisma.attendanceFaceScan.findMany({
    where: { attendanceId: id },
    select: { id: true, scanType: true },
  })
  const scanMap = new Map(scans.map((s) => [s.scanType, `/api/attendance/scan-image/${s.id}`]))

  const resolvePhoto = (stored: string | null, scanType: string): string | null => {
    if (!stored) return null
    if (stored.startsWith('/') || stored.startsWith('https://')) return stored
    return scanMap.get(scanType) ?? null
  }

  // Fetch linked outside work request if present
  let outsideWork = null
  if (record.outsideWorkRequestId) {
    outsideWork = await prisma.outsideWorkRequest.findUnique({
      where: { id: record.outsideWorkRequestId, deletedAt: null },
      select: { place: true, purpose: true, client: true, googleMapsUrl: true, status: true },
    })
  }

  return NextResponse.json({
    id: record.id,
    date: record.date.toISOString(),
    sessionIndex: record.sessionIndex,
    checkIn: record.checkIn?.toISOString() ?? null,
    checkOut: record.checkOut?.toISOString() ?? null,
    lunchOut: record.lunchOut?.toISOString() ?? null,
    lunchIn: record.lunchIn?.toISOString() ?? null,
    status: record.status,
    lateMinutes: record.lateMinutes ?? 0,
    earlyLeaveMinutes: record.earlyLeaveMinutes ?? 0,
    isOutside: record.isOutside ?? false,
    workPlaceName: record.workPlaceName ?? null,
    address: record.address ?? null,
    // checkIn-specific GPS (fall back to legacy lat/lng)
    checkInLat: record.checkInLat ?? record.lat ?? null,
    checkInLng: record.checkInLng ?? record.lng ?? null,
    checkInAddress: record.checkInAddress ?? record.address ?? null,
    // checkOut GPS
    checkOutLat: record.checkOutLat ?? null,
    checkOutLng: record.checkOutLng ?? null,
    checkOutAddress: record.checkOutAddress ?? null,
    autoCheckout: record.autoCheckout ?? false,
    note: record.note ?? null,
    gpsAccuracy: record.gpsAccuracy ?? null,
    // Photos
    photoUrl: resolvePhoto(record.photoUrl, 'checkin'),
    checkOutPhotoUrl: resolvePhoto(record.checkOutPhotoUrl, 'checkout'),
    lunchOutPhotoUrl: resolvePhoto(record.lunchOutPhotoUrl, 'lunch-out'),
    lunchInPhotoUrl: resolvePhoto(record.lunchInPhotoUrl, 'lunch-in'),
    // Relations
    user: {
      name: record.user.name,
      department: record.user.department ?? null,
      employeeId: record.user.employeeId ?? null,
    },
    branch: record.branch
      ? { name: record.branch.name, address: record.branch.address ?? null }
      : null,
    outsideWork,
  })
}
