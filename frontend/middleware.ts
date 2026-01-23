import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/', '/public'];
  const isPublicRoute = publicRoutes.some(route => {
    if (route === '/') {
      return request.nextUrl.pathname === '/';
    }
    return request.nextUrl.pathname.startsWith(route);
  });
  
  // Allow branch portal and HQ portal routes
  if (request.nextUrl.pathname.startsWith('/public/branch/') || 
      request.nextUrl.pathname.startsWith('/public/hq')) {
    return NextResponse.next();
  }
  
  // Allow public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }
  
  // For protected routes, let the client-side handle authentication
  // (since we use localStorage, not cookies)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

