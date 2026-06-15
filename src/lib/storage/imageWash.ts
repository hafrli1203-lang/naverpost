import sharp from "sharp";

/**
 * 이미지 워싱 — 같은 실제 매장 사진을 여러 글에 재사용할 때 네이버의
 * 동일/중복 이미지(해시) 판정을 피하기 위해, 매 사용마다 "다른 파일/다른 해시"가
 * 되도록 미세 변형을 가한다. 단 눈에는 같은 진짜 사진으로 보여야 한다.
 *
 * 적용 변형(결정 안 함, 매번 랜덤):
 *  - 미세 회전(±1.1°) 후 회전 여백(쐐기) 제거를 위한 중앙 추출
 *  - 팬 크롭(가장자리 3~6% 잘라 구도 살짝 이동) → 지각해시(pHash) 변화
 *  - 약한 스케일(95~100%) + 재리사이즈
 *  - 밝기/채도/색상 미세 지터
 *  - JPEG 재압축(품질 82~90, mozjpeg) → 바이트 해시 100% 변화
 *  - 메타데이터(EXIF) 제거(sharp 기본 동작)
 *
 * ※ 좌우반전은 하지 않는다 — 간판/글자가 거울처럼 뒤집혀 오히려 가짜 티가 난다.
 */

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

    // 메타 못 읽으면 최소한 재압축만(해시는 바뀐다)
    if (!W || !H) {
      const data = await sharp(input, { failOn: "none" })
        .jpeg({ quality: Math.round(rand(82, 90)), mozjpeg: true })
        .toBuffer();
      return { data, mimeType: "image/jpeg" };
    }

    // 1) 미세 회전 (여백은 옅은 회색으로 채워지지만 이후 중앙 추출로 제거)
    const angle = rand(-1.1, 1.1);
    const rotated = await sharp(input, { failOn: "none" })
      .removeAlpha()
      .rotate(angle, { background: { r: 245, g: 245, b: 245 } })
      .toBuffer({ resolveWithObject: true });
    const rW = rotated.info.width;
    const rH = rotated.info.height;

    // 2) 팬 크롭: 원본 대비 3~6% 작은 박스를 중앙±약간 이동해서 추출(회전 쐐기도 함께 제거)
    const cropFrac = rand(0.03, 0.06);
    const cw = Math.max(160, Math.floor(W * (1 - cropFrac)));
    const ch = Math.max(160, Math.floor(H * (1 - cropFrac)));
    const maxLeft = Math.max(0, rW - cw);
    const maxTop = Math.max(0, rH - ch);
    const left = Math.min(
      maxLeft,
      Math.max(0, Math.floor((rW - cw) / 2) + Math.round(rand(-W * 0.02, W * 0.02)))
    );
    const top = Math.min(
      maxTop,
      Math.max(0, Math.floor((rH - ch) / 2) + Math.round(rand(-H * 0.02, H * 0.02)))
    );

    // 3) 약한 스케일
    const outW = Math.max(320, Math.round(cw * rand(0.95, 1.0)));

    const data = await sharp(rotated.data, { failOn: "none" })
      .extract({ left, top, width: cw, height: ch })
      .resize({ width: outW })
      .modulate({
        brightness: rand(0.96, 1.04),
        saturation: rand(0.95, 1.06),
        hue: Math.round(rand(-4, 4)),
      })
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
