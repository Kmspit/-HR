import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'

import { prisma } from '@/lib/prisma'

import { apiError } from '@/lib/api-handler'

import { ensureDbSchema } from '@/lib/ensure-db-schema'

import { buildMonthlyWorkLog, buildMonthlyWorkLogForTeam } from '@/lib/attendance-work-log'

import { branchUserWhere, buildBranchScope, parseBranchQueryParam } from '@/lib/branch-scope'

import {

  ALL_EMPLOYEES_USER_ID,

  listAttendanceTeamUsers,

} from '@/lib/attendance-team-users'



export async function GET(req: NextRequest) {

  try {

    await ensureDbSchema()

    const session = await auth()

    if (!session?.user?.id) {

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    }



    const { searchParams } = new URL(req.url)

    const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10)

    const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)

    let userId = searchParams.get('userId') ?? session.user.id

    const branchParam = parseBranchQueryParam(searchParams.get('branchId') ?? undefined)

    const isHr = ['MANAGER_HR', 'ADMIN'].includes(session.user.role)



    if (userId !== session.user.id && !isHr) {

      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    }



    const scope = buildBranchScope(session.user, { branchId: branchParam })



    if (userId === ALL_EMPLOYEES_USER_ID) {

      if (!isHr) {

        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      }

      const team = await listAttendanceTeamUsers(scope)

      const report = await buildMonthlyWorkLogForTeam(team, month, year)

      return NextResponse.json({

        ...report,

        viewMode: 'all',

        employee: {

          name: `ทุกคน (${team.length} คน)`,

          employeeId: null,

          department: null,

        },

      })

    }



    if (userId !== session.user.id) {

      const allowed = await prisma.user.findFirst({

        where: branchUserWhere(scope, { id: userId }),

        select: { id: true, name: true, employeeId: true, department: true, status: true },

      })

      if (!allowed) {

        return NextResponse.json({ error: 'ไม่พบพนักงานในสาขาที่เลือก' }, { status: 404 })

      }

    }



    const user = await prisma.user.findUnique({

      where: { id: userId },

      select: { id: true, name: true, employeeId: true, department: true, status: true },

    })

    if (!user) {

      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })

    }



    const report = await buildMonthlyWorkLog(userId, month, year)



    return NextResponse.json({

      ...report,

      viewMode: 'single',

      employee: user,

    })

  } catch (err) {

    return apiError(err)

  }

}

