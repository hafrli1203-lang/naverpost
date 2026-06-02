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
