import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/discover', '/plans', '/regulars', '/you', '/circles'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has('orbit_session');
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return NextResponse.redirect(new URL('/discover', req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ['/discover/:path*', '/plans/:path*', '/regulars/:path*', '/you/:path*', '/circles/:path*', '/login', '/register'] };
