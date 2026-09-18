/**
 * Fields safe to return from user GET/PATCH APIs (no secrets).
 * nationalId is opt-in — see SAFE_USER_SELECT_WITH_NATIONAL_ID — because it's a
 * sensitive field gated behind GET /api/users/[id]/sensitive (HR_ADMIN only, audited).
 */
export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  employeeId: true,
  role: true,
  status: true,
  employeeType: true,
  managerId: true,
  teamLeaderId: true,
  department: true,
  position: true,
  jobLevel: true,
  baseSalary: true,
  payType: true,
  dailyRate: true,
  positionAllowance: true,
  diligenceAllowanceDefault: true,
  studentLoanDeduction: true,
  socialSecurity: true,
  socialSecurityNumber: true,
  isCoworker: true,
  startDate: true,
  phone: true,
  lineId: true,
  lineUserId: true,
  lineDisplayName: true,
  prefix: true,
  nickname: true,
  birthDate: true,
  address: true,
  addressIdCard: true,
  profileImage: true,
  branchId: true,
  divisionId: true,
  departmentId: true,
  sectionId: true,
} as const

/** SAFE_USER_SELECT plus nationalId — only for call sites that need the real value. */
export const SAFE_USER_SELECT_WITH_NATIONAL_ID = {
  ...SAFE_USER_SELECT,
  nationalId: true,
} as const

/** Redacted select for MANAGER (no nationalId / baseSalary / dailyRate /
 *  addressIdCard / socialSecurityNumber / positionAllowance /
 *  diligenceAllowanceDefault / studentLoanDeduction). payType stays visible
 *  (like employeeType) — it's a classification, not a pay figure; the
 *  actual rates/amounts (dailyRate, baseSalary, and the 3 payroll-batch-2
 *  fields above) are what's sensitive. */
export const MANAGER_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  employeeId: true,
  role: true,
  status: true,
  employeeType: true,
  payType: true,
  managerId: true,
  teamLeaderId: true,
  department: true,
  position: true,
  jobLevel: true,
  socialSecurity: true,
  isCoworker: true,
  startDate: true,
  phone: true,
  lineId: true,
  lineUserId: true,
  lineDisplayName: true,
  prefix: true,
  nickname: true,
  birthDate: true,
  address: true,
  profileImage: true,
  branchId: true,
  divisionId: true,
  departmentId: true,
  sectionId: true,
} as const
