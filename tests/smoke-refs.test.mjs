import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CATEGORIES, challenges } from "../js/challenges.js";

// Playwrightがこの環境でクラッシュしてtest:smokeを実行できないため、
// smoke.test.mjs内の決め打ち参照（data-filter・ATTACH_ID等）が
// 現在のchallenges.jsとずれていないかだけを静的に検査する。
// 他の巻からpublic_siteを複製したときに、旧巻のIDが残っていないかを
// pushする前にローカルで検知するための代替チェック。

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readSmokeSource() {
  return readFile(resolve(ROOT, "tests/smoke.test.mjs"), "utf8");
}

test("smoke.test.mjsのdata-filterが現在のCATEGORIESと一致する", async () => {
  const smoke = await readSmokeSource();
  const categoryIds = new Set(CATEGORIES.map(({ id }) => id));
  const referenced = [...smoke.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(referenced.length > 0, "smoke.test.mjsにdata-filterの参照が見つかりません");
  for (const value of referenced) {
    assert.ok(
      value === "all" || categoryIds.has(value),
      `data-filter="${value}" は現在のCATEGORIESに存在しません（巻を複製したときの古いカテゴリーIDが残っていないか確認）`,
    );
  }
});

test("smoke.test.mjsのATTACH_ID／FILL_ID／PASTE_IDが現在のchallengesと型が一致する", async () => {
  const smoke = await readSmokeSource();
  const expectedType = { ATTACH: "attach", FILL: "fill", PASTE: "paste" };
  const matches = [...smoke.matchAll(/const\s+(ATTACH|FILL|PASTE)_ID\s*=\s*(\d+)/g)];
  for (const [, label, idText] of matches) {
    const id = Number(idText);
    const challenge = challenges.find((c) => c.id === id);
    assert.ok(challenge, `${label}_ID = ${id} は現在のchallengesに存在しません`);
    assert.equal(
      challenge.send.type,
      expectedType[label],
      `${label}_ID = ${id} は send.type="${challenge.send.type}" で、期待する"${expectedType[label]}"と一致しません（巻を複製したときの古いIDが残っていないか確認）`,
    );
  }
});
