/**
 * Finds Korean words that are overused (>= 20 occurrences) in the given text.
 * Uses regex /[가-힣]{2,}/g to extract all Korean words of 2+ characters.
 */
export function findOverusedWords(
  text: string
): { word: string; count: number }[] {
  if (!text || typeof text !== "string") return [];

  const words = text.match(/[가-힣]{2,}/g) ?? [];
  const wordCount: Record<string, number> = {};

  for (const word of words) {
    wordCount[word] = (wordCount[word] ?? 0) + 1;
  }

  return Object.entries(wordCount)
    .filter(([, count]) => count >= 20)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}
