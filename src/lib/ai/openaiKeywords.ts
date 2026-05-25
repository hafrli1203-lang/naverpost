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
}): Promise<KeywordOption[] | null> {
  const fallbackLines = params.fallbackCandidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.title} / ${candidate.mainKeyword} / ${candidate.subKeyword1} / ${candidate.subKeyword2}`
    )
    .join("\n");

  const prompt = `네이버 블로그 키워드 후보를 빠르게 확장하세요.

[대상]
- 매장: ${params.shopName}
- 지역: ${params.region}
- 카테고리: ${params.categoryName}
- 희망 주제: ${params.topic?.trim() || "(없음)"}

[네이버 검색광고 조회]
${formatDemandSignals(params.demandSignals)}

${params.strategyGuide ?? ""}

[기본 후보]
${fallbackLines}

[역할]
- 최종 편집은 Claude가 하므로, 당신은 좋은 후보를 넓고 빠르게 제안합니다.
- 지역형, 증상형, 상황형, 선택기준형을 섞으세요.
- 키워드사운드 조합기처럼 핵심어 × 문제어 × 상황어를 넓게 조합하되, 실제 사람이 검색할 2단어만 남기세요.
- 기본 후보에 없는 키워드도 검색 의도가 자연스러우면 적극적으로 추가하세요.
- 지역형은 큰 도시명만 쓰지 말고 실제 생활권/구/동/역세권 단위가 있으면 그 표현을 우선하세요.
- 시즌형은 현재 월과 카테고리에 맞을 때만 넣고, 억지 계절어는 쓰지 마세요.
- 좋은 구조: 지역/생활권 + 핵심키워드 + 시즌·상황 + 확인 기준.
- 검색량 대비 블로그 발행수가 낮아 보이는 롱테일과 지역 키워드를 우선하세요.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 모든 키워드는 정확히 2단어 조합.
- title에는 main_keyword를 원형 그대로 포함.
- sub_keyword_1과 sub_keyword_2는 본문 확장 소재입니다. 제목에 억지로 모두 넣지 마세요.
- 제목은 main_keyword와 독자 상황이 자연스럽게 읽혀야 합니다.
- 좋은 예: title="누진렌즈 울렁임 원인과 적응 기준", main="누진렌즈 울렁임", sub1="누진렌즈 원인", sub2="누진렌즈 적응"
- 좋은 예: title="장림 안경점 안경렌즈와 안경테 고를 때", main="장림 안경점", sub1="장림 안경렌즈", sub2="장림 안경테"
- 좋은 예: title="안경수리 맡기기 전 확인할 부분", main="안경수리 기준", sub1="안경수리 나사", sub2="안경수리 테"
- 좋은 예: title="안경피팅 코패드가 눌릴 때", main="안경피팅 기준", sub1="안경피팅 코패드", sub2="안경피팅 착용감"
- 나쁜 예: "누진렌즈 울렁임 적응 시야 살펴보기", "심곡 안경수리 안경피팅과 코패드 달라지는 이유", "장림 안경점 소재와 선택 기준"
- 나쁜 예: "안경수리 기준 코패드가 불편할 때"처럼 행동과 증상이 논리적으로 맞지 않는 제목

JSON만 출력:
{
  "results": [
    {
      "title": "15~25자 제목",
      "main_keyword": "2단어",
      "sub_keyword_1": "2단어",
      "sub_keyword_2": "2단어"
    }
  ]
}`;

  const text = await runCodex({
    prompt,
    model: GPT_KEYWORD_MODEL,
    timeoutMs: 45_000,
  });

  return parseKeywordJson(text);
}
