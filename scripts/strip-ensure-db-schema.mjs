/**
 * Remove ensureDbSchema imports and calls from hot paths.
 * Usage: node scripts/strip-ensure-db-schema.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIP = new Set([
  path.normalize('lib/ensure-db-schema.ts'),
  path.normalize('app/api/cron/schema-migrate/route.ts'),
])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, out)
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const importRe = /^import\s+\{\s*ensureDbSchema\s*\}\s+from\s+['"]@\/lib\/ensure-db-schema['"]\s*\n/m
const callRes = [
  /^\s*await ensureDbSchema\(\)\.catch\(\(\)\s*=>\s*\{\}\)\s*\n/gm,
  /^\s*await ensureDbSchema\(\)\.catch\(\(\)\s*=>\s*false\)\s*\n/gm,
  /^\s*await ensureDbSchema\(\)\s*\n/gm,
  /^\s*const schemaOk = await ensureDbSchema\(\)\.catch\(\(\)\s*=>\s*false\)\s*\n/gm,
]

let changed = 0
for (const file of walk(root)) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  if (SKIP.has(path.normalize(rel))) continue
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes('ensureDbSchema')) continue
  const before = src
  src = src.replace(importRe, '')
  for (const re of callRes) src = src.replace(re, '')
  // try/catch blocks that only wrapped ensureDbSchema
  src = src.replace(
    /\s*try\s*\{\s*\n\s*await ensureDbSchema\(\)[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{\s*console\.error\([^)]*\)[^}]*\}\s*\n/g,
    '',
  )
  if (src !== before) {
    fs.writeFileSync(file, src)
    console.log('stripped:', rel)
    changed += 1
  }
}
console.log(`Done — ${changed} files updated`)
