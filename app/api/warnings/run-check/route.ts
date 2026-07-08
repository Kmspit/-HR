/**

 * POST /api/warnings/run-check — manual warning check for authorized managers/HR

 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'

import { prisma } from '@/lib/prisma'

import { runWarningCheck } from '@/lib/warningEngine'

import { isCompanyWideApprover, resolveOrgListScope } from '@/lib/org-scope'


import type { Role } from '@prisma/client'



const ALLOWED_ROLES = new Set<Role>([

  'SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER',

])



export async function POST(_req: NextRequest) {



  const session = await auth()

  if (!session?.user?.id) {

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  }

  const role = session.user.role as Role

  if (!ALLOWED_ROLES.has(role)) {

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  }



  try {

    let results

    if (isCompanyWideApprover(role)) {

      results = await runWarningCheck()

    } else {

      const scope = await resolveOrgListScope(prisma, session.user.id, role)

      const userIds = scope === 'ALL' ? undefined : scope.filter((id) => id !== session.user!.id)

      results = await runWarningCheck({ userIds })

    }

    return NextResponse.json({ success: true, warned: results.length, results })

  } catch (err: unknown) {

    const message = err instanceof Error ? err.message : 'Unknown error'

    return NextResponse.json({ error: message }, { status: 500 })

  }

}

