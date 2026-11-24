// Небольшой безопасный Markdown-рендерер для статблоков.
// Весь текст сначала экранируется, поэтому HTML из статблока выполниться не может.
// Поддерживается: заголовки (#), **жирный**, *курсив*, ***жирный курсив***,
// списки (- * •), таблицы с | и разделителем |---|, линия ---, переносы строк.

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s) {
  s = escapeHtml(s);
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^\s*](?:[^*]*?[^\s*])?)\*/g, "<em>$1</em>");
  return s;
}

function splitCells(row) {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|")) r = r.slice(0, -1);
  return r.split("|").map((c) => c.trim());
}

const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

function align(cell) {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "";
}

export function renderMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    para = [];
  };
  const flushList = () => {
    if (list) out.push("<ul>" + list.map((x) => "<li>" + inline(x) + "</li>").join("") + "</ul>");
    list = null;
  };

  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();

    if (!t) {
      flushPara();
      flushList();
      i++;
      continue;
    }

    let m = /^(#{1,4})\s+(.*)$/.exec(t);
    if (m) {
      flushPara();
      flushList();
      out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      flushList();
      out.push("<hr>");
      i++;
      continue;
    }

    if (t.startsWith("|") && i + 1 < lines.length && SEPARATOR.test(lines[i + 1].trim())) {
      flushPara();
      flushList();
      const head = splitCells(t);
      const aligns = splitCells(lines[i + 1]).map(align);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      const cell = (tag, c, idx) => {
        const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "";
        return `<${tag}${a}>${inline(c)}</${tag}>`;
      };
      out.push(
        "<table><thead><tr>" +
          head.map((c, idx) => cell("th", c, idx)).join("") +
          "</tr></thead><tbody>" +
          rows.map((r) => "<tr>" + r.map((c, idx) => cell("td", c, idx)).join("") + "</tr>").join("") +
          "</tbody></table>"
      );
      continue;
    }

    m = /^[-*•]\s+(.*)$/.exec(t);
    if (m) {
      flushPara();
      (list ||= []).push(m[1]);
      i++;
      continue;
    }

    flushList();
    para.push(t);
    i++;
  }

  flushPara();
  flushList();
  return out.join("\n");
}
