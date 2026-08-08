import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { CATEGORIES, challenges } from "../js/challenges.js";
import {
  CLOSING_NOTE,
  DECIDE_NOTE,
  FOLLOW_UP_STEPS,
  HELP_TEXTS,
  SAFETY_NOTE,
  SEND_TYPES,
  FILL_TYPE,
  withLimits,
} from "../js/view-model.js";

const categoryNames = new Map(CATEGORIES.map(({ id, name }) => [id, name]));

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 画面では入力欄になる空欄を、紙では手書きできる下線にする。
export function printableTemplate(template) {
  return String(template).replace("____", "＿＿＿＿＿＿＿＿");
}

function stepsMarkup(steps, startAt) {
  const items = steps.map((step, index) => {
    const help = step.help && HELP_TEXTS[step.help]
      ? `<br><span class="print-help">${escapeHtml(HELP_TEXTS[step.help].title)}：${escapeHtml(HELP_TEXTS[step.help].body)}</span>`
      : "";
    return `            <li value="${startAt + index}">${escapeHtml(step.text)}${help}</li>`;
  });
  return `          <ol class="print-steps" start="${startAt}">\n${items.join("\n")}\n          </ol>`;
}

// 空欄をうめて送る回だけ、空欄に入れる語の例を紙にも出す。
function sendHintMarkup(challenge) {
  return challenge.send.hint
    ? `\n        <p class="print-hints">例：${escapeHtml(challenge.send.hint)}</p>`
    : "";
}

function challengeMarkup(challenge) {
  const sendType = SEND_TYPES[challenge.send.type] ?? SEND_TYPES.fill;
  const followStart = challenge.send.steps.length + 1;
  return `      <article class="print-challenge">
        <p class="print-check">□ やってみた</p>
        <p class="print-category">${escapeHtml(categoryNames.get(challenge.category) ?? "")}</p>
        <h2 class="print-title">${escapeHtml(challenge.title)}</h2>
        <p class="print-intro">${escapeHtml(challenge.intro.replaceAll("\n", " "))}</p>
        <p class="print-label">1回目 — ${escapeHtml(sendType.label)}</p>
${stepsMarkup(challenge.send.steps, 1)}${sendHintMarkup(challenge)}
        <p class="print-prompt">${escapeHtml(printableTemplate(withLimits(challenge.send.prompt, challenge.send.type)))}</p>
        <p class="print-reply">${escapeHtml(challenge.reply)}${escapeHtml(DECIDE_NOTE)}</p>
        <p class="print-label">2回目 — ${escapeHtml(FILL_TYPE.label)}</p>
${stepsMarkup(FOLLOW_UP_STEPS, followStart)}
        <p class="print-prompt">${escapeHtml(printableTemplate(challenge.followUp.template))}</p>
        <p class="print-hints">例：${escapeHtml(challenge.followUp.hints.join(" ／ "))}</p>
        <p class="print-closing">${escapeHtml(CLOSING_NOTE)}</p>
        <p class="print-safety">${escapeHtml(SAFETY_NOTE)}</p>
      </article>`;
}

export function buildPrintPage(items) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>印刷用一覧｜生成AI 30のチャレンジⅢ ～授業改善～</title>
    <link rel="stylesheet" href="./css/styles.css">
    <link rel="stylesheet" href="./css/print.css">
  </head>
  <body>
    <header class="hero">
      <div class="hero__inner">
        <h1>生成AI 30のチャレンジⅢ ～授業改善～</h1>
        <p class="hero__lead">気になっている授業から、ひとつ試すところから。</p>
      </div>
    </header>
    <main class="site-main">
      <div class="card-grid">
${items.map(challengeMarkup).join("\n")}
      </div>
    </main>
  </body>
</html>
`;
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await writeFile(new URL("../print.html", import.meta.url), buildPrintPage(challenges), "utf8");
}
