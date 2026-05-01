// middleware.ts — Supabase Auth session refresh + route protection
// Runs on every request before the page renders.
// Required by @supabase/ssr to keep sessions alive via cookie refresh.
//
// To run locally: `supabase start` then copy the printed keys into .env.local.
// The local stack runs full Auth in Docker — no bypass needed.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

const PROTECTED_ROUTES = ['/dashboard', '/upload', '/properties', '/reports', '/onboarding']
const AUTH_ROUTES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Check for a stale session cookie before getUser() might clear it
  const hadSessionCookie = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token') && c.value.length > 0
  )

  // Refresh session — required, do not remove
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected = PROTECTED_ROUTES.some(r => path.startsWith(r))
  const isAuthRoute = AUTH_ROUTES.some(r => path.startsWith(r))

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    if (hadSessionCookie) loginUrl.searchParams.set('reason', 'expired')
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
