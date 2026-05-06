const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ENDPOINT = "https://codex-deploy-skills.vercel.sh/api/deploy";

async function waitForReady(url) {
  for (let i = 0; i < 60; i += 1) {
    let status = 0;
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "manual" });
      status = res.status;
    } catch {
      status = 0;
    }

    if (status === 200 || (status >= 400 && status < 500)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function main() {
  const repoRoot = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-fallback-"));
  const tarball = path.join(tempDir, "project.tgz");

  try {
    execFileSync("git", ["archive", "--format=tar.gz", "-o", tarball, "HEAD"], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    const bytes = fs.readFileSync(tarball);
    const form = new FormData();
    form.append("framework", "nextjs");
    form.append("file", new Blob([bytes], { type: "application/gzip" }), "project.tgz");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Deploy request failed: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }
    if (!data.previewUrl) {
      throw new Error("Missing previewUrl in deploy response");
    }

    await waitForReady(data.previewUrl);

    process.stdout.write(
      JSON.stringify(
        {
          previewUrl: data.previewUrl,
          claimUrl: data.claimUrl || "",
          deploymentId: data.deploymentId || "",
          projectId: data.projectId || "",
        },
        null,
        2
      )
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
