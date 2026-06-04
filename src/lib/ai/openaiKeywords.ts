import type { KeywordOption, SearchVolumeSignal } from "@/types";
import { runCodex } from "./cli/codexCli";

const GPT_KEYWORD_MODEL = "gpt-5.5";

function parseKeywordJson(text: string): KeywordOption[] {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
  const parsed = JSON.parse(jsonText) as { results?: Array<Record<string, string>> };
  const rawResults = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(rawResults)) {
    throw new Error("GPT keyword generation returned an unexpected response shape.");
  }

  return rawResults.map((result) => ({
    title: result.title ?? "",
    mainKeyword: result.mainKeyword || result.main_keyword || "",
    subKeyword1: result.subKeyword1 || result.sub_keyword_1 || "",
    subKeyword2: result.subKeyword2 || result.sub_keyword_2 || "",
  }));
}

function formatDemandSignals(signals: SearchVolumeSignal[]): string {
  if (signals.length === 0) return "(검색광고 조회 결과 없음)";
  return signals
    .slice(0, 20)
    .map((signal) => {
      const total =
        typeof signal.monthlyTotalSearches === "number"
          ? signal.monthlyTotalSearches.toLocaleString("ko-KR")
          : "-";
      const competition = signal.competitionLabel ?? "-";
      return `- ${signal.keyword}: 월간 ${total}, 경쟁 ${competition}`;
    })
    .join("\n");
}

export async function generateKeywordCandidatesWithGpt(params: {
  shopName: string;
  region: string;
  categoryName: string;
  topic?: string;
  demandSignals: SearchVolumeSignal[];
  strategyGuide?: string;
  fallbackCandidates: KeywordOption[];
  targetCount?: number;
  batchFocus?: string;
  depthDimensions?: string[];
}): Promise<KeywordOption[] | null> {
  const targetCount = params.targetCount ?? 10;
  const depthSection =
    params.depthDimensions && params.depthDimensions.length > 0
      ? `\n[이 카테고리의 전문 깊이 차원 — 서로 다른 차원으로 퍼뜨릴 것]\n${params.depthDimensions
          .map((dimension) => `- ${dimension}`)
          .join("\n")}\n`
      : "";
  const countRule =
    targetCount === 1
      ? `- results 배열은 정확히 1개입니다. 기본 후보 중 가장 자연스럽고 검색 의도가 선명한 1개만 작성하세요.
- 여러 개를 만들지 마세요. If the results array has more or fewer than 1 object, the response is invalid.`
      : `- results 배열은 정확히 ${targetCount}개입니다. 가장 좋은 후보 1~3개만 고르지 말고 서로 다른 ${targetCount}개를 모두 생성하세요.
- If the results array has fewer than ${targetCount} objects, the response is invalid.`;
  const fallbackLines = params.fallbackCandidates
    .map(
      (candidate, index) =>
        `${index + 1}. main=${candidate.mainKeyword} / sub1=${candidate.subKeyword1} / sub2=${candidate.subKeyword2}`
    )
    .join("\n");

  const prompt = `네이버 블로그 키워드 후보를 빠르게 확장하세요.

[대상]
- 매장: ${params.shopName}
- 카테고리: ${params.categoryName}
- 희망 주제: ${params.topic?.trim() || "(없음)"}
- 이번 배치 관점: ${params.batchFocus?.trim() || "검색량, 독자 상황, 방문 전환 가능성을 균형 있게 확장"}

[네이버 검색광고 조회]
${formatDemandSignals(params.demandSignals)}

${params.strategyGuide ?? ""}

[기본 후보]
${fallbackLines}

[역할]
- 당신의 결과가 화면에 표시될 최종 제목 후보가 될 수 있습니다.
- 기본 후보는 키워드 축일 뿐입니다. 제목 문장은 직접 새로 작성하세요.
- 증상형, 상황형, 선택 맥락형을 섞으세요.
- 키워드사운드 조합기처럼 핵심어 × 문제어 × 상황어를 넓게 조합하되, 실제 사람이 검색할 2단어만 남기세요.
- 기본 후보에 없는 키워드도 검색 의도가 자연스러우면 적극적으로 추가하세요.
- 단, 추가하는 키워드도 반드시 이 카테고리(${params.categoryName}) 제품·주제 범위 안이어야 합니다. 다른 카테고리 제품(안경테↔콘택트렌즈↔안경렌즈↔누진다초점↔선글라스 등)을 섞지 마세요.
- 카테고리 안에서 세부 주제를 고르게 분산하세요. 같은 소재·같은 축(예: 안경테의 "얼굴형")에 후보를 3개 이상 몰지 말고 최대 2개까지만. 소재·무게·피팅·코받침·착용감·관리·브랜드·얼굴형처럼 서로 다른 각도로 골고루 만드세요.
- 전문성 깊이: 아래 "전문 깊이 차원"에서 서로 다른 차원을 골라 다루세요. 한 차원에 2개를 넘기지 마세요.
- 표면 반복 금지: "관리/세척/위생/생활 습관/사용감" 같은 범용 표면어만 반복하지 마세요. 각 키워드는 구체적 전문 포인트(스펙·기준 수치·메커니즘)가 드러나야 합니다.
- 근접 중복 금지: 같은 메인 핵심어를 미세하게 바꿔 반복하지 마세요(예: "건조"와 "건조감"을 따로 만들지 말 것).
${depthSection}
- 브랜드명과 상품명은 기본 후보나 검색광고 조회에 근거가 있을 때만 사용하고, 모르는 브랜드를 지어내지 마세요.
- 지역명(시/도/구/동/생활권/역세권/지하철역)을 키워드와 제목에 절대 넣지 마세요. 지역은 사용자가 최종 단계에서 직접 붙입니다.
- 시즌형은 현재 월과 카테고리에 맞을 때만 넣고, 억지 계절어는 쓰지 마세요.
- 좋은 구조: 핵심키워드 + 실제 검색 상황/불편/선택 맥락.
- 검색량 대비 블로그 발행수가 낮아 보이는 롱테일 키워드를 우선하세요.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 모든 키워드는 실제 검색 가능한 2~3단어 조합.
- main_keyword, sub_keyword_1, sub_keyword_2에는 "새로", "맞춘", "보일", "한다면" 같은 문장 조각이나 서술어를 넣지 마세요.
- 키워드는 검색창에 그대로 입력할 수 있는 명사형 검색어여야 합니다.
- title에는 main_keyword를 원형 그대로 포함.
- sub_keyword_1과 sub_keyword_2는 본문 확장 소재입니다. 제목에 억지로 모두 넣지 마세요.
- 제목은 main_keyword와 독자 상황이 자연스럽게 읽혀야 합니다.
- 특정 어미를 금지하거나 강제로 쓰지 말고, 후보 전체에서 같은 구조가 반복되지 않게 하세요.
- 제목에 쉼표(,)를 쓰지 마세요. 접속 어미로 자연스럽게 이으세요.
- 같은 끝맺음("확인할 점/부분", "기준", "차이", "이유")이 여러 후보에서 반복되지 않게 하세요. 한 끝맺음은 최대 2개까지만 쓰세요.
- 제목은 키워드 나열이 아니라 독자가 겪는 불편, 사용 장면, 선택 맥락, 확인 행동 중 하나가 읽혀야 합니다.
${countRule}

JSON만 출력하세요. 최상위 객체는 results 배열만 가지며, 각 항목 키는 title, main_keyword, sub_keyword_1, sub_keyword_2 입니다.`;

  const text = await runCodex({
    prompt,
    model: GPT_KEYWORD_MODEL,
    timeoutMs: 90_000,
  });

  return parseKeywordJson(text);
}
