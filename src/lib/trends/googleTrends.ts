/**
 * 구글 트렌드 한국 일일 트렌딩 검색어(전 분야) 조회.
 *
 * 네이버는 전 분야 인기검색어 API를 제공하지 않으므로(2021 폐지), 키 불필요한
 * 구글 트렌드 RSS로 "지금 한국에서 뜨는 전 분야 키워드"를 가져온다.
 *
 * 한계(정직):
 *  - "지정한 월"이 아니라 **현재 일일** 트렌드다(구글은 과거 월별 트렌딩 RSS를 안 준다).
 *  - 인물·스포츠·뉴스가 대부분이라 안경 블로그 소재와 직접 관련은 적다(참고·시의성 발굴용).
 *  - 비공식 RSS라 차단/형식 변경 가능 → 실패는 빈 배열(graceful).
 */

const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=KR";
const FETCH_TIMEOUT_MS = 8_000;

export interface TrendingKeyword {
  keyword: string;
  /** 대략 검색 트래픽 라벨(예: "10000+"). 없으면 null. */
  trafficLabel: string | null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export async function fetchGoogleTrendsKR(limit = 20): Promise<TrendingKeyword[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(GOOGLE_TRENDS_RSS, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const result: TrendingKeyword[] = [];
    const seen = new Set<string>();
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1];
      const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? "";
      const keyword = decodeXmlEntities(rawTitle);
      if (!keyword) continue;
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const rawTraffic = (block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) ?? [])[1];
      result.push({
        keyword,
        trafficLabel: rawTraffic ? decodeXmlEntities(rawTraffic) : null,
      });
      if (result.length >= limit) break;
    }
    return result;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
