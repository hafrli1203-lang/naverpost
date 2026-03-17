import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 로그인 페이지와 인증 API는 통과
  if (pathname === "/login" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  // _next 정적 파일, favicon 등은 통과
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  // 인증 쿠키 확인
  const authToken = request.cookies.get("auth_token")?.value;

  if (!authToken || authToken !== process.env.AUTH_TOKEN_SECRET) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
