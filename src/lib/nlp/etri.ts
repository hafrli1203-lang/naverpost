export class EtriNlpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EtriNlpError";
  }
}

export interface EtriMorpheme {
  lemma: string;
  type: string;
}

interface EtriResponse {
  return_object?: {
    sentence?: Array<{
      morp?: Array<{ lemma?: string; type?: string }>;
    }>;
  };
  result?: number;
  reason?: string;
}

const ETRI_ENDPOINT = "http://aiopen.etri.re.kr:8000/WiseNLU";
const NOUN_TYPES = new Set(["NNG", "NNP"]);

function getApiKey(): string {
  const key = (process.env.ETRI_API_KEY ?? "").trim();
  if (!key || key === "your_etri_api_key") {
    throw new EtriNlpError("ETRI_API_KEY 환경변수가 설정되어 있지 않습니다.");
  }
  return key;
}

export function isEtriConfigured(): boolean {
  const key = (process.env.ETRI_API_KEY ?? "").trim();
  return key.length > 0 && key !== "your_etri_api_key";
}

export async function analyzeMorphemes(text: string): Promise<EtriMorpheme[]> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const response = await fetch(ETRI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_key: getApiKey(),
      argument: { analysis_code: "morp", text: trimmed.slice(0, 10000) },
    }),
  });

  if (!response.ok) {
    throw new EtriNlpError(`ETRI 형태소 분석 호출 실패 (${response.status})`);
  }

  const json = (await response.json()) as EtriResponse;
  if (json.result !== undefined && json.result !== 0) {
    throw new EtriNlpError(`ETRI 분석 오류: ${json.reason ?? "알 수 없음"}`);
  }

  const sentences = json.return_object?.sentence ?? [];
  const morphemes: EtriMorpheme[] = [];
  for (const sentence of sentences) {
    for (const morp of sentence.morp ?? []) {
      if (morp.lemma && morp.type) {
        morphemes.push({ lemma: morp.lemma, type: morp.type });
      }
    }
  }
  return morphemes;
}

export function extractNouns(morphemes: EtriMorpheme[]): string[] {
  return morphemes
    .filter((m) => NOUN_TYPES.has(m.type) && m.lemma.length >= 2)
    .map((m) => m.lemma);
}
