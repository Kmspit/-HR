/**
 * คัดลอก prototype/ → public/prototype/ เพื่อให้ Next.js เสิร์ฟที่ /prototype/*
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'prototype')
const dest = join(root, 'public', 'prototype')

if (!existsSync(src)) {
  console.warn('[sync-prototype] skip: no prototype/ folder')
  process.exit(0)
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const a = join(from, name)
    const b = join(to, name)
    if (statSync(a).isDirectory()) copyDir(a, b)
    else cpSync(a, b)
  }
}

copyDir(src, dest)
console.log('[sync-prototype] OK → public/prototype/')
