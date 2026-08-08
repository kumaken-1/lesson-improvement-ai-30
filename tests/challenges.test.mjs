import assert from "node:assert/strict";
import test from "node:test";

import { CATEGORIES, challenges } from "../js/challenges.js";
import { BLANK_MARKER, HELP_TEXTS, SEND_TYPES } from "../js/view-model.js";

const EXPECTED_CATEGORY_COUNTS = {
  material: 5,
  question: 5,
  children: 5,
  activity: 5,
  assess: 5,
  review: 5,
};

const countBlanks = (text) => String(text).split(BLANK_MARKER).length - 1;
const stepText = (item) => item.send.steps.map(({ text }) => text).join("\n");

test("30件が1から30まで重複なく並ぶ", () => {
  assert.equal(challenges.length, 30);
  assert.deepEqual(challenges.map(({ id }) => id), [...Array(30)].map((_, i) => i + 1));
  const titles = challenges.map(({ title }) => title);
  assert.equal(new Set(titles).size, 30, "題名が重複している");
});

test("カテゴリーは6種で、件数が設計どおり", () => {
  assert.deepEqual(CATEGORIES.map(({ id }) => id), Object.keys(EXPECTED_CATEGORY_COUNTS));
  assert.ok(CATEGORIES.every(({ name }) => name.length > 0));
  const counts = {};
  for (const item of challenges) counts[item.category] = (counts[item.category] ?? 0) + 1;
  assert.deepEqual(counts, EXPECTED_CATEGORY_COUNTS);
});

test("表示に必要なデータがそろっている", () => {
  const keys = ["id", "category", "title", "intro", "send", "reply", "followUp"];
  for (const item of challenges) {
    assert.deepEqual(Object.keys(item).sort(), [...keys].sort(), `id ${item.id}`);
    assert.ok(item.title.length >= 6, `id ${item.id} の題名が短すぎる`);
    assert.ok(item.intro.length >= 40, `id ${item.id} の紹介文が短すぎる`);
    const sendKeys = item.send.type === "fill"
      ? ["hint", "prompt", "steps", "type"]
      : ["prompt", "steps", "type"];
    assert.deepEqual(Object.keys(item.send).sort(), sendKeys, `id ${item.id}`);
    assert.ok(SEND_TYPES[item.send.type], `id ${item.id} の送り方が不正`);
    assert.ok(item.send.prompt.length > 0);
    assert.ok(item.send.steps.length >= 2, `id ${item.id} の手順が少なすぎる`);
    assert.deepEqual(Object.keys(item.followUp).sort(), ["hints", "template"], `id ${item.id}`);
  }
});

test("題名は場面の説明で、命令形を使わない", () => {
  for (const item of challenges) {
    assert.doesNotMatch(item.title, /せよ$|え$|よ$/, `id ${item.id}: ${item.title}`);
  }
});

test("紹介文は2文以上で、読み手の場面から入る", () => {
  for (const item of challenges) {
    assert.ok(item.intro.includes("\n"), `id ${item.id} の紹介文が1行しかない`);
  }
});

// 空欄をうめて送る回では、送る文の空欄が自分の見立ての置き場所になる。
// 記入欄を別に立てないので、空欄に何を入れるかは例で示す。
test("空欄をうめて送る回だけ、空欄に入れる語の例を持つ", () => {
  for (const item of challenges) {
    if (item.send.type === "fill") {
      assert.ok(item.send.hint?.trim().length > 0, `id ${item.id} に例がない`);
      assert.doesNotMatch(item.send.hint, /てください。?$|。$/, `id ${item.id} の例に文末表現がある`);
    } else {
      assert.equal(item.send.hint, undefined, `id ${item.id} に不要な例がある`);
    }
  }
});

test("2通目は空欄ひとつと例3つを持ち、言い回しが偏らない", () => {
  const templates = [];
  for (const item of challenges) {
    const { template, hints } = item.followUp;
    assert.equal(countBlanks(template), 1, `id ${item.id} の空欄が1つでない`);
    assert.equal(hints.length, 3, `id ${item.id} の例が3つでない`);
    for (const hint of hints) {
      assert.ok(hint.trim().length > 0);
      assert.doesNotMatch(hint, /てください。?$|。$/, `id ${item.id} の例に文末表現がある`);
    }
    templates.push(template);
  }
  assert.equal(new Set(templates).size, 30, "2通目の文が重複している");
  const leading = templates.filter((t) => t.startsWith("私は")).length;
  assert.ok(leading <= 10, `「私は」で始まる文が多すぎる: ${leading}`);
});

test("返事を読む場面が、毎回その回のねらいとして書かれている", () => {
  const replies = challenges.map(({ reply }) => reply);
  for (const [index, reply] of replies.entries()) {
    assert.match(reply, /^返事が来ます/, `id ${index + 1}`);
    assert.ok(reply.length >= 20, `id ${index + 1} の一行が短すぎる`);
  }
  assert.equal(new Set(replies).size, 30, "返事の一行が使い回されている");
});

test("手順は送信の回数と、同じメッセージであることを明示する", () => {
  for (const item of challenges) {
    const text = stepText(item);
    assert.match(text, /送信|送りま/, `id ${item.id} に送信の手順がない`);
    // 空欄をうめて送る回は資料も自分の文も足さないため、まとめて送る注意は要らない。
    if (item.send.type === "paste" || item.send.type === "attach") {
      assert.match(
        text,
        /同じメッセージ|同じ入力欄|まとめて/,
        `id ${item.id} で添付・貼り付けと文章が同じ送信だと分からない`,
      );
      assert.match(text, /1回/, `id ${item.id} に送信が1回だと書かれていない`);
    }
  }
});

// 空欄をうめて送る回では、その空欄が「送る前の自分の考え」の置き場所になる。
// 2か所に分けると同じことを2回書かせることになるため、ちょうど1個に限る。
test("空欄をうめて送る回だけ、1回目の文に空欄がちょうど1つある", () => {
  for (const item of challenges) {
    const blanks = countBlanks(item.send.prompt);
    if (item.send.type === "fill") {
      assert.equal(blanks, 1, `id ${item.id} の1回目の空欄が1つでない`);
    } else {
      assert.equal(blanks, 0, `id ${item.id} の1回目に空欄がある`);
    }
  }
});

test("補足は共通の4本だけを参照し、1件につき2個までにする", () => {
  const allowed = Object.keys(HELP_TEXTS);
  assert.deepEqual(allowed.sort(), ["attach", "newmsg", "once", "paste"]);
  for (const item of challenges) {
    const used = item.send.steps.filter(({ help }) => help).map(({ help }) => help);
    assert.ok(used.length <= 2, `id ${item.id} の補足が多すぎる: ${used.length}`);
    for (const help of used) {
      assert.ok(allowed.includes(help), `id ${item.id} に未知の補足 ${help}`);
    }
  }
});

// 授業改善では、全30回が自分の教材・授業案・授業記録・自分の考えを材料にする。
// 自分の材料が入らない回は、教科も教材も時間も設定されない一般論になる。
test("送り方の配分がかたよらない", () => {
  const counts = {};
  for (const item of challenges) counts[item.send.type] = (counts[item.send.type] ?? 0) + 1;
  assert.ok((counts.asis ?? 0) <= 3, `そのままコピーが多すぎる: ${counts.asis}`);
  assert.ok(counts.fill >= 12, `空欄をうめて送る回が ${counts.fill} 件`);
  assert.ok(counts.paste >= 6, `貼り付けが ${counts.paste} 件`);
  // 資料を用意する手間で止まる人が出るため、添付は少なめに保つ。
  assert.ok(counts.attach >= 3 && counts.attach <= 8, `添付が ${counts.attach} 件`);
});

test("資料を渡す回は、子どもが分かる情報を外す手順を含む", () => {
  for (const item of challenges.filter((c) => c.send.type === "attach")) {
    const text = stepText(item);
    assert.match(
      text,
      /名前|個人|置き換え|外し/,
      `id ${item.id} に、個人が分かる情報を外す手順がない`,
    );
  }
});

// 好きな回から始められるようにするため、回どうしを番号で参照しない。
test("ゲーム由来の語と、回どうしの参照を残さない", () => {
  const source = challenges.flatMap((item) => [
    item.title,
    item.intro,
    item.reply,
    item.send.prompt,
    item.send.hint ?? "",
    item.followUp.template,
    ...item.followUp.hints,
    ...item.send.steps.map(({ text }) => text),
  ]).join("\n");
  for (const word of ["クエスト", "ポイント", "称号", "レベル", "クリア", "７つの力", "7つの力"]) {
    assert.ok(!source.includes(word), `ゲーム由来の語が残っている: ${word}`);
  }
  assert.doesNotMatch(source, /第\s*\d+\s*回/, "回どうしを番号で参照している");
  assert.doesNotMatch(source, /チャレンジ\s*\d+/, "旧版の呼び方が残っている");
});

test("入力例に個人情報を求めない", () => {
  const source = challenges.flatMap((item) => [
    item.send.prompt,
    item.send.hint ?? "",
    item.followUp.template,
    ...item.followUp.hints,
  ]).join("\n");
  for (const forbidden of ["児童名", "保護者名", "職員名", "実名", "成績を", "健康情報", "顔写真"]) {
    assert.ok(!source.includes(forbidden), `個人情報の語が含まれる: ${forbidden}`);
  }
});

// AIに指導要領や理論を尋ねると、存在しない記述を作る。
// 入力は教師が持っている材料に限り、AIに求めるのは視点・反論・整理だけにする。
test("AIに外部の知識を尋ねる回がない", () => {
  for (const item of challenges) {
    const source = `${item.send.prompt}\n${item.followUp.template}`;
    for (const word of ["学習指導要領", "文部科学省", "解説書", "先行研究", "教育学"]) {
      assert.ok(!source.includes(word), `id ${item.id} が外部の知識を尋ねている: ${word}`);
    }
  }
});

// 対象は授業改善。校務の効率化や一般的なAI活用のお題は入れない。
test("全30回が授業改善のお題になっている", () => {
  const lessonWords = /授業|教材|発問|子ども|児童|交流|見取|振り返り|評価|板書|指導案|単元|学習/;
  for (const item of challenges) {
    assert.match(
      `${item.title}\n${item.intro}\n${item.send.prompt}`,
      lessonWords,
      `id ${item.id} が授業改善のお題になっていない`,
    );
  }
});

// 改善する一点が絞られていること。1回に複数の授業課題を詰め込まない。
test("1回で扱う判断が絞られている", () => {
  for (const item of challenges) {
    const asks = (item.send.prompt.match(/ください/g) ?? []).length;
    assert.ok(asks <= 4, `id ${item.id} でAIに頼んでいることが多すぎる: ${asks}`);
  }
});
