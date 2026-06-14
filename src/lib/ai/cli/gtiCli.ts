import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
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
};

export async function runGti({
  prompt,
  timeoutMs = 300_000,
  provider = "private-codex",
  model,
  images = [],
}: GtiRunOptions): Promise<GtiResult> {
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

    await runCli({
      command: "gti",
      args,
      timeoutMs,
    });

    const buffer = await fs.readFile(outputPath);
    if (buffer.length === 0) {
      throw new CliError("gti CLI produced an empty PNG file.", "empty");
    }
    return {
      base64Data: buffer.toString("base64"),
      mimeType: "image/png",
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
