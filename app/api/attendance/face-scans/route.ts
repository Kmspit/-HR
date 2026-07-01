import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api-handler'
import {
  FACE_SCAN_TYPE_LABEL,
  resolveScanListImageUrl,
  type FaceScanType,
} from '@/lib/attendance-face-scan'
import { branchUserWhere, buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'

export async function GET(req: NextRequest) {
  try {    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)
    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)
    const userId = searchParams.get('userId')
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
    const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)

    const isHr = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)
    if (!isHr && userId && userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    let targetUserId = session.user.id
    let filterUserIds: string[] | undefined
    if (isHr) {
      if (userId) targetUserId = userId
      else {
        const scope = buildBranchScope(session.user, { branchId: branchParam })
        const team = await prisma.user.findMany({
          where: branchUserWhere(scope, { status: 'ACTIVE' }),
          select: { id: true },
        })
        filterUserIds = team.map((u) => u.id)
      }
    }

    const rows = await prisma.attendanceFaceScan.findMany({
      where: {
        ...(filterUserIds ? { userId: { in: filterUserIds } } : { userId: targetUserId }),
        scanTime: { gte: startDate, lte: endDate },
      },
      take: limit,
    })

    const userIds = [...new Set(rows.map((r) => r.userId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, employeeId: true, department: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const sorted = [...rows].sort((a, b) => {
      const nameA = userMap.get(a.userId)?.name ?? ''
      const nameB = userMap.get(b.userId)?.name ?? ''
      const byName = nameA.localeCompare(nameB, 'th')
      if (byName !== 0) return byName
      return b.scanTime.getTime() - a.scanTime.getTime()
    })

    return NextResponse.json({
      month,
      year,
      scans: sorted.map((r) =>
        mapScan({
          ...r,
          user: userMap.get(r.userId) ?? {
            id: r.userId,
            name: '—',
            employeeId: null,
            department: null,
          },
        }),
      ),
    })
  } catch (err) {
    return apiError(err)
  }
}

function mapScan(r: {
  id: string
  scanType: string
  scanTime: Date
  confidenceScore: number | null
  matchScore: number | null
  livenessScore: number | null
  matched: boolean
  faceMatched: boolean
  cloudinaryPublicId: string | null
  objectKey: string | null
  imageUrl: string | null
  secureUrl: string | null
  format: string | null
  storageProvider: string
  locationName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  deviceInfo: string | null
  user: { id: string; name: string; employeeId: string | null; department: string | null }
}) {
  const type = r.scanType as FaceScanType
  return {
    id: r.id,
    scanType: r.scanType,
    scanTypeLabel: FACE_SCAN_TYPE_LABEL[type] ?? r.scanType,
    scanTime: r.scanTime.toISOString(),
    confidenceScore: r.confidenceScore,
    matchScore: r.matchScore,
    livenessScore: r.livenessScore,
    matched: r.matched,
    faceMatched: r.faceMatched,
    cloudinaryPublicId: r.cloudinaryPublicId,
    secureUrl: r.secureUrl,
    storageProvider: r.storageProvider,
    locationName: r.locationName,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    deviceInfo: r.deviceInfo,
    imageApiUrl: `/api/attendance/scan-image/${r.id}`,
    imageDisplayUrl: resolveScanListImageUrl(r),
    employee: r.user,
  }
}
