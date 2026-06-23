import { vi } from 'vitest'

// Provide a minimal process.env for tests
process.env.NEXTAUTH_SECRET ??= 'test-secret'
process.env.TURSO_DATABASE_URL ??= ''
process.env.CLOUDINARY_CLOUD_NAME ??= ''

// Suppress console noise from modules during tests
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})
