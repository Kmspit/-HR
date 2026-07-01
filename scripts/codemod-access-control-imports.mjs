import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(p)
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      let s = fs.readFileSync(p, 'utf8')
      const o = s
      s = s.replace(/from '@\/lib\/rbac'/g, "from '@/lib/access-control'")
      s = s.replace(/from '@\/lib\/permissions'/g, "from '@/lib/access-control'")
      if (s !== o) fs.writeFileSync(p, s)
    }
  }
}

walk(root)
console.log('imports updated')
