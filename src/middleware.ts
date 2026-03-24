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
    // API 라우트는 JSON 401 응답 반환 (리다이렉트 시 JSON 파싱 실패 방지)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "인증이 만료되었습니다. 다시 로그인해주세요." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
