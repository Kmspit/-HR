import type { NextResponse } from 'next/server'

export const FP_CHALLENGE_COOKIE = 'hrflow_fp_challenge'
const MAX_AGE = 15 * 60

export function setForgotPasswordChallengeCookie(response: NextResponse, challenge: string) {
  response.cookies.set(FP_CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function clearForgotPasswordChallengeCookie(response: NextResponse) {
  response.cookies.set(FP_CHALLENGE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
