import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=confirmation_failed', requestUrl.origin)
    )
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error(
      'AUTH CALLBACK ERROR:',
      error.message
    )

    return NextResponse.redirect(
      new URL('/login?error=confirmation_failed', requestUrl.origin)
    )
  }

  return NextResponse.redirect(
    new URL(next, requestUrl.origin)
  )
}