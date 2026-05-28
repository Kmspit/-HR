/**
 * Copy face-api WASM weights to public/models for browser loading.
 * Run automatically via predev/prebuild.
 */
import { cpSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const src = resolve(root, 'node_modules/@vladmandic/face-api/model')
const dest = resolve(root, 'public/models')

const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_tiny_model-weights_manifest.json',
  'face_landmark_68_tiny_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

if (!existsSync(src)) {
  console.warn('[copy-face-models] @vladmandic/face-api not installed — skip')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
for (const f of FILES) {
  const from = resolve(src, f)
  if (!existsSync(from)) {
    console.warn('[copy-face-models] missing', f)
    continue
  }
  cpSync(from, resolve(dest, f), { force: true })
}
console.log('[copy-face-models] OK → public/models/')
