import type { KeywordOption, SearchVolumeSignal } from "@/types";
import { OPTICAL_ACCURACY_GUIDE } from "@/lib/domain/opticalDomainRules";
import { TITLE_PATTERN_GUIDE } from "@/lib/prompts/titlePrompt";
import { runCodex } from "./cli/codexCli";

const GPT_KEYWORD_MODEL = "gpt-5.5";

function parseKeywordJson(text: string): KeywordOption[] {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = (jsonMatch ? jsonMatch[1] : text).trim();
  // LLM이 JSON 앞뒤에 설명문을 붙여도 죽지 않게 중괄호 범위로 한 번 더 시도한다.
  let parsed: { results?: Array<Record<string, string>> };
  try {
    parsed = JSON.parse(jsonText) as { results?: Array<Record<string, string>> };
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("GPT keyword generation returned non-JSON output.");
    }
    parsed = JSON.parse(jsonText.slice(start, end + 1)) as {
      results?: Array<Record<string, string>>;
    };
  }
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
  competitorTitles?: string[];
  topPostContent?: {
    bodyHighlights: string[];
    contentBlocks: string[];
    titleAngles: string[];
  } | null;
  avoidKeywords?: string[];
  corpusTitles?: string[];
}): Promise<KeywordOption[] | null> {
  const targetCount = params.targetCount ?? 10;
  // 이미 생성된 후보를 알려주고 "겹치지 말고 새 소재로" 유도한다. GPT가 매 라운드 같은 후보를
  // 반복해 dedup에 전멸하던 수렴 문제(좁은 카테고리)를 깨, 하드코딩·중복 없이 다양성을 끌어올린다.
  const avoidSection = (() => {
    const list = Array.from(new Set((params.avoidKeywords ?? []).map((k) => k.trim()).filter(Boolean))).slice(0, 30);
    if (list.length === 0) return "";
    return `\n[이미 만든 키워드 — 절대 겹치지 말 것]\n${list.join(" / ")}\n※ 위 키워드와 같은 소재·같은 메인 핵심어는 만들지 마세요. 아직 안 다룬 새로운 소재·각도로만 생성하세요.\n`;
  })();
  // 실제 상위 노출 정보성 글의 본문에서 추출한 구조화 신호(소재·구조·각도). 독자가 실제로 읽는
  // 내용 영역을 보여줘 키워드/제목이 현실에 붙게 한다. 원문이 아니라 요약 신호만 주입해 광고·지역명
  // 노이즈와 베끼기를 피한다. 분석 실패(unavailable) 시 빈 섹션으로 떨어져 제목 방향참고만 남는다.
  const topPostSection = (() => {
    const content = params.topPostContent;
    if (!content) return "";
    const highlights = content.bodyHighlights.filter(Boolean).slice(0, 6);
    const blocks = content.contentBlocks.filter(Boolean).slice(0, 6);
    const angles = content.titleAngles.filter(Boolean).slice(0, 6);
    if (highlights.length === 0 && blocks.length === 0 && angles.length === 0) {
      return "";
    }
    const lines = [
      highlights.length > 0 ? `핵심 각도: ${highlights.join(" / ")}` : "",
      blocks.length > 0 ? `본문 구조: ${blocks.join(" / ")}` : "",
      angles.length > 0 ? `제목 각도: ${angles.join(" / ")}` : "",
    ].filter(Boolean);
    return `\n[실제 상위 정보성 글이 다루는 소재·구조 — 독자가 실제로 읽는 내용]\n${lines.join("\n")}\n※ 실제 네이버 상위 노출 정보성 글 본문에서 추출한 신호입니다. 독자가 실제로 찾는 소재 영역을 보여줍니다.\n※ 이 소재·구조 영역을 겨냥해 검색 의도가 선명한 키워드/제목을 만드세요. 단, 같은 표현·각도·조합은 베끼지 말고 차별화하세요.\n`;
  })();
  // 실제 네이버 상위 노출 제목은 "피하라"가 아니라 "독자가 실제로 찾는 소재·의도의 지도"로
  // 제공한다. 같은 소재·의도는 겨냥하되 표현·각도·조합은 차별화하도록 유도해, 추상 규칙만으로
  // 지어내 현실과 동떨어지던 제목 문제를 줄인다.
  const competitorSection = (() => {
    const titles = (params.competitorTitles ?? [])
      .map((title) => title.trim())
      .filter((title) => title.length > 0)
      .slice(0, 12);
    if (titles.length === 0) return "";
    return `\n[실제 상위 노출 제목 — 독자가 이 카테고리에서 찾는 소재·의도의 지도]\n${titles
      .map((title) => `- ${title}`)
      .join("\n")}\n※ 실제 네이버 상위 노출 샘플입니다. 독자가 실제로 검색·클릭하는 소재와 의도를 보여줍니다.\n※ 이 소재·독자 의도는 적극 겨냥하되, 같은 표현·각도·어미·키워드 조합을 그대로 베끼지 말고 새 관점으로 차별화하세요.\n※ 위 제목과 무관한 일반론으로 빠지지 말고, 실제 검색 수요가 보이는 소재를 우선하세요.\n`;
  })();
  // 실제 업종 상위 제목 말뭉치 — 용어·분류·표현 수준의 기준. 손수 만든 규칙 대신
  // 실데이터가 "사람들이 실제로 쓰는 말"의 경계를 정한다.
  const corpusSection = (() => {
    const titles = (params.corpusTitles ?? []).filter(Boolean).slice(0, 40);
    if (titles.length === 0) return "";
    return `\n[실제 업종 상위 제목 말뭉치 — 용어·표현·분류 수준의 기준]\n${titles
      .map((title) => `- ${title}`)
      .join(
        "\n"
      )}\n※ 실제 네이버 블로그 상위 노출 제목입니다. 용어 선택과 분류 명칭, 표현 수준은 이 말뭉치를 기준으로 삼으세요.\n※ 문장을 그대로 베끼지는 말되, 말뭉치에서 쓰이지 않는 생소한 조어·분류·명사 조합을 만들지 마세요.\n`;
  })();
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
${competitorSection}${topPostSection}${corpusSection}
${params.strategyGuide ?? ""}

[기본 후보]
${fallbackLines}
${avoidSection}
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
- 브랜드명·상품명은 [기본 후보]에 이미 들어 있는 것만 사용하세요. 검색광고 조회에 보이더라도 기본 후보에 없는 브랜드는 매장이 취급하지 않는 상품이므로 절대 만들지 마세요.
- 지역명(시/도/구/동/생활권/역세권/지하철역)을 키워드와 제목에 절대 넣지 마세요. 지역은 사용자가 최종 단계에서 직접 붙입니다.
- 시즌형은 현재 월과 카테고리에 맞을 때만 넣고, 억지 계절어는 쓰지 마세요.
- 좋은 구조: 핵심키워드 + 실제 검색 상황/불편/선택 맥락.
- 검색량 대비 블로그 발행수가 낮아 보이는 롱테일 키워드를 우선하세요.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 모든 키워드는 실제 검색 가능한 2~3단어 조합.
- main_keyword, sub_keyword_1, sub_keyword_2에는 "새로", "맞춘", "보일", "한다면" 같은 문장 조각이나 서술어를 넣지 마세요.
- 키워드는 검색창에 그대로 입력할 수 있는 명사형 검색어여야 합니다.
- 메인 키워드의 첫 단어(헤드)는 사람들이 실제로 검색하는 단어여야 합니다. 위 검색광고 조회나 기본 후보에 등장하는 헤드를 우선 쓰고, 거기 없는 전문용어(예: 명시야, 안장형브릿지, 누진대)를 헤드로 만들지 마세요.
- 헤드는 그 자체로 검색창에 칠 수 있는 단일 명사여야 합니다. 두 개념을 억지로 붙인 합성어(예: "안경착용감" "안경관리방법" "안경보관")를 헤드로 만들지 마세요. "안경 코 눌림"은 "코받침"이나 "안경테"처럼 실제 검색 헤드로 잡으세요.
- 헤드 뒤에 어색한 수식어(고온·환경·차량 같은)를 붙여 아무도 검색하지 않는 조합을 만들지 마세요. 실제 관측된 나쁜 예: "안경보관 고온" "안경착용감 코" "안경관리 방법" — 이런 비검색 조합은 절대 만들지 마세요. 각 키워드는 "이 두 단어를 그대로 붙여 검색하는 사람이 있는가"를 자문해 아니면 버리세요.
- 제목에 원인-결과 주장을 쓰지 마세요("~하면 ~됩니다", "~수록 ~해지는", "~따라 갈리는"). 인과는 본문에서 검증해 다룰 내용입니다. 제목은 검색자가 실제 겪는 상황이나 궁금증까지만 담으세요(예: "뿔테안경 다리가 자꾸 벌어질 때 확인할 부분").
- 사실이 아니거나 검증할 수 없는 전제를 제목에 만들지 마세요. 헤드 키워드와 전문 개념을 한 문장에 욱여넣은 명사구("벌어지는 얼굴형에서 확인할 힌지 구조")는 비문입니다.
${TITLE_PATTERN_GUIDE}
${OPTICAL_ACCURACY_GUIDE}
- title에는 main_keyword 두 단어가 순서대로 이어져야 합니다. 두 단어 사이에는 조사(이/가/을/를/에/의 등)만 허용됩니다. 예: main="안경렌즈 얼룩" → "안경렌즈에 얼룩이 남는 이유" 가능.
- 키워드 덩어리를 문두에 그대로 박고 뒤에 절을 이어붙이지 마세요(예: "안경보관 고온환경 코받침이 달라지는 과정" 같은 비문 금지). 키워드가 문장의 주어나 목적어로 자연스럽게 녹아야 합니다.
- sub_keyword_1과 sub_keyword_2는 본문 확장 소재입니다. 제목에 억지로 모두 넣지 마세요.
- 제목은 main_keyword와 독자 상황이 자연스럽게 읽혀야 합니다.
- 특정 어미를 금지하거나 강제로 쓰지 말고, 후보 전체에서 같은 구조가 반복되지 않게 하세요.
- 제목에 쉼표(,)를 쓰지 마세요. 접속 어미로 자연스럽게 이으세요.
- 같은 끝맺음("확인할 점/부분", "기준", "차이", "이유", "~때")이 여러 후보에서 반복되지 않게 하세요. 한 끝맺음은 최대 2개까지만 쓰세요.
- 상황형 제목도 끝맺음을 섞으세요: "~할 때" 외에 "~다면", "~읽는 법", "~보는 순서", 질문형("~일까") 등을 고르게 사용하세요.
- 제목은 키워드 나열이 아니라 독자가 겪는 불편, 사용 장면, 선택 맥락, 확인 행동 중 하나가 읽혀야 합니다.
${countRule}

JSON만 출력하세요. 최상위 객체는 results 배열만 가지며, 각 항목 키는 title, main_keyword, sub_keyword_1, sub_keyword_2 입니다.`;

  const text = await runCodex({
    prompt,
    model: GPT_KEYWORD_MODEL,
    timeoutMs: 120_000,
  });

  return parseKeywordJson(text);
}
