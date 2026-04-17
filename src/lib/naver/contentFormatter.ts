export function formatForNaver(params: {
  title: string;
  content: string;
  imageUrls?: string[];
}): string {
  const { title, content, imageUrls = [] } = params;

  let html = convertMarkdownToHtml(content);

  if (imageUrls.length > 0) {
    html = insertImages(html, imageUrls);
  }

  return [
    `<div style="max-width:860px;margin:0 auto;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f2937;line-height:1.9;">`,
    `<h1 style="margin:0 0 28px;font-size:30px;line-height:1.4;font-weight:800;color:#111827;letter-spacing:-0.02em;">${escapeHtml(
      title
    )}</h1>`,
    html,
    `</div>`,
  ].join("\n");
}

type Block =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "table"; lines: string[] }
  | { type: "paragraph"; text: string }
  | { type: "blank" };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style=\"padding:2px 6px;border-radius:6px;background:#f3f4f6;font-size:0.95em;\">$1</code>");
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      blocks.push({ type: "table", lines: tableBuffer });
      tableBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith("|")) {
      tableBuffer.push(line);
      continue;
    }

    flushTable();

    if (line.trim() === "") {
      blocks.push({ type: "blank" });
      continue;
    }

    if (/^### /.test(line)) {
      blocks.push({ type: "heading", level: 3, text: line.replace(/^### /, "").trim() });
      continue;
    }

    if (/^## /.test(line)) {
      blocks.push({ type: "heading", level: 2, text: line.replace(/^## /, "").trim() });
      continue;
    }

    if (/^# /.test(line)) {
      blocks.push({ type: "heading", level: 2, text: line.replace(/^# /, "").trim() });
      continue;
    }

    blocks.push({ type: "paragraph", text: line.trim() });
  }

  flushTable();
  return blocks;
}

function convertMarkdownToHtml(markdown: string): string {
  const blocks = parseBlocks(markdown);
  const output: string[] = [];
  let paragraphBuffer: string[] = [];
  let inFaq = false;

  const flushParagraphBuffer = () => {
    if (paragraphBuffer.length === 0) return;
    output.push(renderParagraphGroup(paragraphBuffer));
    paragraphBuffer = [];
  };

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];

    if (block.type === "blank") {
      flushParagraphBuffer();
      continue;
    }

    if (block.type === "table") {
      flushParagraphBuffer();
      output.push(renderTable(block.lines));
      continue;
    }

    if (block.type === "heading") {
      flushParagraphBuffer();
      const isFaqTitle = /^faq$/i.test(block.text) || block.text === "자주 묻는 질문";
      inFaq = isFaqTitle;
      output.push(renderHeading(block.text, block.level, isFaqTitle));
      continue;
    }

    if (block.type === "paragraph") {
      if (inFaq && /^###?\s*/.test(block.text)) {
        flushParagraphBuffer();
      }

      if (/^핵심 답변[:：]/.test(block.text)) {
        flushParagraphBuffer();
        output.push(renderAnswerLead(block.text));
        continue;
      }

      if (looksLikeMetaLine(block.text)) {
        flushParagraphBuffer();
        output.push(renderMetaLine(block.text));
        continue;
      }

      if (inFaq && /^Q[.:]/i.test(block.text)) {
        flushParagraphBuffer();
        output.push(renderFaqQuestion(block.text));
        continue;
      }

      paragraphBuffer.push(block.text);
    }
  }

  flushParagraphBuffer();
  return output.join("\n");
}

function looksLikeMetaLine(text: string): boolean {
  return /작성 주체|분류|업데이트 일자|작성 기준|출처|참고/.test(text);
}

function renderHeading(text: string, level: 2 | 3, isFaqTitle = false): string {
  if (isFaqTitle) {
    return `<div style="margin:40px 0 18px;padding:18px 20px;border-radius:18px;background:linear-gradient(180deg,#ecfeff 0%,#f8fafc 100%);border:1px solid #bae6fd;"><h2 style="margin:0;font-size:24px;line-height:1.45;font-weight:800;color:#0f172a;">${inlineMarkdown(
      text
    )}</h2></div>`;
  }

  if (level === 3) {
    return `<h3 style="margin:28px 0 12px;font-size:19px;line-height:1.55;font-weight:700;color:#0f172a;">${inlineMarkdown(
      text
    )}</h3>`;
  }

  return `<div style="margin:38px 0 14px;"><h2 style="margin:0;font-size:24px;line-height:1.5;font-weight:800;color:#111827;letter-spacing:-0.01em;">${inlineMarkdown(
    text
  )}</h2><div style="margin-top:10px;width:56px;height:3px;border-radius:999px;background:#14b8a6;"></div></div>`;
}

function renderParagraphGroup(lines: string[]): string {
  if (lines.length === 0) return "";

  const rendered = lines
    .map((line) => {
      if (/^- /.test(line)) {
        return `<p style="margin:0 0 10px;padding-left:16px;text-indent:-16px;font-size:16px;line-height:1.95;color:#374151;">• ${inlineMarkdown(
          line.replace(/^- /, "")
        )}</p>`;
      }

      return `<p style="margin:0 0 14px;font-size:16px;line-height:1.95;color:#374151;">${inlineMarkdown(
        line
      )}</p>`;
    })
    .join("");

  return `<div style="margin:0 0 18px;">${rendered}</div>`;
}

function renderAnswerLead(text: string): string {
  const value = text.replace(/^핵심 답변[:：]\s*/, "").trim();
  return `<div style="margin:0 0 18px;padding:16px 18px;border-radius:16px;background:#f0fdfa;border:1px solid #99f6e4;"><div style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#0f766e;text-transform:uppercase;">핵심 답변</div><p style="margin:0;font-size:16px;line-height:1.9;color:#134e4a;">${inlineMarkdown(
    value
  )}</p></div>`;
}

function renderMetaLine(text: string): string {
  const value = text.replace(/^-\s*/, "");
  return `<div style="margin:0 0 10px;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;font-size:14px;line-height:1.8;color:#475569;">${inlineMarkdown(
    value
  )}</div>`;
}

function renderFaqQuestion(text: string): string {
  return `<div style="margin:18px 0 10px;padding:14px 16px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;font-size:16px;line-height:1.85;font-weight:700;color:#1d4ed8;">${inlineMarkdown(
    text
  )}</div>`;
}

function renderTable(lines: string[]): string {
  const dataRows = lines.filter((line) => !/^\|[\s|:-]+\|$/.test(line.trim()));
  if (dataRows.length === 0) return "";

  const rows = dataRows.map((line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
  );

  const [header, ...body] = rows;
  const th = (header ?? [])
    .map(
      (cell) =>
        `<th style="padding:12px 14px;border:1px solid #dbeafe;background:#eff6ff;font-size:14px;line-height:1.6;font-weight:700;color:#1e3a8a;text-align:left;">${inlineMarkdown(
          cell
        )}</th>`
    )
    .join("");

  const tbody = body
    .map((row, rowIndex) => {
      const td = row
        .map(
          (cell) =>
            `<td style="padding:12px 14px;border:1px solid #e5e7eb;background:${
              rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc"
            };font-size:14px;line-height:1.8;color:#374151;vertical-align:top;">${inlineMarkdown(cell)}</td>`
        )
        .join("");
      return `<tr>${td}</tr>`;
    })
    .join("");

  return `<div style="margin:26px 0;overflow-x:auto;border-radius:18px;border:1px solid #dbeafe;background:#ffffff;box-shadow:0 8px 24px rgba(15,23,42,0.04);"><table style="width:100%;border-collapse:collapse;min-width:520px;"><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function insertImages(html: string, imageUrls: string[]): string {
  if (imageUrls.length === 0) return html;

  const sections = html.split(/(?=<div style="margin:38px 0 14px;">|<div style="margin:40px 0 18px;|<h3 style="margin:28px 0 12px;)/);
  if (sections.length === 0) return html;

  const step = Math.max(1, Math.floor(sections.length / imageUrls.length));
  const result: string[] = [];
  let imageIndex = 0;

  for (let index = 0; index < sections.length; index++) {
    result.push(sections[index]);
    if (imageIndex < imageUrls.length && index > 0 && index % step === 0) {
      result.push(buildImageTag(imageUrls[imageIndex], imageIndex + 1));
      imageIndex++;
    }
  }

  while (imageIndex < imageUrls.length) {
    result.push(buildImageTag(imageUrls[imageIndex], imageIndex + 1));
    imageIndex++;
  }

  return result.join("\n");
}

function buildImageTag(url: string, order: number): string {
  const safeUrl = escapeHtml(url);
  return `<figure style="margin:30px 0;text-align:center;"><div style="overflow:hidden;border-radius:22px;border:1px solid #e5e7eb;background:#ffffff;box-shadow:0 12px 32px rgba(15,23,42,0.06);"><img src="${safeUrl}" alt="본문 이미지 ${order}" style="display:block;width:100%;height:auto;" /></div><figcaption style="margin-top:10px;font-size:13px;line-height:1.7;color:#6b7280;">본문 이해를 돕는 참고 이미지 ${order}</figcaption></figure>`;
}
