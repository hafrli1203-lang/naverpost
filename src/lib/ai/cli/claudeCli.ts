import { CliError, runCli } from "./spawnCli";

const DEFAULT_SYSTEM_PROMPT =
  "You are a content writing assistant. Reply only with the requested output. Do not call any tools or ask follow-up questions.";

type ClaudeRunOptions = {
  prompt: string;
  model: string;
  timeoutMs?: number;
  systemPrompt?: string;
};

type ClaudeJsonOutput = {
  result?: string;
  type?: string;
  is_error?: boolean;
  error?: { message?: string };
};

export async function runClaude({
  prompt,
  model,
  timeoutMs = 60_000,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
}: ClaudeRunOptions): Promise<string> {
  const args = [
    "-p",
    "--model",
    model,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--system-prompt",
    systemPrompt,
    "--tools",
    "",
  ];

  const { stdout } = await runCli({
    command: "claude",
    args,
    stdin: prompt,
    timeoutMs,
  });

  let parsed: ClaudeJsonOutput;
  try {
    parsed = JSON.parse(stdout) as ClaudeJsonOutput;
  } catch {
    throw new CliError(
      `claude CLI returned non-JSON output (first 200 chars): ${stdout.slice(0, 200)}`,
      "non-zero"
    );
  }

  if (parsed.is_error) {
    throw new CliError(
      parsed.error?.message ?? "claude CLI returned an error response.",
      "non-zero"
    );
  }

  const text = parsed.result?.trim();
  if (!text) {
    throw new CliError("claude CLI returned empty output.", "empty");
  }
  return text;
}
