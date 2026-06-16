# HRFlow — Enterprise HR Platform (เค เอ็ม เซอร์วิส พลัส)

**Project Type**: Multi-page HTML/CSS/JS prototype for HR management system

## Project Overview

HRFlow (UI brand: **เค เอ็ม เซอร์วิส พลัส**) is an enterprise HR platform with employee tracking, attendance, payroll, leave, OOO scheduling, and LINE OA integration. Data persists in `localStorage` (`hrflow_*` keys) with optional API sync when deployed on the main app domain.

### Key Features
- Dashboard with analytics (`index.html`, `dashboard.js`)
- Attendance & face recognition (`attendance.html`, `attendance.js`, `face-core.js`)
- Leave request & approval workflow (`leave.html`)
- Out-of-office weekly plans (`out-of-office.html`)
- Payroll, payslips, reports
- Employee management & RBAC (4 roles)
- Dynamic sidebar + mobile nav (`hr-core.js` → `SIDEBAR_NAV`, `MOBILE_NAV`)

## Architecture & Structure

### Core Files
| File | Role |
|------|------|
| `style.css` | Shared design system (CSS variables, components, responsive) |
| `hr-core.js` | Auth, sidebar, mobile nav, localStorage CRUD, RBAC, API layer stub |
| `face-core.js` | Client-side face recognition (face-api.js CDN) |
| `dashboard.js` | Dashboard-only logic (index.html) |
| `attendance.js` | Attendance page logic (GPS, map, face scan, history) |
| `dev-banner.js` | Prototype warning banner |
| `schema.prisma` | PostgreSQL data model for future backend |
| `line-relay-worker.js` | Cloudflare Worker for LINE relay |

### HTML Pages (19)
All app pages use `<nav class="sidebar-nav"></nav>` rendered by `hr-core.js`.

**Auth:** `login.html`, `forgot-password.html`  
**App:** `index.html`, `attendance.html`, `attendance-history.html`, `leave.html`, `out-of-office.html`, `calendar.html`, `employees.html`, `payroll.html`, `payslip.html`, `reports.html`, `announcements.html`, `warnings.html`, `rules.html`, `line-oa.html`, `settings.html`

### Deep Links (sidebar anchors)
| Link | Target ID |
|------|-----------|
| `attendance.html#scan-history` | `#scan-history` |
| `calendar.html?view=week` | Week view toggle |
| `leave.html#approve` | `#tab-approve` (hash handler) |
| `settings.html#profile` | `#profile` |
| `settings.html#branches` | `#branches` |
| `settings.html#permissions` | `#permissions` |
| `settings.html#face` | `#face` |
| `employees.html#departments` | `#departments` |

## Design System

**Typography:**
- Headings: Syne (400, 700, 800)
- Body: IBM Plex Sans Thai (300–700)
- Language: Thai (`lang="th"`)

**Colors:** CSS custom properties in `:root` — `--bg`, `--accent`, `--green`, `--red`, etc.

## Development Guidelines

### Adding New Pages
1. Copy `<head>` + sidebar skeleton from any app page
2. Include `<script src="hr-core.js"></script>` and `<script src="dev-banner.js"></script>`
3. Add entry to `SIDEBAR_NAV` and optionally `MOBILE_NAV` in `hr-core.js`
4. Use role classes: `role-hr-admin-only`, `role-manager-only`, etc.

### RBAC Roles
- `EMPLOYEE`, `LAWYER`, `MANAGER_HR`, `ADMIN`
- Gated via CSS classes and `initRole()` in `hr-core.js`

## Notes for AI Agents

- **Do not duplicate sidebar HTML** — `renderSidebarNav()` owns navigation
- **Use `style.css`** — avoid large inline `<style>` blocks
- **Thai localization** — keep UI text in Thai unless i18n is explicitly requested
- **Accessibility** — hamburger is `<button aria-label="เปิดเมนู">`; use meaningful `alt` on images
- **Backend** — `useHrApi()` + `syncFromApi()` in `hr-core.js`; Prisma schema in `schema.prisma`
