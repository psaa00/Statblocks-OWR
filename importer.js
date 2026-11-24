// Разбор импортируемых файлов и слияние с библиотекой. Чистые функции, без обращения к странице.

export const TEMPLATE = `# Название существа
*Средний гуманоид, нейтральный*

**Класс Доспеха** 12 (кожаный доспех)
**Хиты** 22 (4к8 + 4)
**Скорость** 30 фт.

| СИЛ | ЛОВ | ТЕЛ | ИНТ | МУД | ХАР |
|:-:|:-:|:-:|:-:|:-:|:-:|
| 10 (+0) | 14 (+2) | 12 (+1) | 10 (+0) | 10 (+0) | 10 (+0) |

**Навыки** Скрытность +4
**Чувства** пассивное Восприятие 10
**Языки** Общий
**Опасность** 1/2 (100 опыта)

## Особенности
***Название особенности.*** Описание особенности.

## Действия
***Короткий меч.*** *Рукопашная атака оружием:* +4 к попаданию, досягаемость 5 фт., одна цель. *Попадание:* 5 (1к6 + 2) колющего урона.
`;

/** Делит текст на части по заголовкам нужного уровня (1 = «# », 2 = «## »). Уровень 0: не делить. */
export function splitText(text, level) {
  const normalized = String(text).replace(/\r\n?/g, "\n");
  if (!level) return [normalized.trim()].filter(Boolean);
  const marker = "#".repeat(level) + " ";
  const parts = [];
  let current = [];
  for (const line of normalized.split("\n")) {
    if (line.startsWith(marker) && current.some((l) => l.trim())) {
      parts.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim())) parts.push(current.join("\n"));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Название берётся из первого заголовка, иначе из первой строки, иначе из имени файла. */
export function deriveName(text, fallback = "Без названия") {
  const clean = (s) => s.replace(/[*_#|]/g, "").trim().slice(0, 80);
  const heading = /^#{1,6}\s+(.+)$/m.exec(text);
  if (heading && clean(heading[1])) return clean(heading[1]);
  const first = text.split("\n").find((l) => clean(l));
  return first ? clean(first) : fallback;
}

/**
 * Превращает содержимое файла (или вставленный текст) в список статблоков.
 * JSON-резервная копия (массив или {statblocks: [...]}) читается как есть.
 */
export function parseImport(raw, filename = "", { split = 0, group = "" } = {}) {
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed);
      const list = Array.isArray(data) ? data : data && data.statblocks;
      if (Array.isArray(list)) {
        return list
          .filter((x) => x && typeof x.name === "string" && typeof x.text === "string")
          .map((x) => ({
            id: typeof x.id === "string" ? x.id : undefined,
            name: x.name,
            group: typeof x.group === "string" ? x.group : group,
            text: x.text,
          }));
      }
    } catch {
      /* это не JSON, читаем как обычный текст */
    }
  }
  const base = filename.replace(/\.[^.]+$/, "") || "Без названия";
  return splitText(raw, split).map((text) => ({ name: deriveName(text, base), group, text }));
}

/**
 * Добавляет статблоки в библиотеку. Совпадение ищется по id (для резервных копий)
 * или по паре «название + группа» (для повторного импорта файла): такой статблок обновляется.
 */
export function mergeLibrary(existing, incoming, makeId, now = Date.now()) {
  const map = new Map(existing.map((s) => [s.id, s]));
  const key = (s) => `${s.name.trim().toLowerCase()}|${(s.group || "").trim().toLowerCase()}`;
  const byKey = new Map(existing.map((s) => [key(s), s.id]));
  let added = 0;
  let updated = 0;

  for (const inc of incoming) {
    const name = inc.name.trim() || "Без названия";
    const group = (inc.group || "").trim();
    let id = inc.id;
    if (!id) id = byKey.get(key({ name, group })) || makeId();
    if (map.has(id)) updated++;
    else added++;
    map.set(id, { id, name, group, text: inc.text, updated: now });
    byKey.set(key({ name, group }), id);
  }
  return { library: [...map.values()], added, updated };
}
