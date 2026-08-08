import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const stripComments = (css) => css.replaceAll(/\/\*[\s\S]*?\*\//g, "");

function findRule(css, selector) {
  for (const match of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((item) => item.trim());
    if (selectors.includes(selector)) {
      return { selectorText: selectors.join(", "), selectors, declarations: match[2] };
    }
  }
  assert.fail(`missing CSS rule for selector: ${selector}`);
}

test("HTMLがJavaScriptより先に、日本語の骨組みを出す", async () => {
  const html = await read("../index.html");

  assert.match(html, /<html\s+lang="ja"/i);
  assert.match(html, /<meta\s+charset="utf-8"/i);
  assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1"/i);
  assert.match(html, /<title>生成AI 30のチャレンジⅣ ～授業改善を生成AIとの対話で進める～<\/title>/);
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\/css\/styles\.css"/i);
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\/css\/print\.css"\s+media="print"/i);
  assert.match(html, /<a[^>]+href="#main"/i);
  assert.match(html, /<main\s+id="main"/i);
  assert.match(html, /<script\s+type="module"\s+src="\.\/js\/app\.js"><\/script>/i);
  assert.match(html, /気になっている授業から、ひとつ試すところから。/);
  assert.match(html, /1回だけでも、順番どおりでなくてもかまいません。/);
});

test("ゲーム由来の仕掛けを画面から消してある", async () => {
  const html = await read("../index.html");
  const app = await read("../js/app.js");
  const css = await read("../css/styles.css");

  for (const word of ["7つの力", "７つの力", "称号", "ポイント", "クエスト", "バッジ"]) {
    assert.ok(!html.includes(word), `HTMLに残っている: ${word}`);
    assert.ok(!app.includes(word), `app.jsに残っている: ${word}`);
  }
  for (const selector of ["powers-dialog", "badge", "power-summary", "step-tracker", "verdict"]) {
    assert.ok(!html.includes(selector), `HTMLに残っている: ${selector}`);
    assert.ok(!css.includes(selector), `CSSに残っている: ${selector}`);
  }
});

test("読み込み前の描画先と、操作の受け皿がある", async () => {
  const html = await read("../index.html");

  assert.match(html, /<section[^>]+aria-labelledby="guide-title"/i);
  assert.match(html, /<section\s+id="summary"\s+class="summary"\s+aria-label="[^"]+"/i);
  assert.match(html, /<nav\s+id="filters"[^>]+aria-label="[^"]+"/i);
  assert.match(html, /<div\s+id="challenge-list"\s+class="card-grid"/i);
  assert.match(html, /<noscript>[\s\S]*print\.html[\s\S]*<\/noscript>/i);
  assert.match(html, /<dialog\s+id="challenge-dialog"[^>]+aria-labelledby="dialog-title"/i);
  assert.match(html, /<div\s+id="challenge-detail"><\/div>/i);
  assert.match(html, /<button\s+id="close-dialog"/i);
  assert.match(html, /<div\s+id="toast"\s+role="status"\s+aria-live="polite"/i);
  assert.match(
    html,
    /<div\s+id="dialog-toast"\s+role="status"\s+aria-live="polite"\s+aria-atomic="true"><\/div>/i,
  );
  assert.match(html, /<div\s+id="storage-warning"[^>]+role="status"[^>]+hidden[\s\S]*print\.html/i);
  assert.match(html, /<button\s+id="reset-tried"/i);
  assert.match(
    html,
    /<div\s+id="reset-confirmation"[^>]+hidden[\s\S]*id="confirm-reset"[\s\S]*id="cancel-reset"/i,
  );
});

test("初心者向けの言い回しが画面に出る", async () => {
  const app = await read("../js/app.js");
  const html = await read("../index.html");

  for (const label of [
    "この文章をコピー",
    "うめた文をコピー",
    "くわしく",
    "やってみたことにする",
    "この回のURLをコピー",
    "コピーしました。ChatGPTなどの生成AIを開いて貼り付けてください。",
    "順番も速さも自由です。1日に何回やっても、やらない日があってもかまいません。",
  ]) {
    assert.ok(app.includes(label), `app.jsに無い: ${label}`);
  }
  assert.match(html, /生成AIを開けないときは、文章を読んで/);
});

// 回答が長いと、着眼点にたどり着く前に読む負荷が勝つ。
test("1回目の文に、検索させず短く答えさせる制約が出る", async () => {
  const app = await read("../js/app.js");
  const css = await read("../css/styles.css");

  assert.match(app, /function limitsLine/);
  assert.match(app, /className: "prompt__limits", text: promptLimits\(model\.send\.type\)/);
  assert.match(css, /\.prompt__limits/);
  // コピーする文にも同じ制約を付ける
  assert.match(app, /withLimits\(body, challenge\.send\.type\)/);
});

test("手順は1回目と2回目を分け、番号を通しで振る", async () => {
  const app = await read("../js/app.js");
  const viewModel = await read("../js/view-model.js");

  assert.match(app, /1回目 — \$\{model\.sendType\.label\}/);
  assert.match(app, /2回目 — \$\{FILL_TYPE\.label\}/);
  assert.match(viewModel, /function numberedSteps/);
  assert.match(app, /className: "reply"/);
});

test("空欄は文の中の入力欄にして、別の組み立て欄を作らない", async () => {
  const app = await read("../js/app.js");

  assert.match(app, /id:\s*"blank-input"/);
  assert.match(app, /文そのものが入力欄/);
  assert.match(app, /let blankDraft = ""/);
  // 携帯でキーボードに隠れるため、組み立て結果を別に置かない
  const fillBlock = app.slice(app.indexOf("function fillBlock"), app.indexOf("function renderDetail"));
  assert.equal(
    (fillBlock.match(/"data-prompt":\s*"fill"/g) ?? []).length,
    1,
    "組み立てた文の置き場所が2か所ある",
  );
  assert.match(app, /名前など個人が分かる言葉は書かないでください。/);
  assert.ok(!app.includes("saveTried(blankDraft"), "書いた言葉を保存してはいけない");
});

test("補足はマウスがなくても開ける", async () => {
  const app = await read("../js/app.js");

  assert.match(app, /aria-expanded/);
  assert.match(app, /button\.dataset\.help/);
  assert.match(app, /addEventListener\("mouseenter"/);
  assert.match(app, /マウスがない端末でも届くよう/);

  // 指で押せる大きさを確保する（26pxだと押しにくい）
  const css = await read("../css/styles.css");
  assert.match(css, /\.help__button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.help\s*\{[^}]*display:\s*block/s);
});

test("操作の種類ごとに色を分け、注意の色は他で使わない", async () => {
  const css = await read("../css/styles.css");

  for (const token of [
    "--asis-line:", "--asis-bg:", "--asis-ink:",
    "--paste-line:", "--paste-bg:", "--paste-ink:",
    "--attach-line:", "--attach-bg:", "--attach-ink:",
    "--fill-line:", "--fill-bg:", "--fill-ink:",
    "--warn-line:", "--warn-bg:", "--warn-ink:",
  ]) {
    assert.ok(css.includes(token), `色の定義が無い: ${token}`);
  }

  for (const type of ["asis", "paste", "attach", "fill"]) {
    assert.match(
      css,
      new RegExp(`\\.block--${type}\\s*\\{[^}]*border-inline-start-color:\\s*var\\(--${type}-line\\)`, "s"),
      `.block--${type} の枠色が違う`,
    );
  }

  const warnUsers = [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*var\(--warn-line\)[^{}]*)\}/g)]
    .map(([, selector]) => selector.trim());
  assert.ok(warnUsers.length > 0);
  assert.ok(
    warnUsers.every((selector) => /safety|storage-warning/.test(selector)),
    `注意の色が他の役割で使われている: ${warnUsers.join(" / ")}`,
  );
});

test("色以外の手がかりを必ず併記する", async () => {
  const app = await read("../js/app.js");
  const viewModel = await read("../js/view-model.js");
  const { SEND_TYPES } = await import("../js/view-model.js");
  const { iconMarkup, ICON_NAMES } = await import("../js/icons.js");

  assert.match(viewModel, /ラベルとアイコンを主、色を従/);
  for (const type of Object.values(SEND_TYPES)) {
    assert.ok(ICON_NAMES.includes(type.icon), `アイコンが無い: ${type.icon}`);
  }
  assert.match(app, /createIcon\(model\.sendType\.icon\)/);
  assert.match(app, /text: `1回目 — \$\{model\.sendType\.label\}`/);
  assert.match(iconMarkup("copy"), /^<svg[^>]+viewBox="0 0 24 24"/);
  assert.match(iconMarkup("copy"), /aria-hidden="true"/);
  assert.match(iconMarkup("copy", { title: "コピー" }), /aria-label="コピー"/);
  assert.equal(iconMarkup("unknown"), "");
});

test("画面の基本と、携帯での崩れ対策がある", async () => {
  const css = await read("../css/styles.css");

  assert.match(css, /font-family:\s*"BIZ UDPGothic"/);
  assert.match(css, /body\s*\{[^}]*margin:\s*0[^}]*line-height:\s*1\.7/s);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px\s+solid\s+var\(--focus\)/s);
  assert.match(css, /button[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.blank-input\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(280px,\s*1fr\)\)/s);
  assert.match(css, /\.prompt\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /dialog\s*\{[^}]*max-height:\s*calc\(100vh\s*-\s*2rem\);\s*max-height:\s*calc\(100dvh\s*-\s*2rem\)/s);
  assert.match(css, /dialog::backdrop/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*padding-inline:\s*1rem/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*\.card-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  // 固定ヘッダーは縦積みにしない（携帯で画面を常時圧迫する）
  const header = findRule(css, ".dialog-header");
  assert.match(header.declarations, /position:\s*sticky/);
});

test("印刷用スタイルは操作を隠し、A4に収める", async () => {
  const css = await read("../css/print.css");

  assert.match(css, /@page\s*\{[^}]*size:\s*A4\s+portrait[^}]*margin:\s*12mm/s);
  const hidden = findRule(css, "button");
  for (const selector of ["button", "nav", "dialog", "#toast", ".guide", ".summary"]) {
    assert.equal(findRule(css, selector).selectorText, hidden.selectorText, `${selector} が非表示側にない`);
  }
  assert.match(hidden.declarations, /display:\s*none\s*!important/);
  assert.match(css, /\.print-challenge\s*\{[^}]*break-inside:\s*avoid/s);
  assert.match(css, /font-size:\s*(?:9pt|1[0-9](?:\.\d+)?pt)/);
});

test("favicon は自前のSVGで、外部を読まない", async () => {
  const svg = await read("../assets/favicon.svg");
  assert.match(svg, /<svg[^>]+viewBox="0 0 \d+ \d+"/i);
  assert.doesNotMatch(svg, /(?:href|src)=["']https?:\/\//i);
});
