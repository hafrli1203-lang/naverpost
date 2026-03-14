export function formatForNaver(params: {
  title: string;
  content: string;
  imageUrls?: string[];
}): string {
  const { title, content, imageUrls = [] } = params;

  let html = convertMarkdownToHtml(content);

  // Insert images at evenly spaced positions within the body
  if (imageUrls.length > 0) {
    html = insertImages(html, imageUrls);
  }

  return `<h1>${escapeHtml(title)}</h1>\n${html}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function convertMarkdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inTable = false;
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Tables: collect lines that look like table rows
    if (line.trim().startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
      continue;
    }

    // Flush table when table ends
    if (inTable) {
      output.push(renderTable(tableBuffer));
      tableBuffer = [];
      inTable = false;
    }

    // Headings
    if (/^### /.test(line)) {
      output.push(`<h3>${inlineMarkdown(line.replace(/^### /, ""))}</h3>`);
      continue;
    }
    if (/^## /.test(line)) {
      output.push(`<h2>${inlineMarkdown(line.replace(/^## /, ""))}</h2>`);
      continue;
    }
    if (/^# /.test(line)) {
      // Top-level heading treated as h2 inside body
      output.push(`<h2>${inlineMarkdown(line.replace(/^# /, ""))}</h2>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      output.push("<hr />");
      continue;
    }

    // Blank line -> paragraph break
    if (line.trim() === "") {
      output.push("<br />");
      continue;
    }

    // Normal paragraph line
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  // Flush any remaining table
  if (inTable && tableBuffer.length > 0) {
    output.push(renderTable(tableBuffer));
  }

  return output.join("\n");
}

function inlineMarkdown(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<b>$1</b>")
    // Italic: *text* or _text_
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/_(.+?)_/g, "<i>$1</i>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function renderTable(lines: string[]): string {
  // Filter out separator rows (---|---)
  const dataRows = lines.filter((l) => !/^\|[\s|:-]+\|$/.test(l.trim()));

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
  const thCells = (header ?? [])
    .map((c) => `<th style="border:1px solid #ccc;padding:6px 10px;">${inlineMarkdown(c)}</th>`)
    .join("");
  const thead = `<thead><tr>${thCells}</tr></thead>`;

  const tbodyRows = body
    .map((row) => {
      const tdCells = row
        .map((c) => `<td style="border:1px solid #ccc;padding:6px 10px;">${inlineMarkdown(c)}</td>`)
        .join("");
      return `<tr>${tdCells}</tr>`;
    })
    .join("\n");
  const tbody = `<tbody>${tbodyRows}</tbody>`;

  return `<table style="border-collapse:collapse;width:100%;margin:16px 0;">${thead}${tbody}</table>`;
}

function insertImages(html: string, imageUrls: string[]): string {
  if (imageUrls.length === 0) return html;

  // Split on h2/h3 boundaries to find natural insertion points
  const sections = html.split(/(?=<h[23])/);

  // Distribute images evenly across sections
  const step = Math.max(1, Math.floor(sections.length / imageUrls.length));

  let imageIndex = 0;
  const result: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    result.push(sections[i]);
    if (
      imageIndex < imageUrls.length &&
      i > 0 &&
      i % step === 0
    ) {
      result.push(buildImageTag(imageUrls[imageIndex]));
      imageIndex++;
    }
  }

  // Append remaining images at the end
  while (imageIndex < imageUrls.length) {
    result.push(buildImageTag(imageUrls[imageIndex]));
    imageIndex++;
  }

  return result.join("\n");
}

function buildImageTag(url: string): string {
  return `<div style="text-align:center;margin:20px 0;"><img src="${url}" style="max-width:100%;height:auto;" /></div>`;
}
