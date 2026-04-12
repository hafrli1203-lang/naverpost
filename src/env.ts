import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API key is required."),
  PERPLEXITY_API_KEY: z.string().min(1, "Perplexity API key is required."),
  GOOGLE_AI_API_KEY: z.string().min(1, "Google AI Studio API key is required."),
  NAVER_CLIENT_ID: z.string().min(1, "Naver client ID is required."),
  NAVER_CLIENT_SECRET: z.string().min(1, "Naver client secret is required."),
  GOOGLE_SHEETS_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Missing required environment variables:\n${missing}\n\nCheck your .env.local file.`
    );
  }

  cachedEnv = result.data;
  return cachedEnv;
}
