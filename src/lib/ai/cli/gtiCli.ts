import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";
import { CliError, runCli } from "./spawnCli";

export type GtiResult = {
  base64Data: string;
  mimeType: string;
};

type GtiRunOptions = {
  prompt: string;
  timeoutMs?: number;
  provider?: "auto" | "private-codex" | "codex-cli";
  model?: string;
  /** 참조 이미지 경로(실제 매장 사진 등). gti --image 로 전달. */
  images?: string[];
  /** 출력 크기. 블로그 이미지는 1:1(정사각). gti --size 로 전달(프롬프트의 --ar 잡음 대체). */
  size?: string;
  /** 진단(IMG-G): 백엔드 호출 없이 요청 형태만 출력(무비용). env GTI_DRY_RUN=1 로도 켬. */
  dryRun?: boolean;
  /** 진단(IMG-G): sanitized 요청/응답 덤프 디렉터리. env GTI_DEBUG_DIR 로도 지정. */
  debugDir?: string;
};

export async function runGti({
  prompt,
  timeoutMs = 300_000,
  provider = "private-codex",
  model,
  images = [],
  size = "1024x1024",
  dryRun,
  debugDir,
}: GtiRunOptions): Promise<GtiResult> {
  const effectiveDryRun = dryRun ?? process.env.GTI_DRY_RUN === "1";
  const effectiveDebugDir = debugDir ?? (process.env.GTI_DEBUG_DIR || undefined);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "naverpost-gti-"));
  const outputPath = path.join(tmpDir, `${crypto.randomUUID()}.png`);

  try {
    const args = [
      "--prompt",
      prompt,
      "--output",
      outputPath,
      "--provider",
      provider,
    ];
    if (size) {
      args.push("--size", size);
    }
    if (model) {
      args.push("--model", model);
    }
    // 참조 이미지: 실제로 존재하는 파일만 --image 로 첨부 (없으면 프롬프트만으로 폴백)
    for (const imagePath of images) {
      try {
        await fs.access(imagePath);
        args.push("--image", imagePath);
      } catch {
        // 경로 오류 시 해당 참조만 스킵
      }
    }
    // 진단 옵션(IMG-G): dry-run은 백엔드 미호출(무비용), debug는 요청/응답 덤프.
    if (effectiveDebugDir) {
      args.push("--debug", "--debug-dir", effectiveDebugDir);
    }
    if (effectiveDryRun) {
      args.push("--dry-run");
    }

    let stdout: string;
    try {
      ({ stdout } = await runCli({
        command: "gti",
        args,
        timeoutMs,
      }));
    } catch (err) {
      // 401/Unauthorized = ChatGPT(Codex) 로그인 만료. gti는 토큰을 읽기만 하고 갱신하지
      // 않으므로 만료되면 전 호출이 죽는다. 일반 "non-zero" 대신 "auth"로 재분류해
      // UI가 "로그인 만료"를 명확히 안내하도록 한다(원인 모를 "실패" 방지).
      if (err instanceof CliError) {
        const haystack = `${err.message}\n${err.stderr ?? ""}`;
        if (/unauthorized|auth may be expired|\b401\b/i.test(haystack)) {
          throw new CliError(
            "ChatGPT(Codex) 로그인이 만료되어 이미지 생성이 차단되었습니다. 터미널에서 codex를 한 번 실행해 로그인을 갱신한 뒤 다시 시도하세요.",
            "auth",
            err.stderr
          );
        }
      }
      throw err;
    }

    // dry-run은 PNG를 만들지 않는다 → 요청 형태를 진단 에러로 노출(이미지 없음).
    if (effectiveDryRun) {
      throw new CliError(
        `gti --dry-run (no image generated). request shape:\n${stdout.slice(0, 2000)}`,
        "empty"
      );
    }

    const buffer = await fs.readFile(outputPath);
    if (buffer.length === 0) {
      throw new CliError("gti CLI produced an empty PNG file.", "empty");
    }
    // 백엔드(private-codex/gpt-image)가 --size 1024x1024 요청을 무시하고 ~4:3로 출력하므로
    // 1:1을 보장하기 위해 출력 PNG를 정사각(1024x1024)으로 센터-크롭한다(IMG-F).
    // 크롭 실패 시 원본을 반환해 생성 자체는 막지 않는다(폴백).
    let base64Data: string;
    try {
      const squared = await sharp(buffer)
        .resize(1024, 1024, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();
      base64Data = squared.toString("base64");
    } catch {
      base64Data = buffer.toString("base64");
    }
    return {
      base64Data,
      mimeType: "image/png",
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
