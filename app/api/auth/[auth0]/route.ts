import { handleAuth, handleLogin } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

const auth0Configured =
  process.env.AUTH0_SECRET &&
  process.env.AUTH0_ISSUER_BASE_URL &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET;

export async function GET(
  req: Request,
  context: { params: Promise<{ auth0: string }> }
) {
  if (!auth0Configured) {
    // Auth0 not configured: redirect to dashboard so you can test without login
    const url = new URL(req.url);
    const returnTo = url.searchParams.get('returnTo') || '/dashboard';
    return NextResponse.redirect(new URL(returnTo, url.origin));
  }
  return handleAuth({
    login: handleLogin({
      returnTo: '/dashboard'
    })
  })(req, context);
}
