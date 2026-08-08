import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const MATERIALS = [
  "sample-text.md",
  "sample-reflection.md",
  "sample-board-plan.md",
  "sample-worksheet.md",
  "sample-lesson-record.md",
];

test("READMEが企画の前提と運用を説明している", async () => {
  const readme = await read("../README.md");

  for (const phrase of [
    "自由参加",
    "順番も速さも自由",
    "ランキング",
    "生成AIを開けないとき",
    "localStorage",
    "収集しません",
    "外部API",
    "個人情報",
    "材料",
    "GitHub Pages",
    "npm test",
    "npm run build:print",
    "js/challenges.js",
    "MIT License",
    "CC BY 4.0",
  ]) {
    assert.ok(readme.includes(phrase), `READMEに無い: ${phrase}`);
  }
});

test("READMEが手順・色・補足・記録の扱いを説明している", async () => {
  const readme = await read("../README.md");

  for (const phrase of [
    "手順の番号は1回目から2回目まで通しで振ってあります",
    "添付と文章が同じメッセージで、送信は1回",
    "空欄をうめてから送る",
    "自分の文を貼ってから送る",
    "資料を添付してから送る",
    "ラベルとアイコンだけで何をするか決まる",
    "押しても、マウスを乗せても開きます",
    "添付ボタンの場所",
    "端末にも保存しません",
    ...MATERIALS,
  ]) {
    assert.ok(readme.includes(phrase), `READMEに無い: ${phrase}`);
  }
});

// 校務版の言い換えではないこと、AIの出力が主役ではないことを、READMEで明示する。
test("READMEが対象者と、教師の判断が中心であることを明示している", async () => {
  const readme = await read("../README.md");

  for (const phrase of [
    "使わないという判断も、その回の結論です",
    "次の授業で変える一点",
    "学習指導要領",
    "教師の判断を一つ前へ進める",
    "個人が分かる情報を取り除く手順を、資料を渡す前の手順として示しています",
    "児童A",
  ]) {
    assert.ok(readme.includes(phrase), `READMEに無い: ${phrase}`);
  }
});

// 回答が長いと着眼点にたどり着く前に読む負荷が勝つ。
// 操作の型はⅠ・Ⅱと変えない。参加のたびにやり方を覚え直さずにすむようにする。
test("READMEが回答量の制約と、シリーズ共通の型を説明している", async () => {
  const readme = await read("../README.md");

  for (const phrase of [
    "Web検索はせず、ここに書いた情報だけを使ってください",
    "各項目は2文以内で書いてください",
    "PROMPT_LIMITS",
    "10回講座（Ⅰ）と校務版（Ⅱ）と同じ進み方です",
    "記入欄を別に立てていません",
    "書く場所はこの画面ではなく",
  ]) {
    assert.ok(readme.includes(phrase), `READMEに無い: ${phrase}`);
  }
});

// 30枚まとめて配る冊子ではなく、必要な回だけ刷って使う。
test("READMEが印刷の使い方を説明している", async () => {
  const readme = await read("../README.md");

  for (const phrase of [
    "A4縦2列で全15ページ",
    "1回分が2ページに分かれることはありません",
    "記入欄は置いていません",
  ]) {
    assert.ok(readme.includes(phrase), `READMEに無い: ${phrase}`);
  }
});

test("廃止した仕掛けと、旧版の呼び方を残さない", async () => {
  const readme = await read("../README.md");
  for (const word of [
    "7つの力",
    "７つの力",
    "称号",
    "ポイント",
    "クエスト",
    "3ステップ",
    "今日のおすすめ",
    "夏の自由研究",
  ]) {
    assert.ok(!readme.includes(word), `READMEに残っている: ${word}`);
  }
});

// 教室で失敗しやすい形を素材そのものに埋め込む。教師が兆候を見つける練習になる。
test("練習用の素材が架空で、直すところを含むと明示している", async () => {
  for (const name of MATERIALS) {
    const material = await read(`../assets/${name}`);
    assert.match(material, /練習用/, `練習用と書かれていない: ${name}`);
    assert.match(material, /実在の[^\n]*とは関係ありません/, `架空だと書かれていない: ${name}`);
    assert.match(material, /わざと|書き下ろした/, `直すところを含むと書かれていない: ${name}`);
    assert.ok(!material.includes("クエスト"), `旧版の呼び方が残っている: ${name}`);
  }
});

// 子どもの氏名が残った実物を持ち込ませないため、素材側でも置き換え済みだと示す。
test("子どもが登場する素材は役割名に置き換えてある", async () => {
  for (const name of ["sample-reflection.md", "sample-lesson-record.md"]) {
    const material = await read(`../assets/${name}`);
    assert.match(material, /児童A/, `役割名になっていない: ${name}`);
    assert.match(material, /置き換え/, `置き換えたと書かれていない: ${name}`);
  }
});

// READMEを読まない利用者でも素材にたどり着けるようにする。
test("講座の画面から練習用の素材へ移動できる", async () => {
  const html = await read("../index.html");

  for (const asset of MATERIALS) {
    assert.match(
      html,
      new RegExp(`<a\\s+href="\\./assets/${asset.replaceAll(".", "\\.")}"`),
      `画面から開けない素材がある: ${asset}`,
    );
  }
  assert.match(html, /すべて架空の内容で、実在の学校・自治体・人物とは関係ありません/);
  assert.match(html, /教室で失敗しやすい形をわざと入れてあります/);
});

test("コードとコンテンツのライセンスが分かれている", async () => {
  const codeLicense = await read("../LICENSE-CODE");
  const contentLicense = await read("../LICENSE-CONTENT");

  assert.match(codeLicense, /MIT License/);
  assert.match(codeLicense, /Permission is hereby granted, free of charge/);
  assert.match(contentLicense, /Creative Commons Attribution 4\.0 International/);
  assert.match(contentLicense, /CC BY 4\.0/);
});

test("404ページは自己完結していて、相対リンクで戻る", async () => {
  const html = await read("../404.html");

  assert.match(html, /<html\s+lang="ja"/i);
  assert.match(html, /<meta\s+charset="utf-8"/i);
  assert.match(html, /<meta\s+name="viewport"/i);
  assert.match(html, /<main[\s>]/i);
  assert.match(html, /<a\s+href="\.\/">[\s\S]*トップへ戻る[\s\S]*<\/a>/i);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  assert.doesNotMatch(html, /<script/i);
  assert.ok(!html.includes("クエスト"), "404ページに旧版の呼び方が残っている");
});
