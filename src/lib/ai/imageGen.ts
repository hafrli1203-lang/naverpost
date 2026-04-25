import { runGti, type GtiResult } from "./cli/gtiCli";

export async function generateBlogImage(prompt: string): Promise<GtiResult> {
  return runGti({ prompt });
}
