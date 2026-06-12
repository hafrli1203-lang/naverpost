import { CliError, runCli } from "./spawnCli";
import fs from "fs/promises";
import os from "os";
import path from "path";

type CodexRunOptions = {
  prompt: string;
  model?: string;
  timeoutMs?: number;
};

export async function runCodex({
  prompt,
  model,
  timeoutMs = 120_000,
}: CodexRunOptions): Promise<string> {
  const outputFile = path.join(
    os.tmpdir(),
    `naverpost-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--color",
    "never",
    // codex의 멀티에이전트 기능이 spawn_agent 도구를 등록하는데 exec 모델과 호환되지 않아
    // 모든 호출이 400으로 죽는다(2026-06 실측). 텍스트 생성에는 도구가 필요 없으므로
    // 이 프로젝트의 headless 호출에서만 비활성화한다(대화형 codex 사용에는 영향 없음).
    "--disable",
    "multi_agent",
    "-c",
    "features.multi_agent_v2.enabled=false",
    "-c",
    'model_reasoning_effort="low"',
    "-o",
    outputFile,
  ];
  if (model) {
    args.push("-m", model);
  }
  args.push("-");

  try {
    const { stdout } = await runCli({
      command: "codex",
      args,
      stdin: prompt,
      timeoutMs,
    });

    const lastMessage = await fs.readFile(outputFile, "utf-8").catch(() => "");
    const text = (lastMessage || stdout).trim();
    if (!text) {
      throw new CliError("codex CLI returned empty output.", "empty");
    }
    return text;
  } finally {
    await fs.unlink(outputFile).catch(() => {});
  }
}
