import OBR from "@owlbear-rodeo/sdk";
import { EXT_ID, LINK_KEY, setPending } from "./store.js";

// Иконки должны быть абсолютными ссылками (расширение лежит в подпапке GitHub Pages).
const asset = (name) => new URL(name, window.location.href).href;

OBR.onReady(async () => {
  // Пункт «Статблок» в контекстном меню токена. Виден только мастеру.
  await OBR.contextMenu.create({
    id: `${EXT_ID}/open`,
    icons: [
      {
        icon: asset("icon.svg"),
        label: "Статблок",
        filter: {
          roles: ["GM"],
          min: 1,
          max: 1,
          every: [{ key: "type", value: "IMAGE" }],
        },
      },
    ],
    onClick: async (context) => {
      const item = context.items[0];
      if (!item) return;
      const link = item.metadata?.[LINK_KEY];
      // Окно расширения заберёт это сообщение при открытии
      if (typeof link === "string") {
        setPending({ type: "open", id: link });
      } else {
        setPending({ type: "attach", itemIds: [item.id], itemName: item.name || "токен" });
      }
      await OBR.action.open();
    },
  });
});
