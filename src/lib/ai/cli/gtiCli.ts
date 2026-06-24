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

/**
 * Windows에서 병렬로 갓 생성된 PNG는 실시간 백신(Defender)이 잠깐 잠그거나 디렉터리
 * 엔트리 가시화가 지연돼 직후 readFile이 일시적으로 ENOENT/EBUSY/EPERM을 낼 수 있다.
 * gti가 exit 0(=파일 기록 완료)으로 끝난 직후이므로, 짧게 backoff 재시도하면 흡수된다.
 */
async function readFileWithRetry(
  filePath: string,
  attempts = 5,
  delayMs = 150
): Promise<Buffer> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fs.readFile(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const transient = code === "ENOENT" || code === "EBUSY" || code === "EPERM";
      if (i === attempts - 1 || !transient) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  // 위 루프가 항상 return 또는 throw 하므로 도달하지 않는다.
  throw new Error("readFileWithRetry: unreachable");
}

/**
 * 단발성으로 보이는 실패만 재시도 대상으로 본다.
 * - "auth": private-codex 백엔드가 동시/연속 요청 일부를 401로 거부(혼잡성 throttle).
 *   토큰이 유효해도 발생하며 재시도하면 대개 통과한다. 진짜 만료여도 빠르게(수초) 소진.
 * - "empty": 빈 PNG 응답(드문 백엔드 흔들림).
 * - ENOENT/EBUSY/EPERM: 갓 생성된 파일을 백신/FS가 순간 잠금(레이스).
 * 미설치(not-found)·일반 비정상종료(non-zero)·타임아웃(timeout)은 재시도해도 같은 결과거나
 * 비용이 과해 즉시 표면화한다.
 */
function isRetryableGtiError(err: unknown): boolean {
  if (err instanceof CliError) {
    return err.code === "auth" || err.code === "empty";
  }
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "EBUSY" || code === "EPERM";
}

export async function runGti({
  prompt,
  // gti 내부 fetch 타임아웃(300s)보다 약간 길게 잡아, 백엔드 지연 시 우리 쪽 강제 종료보다
  // gti 자신의 정확한 오류(타임아웃/거부)가 먼저 표면화되도록 한다.
  timeoutMs = 320_000,
  provider = "private-codex",
  model,
  images = [],
  size = "1024x1024",
  dryRun,
  debugDir,
}: GtiRunOptions): Promise<GtiResult> {
  const effectiveDryRun = dryRun ?? process.env.GTI_DRY_RUN === "1";
  const effectiveDebugDir = debugDir ?? (process.env.GTI_DEBUG_DIR || undefined);

  // 간헐 실패(혼잡성 401·빈응답·갓생성 파일 레이스)는 단발성이 많아, 매 시도마다 새 tmp로
  // 최대 maxAttempts회 재시도하면 대부분 자가복구된다. dry-run은 의도적으로 "empty"를
  // 던지므로 재시도 대상에서 제외한다.
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
        // 백엔드 401은 두 가지다: (1) 진짜 ChatGPT(Codex) 로그인 만료, (2) 토큰이 유효해도
        // 동시/연속 요청 일부를 거부하는 혼잡성 throttle. 구분이 불가능하므로 "auth"로 묶어
        // 재시도 대상에 넣고(대개 (2)는 재시도로 통과), 소진 시 양쪽을 모두 안내한다.
        if (err instanceof CliError) {
          const haystack = `${err.message}\n${err.stderr ?? ""}`;
          if (/unauthorized|auth may be expired|\b401\b/i.test(haystack)) {
            throw new CliError(
              "이미지 생성이 일시적으로 차단되었습니다(서버 혼잡 또는 로그인 만료). 잠시 후 재생성하세요. 계속되면 터미널에서 codex를 실행해 로그인을 갱신하세요.",
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

      const buffer = await readFileWithRetry(outputPath);
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
    } catch (err) {
      lastError = err;
      // dry-run의 의도적 "empty" 또는 비재시도성 실패는 즉시 표면화. 마지막 시도면 그대로 throw.
      const canRetry =
        !effectiveDryRun && attempt < maxAttempts && isRetryableGtiError(err);
      if (!canRetry) {
        throw err;
      }
      // backoff: 1.5s, 3.0s (혼잡 해소·파일 레이스 안정화 대기)
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // 루프는 성공 시 return, 비재시도/소진 시 throw 한다. 방어적으로 마지막 오류를 던진다.
  throw lastError instanceof Error
    ? lastError
    : new Error("gti 이미지 생성 실패");
}
