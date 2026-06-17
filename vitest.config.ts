import { defineConfig } from "vitest/config";
import { resolve } from "path";

// 순수함수 단위 테스트용 최소 설정. "@/" 별칭만 해결하면 src 모듈이 그대로 import된다.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
