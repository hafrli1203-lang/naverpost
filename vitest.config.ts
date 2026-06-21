import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/..." path alias (mirrors tsconfig.json paths) so vitest can
// load source modules that import via "@/lib/...". Test infra only — no source
// logic, package, or runtime behavior change.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 전역은 node(순수 테스트 빠르게 유지). 컴포넌트 테스트 파일은 상단
    // `// @vitest-environment jsdom` 도크블록으로 개별 전환한다.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
