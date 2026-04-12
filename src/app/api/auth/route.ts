import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    const correctPassword = process.env.AUTH_PASSWORD;
    if (!correctPassword) {
      return NextResponse.json(
        { success: false, error: "서버에 비밀번호가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (password !== correctPassword) {
      return NextResponse.json(
        { success: false, error: "비밀번호가 틀렸습니다." },
        { status: 401 }
      );
    }

    // 인증 토큰 생성 및 쿠키 설정
    const tokenSecret = process.env.AUTH_TOKEN_SECRET;
    if (!tokenSecret) {
      return NextResponse.json(
        { success: false, error: "서버 토큰이 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("auth_token", tokenSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7일
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "요청 처리 중 오류가 발생했습니다." },
      { status: 400 }
    );
  }
}

// 로그아웃
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
  return NextResponse.json({ success: true });
}
