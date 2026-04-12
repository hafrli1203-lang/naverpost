import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("auth_token")?.value;

  if (!authToken || authToken !== process.env.AUTH_TOKEN_SECRET) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다. 다시 로그인해 주세요." },
        { status: 401 }
      );
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
