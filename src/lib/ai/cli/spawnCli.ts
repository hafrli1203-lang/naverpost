import spawn from "cross-spawn";
import fs from "node:fs/promises";
import path from "node:path";

async function appendCrashLog(entry: {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}): Promise<void> {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      command: entry.command,
      args: entry.args.slice(0, 6),
      exitCode: entry.exitCode,
      signal: entry.signal,
      stdoutTail: entry.stdout.slice(-400),
      stderrTail: entry.stderr.slice(-400),
    });
    await fs.appendFile(path.join(process.cwd(), "data", "cli-crash.log"), line + "\n", "utf8");
  } catch {
    // 진단 로그 실패는 본 흐름에 영향을 주지 않는다.
  }
}

export type CliErrorCode = "not-found" | "timeout" | "non-zero" | "empty";

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly stderr?: string;

  constructor(message: string, code: CliErrorCode, stderr?: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.stderr = stderr;
  }
}

export type CliRunOptions = {
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

export type CliRunResult = {
  stdout: string;
  stderr: string;
};

export function runCli({
  command,
  args,
  stdin,
  timeoutMs = 60_000,
  env,
  cwd,
}: CliRunOptions): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env,
      cwd,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new CliError(`${command} CLI timed out after ${timeoutMs}ms.`, "timeout", stderr));
    }, timeoutMs);

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(
          new CliError(
            `${command} CLI not found in PATH. Install it before retrying.`,
            "not-found"
          )
        );
        return;
      }
      reject(new CliError(`${command} CLI failed to start: ${e.message}`, "not-found"));
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        // 크래시 진단: 종료 코드·시그널·출력 꼬리를 파일로 남긴다.
        // (no stderr 크래시는 이 로그 없이는 원인 추적이 불가능하다.)
        void appendCrashLog({ command, args, exitCode, signal, stdout, stderr });
        reject(
          new CliError(
            `${command} CLI exited with code ${exitCode}: ${stderr.trim() || "no stderr"}`,
            "non-zero",
            stderr
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });

    if (stdin !== undefined) {
      child.stdin!.end(stdin, "utf8");
    } else {
      child.stdin!.end();
    }
  });
}
