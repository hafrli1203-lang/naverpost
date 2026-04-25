import { CliError, runCli } from "./spawnCli";

type CodexRunOptions = {
  prompt: string;
  model?: string;
  timeoutMs?: number;
};

export async function runCodex({
  prompt,
  model,
  timeoutMs = 60_000,
}: CodexRunOptions): Promise<string> {
  const args = ["exec", "--skip-git-repo-check"];
  if (model) {
    args.push("-m", model);
  }
  args.push("-");

  const { stdout } = await runCli({
    command: "codex",
    args,
    stdin: prompt,
    timeoutMs,
  });

  const text = stdout.trim();
  if (!text) {
    throw new CliError("codex CLI returned empty output.", "empty");
  }
  return text;
}
