import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next 16 renamed middleware.ts to proxy.ts. Refreshes the Supabase session on every
// page request and redirects before anything renders, so the login form never flashes.
const DASHBOARD = /^\/(dashboard|alerts|children|geospatial|health-activities|inventory|masterlist-upload|nutrition|reports|settings|supplementation|user-management|vaccination|child-profiling|vaccinations|nutritional-assessment|supplements)(\/|$)/
const AUTH_PAGES = new Set(['/login', '/register'])
// Accounts the dashboard layout renders. Anything else is sent back to /login there,
// so redirecting those away from /login would loop.
const DASHBOARD_STATUSES = new Set(['ACTIVE', 'PENDING'])

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser() validates with Supabase and rotates an expiring token. Do not run code between
  // createServerClient and this call.
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    const redirect = NextResponse.redirect(url)
    // Keep any refreshed session cookies on the redirect.
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && DASHBOARD.test(path)) return redirectTo('/login')

  if (user && AUTH_PAGES.has(path)) {
    const { data } = await supabase.from('users').select('account_status').eq('user_id', user.id).maybeSingle()
    if (DASHBOARD_STATUSES.has(String(data?.account_status ?? '').toUpperCase())) return redirectTo('/dashboard')
  }

  return response
}

export const config = {
  // Skip static files, APIs (they answer 401 themselves), the auth callback, the offline
  // shell and its worker, and the public landing/legal pages. The trailing .+ skips "/".
  matcher: [
    '/((?!_next/static|_next/image|api/|auth/callback|offline|sw\\.js|manifest\\.webmanifest|favicon\\.ico|icon\\.png|apple-icon\\.png|brand/|geojson/|terms|privacy|.*\\.(?:png|jpe?g|svg|gif|webp|ico|csv|json|js|txt)$).+)',
  ],
}
