export type ApprovalType = 'LEAVE' | 'OUTSIDE' | 'WEEKLY_PLAN' | 'FORGOT_SCAN'

export type ApprovalTab = 'pending' | 'approved' | 'rejected' | 'mine'

export const APPROVAL_TABS: ApprovalTab[] = ['pending', 'approved', 'rejected', 'mine']

export function parseApprovalTab(value: string | null): ApprovalTab {
  if (value && APPROVAL_TABS.includes(value as ApprovalTab)) return value as ApprovalTab
  return 'pending'
}

export type ApprovalDetailField = { label: string; value: string }

export type UnifiedApprovalItem = {
  id: string
  type: ApprovalType
  employeeName: string
  employeeId: string
  department: string | null
  requestTypeLabel: string
  submittedAt: string
  currentStep: string | null
  status: string
  statusLabel: string
  summary: string
  canAct: boolean
  deepLink: string
  detailFields: ApprovalDetailField[]
}

export type ApprovalCenterCounts = {
  pending: number
  approved: number
  rejected: number
  mine: number
  byType: Record<ApprovalType, number>
}

export type ApprovalCenterPayload = {
  pending: UnifiedApprovalItem[]
  approved: UnifiedApprovalItem[]
  rejected: UnifiedApprovalItem[]
  myRequests: UnifiedApprovalItem[]
  departments: string[]
  counts: ApprovalCenterCounts
  userRole: string
  canManageChains: boolean
}

export type ApprovalFilters = {
  type: ApprovalType | 'ALL'
  department: string
  status: string
  dateFrom: string
  dateTo: string
}
