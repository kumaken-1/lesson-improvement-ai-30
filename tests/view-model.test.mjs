import assert from "node:assert/strict";
import test from "node:test";

import { challenges } from "../js/challenges.js";
import {
  BLANK_MARKER,
  CATEGORY_NAMES,
  CLOSING_LABEL,
  CLOSING_TEXT,
  CORE_NOTE,
  DECIDE_CHOICES,
  DECIDE_LABEL,
  DECIDE_NOTE,
  DECIDE_REASON_LABEL,
  DECIDE_REASON_TOGGLE,
  FILL_TYPE,
  MATERIAL_LIMITS,
  PROMPT_LIMITS,
  promptLimits,
  withLimits,
  FOLLOW_UP_STEPS,
  HELP_TEXTS,
  HYPOTHESIS_LABEL,
  HYPOTHESIS_NOTE,
  SAFETY_NOTE,
  SEND_TYPES,
  buildFilledText,
  categoryCounts,
  classifyChallengeHash,
  createViewModel,
  decideOptions,
  filterChallenges,
  getChallengeById,
  getFocusSelector,
  numberedSteps,
  parseChallengeHash,
  splitTemplate,
  usesPromptBlank,
} from "../js/view-model.js";

test("送り方は4種で、ラベルとアイコンが色とは別に用意されている", () => {
  assert.deepEqual(Object.keys(SEND_TYPES), ["fill", "paste", "attach", "asis"]);
  for (const type of Object.values(SEND_TYPES)) {
    assert.ok(type.label.length > 0);
    assert.ok(type.short.length > 0);
    assert.ok(type.icon.length > 0);
  }
  // 2回目は全30回とも空欄をうめて送るため、1回目の fill と同じ見せ方にする。
  assert.equal(FILL_TYPE.label, "空欄をうめてから送る");
  assert.equal(FILL_TYPE, SEND_TYPES.fill);
  assert.ok(FILL_TYPE.icon.length > 0);
});

// 送る前の仮説、採用・修正・却下、変える一点。
// 全30回で同じ文なので、回ごとの本文ではなくここに置く。
test("教師が決める場面の共通文がそろっている", () => {
  for (const text of [
    HYPOTHESIS_LABEL,
    HYPOTHESIS_NOTE,
    DECIDE_LABEL,
    DECIDE_NOTE,
    DECIDE_REASON_LABEL,
    CLOSING_LABEL,
    CLOSING_TEXT,
  ]) {
    assert.ok(typeof text === "string" && text.length >= 8);
  }
  assert.deepEqual(DECIDE_CHOICES.map(({ id }) => id), ["adopt", "revise", "reject"]);
  assert.match(DECIDE_NOTE, /却下/);
  assert.match(CLOSING_TEXT, /一行/);
  assert.match(SAFETY_NOTE, /児童A/);
});

// AIが検索して長い回答を返すと、着眼点にたどり着く前に読む負荷が勝つ。
// 制約は回ごとの本文ではなく共通で持ち、30回に必ず付くようにする。
test("1回目には、検索させず回答を短くする制約が必ず付く", () => {
  assert.match(PROMPT_LIMITS, /Web検索はせず/);
  assert.match(PROMPT_LIMITS, /2文以内/);
  assert.deepEqual(Object.keys(MATERIAL_LIMITS).sort(), ["attach", "paste"]);

  // 空欄をうめて送る回は渡す資料がないので、資料向けの一文は付かない
  assert.equal(promptLimits("fill"), PROMPT_LIMITS);
  assert.match(promptLimits("paste"), /貼った内容にない一般論/);
  assert.match(promptLimits("attach"), /資料にない一般論/);

  for (const item of challenges) {
    const full = withLimits(item.send.prompt, item.send.type);
    assert.ok(full.startsWith(item.send.prompt), `id ${item.id} の本文が変わっている`);
    assert.ok(full.endsWith(PROMPT_LIMITS), `id ${item.id} に制約が付いていない`);
    if (item.send.type === "paste" || item.send.type === "attach") {
      assert.ok(full.includes(MATERIAL_LIMITS[item.send.type]), `id ${item.id} に資料の制約がない`);
    }
    // 制約を回ごとの本文へ二重に書いていないか
    assert.ok(!item.send.prompt.includes("Web検索"), `id ${item.id} が制約を本文に持っている`);
  }
});

// 個数を指定する回は、各案が長くなりやすい。
test("2回目で個数を指定する回は、1案を1文に制限する", () => {
  for (const item of challenges) {
    const { template } = item.followUp;
    if (/[0-9１-９]つ/.test(template)) {
      assert.match(template, /各1文/, `id ${item.id} の2回目に1文制限がない`);
    }
  }
});

// 4か所すべて埋めないと終わらない教材に見せない。
test("書く終点を先に示し、理由の記入は任意にする", () => {
  assert.match(CORE_NOTE, /最初の考えと最後の一点だけ書けば完了/);
  assert.match(DECIDE_REASON_TOGGLE, /任意/);
  assert.match(CLOSING_LABEL, /ここまで書けば完了/);
});

test("三択の文は回ごとに持ち、空欄をうめて送る回だけ1回目に空欄がある", () => {
  const filled = challenges.find((item) => item.send.type === "fill");
  const pasted = challenges.find((item) => item.send.type === "paste");
  assert.equal(usesPromptBlank(filled), true);
  assert.equal(usesPromptBlank(pasted), false);

  const options = decideOptions(filled);
  assert.deepEqual(options.map(({ id }) => id), ["adopt", "revise", "reject"]);
  assert.equal(options[0].text, filled.decide.adopt);
  assert.ok(options.every(({ head }) => head.length > 0));
});

test("共通の補足は4本で、名前と本文を持つ", () => {
  assert.deepEqual(Object.keys(HELP_TEXTS).sort(), ["attach", "newmsg", "once", "paste"]);
  for (const help of Object.values(HELP_TEXTS)) {
    assert.ok(help.title.length > 0);
    assert.ok(help.body.length >= 30);
  }
});

test("2通目の手順は共通で、新しいメッセージだと補足がつく", () => {
  assert.equal(FOLLOW_UP_STEPS.length, 2);
  assert.equal(FOLLOW_UP_STEPS[1].help, "newmsg");
  assert.match(FOLLOW_UP_STEPS[1].text, /新しいメッセージ/);
  assert.match(SAFETY_NOTE, /入力しません/);
});

test("手順の番号は1回目から2回目まで通しで振る", () => {
  for (const challenge of challenges) {
    const { send, follow } = numberedSteps(challenge);
    assert.deepEqual(send.map(({ number }) => number), send.map((_, i) => i + 1));
    assert.equal(follow[0].number, send.length + 1);
    assert.equal(follow[1].number, send.length + 2);
  }
});

test("カテゴリーの件数を数え、絞り込める", () => {
  const counts = categoryCounts(challenges);
  assert.equal(counts.reduce((total, item) => total + item.count, 0), 30);
  for (const item of counts) {
    assert.equal(filterChallenges(challenges, item.id).length, item.count);
    assert.ok(CATEGORY_NAMES[item.id].length > 0);
  }
  assert.equal(filterChallenges(challenges, "all").length, 30);
  assert.equal(filterChallenges(challenges, "unknown").length, 30);
});

test("URLの断片は c-1 から c-30 だけを受け付ける", () => {
  assert.equal(parseChallengeHash("#c-12"), 12);
  for (const hash of ["", "#c-0", "#c-31", "#c-1-extra", "#C-1", "#quest-1"]) {
    assert.equal(parseChallengeHash(hash), null);
  }
  assert.deepEqual(classifyChallengeHash(""), { type: "empty", id: null });
  assert.deepEqual(classifyChallengeHash("#c-3"), { type: "valid", id: 3 });
  assert.deepEqual(classifyChallengeHash("#nope"), { type: "invalid", id: null });
});

test("番号から該当のチャレンジと戻り先を引ける", () => {
  assert.equal(getChallengeById(challenges, 1)?.id, 1);
  assert.equal(getChallengeById(challenges, "12")?.id, 12);
  assert.equal(getChallengeById(challenges, "12x"), null);
  assert.equal(getChallengeById(challenges, 31), null);
  assert.equal(getFocusSelector(1), '[data-open="1"]');
  assert.equal(getFocusSelector(0), null);
  assert.equal(getFocusSelector("1"), null);
});

test("空欄は前後に割れ、埋めた語で組み立てられる", () => {
  const template = `「${BLANK_MARKER}」が気になりました。`;
  assert.deepEqual(splitTemplate(template), { before: "「", after: "」が気になりました。" });
  assert.equal(buildFilledText(template, "言い回し"), "「言い回し」が気になりました。");
  assert.match(buildFilledText(template, ""), /「　+」/);
  assert.match(buildFilledText(template, "   "), /「　+」/);
  assert.deepEqual(splitTemplate("空欄なし"), { before: "空欄なし", after: "" });
});

test("表示用のデータに、種別と試した印がそろう", () => {
  const model = createViewModel(challenges[0], [1]);
  assert.equal(model.categoryName, CATEGORY_NAMES[challenges[0].category]);
  assert.equal(model.sendType.id, challenges[0].send.type);
  assert.equal(model.tried, true);
  assert.equal(model.steps.send.length, challenges[0].send.steps.length);
  assert.equal(model.steps.follow.length, 2);
  assert.equal(model.decideChoices.length, 3);
  assert.equal(model.promptBlank, usesPromptBlank(challenges[0]));

  assert.equal(createViewModel(challenges[1], [1]).tried, false);
});
