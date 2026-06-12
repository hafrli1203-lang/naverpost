import { NextRequest, NextResponse } from "next/server";
import { registerPostToBlogOps } from "@/lib/blogops/client";
import { saveSession, listSessions, deleteSession } from "@/lib/storage/sessionStore";
import type { SavedSession } from "@/lib/storage/sessionStore";

// GET - list all saved sessions
export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json({ success: true, data: sessions });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "세션 목록 조회 실패" },
      { status: 500 }
    );
  }
}

// POST - save a session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session: SavedSession = {
      id: body.id || crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      shopName: body.shopName,
      category: body.category,
      topic: body.topic,
      title: body.title,
      mainKeyword: body.mainKeyword,
      subKeyword1: body.subKeyword1,
      subKeyword2: body.subKeyword2,
      articleContent: body.articleContent,
      images: Array.isArray(body.images) ? body.images : undefined,
    };
    await saveSession(session);

    // BlogOps(성과 측정) 글 기록 — 실패해도 세션 저장은 성공 처리하고 결과만 표면화한다.
    // (설계: docs/designs/blogops-integration.md, BLOGOPS_API_URL 미설정 시 연동 OFF)
    const blogops = await registerPostToBlogOps({
      shopName: session.shopName,
      category: session.category,
      title: session.title,
      mainKeyword: session.mainKeyword,
      subKeywords: [session.subKeyword1, session.subKeyword2],
    });

    return NextResponse.json({ success: true, data: { ...session, blogops } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "세션 저장 실패" },
      { status: 500 }
    );
  }
}

// DELETE - delete a session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "id 파라미터 필수" }, { status: 400 });
    }
    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "세션 삭제 실패" },
      { status: 500 }
    );
  }
}
