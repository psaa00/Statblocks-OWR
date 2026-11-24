import OBR from "@owlbear-rodeo/sdk";
import {
  LINK_KEY,
  PENDING_KEY,
  loadLibrary,
  saveLibrary,
  newId,
  takePending,
  storageAvailable,
} from "./store.js";
import { renderMarkdown } from "./render.js";
import { parseImport, mergeLibrary, deriveName, TEMPLATE } from "./importer.js";

const app = document.getElementById("app");
const state = { role: null, library: [], query: "", attach: null };

const notify = (message, variant = "DEFAULT") => OBR.notification.show(message, variant);

// ───────── Вспомогательное ─────────

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "html") el.innerHTML = value; // только вывод renderMarkdown (он экранирует текст)
    else if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const btn = (label, onClick, cls = "") => h("button", { type: "button", class: `btn ${cls}`.trim(), onClick }, label);
const show = (node) => app.replaceChildren(node);
const find = (id) => state.library.find((s) => s.id === id);

function persist() {
  if (!saveLibrary(state.library)) notify("Не удалось сохранить в браузере", "ERROR");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* запасной способ ниже */
  }
  const area = h("textarea", { value: text, style: "position:fixed;opacity:0" });
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty("--bg", theme.background.default);
  root.setProperty("--paper", theme.background.paper);
  root.setProperty("--text", theme.text.primary);
  root.setProperty("--text-2", theme.text.secondary);
  root.setProperty("--primary", theme.primary.main);
  root.setProperty("--primary-text", theme.primary.contrastText);
}

// ───────── Привязка к токенам ─────────

async function setLink(itemIds, statblockId) {
  try {
    await OBR.scene.items.updateItems(itemIds, (items) => {
      for (const item of items) {
        if (statblockId) item.metadata[LINK_KEY] = statblockId;
        else delete item.metadata[LINK_KEY];
      }
    });
    return true;
  } catch {
    notify("Не удалось изменить токен. Сцена открыта?", "ERROR");
    return false;
  }
}

async function selectedIds() {
  const ids = await OBR.player.getSelection();
  if (!ids || !ids.length) {
    notify("Сначала выберите токен на карте", "WARNING");
    return null;
  }
  return ids;
}

async function linkSelected(statblockId) {
  const ids = await selectedIds();
  if (ids && (await setLink(ids, statblockId))) notify("Статблок привязан к выбранному токену", "SUCCESS");
}

async function unlinkSelected() {
  const ids = await selectedIds();
  if (ids && (await setLink(ids, null))) notify("Статблок отвязан от выбранного токена", "SUCCESS");
}

async function attachFromList(statblock) {
  const target = state.attach;
  if (!target) return;
  if (await setLink(target.itemIds, statblock.id)) {
    notify(`«${statblock.name}» привязан к токену «${target.itemName}»`, "SUCCESS");
    state.attach = null;
    showDetail(statblock.id);
  }
}

// ───────── Экраны ─────────

function showList() {
  const results = h("div", { class: "results" });

  const fill = () => {
    const q = state.query.trim().toLowerCase();
    const items = state.library.filter((s) => !q || `${s.name} ${s.group} ${s.text}`.toLowerCase().includes(q));
    items.sort(
      (a, b) =>
        !a.group - !b.group || a.group.localeCompare(b.group, "ru") || a.name.localeCompare(b.name, "ru")
    );
    const nodes = [];
    let lastGroup = null;
    for (const s of items) {
      if (s.group !== lastGroup) {
        nodes.push(h("div", { class: "group" }, s.group || "Без группы"));
        lastGroup = s.group;
      }
      nodes.push(
        h(
          "button",
          { type: "button", class: "card", onClick: () => (state.attach ? attachFromList(s) : showDetail(s.id)) },
          s.name
        )
      );
    }
    if (!nodes.length) {
      nodes.push(
        h(
          "div",
          { class: "empty" },
          state.library.length ? "Ничего не найдено" : "Библиотека пуста. Добавьте статблок или импортируйте файлы."
        )
      );
    }
    results.replaceChildren(...nodes);
  };

  const banner = state.attach
    ? h(
        "div",
        { class: "banner" },
        h("span", {}, `Выберите статблок для токена «${state.attach.itemName}»`),
        btn("Отмена", () => {
          state.attach = null;
          showList();
        })
      )
    : null;

  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "Поиск по названию, группе, тексту",
    value: state.query,
    onInput: (e) => {
      state.query = e.target.value;
      fill();
    },
  });

  show(
    h(
      "div",
      {},
      banner,
      h("div", { class: "toolbar" }, btn("＋ Новый", () => showEdit(null), "primary"), h("span", { class: "spacer" }), btn("Импорт / экспорт", showIO)),
      search,
      results
    )
  );
  fill();
}

function showDetail(id) {
  const s = find(id);
  if (!s) return showList();

  let armed = false;
  const del = btn("Удалить", () => {
    if (!armed) {
      armed = true;
      del.textContent = "Точно удалить?";
      del.classList.add("danger");
      setTimeout(() => {
        armed = false;
        del.textContent = "Удалить";
        del.classList.remove("danger");
      }, 3000);
      return;
    }
    state.library = state.library.filter((x) => x.id !== id);
    persist();
    showList();
  });

  show(
    h(
      "div",
      {},
      h("div", { class: "toolbar" }, btn("← Назад", showList), h("span", { class: "spacer" }), btn("Править", () => showEdit(id)), del),
      h("h2", { class: "title" }, s.name),
      s.group ? h("div", { class: "sub" }, s.group) : null,
      h("div", { class: "sb", html: renderMarkdown(s.text) }),
      h(
        "div",
        { class: "actions" },
        btn("Привязать к выбранному токену", () => linkSelected(s.id), "primary"),
        btn("Отвязать от выбранного", unlinkSelected),
        btn("Копировать текст", async () =>
          (await copyText(s.text)) ? notify("Скопировано", "SUCCESS") : notify("Не удалось скопировать", "ERROR")
        )
      )
    )
  );
}

function showEdit(id) {
  const s = id ? find(id) : null;
  const name = h("input", { type: "text", placeholder: "Название", value: s ? s.name : "" });
  const group = h("input", { type: "text", placeholder: "Группа (необязательно), например «Боггарты»", value: s ? s.group : "" });
  const text = h("textarea", { class: "editor", placeholder: "Текст статблока (Markdown)", value: s ? s.text : "" });

  const save = () => {
    const body = text.value;
    if (!body.trim()) return notify("Текст статблока пуст", "WARNING");
    const title = name.value.trim() || deriveName(body);
    if (s) {
      Object.assign(s, { name: title, group: group.value.trim(), text: body, updated: Date.now() });
    } else {
      state.library.push({ id: newId(), name: title, group: group.value.trim(), text: body, updated: Date.now() });
    }
    persist();
    showDetail(s ? s.id : state.library[state.library.length - 1].id);
  };

  show(
    h(
      "div",
      {},
      h("div", { class: "toolbar" }, btn("← Отмена", () => (s ? showDetail(s.id) : showList())), h("span", { class: "spacer" }), btn("Сохранить", save, "primary")),
      name,
      group,
      text,
      h(
        "div",
        { class: "actions" },
        btn("Вставить шаблон 5e", () => {
          if (!text.value.trim() || text.value === TEMPLATE) text.value = TEMPLATE;
          else notify("Шаблон вставляется только в пустое поле", "WARNING");
        })
      )
    )
  );
}

function showIO() {
  const files = h("input", { type: "file", multiple: true, accept: ".md,.markdown,.txt,.json,text/*,application/json" });
  const split = h(
    "select",
    {},
    h("option", { value: "0" }, "Один файл = один статблок"),
    h("option", { value: "1" }, "Делить файл по заголовкам «# »"),
    h("option", { value: "2" }, "Делить файл по заголовкам «## »")
  );
  const group = h("input", { type: "text", placeholder: "Группа для импортируемых (необязательно)" });
  const pasted = h("textarea", { class: "paste", placeholder: "…или вставьте сюда текст статблока(ов) либо JSON-резервную копию" });
  const exportBox = h("textarea", { class: "paste", readOnly: true, placeholder: "Здесь появится JSON вашей библиотеки" });

  const doImport = async () => {
    const options = { split: Number(split.value), group: group.value.trim() };
    const incoming = [];
    for (const file of files.files) incoming.push(...parseImport(await file.text(), file.name, options));
    if (pasted.value.trim()) incoming.push(...parseImport(pasted.value, "Вставленный текст", options));
    if (!incoming.length) return notify("Нечего импортировать: выберите файлы или вставьте текст", "WARNING");
    const merged = mergeLibrary(state.library, incoming, newId);
    state.library = merged.library;
    persist();
    notify(`Добавлено: ${merged.added}, обновлено: ${merged.updated}`, "SUCCESS");
    showList();
  };

  const doExport = () => {
    exportBox.value = JSON.stringify({ statblocks: state.library }, null, 2);
    exportBox.select();
  };

  show(
    h(
      "div",
      {},
      h("div", { class: "toolbar" }, btn("← Назад", showList)),
      h("h3", {}, "Импорт"),
      h("p", { class: "hint" }, "Подойдут .md, .txt и .json (резервная копия). Название берётся из первого заголовка."),
      files,
      split,
      group,
      pasted,
      h("div", { class: "actions" }, btn("Импортировать", doImport, "primary")),
      h("h3", {}, "Резервная копия"),
      h("p", { class: "hint" }, "Статблоки хранятся только в этом браузере. Сохраните копию на случай очистки данных или смены компьютера."),
      h(
        "div",
        { class: "actions" },
        btn("Показать JSON", doExport),
        btn("Копировать", async () => {
          if (!exportBox.value) doExport();
          (await copyText(exportBox.value)) ? notify("Скопировано", "SUCCESS") : notify("Не удалось скопировать", "ERROR");
        }),
        btn("Скачать .json", () => {
          if (!exportBox.value) doExport();
          download("statblocks-backup.json", exportBox.value);
        })
      ),
      exportBox
    )
  );
}

// ───────── Запуск ─────────

function consumePending() {
  const pending = takePending();
  if (!pending) return;
  if (pending.type === "open") {
    if (find(pending.id)) showDetail(pending.id);
    else {
      notify("Привязанный статблок не найден в этой библиотеке", "WARNING");
      showList();
    }
  } else if (pending.type === "attach") {
    state.attach = pending;
    showList();
  }
}

function init() {
  if (state.role !== "GM") {
    show(h("div", { class: "gm-only" }, h("h2", {}, "Статблоки"), h("p", {}, "Этот раздел доступен только мастеру.")));
    return;
  }
  state.library = loadLibrary().map((s) => ({ ...s, group: s.group || "" }));
  if (!storageAvailable()) notify("Хранилище браузера недоступно: статблоки пропадут после закрытия вкладки", "WARNING");
  showList();
  consumePending();
}

OBR.onReady(async () => {
  applyTheme(await OBR.theme.getTheme());
  OBR.theme.onChange(applyTheme);

  state.role = await OBR.player.getRole();
  OBR.player.onChange((player) => {
    if (player.role !== state.role) {
      state.role = player.role;
      init();
    }
  });

  // Если окно уже открыто, а мастер нажал «Статблок» в меню токена
  window.addEventListener("storage", (event) => {
    if (event.key === PENDING_KEY && event.newValue && state.role === "GM") consumePending();
  });

  init();
});
