import sharp from "sharp";

/**
 * 이미지 워싱 — 같은 실제 매장 사진을 여러 글에 재사용할 때 네이버의
 * 동일/중복 이미지(해시) 판정을 피하기 위해, 매 사용마다 "다른 파일/다른 해시"가
 * 되도록 미세 변형을 가한다. 단 눈에는 같은 진짜 사진으로 보여야 한다.
 *
 * 적용 변형(결정 안 함, 매번 랜덤):
 *  - 팬 크롭(가장자리 3~6% 잘라 구도 살짝 이동) → 지각해시(pHash) 변화
 *  - 밝기/채도/색상 미세 지터
 *  - JPEG 재압축(품질 82~90, mozjpeg) → 바이트 해시 100% 변화
 *  - 메타데이터(EXIF) 제거(sharp 기본 동작)
 *  - 최종 1:1 정사각(1024x1024) — fit:contain(흰 여백). 생성 이미지와 비율 통일.
 *
 * ※ 1:1은 contain(레터박스)로 맞춘다 — cover로 자르면 매장 간판/상단이 잘리므로,
 *   실사진은 자르지 않고 여백을 대 정사각으로 만든다(생성 경로는 cover 크롭과 다름).
 * ※ 회전은 하지 않는다 — 사진이 기울어져 오히려 부자연스럽다.
 *   재압축(바이트 해시)+팬 크롭(pHash)만으로 중복 판정 회피는 충분하다.
 * ※ 좌우반전도 하지 않는다 — 간판/글자가 거울처럼 뒤집혀 오히려 가짜 티가 난다.
 */

/** 블로그 이미지 통일 규격: 1:1 정사각(긴 변 1024). */
const SQUARE = 1024;
const PAD_WHITE = { r: 255, g: 255, b: 255 };

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export async function washImageBuffer(
  input: Buffer
): Promise<{ data: Buffer; mimeType: string }> {
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;

    // 메타 못 읽으면 재압축 + 1:1 contain만(해시는 바뀐다)
    if (!W || !H) {
      const data = await sharp(input, { failOn: "none" })
        .resize(SQUARE, SQUARE, { fit: "contain", background: PAD_WHITE })
        .jpeg({ quality: Math.round(rand(82, 90)), mozjpeg: true })
        .toBuffer();
      return { data, mimeType: "image/jpeg" };
    }

    // 1) 팬 크롭: 원본 대비 3~6% 작은 박스를 중앙±약간 이동해서 추출
    const cropFrac = rand(0.03, 0.06);
    const cw = Math.max(160, Math.floor(W * (1 - cropFrac)));
    const ch = Math.max(160, Math.floor(H * (1 - cropFrac)));
    const maxLeft = Math.max(0, W - cw);
    const maxTop = Math.max(0, H - ch);
    const left = Math.min(
      maxLeft,
      Math.max(0, Math.floor((W - cw) / 2) + Math.round(rand(-W * 0.02, W * 0.02)))
    );
    const top = Math.min(
      maxTop,
      Math.max(0, Math.floor((H - ch) / 2) + Math.round(rand(-H * 0.02, H * 0.02)))
    );

    // 2) 밝기/채도/색상 지터 후 1:1 정사각(contain, 흰 여백) — 자르지 않고 비율만 통일
    const data = await sharp(input, { failOn: "none" })
      .extract({ left, top, width: cw, height: ch })
      .modulate({
        brightness: rand(0.96, 1.04),
        saturation: rand(0.95, 1.06),
        hue: Math.round(rand(-4, 4)),
      })
      .resize(SQUARE, SQUARE, { fit: "contain", background: PAD_WHITE })
      .jpeg({ quality: Math.round(rand(82, 90)), mozjpeg: true })
      .toBuffer();

    return { data, mimeType: "image/jpeg" };
  } catch (err) {
    // 보안: 원본(비이미지일 수 있음)을 그대로 반환하지 않는다 — 비이미지 파일이
    // 그대로 base64로 새어 나가는 것을 막기 위해 실패는 그대로 던진다.
    // (호출부에서 catch해 AI 생성으로 폴백한다.)
    throw err instanceof Error ? err : new Error("image wash failed");
  }
}
