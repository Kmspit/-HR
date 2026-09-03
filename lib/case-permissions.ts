/** Roles that may create a case and choose its assignee — was duplicated
 *  identically in app/api/cases/route.ts and CasesClient.tsx (client-side
 *  gating only, no server enforcement of its own copy); consolidated here so
 *  the two can't drift. Also gates GET /api/users, the assignee-picker
 *  endpoint that only this feature currently consumes. */
export const CASE_CREATE_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN', 'MANAGER', 'TEAM_LEADER', 'LAWYER', 'ENFORCEMENT']

/** Roles that see the company-wide executive case summary. */
export const CASE_EXEC_ROLES = ['SUPER_ADMIN', 'CEO', 'MANAGER_HR', 'HR', 'ADMIN']
