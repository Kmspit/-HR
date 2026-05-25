# HRFlow — Next.js 15 Enterprise HR Platform

Professional HR Management System built with Next.js 15, TypeScript, TailwindCSS, Prisma + Supabase PostgreSQL, NextAuth.js v5.

## Quick Start

### 1. ติดตั้ง Node.js
ดาวน์โหลดที่ https://nodejs.org (เลือก LTS) แล้วติดตั้ง

### 2. ติดตั้ง dependencies
```bash
cd hrflow-app
npm install
```

### 3. ตั้งค่า Database (Supabase)
1. ไปที่ https://supabase.com → สร้าง project ใหม่ (ฟรี)
2. ไปที่ Settings → Database → Connection string → Copy URI
3. แก้ไขไฟล์ `.env.local`:
```
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
```

### 4. Push database schema
```bash
npm run db:push
```

### 5. Seed demo data
```bash
npm run db:seed
```

### 6. รันแอพ
```bash
npm run dev
```

เปิด http://localhost:3000

## Demo Accounts
| Email | Password | Role |
|-------|----------|------|
| manager@demo.com | demo1234 | Manager/HR |
| admin@demo.com | demo1234 | Admin |
| employee@demo.com | demo1234 | Employee |
| lawyer@demo.com | demo1234 | Lawyer |

## Tech Stack
- **Next.js 15** (App Router) + TypeScript
- **TailwindCSS** + Dark theme
- **Prisma ORM** + PostgreSQL (Supabase)
- **NextAuth.js v5** JWT authentication
- **Zod** validation
- **Sonner** toast notifications

## Features
- ✅ Authentication (Login / Register / Forgot Password)
- ✅ RBAC — 4 roles (Manager/HR, Admin, Employee, Lawyer)
- ✅ Sign Up Approval workflow (PENDING → HR Approve → ACTIVE)
- ✅ Leave request 2-step approval (Admin → Manager)
- ✅ Outside work request approval
- ✅ Weekly Lawyer Plan submission + approval
- ✅ Attendance tracking
- ✅ Employee management
- ✅ In-app notifications
- ✅ LINE Notify integration (mock)
- ✅ Audit logs
- ✅ Mobile responsive

## Deploy to Vercel
```bash
git init
git add .
git commit -m "Initial commit"
# Push to GitHub, then import to Vercel
# Add environment variables in Vercel dashboard
```
