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

[기본 후보]
${fallbackLines}

[역할]
- 최종 편집은 Claude가 하므로, 당신은 좋은 후보를 넓고 빠르게 제안합니다.
- 지역형, 증상형, 상황형, 선택기준형을 섞으세요.
- 월간 10~1,000 구간과 지역 키워드를 우선하세요.
- 금지어 사용 금지: 추천, 가격, 비용, 후기, 꼭, 필독, 후회, 상담, 문의, 예약, 할인, 무료, 최고, 완벽, 보장.
- 모든 키워드는 정확히 2단어 조합.
- title에는 main_keyword를 원형 그대로 포함.
- sub_keyword_1과 sub_keyword_2의 두 번째 단어가 title에 그대로 보여야 합니다.
- 좋은 예: title="누진렌즈 울렁임 원인과 적응 기준", main="누진렌즈 울렁임", sub1="누진렌즈 원인", sub2="누진렌즈 적응"
- 좋은 예: title="장림 안경점 안경렌즈와 안경테 고를 때", main="장림 안경점", sub1="장림 안경렌즈", sub2="장림 안경테"
- 나쁜 예: "누진렌즈 울렁임 적응 시야 살펴보기", "장림 안경점 소재와 선택 기준"

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
    timeoutMs: 90_000,
  });

  return parseKeywordJson(text);
}
