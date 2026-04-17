export interface ReferenceDigest {
  text: string;
  rawText: string;
  sectionCount: number;
  tableCount: number;
  snippetCount: number;
}

type Section = {
  title: string;
  lines: string[];
};

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInline(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isHeading(line: string): boolean {
  const trimmed = cleanInline(line);
  if (!trimmed) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^\d+[\.\)]\s+/.test(trimmed) && trimmed.length <= 60) return true;
  if (/^[가-힣A-Za-z0-9][^.!?]{0,40}$/.test(trimmed) && trimmed.length <= 28) return true;
  if (trimmed.endsWith(":") || trimmed.endsWith("：")) return true;
  return false;
}

function isBullet(line: string): boolean {
  return /^[-*•·]\s+/.test(line.trim()) || /^\d+[\.\)]\s+/.test(line.trim());
}

function isTableLike(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.includes("|")) return true;
  if (trimmed.includes("\t")) return true;
  return / {2,}/.test(trimmed) && trimmed.split(/ {2,}/).length >= 3;
}

function splitSections(rawText: string): Section[] {
  const lines = rawText.split("\n").map((line) => line.trim());
  const sections: Section[] = [];
  let current: Section = { title: "문서 개요", lines: [] };

  for (const line of lines) {
    if (!line) continue;

    if (isHeading(line)) {
      if (current.lines.length > 0) {
        sections.push(current);
      }
      current = {
        title: cleanInline(line.replace(/^#{1,6}\s+/, "").replace(/[:：]$/, "")),
        lines: [],
      };
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length > 0) {
    sections.push(current);
  }

  return sections.slice(0, 8);
}

function pickKeyFacts(rawText: string): string[] {
  const lines = rawText
    .split("\n")
    .map((line) => cleanInline(line))
    .filter(Boolean);

  const facts = lines.filter((line) => {
    if (line.length < 12 || line.length > 120) return false;
    if (isBullet(line)) return true;
    if (/[0-9]+/.test(line) && /[:：]/.test(line)) return true;
    if (/기간|횟수|비용|용량|사이즈|대상|효과|주의|방법|구성|절차|순서/.test(line)) return true;
    return false;
  });

  return Array.from(new Set(facts)).slice(0, 8);
}

function pickTableBlocks(rawText: string): string[] {
  const lines = rawText.split("\n");
  const blocks: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (isTableLike(line)) {
      buffer.push(cleanInline(line));
      continue;
    }

    if (buffer.length >= 2) {
      blocks.push(buffer.join(" / "));
    }
    buffer = [];
  }

  if (buffer.length >= 2) {
    blocks.push(buffer.join(" / "));
  }

  return blocks.slice(0, 3);
}

function buildSnippets(rawText: string): string[] {
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((chunk) => cleanInline(chunk))
    .filter((chunk) => chunk.length >= 40);

  return paragraphs.slice(0, 4);
}

export function buildReferenceDigest(fileName: string, rawInput: string): ReferenceDigest {
  const rawText = normalizeText(rawInput);
  const sections = splitSections(rawText);
  const keyFacts = pickKeyFacts(rawText);
  const tableBlocks = pickTableBlocks(rawText);
  const snippets = buildSnippets(rawText);

  const summaryLines = sections.slice(0, 4).map((section) => {
    const preview = cleanInline(section.lines.join(" ")).slice(0, 110);
    return `- ${section.title}: ${preview}`;
  });

  const text = [
    `[참고 자료 구조화 요약: ${fileName}]`,
    "",
    "[문서 메타]",
    `- 파일명: ${fileName}`,
    `- 섹션 수: ${sections.length}`,
    `- 표 후보 수: ${tableBlocks.length}`,
    `- 핵심 스니펫 수: ${snippets.length}`,
    "",
    "[핵심 요약]",
    ...(summaryLines.length > 0 ? summaryLines : [`- ${rawText.slice(0, 220)}`]),
    "",
    "[키 팩트]",
    ...(keyFacts.length > 0 ? keyFacts.map((fact) => `- ${fact}`) : ["- 추출된 핵심 팩트 없음"]),
    "",
    "[표/비교 후보]",
    ...(tableBlocks.length > 0
      ? tableBlocks.map((block, index) => `- 표 후보 ${index + 1}: ${block}`)
      : ["- 표 형식 후보 없음"]),
    "",
    "[원문 스니펫]",
    ...(snippets.length > 0
      ? snippets.map((snippet, index) => `- 스니펫 ${index + 1}: ${snippet}`)
      : ["- 원문 스니펫 없음"]),
  ].join("\n");

  return {
    text,
    rawText,
    sectionCount: sections.length,
    tableCount: tableBlocks.length,
    snippetCount: snippets.length,
  };
}
