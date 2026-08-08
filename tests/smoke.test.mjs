import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { challenges } from "../js/challenges.js";
import { promptLimits, withLimits } from "../js/view-model.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};
const STORAGE_KEY = "lesson-improve-ai-30-tried-v1";
// 資料を添付する回。1回目のラベルと補足の確認に使う。
const ATTACH_ID = 15;
// 空欄をうめて送る回。送る前の考えが1回目の文に入ることの確認に使う。
const FILL_ID = 1;

let server;
let baseURL;

test.before(async () => {
  server = createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      let filePath = resolve(ROOT, `.${pathname}`);
      if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${sep}`)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, "index.html");
      const info = await stat(filePath);
      response.writeHead(200, {
        "Content-Length": info.size,
        "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      });
      if (request.method === "HEAD") response.end();
      else createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((done, reject) => {
    server.close((error) => (error ? reject(error) : done()));
  });
});

async function withPage(run, viewport = { width: 390, height: 844 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__copied = text; } },
    });
  });
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

test("どの画面幅でも横にはみ出さない", async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
      { width: 1440, height: 1000 },
    ]) {
      const page = await browser.newPage({ viewport });
      for (const pathname of ["/", "/print.html"]) {
        await page.goto(`${baseURL}${pathname}`, { waitUntil: "networkidle" });
        const size = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.ok(size.scroll <= size.client, `${pathname} が ${viewport.width}px で溢れる`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("一覧の絞り込みと、やってみたの記録が動く", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    assert.equal(await page.locator(".card").count(), 30);
    assert.match(await page.locator("#summary").innerText(), /0\s*\/\s*30/);

    await page.locator('[data-filter="material"]').click();
    assert.equal(await page.locator(".card").count(), 5);
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator(".card").count(), 30);

    await page.locator('.card[data-challenge-id="1"] .card__open').click();
    assert.equal(new URL(page.url()).hash, "#c-1");
    await page.getByRole("button", { name: "やってみたことにする" }).click();
    assert.match(await page.locator("#summary").innerText(), /1\s*\/\s*30/);

    await page.reload({ waitUntil: "networkidle" });
    assert.match(await page.locator("#summary").innerText(), /1\s*\/\s*30/);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), "[1]");
  });
});

test("1回目と2回目が分かれ、番号が通しで振られる", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${ATTACH_ID}`, { waitUntil: "networkidle" });
    const detail = page.locator("#challenge-detail");

    assert.match(await detail.innerText(), /1回目 — 資料を添付してから送る/);
    assert.match(await detail.innerText(), /2回目 — 空欄をうめてから送る/);
    assert.match(await page.locator(".reply").innerText(), /^返事が来ます/);

    // 手順の番号は返事を挟んでも1に戻さない
    const values = await page.locator(".steps__item").evaluateAll(
      (items) => items.map((item) => Number(item.value)),
    );
    assert.deepEqual(values, values.map((_, index) => index + 1));

    // 添付と文章は同じメッセージで、送信は1回
    const stepText = await page.locator(".steps").first().innerText();
    assert.match(stepText, /同じメッセージ/);
    assert.match(stepText, /1回で送信/);
  });
});

test("そのまま送る文と、空欄をうめる文が別物として示される", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${ATTACH_ID}`, { waitUntil: "networkidle" });

    // コピーされる文は「本文 + 空行 + 共通の制約」。画面では制約を別行に出すため、
    // DOMの textContent と突き合わせると区切りの改行のぶんだけ食い違う。
    // 期待値は本文データから組み立てて、コピーの中身そのものを確かめる。
    const challenge = challenges.find((item) => item.id === ATTACH_ID);
    const sendPrompt = withLimits(challenge.send.prompt, challenge.send.type);
    await page.getByRole("button", { name: "この文章をコピー" }).click();
    assert.equal(await page.evaluate(() => window.__copied), sendPrompt);
    // 本文と制約は空行で区切る。制約の先頭は送り方で変わる（資料を渡す回は一文増える）。
    assert.match(sendPrompt, /\n\n/);
    assert.ok(sendPrompt.endsWith(promptLimits(challenge.send.type)));

    // 空欄は文の中の入力欄。組み立て結果を別に置かない。
    assert.equal(await page.locator('[data-prompt="fill"]').count(), 1);
    assert.equal(await page.locator('[data-prompt="fill"] #blank-input').count(), 1);

    await page.locator(".hint").first().click();
    const hint = await page.locator(".hint").first().textContent();
    assert.equal(await page.locator("#blank-input").inputValue(), hint);

    await page.locator("#blank-input").fill("じぶんの言葉");
    await page.getByRole("button", { name: "うめた文をコピー" }).click();
    const copied = await page.evaluate(() => window.__copied);
    assert.match(copied, /じぶんの言葉/);
    assert.notEqual(copied, sendPrompt);
    assert.doesNotMatch(copied, /____/);

    // 書いた言葉は端末に残さない
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#blank-input").inputValue(), "");
    const stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", STORAGE_KEY);
    assert.ok(!stored.includes("じぶんの言葉"));
  });
});

// 空欄をうめて送る回は、自分の見立てを書く行為と送る文を組み立てる行為が1つになる。
// 記入欄を別に立てないので、入力欄は送る文の中だけにある。
test("空欄をうめて送る回は、1回目の文そのものが入力欄になる", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${FILL_ID}`, { waitUntil: "networkidle" });
    const detail = page.locator("#challenge-detail");

    assert.equal(await detail.locator('[data-prompt="send"] #send-input').count(), 1);
    // 画面に置く入力欄は、1回目と2回目の空欄の2つだけ
    assert.equal(await detail.locator("input").count(), 2);

    await detail.locator("[data-sendhint]").click();
    const hint = await detail.locator("[data-sendhint]").textContent();
    assert.equal(await page.locator("#send-input").inputValue(), hint);

    await page.locator("#send-input").fill("判断が変わる場面");
    await page.getByRole("button", { name: "うめた文をコピー" }).first().click();
    const copied = await page.evaluate(() => window.__copied);
    assert.match(copied, /判断が変わる場面/);
    assert.doesNotMatch(copied, /____/);

    // 書いた言葉は端末に残さない
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#send-input").inputValue(), "");
    const stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", STORAGE_KEY);
    assert.ok(!stored.includes("判断が変わる場面"));
  });
});

test("補足はマウスがなくても押して開け、指で押せる大きさがある", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${ATTACH_ID}`, { waitUntil: "networkidle" });

    const help = page.locator(".help__button").first();
    const panel = page.locator(".help__panel").first();
    assert.equal(await panel.evaluate((node) => node.hidden), true);
    assert.equal(await help.getAttribute("aria-expanded"), "false");

    // マウスは乗せた時点で開く（ホバー）
    await help.hover();
    assert.equal(await panel.evaluate((node) => node.hidden), false);

    // 押した場合は、そのあと離れても開いたまま
    await help.click();
    assert.equal(await panel.evaluate((node) => node.hidden), false);
    assert.equal(await help.getAttribute("aria-expanded"), "true");
    await page.locator("#dialog-title").hover();
    assert.equal(await panel.evaluate((node) => node.hidden), false, "押して開いたものが閉じてしまう");
    assert.match(await panel.innerText(), /クリップ|1回|新しいメッセージ|長押し/);
  });
});

test("携帯で、操作できるものが44px以上ある", async () => {
  await withPage(async (page) => {
    for (const id of [1, 5, 19, 27, 30]) {
      await page.goto(`${baseURL}/#c-${id}`, { waitUntil: "networkidle" });
      const small = await page.locator("#challenge-detail button, #challenge-detail input")
        .evaluateAll((nodes) => nodes
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.height > 0 && rect.height < 44;
          })
          .map((node) => `${(node.textContent || node.id).trim()} h=${Math.round(node.getBoundingClientRect().height)}`));
      assert.deepEqual(small, [], `c-${id} に小さすぎる操作がある`);
    }
    await page.locator("#close-dialog").click();
    const cardControls = await page.locator(".card__open, .filter-button")
      .evaluateAll((nodes) => nodes
        .filter((node) => node.getBoundingClientRect().height < 44).length);
    assert.equal(cardControls, 0);
  });
});

test("安全上の注意は畳まず、常に見えている", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${ATTACH_ID}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".safety").isVisible(), true);
    assert.match(await page.locator(".safety").innerText(), /児童A/);
    assert.match(
      await page.locator("#challenge-detail").innerText(),
      /名前など個人が分かる言葉は書かないでください。/,
    );
  });
});

test("URLで直接ひらけ、共有できる", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-12`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#challenge-dialog[open]").count(), 1);

    await page.getByRole("button", { name: "この回のURLをコピー" }).click();
    assert.match(await page.evaluate(() => window.__copied), /#c-12$/);

    await page.locator("#close-dialog").click();
    await page.waitForFunction(() => window.location.hash === "");
    assert.equal(await page.locator("#challenge-dialog[open]").count(), 0);
  });
});

test("記録の削除は確認をはさむ", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.locator('.card[data-challenge-id="2"] .card__open').click();
    await page.getByRole("button", { name: "やってみたことにする" }).click();
    await page.locator("#close-dialog").click();
    assert.match(await page.locator("#summary").innerText(), /1\s*\/\s*30/);

    await page.getByRole("button", { name: "記録を消す" }).click();
    await page.getByRole("button", { name: "やめる" }).click();
    assert.match(await page.locator("#summary").innerText(), /1\s*\/\s*30/);

    await page.getByRole("button", { name: "記録を消す" }).click();
    await page.getByRole("button", { name: "消す", exact: true }).click();
    assert.match(await page.locator("#summary").innerText(), /0\s*\/\s*30/);
  }, { width: 1280, height: 900 });
});
