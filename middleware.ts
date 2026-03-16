import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const auth0Configured =
  typeof process.env.AUTH0_ISSUER_BASE_URL === 'string' &&
  process.env.AUTH0_ISSUER_BASE_URL.length > 0;

export function middleware(request: NextRequest) {
  // When Auth0 is not configured, allow access everywhere (for local testing)
  if (!auth0Configured) {
    return NextResponse.next();
  }

  // Check for auth session cookie
  const sessionCookie = request.cookies.get('appSession');
  const isAuthenticated = !!sessionCookie;

  // If user is on landing page and has session, redirect to dashboard
  if (request.nextUrl.pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Protect dashboard route - redirect to login if no session
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/api/auth/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*'
  ]
};
