import { prisma } from '@/lib/prisma'

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'ไม่ระบุ'
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

const DEPT: Record<string, string> = {
  DEBT: 'ฝ่ายเร่งรัดหนี้', LAW: 'ฝ่ายกฎหมาย', ASSET: 'ฝ่ายสืบทรัพย์', ENFORCE: 'ฝ่ายบังคับคดี',
}

const STATUS: Record<string, string> = {
  NEW: 'รับเรื่องแล้ว', ASSIGNED: 'มอบหมายแล้ว', IN_PROGRESS: 'กำลังดำเนินการ',
  WAITING_DOC: 'รอเอกสาร', WAITING_REVIEW: 'รอตรวจสอบ', REVISION: 'ส่งกลับแก้ไข',
  COMPLETED: 'เสร็จสิ้น', OVERDUE: 'เกินกำหนด', PENDING: 'รอดำเนินการ',
}

// ── CEO / HR — sees everything ────────────────────────────────────────────────

async function ctxCeoHr(): Promise<string> {
  const now   = new Date()
  const in7   = new Date(now.getTime() + 7  * 86400_000)
  const in30  = new Date(now.getTime() + 30 * 86400_000)
  const ago30 = new Date(now.getTime() - 30 * 86400_000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [tasks, pendingLeaves, monthIncomes, monthExpenses, pendingClaims, debtSummary] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { createdAt: { gte: ago30 } },
      include: { assignee: { select: { name: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.caseIncome.aggregate({ where: { date: { gte: startOfMonth } }, _sum: { amount: true } }),
    prisma.caseExpense.aggregate({ where: { date: { gte: startOfMonth } }, _sum: { amount: true } }),
    prisma.expenseClaim.findMany({ where: { status: { in: ['PENDING', 'SUPERVISOR_APPROVED'] } }, select: { title: true, amount: true, submittedBy: { select: { name: true } } }, take: 10 }),
    Promise.all([
      prisma.debtor.count(),
      prisma.debtor.aggregate({ _sum: { totalDebt: true, paidAmount: true, remainingDebt: true } }),
      prisma.debtor.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.paymentAppointment.count({ where: { appointDate: { lt: now }, status: 'PENDING' } }),
    ]),
  ])

  const overdue     = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
  const courtIn7    = tasks.filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in7)
  const courtIn30   = tasks.filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in30)
  const completed   = tasks.filter((t) => t.status === 'COMPLETED')

  const byDept = ['DEBT', 'LAW', 'ASSET', 'ENFORCE'].map((d) => {
    const dt = tasks.filter((t) => t.taskDepartment === d)
    const cp = dt.filter((t) => t.status === 'COMPLETED')
    const ov = dt.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
    return `  ${DEPT[d]}: ทั้งหมด ${dt.length} งาน | เสร็จ ${cp.length} | ค้าง ${ov.length}`
  }).join('\n')

  const overdueList = overdue.slice(0, 10).map((t) =>
    `  - ${t.title} (ครบ: ${fmtDate(t.dueDate)}) — ${t.assignee.name}`
  ).join('\n')

  const courtList = courtIn7.slice(0, 7).map((t) =>
    `  - ${t.title}${t.caseNumber ? ` [${t.caseNumber}]` : ''} — ${fmtDate(t.courtDate)} — ${t.assignee.name}`
  ).join('\n')

  const totalIncome  = monthIncomes._sum.amount ?? 0
  const totalExpense = monthExpenses._sum.amount ?? 0
  const claimList    = pendingClaims.map((c) => `  - ${c.title} (${c.submittedBy.name}) ฿${c.amount.toLocaleString('th-TH')}`).join('\n')

  const [debtCount, debtAgg, debtByStatus, overdueAppts] = debtSummary
  const debtStatusList = debtByStatus.map((r) => `  ${r.status}: ${r._count.id} ราย`).join('\n')

  return [
    `=== สรุปภาพรวมบริษัท (30 วันล่าสุด) ===`,
    `งานทั้งหมด: ${tasks.length} รายการ`,
    `เสร็จสิ้น: ${completed.length} รายการ`,
    `ค้างเกินกำหนด: ${overdue.length} รายการ`,
    `ใบลาที่รออนุมัติ: ${pendingLeaves} รายการ`,
    `นัดศาลใน 7 วัน: ${courtIn7.length} รายการ`,
    `นัดศาลใน 30 วัน: ${courtIn30.length} รายการ`,
    ``,
    `=== การเงินเดือนนี้ ===`,
    `รายรับ: ฿${totalIncome.toLocaleString('th-TH')}`,
    `ค่าใช้จ่าย: ฿${totalExpense.toLocaleString('th-TH')}`,
    `กำไรสุทธิ: ฿${(totalIncome - totalExpense).toLocaleString('th-TH')}`,
    `ใบเบิกรออนุมัติ: ${pendingClaims.length} รายการ`,
    pendingClaims.length > 0 ? claimList : '',
    ``,
    `=== ผลงานรายฝ่าย ===`,
    byDept || '  (ไม่มีข้อมูล)',
    ``,
    `=== งานค้างเกินกำหนด (10 รายการล่าสุด) ===`,
    overdueList || '  (ไม่มีงานค้าง)',
    ``,
    `=== นัดศาลใน 7 วัน ===`,
    courtList || '  (ไม่มีนัดศาล)',
    ``,
    `=== ลูกหนี้ (Debt CRM) ===`,
    `ลูกหนี้ทั้งหมด: ${debtCount} ราย`,
    `หนี้รวม: ฿${(debtAgg._sum.totalDebt ?? 0).toLocaleString('th-TH')}`,
    `เก็บได้แล้ว: ฿${(debtAgg._sum.paidAmount ?? 0).toLocaleString('th-TH')}`,
    `คงค้าง: ฿${(debtAgg._sum.remainingDebt ?? 0).toLocaleString('th-TH')}`,
    `ผิดนัดชำระ (ค้าง): ${overdueAppts} นัด`,
    debtStatusList || '  (ไม่มีข้อมูล)',
  ].join('\n')
}

// ── MANAGER / TEAM_LEADER — sees team ────────────────────────────────────────

async function ctxManager(userId: string): Promise<string> {
  const now = new Date()
  const members = await prisma.user.findMany({
    where: { OR: [{ managerId: userId }, { teamLeaderId: userId }] },
    select: { id: true, name: true },
  })
  const memberIds = [userId, ...members.map((m) => m.id)]

  const tasks = await prisma.taskAssignment.findMany({
    where: { assigneeId: { in: memberIds } },
    include: { assignee: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const overdue   = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
  const completed = tasks.filter((t) => t.status === 'COMPLETED')
  const courtIn7  = tasks.filter((t) => {
    const in7 = new Date(now.getTime() + 7 * 86400_000)
    return t.courtDate && t.courtDate >= now && t.courtDate <= in7
  })

  const memberSummary = members.map((m) => {
    const mt = tasks.filter((t) => t.assignee.name === m.name)
    const ov = mt.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
    return `  ${m.name}: งาน ${mt.length} | ค้าง ${ov.length}`
  }).join('\n')

  const overdueList = overdue.slice(0, 8).map((t) =>
    `  - ${t.title} (ครบ: ${fmtDate(t.dueDate)}) — ${t.assignee.name}`
  ).join('\n')

  return [
    `=== สรุปทีม ===`,
    `สมาชิก: ${members.length} คน`,
    `งานทั้งหมด: ${tasks.length} | เสร็จ: ${completed.length} | ค้าง: ${overdue.length}`,
    `นัดศาลใน 7 วัน: ${courtIn7.length}`,
    ``,
    `=== ผลงานสมาชิก ===`,
    memberSummary || '  (ไม่มีสมาชิก)',
    ``,
    `=== งานค้างในทีม ===`,
    overdueList || '  (ไม่มีงานค้าง)',
  ].join('\n')
}

// ── EMPLOYEE / LAWYER / ENFORCEMENT — sees own ───────────────────────────────

async function ctxEmployee(userId: string): Promise<string> {
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400_000)

  const [tasks, leaveReqs] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { assigneeId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const active    = tasks.filter((t) => !['COMPLETED', 'OVERDUE'].includes(t.status))
  const overdue   = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'COMPLETED')
  const courtIn7  = tasks.filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in7)

  const taskList = active.slice(0, 10).map((t) =>
    `  - ${t.title} | สถานะ: ${STATUS[t.status] ?? t.status}${t.dueDate ? ` | ครบ: ${fmtDate(t.dueDate)}` : ''}${t.caseNumber ? ` | เลขคดี: ${t.caseNumber}` : ''}`
  ).join('\n')

  const leaveList = leaveReqs.slice(0, 5).map((l) =>
    `  - ${l.type} | ${fmtDate(l.startDate)} ถึง ${fmtDate(l.endDate)} | สถานะ: ${l.status}`
  ).join('\n')

  return [
    `=== งานของฉัน ===`,
    `งานทั้งหมด: ${tasks.length} | กำลังดำเนิน: ${active.length} | ค้าง: ${overdue.length}`,
    `นัดศาลใน 7 วัน: ${courtIn7.length}`,
    ``,
    `=== งานที่กำลังดำเนิน (10 รายการ) ===`,
    taskList || '  (ไม่มีงาน)',
    ``,
    `=== ประวัติการลาล่าสุด ===`,
    leaveList || '  (ไม่มีประวัติการลา)',
  ].join('\n')
}

// ── CLIENT — sees own cases ───────────────────────────────────────────────────

async function ctxClient(userId: string): Promise<string> {
  const now  = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400_000)

  const tasks = await prisma.taskAssignment.findMany({
    where: { clientId: userId },
    include: {
      assignee: { select: { name: true, position: true } },
      statusHistories: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const docs = await prisma.caseDocument.findMany({
    where: { clientId: userId, status: 'ACTIVE' },
    include: { files: { take: 1, orderBy: { version: 'desc' } } },
  })

  const courtIn30 = tasks.filter((t) => t.courtDate && t.courtDate >= now && t.courtDate <= in30)

  const caseList = tasks.map((t) => {
    const lastStatus = t.statusHistories.at(-1)
    return [
      `  คดี: ${t.title}${t.caseNumber ? ` [เลขคดี: ${t.caseNumber}]` : ''}`,
      `    สถานะ: ${STATUS[t.status] ?? t.status}`,
      lastStatus ? `    อัพเดทล่าสุด: ${lastStatus.status} (${fmtDate(new Date(lastStatus.createdAt))})` : '',
      t.courtDate ? `    วันนัดศาล: ${fmtDate(t.courtDate)}` : '',
      t.appointmentDate ? `    วันนัดหมาย: ${fmtDate(t.appointmentDate)}` : '',
      `    ผู้รับผิดชอบ: ${t.assignee.name}`,
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const docList = docs.slice(0, 5).map((d) =>
    `  - ${d.title} (${d.docType}) — ${fmtDate(new Date(d.updatedAt))} — ไฟล์: ${d.files.length}`
  ).join('\n')

  return [
    `=== คดีของคุณ ===`,
    `จำนวนคดี: ${tasks.length} | นัดศาลใน 30 วัน: ${courtIn30.length}`,
    ``,
    tasks.length > 0 ? caseList : '  (ไม่มีคดี)',
    ``,
    `=== เอกสารที่มี ===`,
    docList || '  (ไม่มีเอกสาร)',
  ].join('\n')
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function fetchAiContext(userId: string, role: string): Promise<string> {
  try {
    if (['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR'].includes(role)) return await ctxCeoHr()
    if (['MANAGER', 'TEAM_LEADER', 'ADMIN'].includes(role))         return await ctxManager(userId)
    if (role === 'CLIENT')                                           return await ctxClient(userId)
    return await ctxEmployee(userId)
  } catch {
    return '(ไม่สามารถโหลดข้อมูลบริบทได้ในขณะนี้)'
  }
}
