# Approval Requests API (Generic 2.0)

**Status:** API-only — no dedicated UI page. Staff use **Approval Center** (`/approval-center`) for day-to-day approvals.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/approval-requests` | List (`?mine=true`, `?pending=true`, filters) |
| POST | `/api/approval-requests` | Create multi-step request |
| GET | `/api/approval-requests/[id]` | Detail + activity + signatures |
| PATCH | `/api/approval-requests/[id]` | Approve / reject / revise step |

## Auth & org-scope

- **View:** requester, assigned approver (`approverId`), role-based approver with direct-report scope, or HR/company-wide roles.
- **Pending list:** supervisors only see requests from their org scope when matched by `approverRole`.
- **Act on step:** same as view + active step must match actor.

## When to use

- Legal/finance integrations needing generic multi-step approval with activity log.
- **Do not** use for leave / outside-work / forgot-scan — those use entity-specific chain APIs (`/api/approvals`, step-approve routes).

## UI

No React page consumes this API today. Future finance module may wire here; until then treat as backend-only.
