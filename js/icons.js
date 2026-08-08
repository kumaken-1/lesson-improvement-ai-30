// 操作の種類を表す小さな図形。色が見分けられない人にも形で伝わるようにする。
// viewBox は 0 0 24 24 で統一し、currentColor で描く。
const PATHS = {
  copy: ["M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z", "M15 6.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5"],
  paste: ["M8 4h8a1 1 0 0 1 1 1v2H7V5a1 1 0 0 1 1-1Z", "M10 4V3h4v1", "M7 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1", "M9 13h6M9 17h4"],
  attach: ["M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.1 3.1 0 0 1 4.4 4.4l-7.6 7.6a1.5 1.5 0 0 1-2.2-2.2l7-7"],
  pencil: ["M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Z", "M14.5 6.5l3 3"],
  warning: ["M12 4 2.8 20h18.4L12 4Z", "M12 10v4.5", "M12 17.4h.01"],
  help: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.6", "M12 17.2h.01"],
  arrow: ["M12 4v15", "M6.5 13.5 12 19l5.5-5.5"],
  check: ["M4.5 12.5 9.5 17.5 19.5 6.5"],
  flag: ["M6 4v16", "M6 5h11l-2 3.5L17 12H6"],
};

export const ICON_NAMES = Object.keys(PATHS);

export function iconMarkup(name, { size = 18, title = "" } = {}) {
  const paths = PATHS[name];
  if (!paths) return "";
  const label = title
    ? ` role="img" aria-label="${title}"`
    : ' aria-hidden="true" focusable="false"';
  const body = paths.map((d) => `<path d="${d}"></path>`).join("");
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}"`
    + ` fill="none" stroke="currentColor" stroke-width="1.7"`
    + ` stroke-linecap="round" stroke-linejoin="round"${label}>${body}</svg>`;
}

export function createIcon(name, options = {}) {
  const markup = iconMarkup(name, options);
  if (!markup) return null;
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild;
}
