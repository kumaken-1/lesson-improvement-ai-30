import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

    const sendPrompt = await page.locator('[data-prompt="send"]').textContent();
    await page.getByRole("button", { name: "この文章をコピー" }).click();
    assert.equal(await page.evaluate(() => window.__copied), sendPrompt);

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

// AIの出力が主役に見える画面にしない。
// 送る前の考えと、採用・修正・却下が、画面上の行為として動くことを確かめる。
test("送る前に自分の考えを書き、採用・修正・却下を選べる", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${ATTACH_ID}`, { waitUntil: "networkidle" });
    const detail = page.locator("#challenge-detail");

    // 並び順。返事より前に自分の考えを書く欄がある。
    const text = await detail.innerText();
    const order = ["送る前に", "1回目 —", "返事が来ます", "返事を読んで決める", "2回目 —", "最後に"];
    let previous = -1;
    for (const label of order) {
      const index = text.indexOf(label);
      assert.notEqual(index, -1, `画面に無い: ${label}`);
      assert.ok(index > previous, `並び順が違う: ${label}`);
      previous = index;
    }

    // 却下を選んで終わってよいことが、画面に書かれている
    assert.match(text, /却下を選んで終わってよい回もあります/);
    // どこまで書けば終わりかを、開いてすぐに示す
    assert.match(text, /時間がないときは、最初の考えと最後の一点だけ書けば完了です。/);
    // 回答を短くする制約が1回目の文に出る
    assert.match(await page.locator('[data-prompt="send"]').innerText(), /Web検索はせず/);

    await page.locator("#hypothesis-input").fill("じぶんの見立て");

    // 理由の記入欄は、判断を選ぶまで出さない
    assert.equal(await page.locator("#reason-toggle").isVisible(), false);
    assert.equal(await page.locator("#reason-field").isVisible(), false);

    assert.equal(await page.locator('[data-decide="reject"]').getAttribute("aria-pressed"), "false");
    await page.locator('[data-decide="reject"]').click();
    assert.equal(await page.locator('[data-decide="reject"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-decide="adopt"]').getAttribute("aria-pressed"), "false");

    // 選んだあとに開けるようになる。開くまで入力欄は出ない。
    assert.equal(await page.locator("#reason-toggle").isVisible(), true);
    assert.equal(await page.locator("#reason-field").isVisible(), false);
    await page.locator("#reason-toggle").click();
    assert.equal(await page.locator("#reason-field").isVisible(), true);
    await page.locator("#reason-input").fill("りゆう");

    // 押し直すと選び直せる。決めきれない回もある。
    await page.locator('[data-decide="reject"]').click();
    assert.equal(await page.locator('[data-decide="reject"]').getAttribute("aria-pressed"), "false");
    // 判断を外したら、理由欄も畳む
    assert.equal(await page.locator("#reason-toggle").isVisible(), false);
    assert.equal(await page.locator("#reason-field").isVisible(), false);

    // 判断を選んでも、書いた言葉が消えない
    assert.equal(await page.locator("#hypothesis-input").inputValue(), "じぶんの見立て");

    await page.locator("#next-input").fill("かえる一点");

    // 書いた言葉は端末に残さない
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#hypothesis-input").inputValue(), "");
    assert.equal(await page.locator("#reason-input").inputValue(), "");
    assert.equal(await page.locator("#next-input").inputValue(), "");
    const stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", STORAGE_KEY);
    for (const word of ["じぶんの見立て", "りゆう", "かえる一点"]) {
      assert.ok(!stored.includes(word), `端末に残っている: ${word}`);
    }
  });
});

// 空欄をうめて送る回は、送る前の考えがそのまま1回目の文に入る。
// 仮説を書く欄と送る文の空欄を分けると、同じことを2回書かせることになる。
test("空欄をうめて送る回は、自分の考えが1回目の文に入る", async () => {
  await withPage(async (page) => {
    await page.goto(`${baseURL}/#c-${FILL_ID}`, { waitUntil: "networkidle" });

    assert.equal(await page.locator('[data-prompt="send"] #hypothesis-input').count(), 1);
    await page.locator("#hypothesis-input").fill("判断が変わる場面");
    await page.getByRole("button", { name: "うめた文をコピー" }).first().click();
    const copied = await page.evaluate(() => window.__copied);
    assert.match(copied, /判断が変わる場面/);
    assert.doesNotMatch(copied, /____/);
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
