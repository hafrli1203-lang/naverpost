import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API 키가 필요합니다"),
  PERPLEXITY_API_KEY: z.string().min(1, "Perplexity API 키가 필요합니다"),
  GOOGLE_AI_API_KEY: z.string().min(1, "Google AI Studio API 키가 필요합니다"),
  NAVER_CLIENT_ID: z.string().min(1, "네이버 Client ID가 필요합니다"),
  NAVER_CLIENT_SECRET: z.string().min(1, "네이버 Client Secret이 필요합니다"),
  NAVER_BLOG_TOKENS_JSON: z
    .string()
    .min(1, "네이버 블로그 토큰 JSON이 필요합니다"),
  GOOGLE_SHEETS_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `환경 변수 설정 오류:\n${missing}\n\n.env.local 파일을 확인하세요.`
    );
  }

  cachedEnv = result.data;
  return cachedEnv;
}
