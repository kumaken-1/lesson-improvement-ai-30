import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { challenges } from "../js/challenges.js";
import {
  CORE_NOTE,
  FOLLOW_UP_STEPS,
  PROMPT_LIMITS,
  SAFETY_NOTE,
  SEND_TYPES,
} from "../js/view-model.js";
import {
  buildPrintPage,
  escapeHtml,
  printableTemplate,
} from "../scripts/build-print-page.mjs";

const printPageUrl = new URL("../print.html", import.meta.url);

test("escapeHtml が生成物を守る", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("print.html は生成器の出力と完全に一致する", async () => {
  const html = await readFile(printPageUrl, "utf8");
  assert.equal(html, buildPrintPage(challenges));
  assert.equal((html.match(/class="print-challenge"/g) ?? []).length, 30);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /href="\.\/css\/print\.css"/);
});

test("30件すべての本文が紙面に載る", async () => {
  const html = await readFile(printPageUrl, "utf8");
  for (const challenge of challenges) {
    assert.ok(html.includes(escapeHtml(challenge.title)), `題名が無い: ${challenge.title}`);
    // 空欄をうめて送る回は、1回目の文の空欄も紙では下線になる
    assert.ok(
      html.includes(escapeHtml(printableTemplate(challenge.send.prompt))),
      `送る文が無い: id ${challenge.id}`,
    );
    assert.ok(html.includes(escapeHtml(challenge.reply)), `返事の一行が無い: id ${challenge.id}`);
    assert.ok(
      html.includes(escapeHtml(challenge.hypothesis.text)),
      `送る前の問いが無い: id ${challenge.id}`,
    );
    for (const key of ["adopt", "revise", "reject"]) {
      assert.ok(
        html.includes(escapeHtml(challenge.decide[key])),
        `三択が無い: id ${challenge.id} の ${key}`,
      );
    }
    assert.ok(
      html.includes(escapeHtml(printableTemplate(challenge.followUp.template))),
      `2通目が無い: id ${challenge.id}`,
    );
    assert.ok(
      html.includes(escapeHtml(challenge.followUp.hints.join(" ／ "))),
      `例が無い: id ${challenge.id}`,
    );
    for (const step of challenge.send.steps) {
      assert.ok(html.includes(escapeHtml(step.text)), `手順が無い: id ${challenge.id}`);
    }
  }
  assert.equal((html.match(/class="print-check"/g) ?? []).length, 30);
  assert.equal((html.match(/class="print-safety"/g) ?? []).length, 30);
  assert.ok(html.includes(escapeHtml(SAFETY_NOTE)));
});

// 紙でも、回答量の制約と書く終点を示す。理由欄は任意だと分かるようにする。
test("紙面にも制約と終点が出て、理由欄は任意と分かる", async () => {
  const html = await readFile(printPageUrl, "utf8");

  assert.equal((html.match(new RegExp(escapeHtml(PROMPT_LIMITS), "g")) ?? []).length, 30);
  assert.equal((html.match(/class="print-core"/g) ?? []).length, 30);
  assert.ok(html.includes(escapeHtml(CORE_NOTE)));
  assert.equal((html.match(/そう決めた理由を、一行だけ書きます（任意）/g) ?? []).length, 30);
  assert.equal((html.match(/ここまで書けば完了/g) ?? []).length, 30);
});

test("紙面では空欄を手書きできる下線にする", async () => {
  assert.equal(printableTemplate("「____」が気になりました。"), "「＿＿＿＿＿＿＿＿」が気になりました。");
  const html = await readFile(printPageUrl, "utf8");
  assert.doesNotMatch(html, /____/, "画面用の空欄記号が紙面に残っている");
});

// 記入欄の下線を文字で引くと、本数が紙幅に合わず1列の紙面では短く見える。
// 罫線にすれば列幅いっぱいに伸びる。
test("記入欄の下線は文字ではなく罫線で引く", async () => {
  const html = await readFile(printPageUrl, "utf8");
  const css = await readFile(new URL("../css/print.css", import.meta.url), "utf8");

  // 送る前の考え・判断の理由・今日変える一点の3か所 × 30回
  assert.equal((html.match(/class="print-write"/g) ?? []).length, 90);
  assert.equal((html.match(/class="print-rule"/g) ?? []).length, 90);
  // 下線を文字で並べていないこと
  assert.doesNotMatch(html, /＿{10,}/, "記入欄の下線が文字で引かれている");

  const rule = /\.print-rule\s*\{([^}]*)\}/s.exec(css);
  assert.ok(rule, "CSSに .print-rule が無い");
  assert.match(rule[1], /border-block-end/);
  assert.match(rule[1], /height/, "書き込む高さが確保されていない");
});

// 30枚まとめて配る冊子ではなく、1枚ずつ選んで刷る教材として使う。
test("紙の1枚目に、1回1ページであることを書く", async () => {
  const html = await readFile(printPageUrl, "utf8");
  assert.match(
    html,
    /印刷版は1回1ページです。必要な回のページだけを選んで印刷してください。/,
    "刷り方の説明が紙面に無い",
  );
  assert.match(html, /class="print-howto"/);
});

test("送り方のラベルと2通目の手順が紙面にも出る", async () => {
  const html = await readFile(printPageUrl, "utf8");
  for (const type of Object.values(SEND_TYPES)) {
    const used = challenges.some((challenge) => challenge.send.type === type.id);
    if (used) assert.ok(html.includes(escapeHtml(type.label)), `送り方が無い: ${type.label}`);
  }
  assert.ok(html.includes("1回目 —"));
  assert.ok(html.includes("2回目 —"));
  for (const step of FOLLOW_UP_STEPS) {
    assert.ok(html.includes(escapeHtml(step.text)), `2通目の手順が無い: ${step.text}`);
  }
});

// A4のPDFで右の列が切れた原因を、そのまま固定する。
// 折り返せない中身が1つあると、grid の列が紙幅を越えて押し広げられた。
// これはソーステストでは検出できなかったので、原因の指定だけを見張る。
// 紙面が本当に収まっているかは、実PDFのページ幅で確認する必要がある。
test("印刷の段組みが、紙幅を越えない指定になっている", async () => {
  const css = await readFile(new URL("../css/print.css", import.meta.url), "utf8");
  const rule = (selector) => {
    const match = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, "s").exec(css);
    assert.ok(match, `CSSに無い: .${selector}`);
    return match[1];
  };

  // 1fr の最小値は auto（min-content）。0 まで縮められるようにしておく。
  const grid = rule("card-grid");
  assert.match(grid, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(grid, /repeat\(\s*\d+\s*,\s*1fr\s*\)/, "1fr の裸指定が戻っている");

  assert.match(rule("print-challenge"), /min-width:\s*0/);

  // ラベルと下線を同じ要素に入れているため、nowrap にすると
  // ラベル文まで折り返せなくなり、列幅を押し広げる。
  const write = rule("print-write");
  assert.doesNotMatch(write, /white-space:\s*nowrap/, "記入欄が折り返せない指定に戻っている");
  assert.doesNotMatch(write, /overflow:\s*hidden/, "切れたことに気づけない指定に戻っている");
});

test("ゲーム由来の語を紙面にも残さない", async () => {
  const html = await readFile(printPageUrl, "utf8");
  for (const word of ["クエスト", "称号", "ポイント", "7つの力", "７つの力"]) {
    assert.ok(!html.includes(word), `紙面に残っている: ${word}`);
  }
});
