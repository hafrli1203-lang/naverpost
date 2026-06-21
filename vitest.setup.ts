// 컴포넌트 테스트용 setup — jest-dom matcher(toBeInTheDocument 등) 등록 +
// 각 테스트 후 DOM 정리. 전역 setupFile이라 node 환경 순수 테스트에도 로드되므로
// DOM이 있을 때만(=jsdom 환경) cleanup을 돌려 node 테스트에 영향이 없게 가드한다.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
