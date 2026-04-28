import spawn from "cross-spawn";

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

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
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
