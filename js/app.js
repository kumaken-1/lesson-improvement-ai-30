import { challenges } from "./challenges.js";
import { createIcon } from "./icons.js";
import {
  checkStorageAvailability,
  clearTried,
  getLocalStorageSafely,
  isTried,
  loadTried,
  saveTried,
  toggleTried,
} from "./state.js";
import {
  CLOSING_NOTE,
  DECIDE_NOTE,
  FILL_TYPE,
  HELP_TEXTS,
  SAFETY_NOTE,
  buildFilledText,
  promptLimits,
  withLimits,
  categoryCounts,
  classifyChallengeHash,
  createViewModel,
  filterChallenges,
  getChallengeById,
  getFocusSelector,
  parseChallengeHash,
  splitTemplate,
  usesPromptBlank,
} from "./view-model.js";

const listRoot = document.querySelector("#challenge-list");
const filtersRoot = document.querySelector("#filters");
const summaryRoot = document.querySelector("#summary");
const dialog = document.querySelector("#challenge-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const detailRoot = document.querySelector("#challenge-detail");
const closeButton = document.querySelector("#close-dialog");
const toast = document.querySelector("#toast");
const dialogToast = document.querySelector("#dialog-toast");
const storageWarning = document.querySelector("#storage-warning");
const resetControls = document.querySelector(".reset-controls");
const resetButton = document.querySelector("#reset-tried");
const resetConfirmation = document.querySelector("#reset-confirmation");
const confirmResetButton = document.querySelector("#confirm-reset");
const cancelResetButton = document.querySelector("#cancel-reset");

const storage = getLocalStorageSafely();
let tried = storage ? loadTried(storage) : [];
let storageAvailable = Boolean(storage);
let activeFilter = "all";
let activeId = null;
let returnFocus = null;
let returnId = null;
let toastTimer;
let toastMessage = "";
let closeHandled = true;
// 利用者が書いた言葉。端末にも保存せず、画面を閉じると消える。
// 授業記録や子どもの発言に触れた言葉が端末に残らないようにするため、
// 「やってみた」の印以外は一切保存しない。
let blankDraft = "";
let sendDraft = "";

function clearDrafts() {
  blankDraft = "";
  sendDraft = "";
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("data-") || key.startsWith("aria-")) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter(Boolean));
  return node;
}

function renderToast() {
  const inDialog = dialog.open;
  toast.textContent = inDialog ? "" : toastMessage;
  dialogToast.textContent = inDialog ? toastMessage : "";
  toast.setAttribute("aria-hidden", String(inDialog));
  dialogToast.setAttribute("aria-hidden", String(!inDialog));
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastMessage = message;
  renderToast();
  toastTimer = setTimeout(() => {
    toastMessage = "";
    renderToast();
  }, 3500);
}

function showStorageWarning() {
  storageAvailable = false;
  storageWarning.hidden = false;
}

function persist() {
  if (!storageAvailable) return;
  try {
    saveTried(tried, storage);
  } catch {
    showStorageWarning();
  }
}

function renderSummary() {
  if (!summaryRoot) return;
  summaryRoot.replaceChildren(
    el("p", { className: "summary__count" }, [
      el("strong", { text: `${tried.length}` }),
      document.createTextNode(` / ${challenges.length} 回を試しました`),
    ]),
    el("p", {
      className: "field-note",
      text: "順番も速さも自由です。1日に何回やっても、やらない日があってもかまいません。",
    }),
  );
}

function renderFilters() {
  const definitions = [
    { id: "all", name: "すべて", count: challenges.length },
    ...categoryCounts(challenges),
  ];
  filtersRoot.replaceChildren(el("ul", { className: "filter-list" },
    definitions.map((item) => el("li", {}, [
      el("button", {
        type: "button",
        className: `filter-button filter-button--${item.id}`,
        "data-filter": item.id,
        "aria-pressed": String(activeFilter === item.id),
      }, [
        el("span", { text: item.name }),
        el("span", { className: "filter-button__count", text: String(item.count) }),
      ]),
    ]))));
}

function renderCard(challenge) {
  const model = createViewModel(challenge, tried);
  return el("article", {
    className: model.tried ? "card card--tried" : "card",
    "data-category": model.category,
    "data-challenge-id": String(model.id),
  }, [
    el("p", { className: "card__top" }, [
      el("span", { className: `chip chip--${model.category}`, text: model.categoryName }),
      el("span", { className: `chip chip--send chip--${model.sendType.id}` }, [
        createIcon(model.sendType.icon),
        el("span", { text: model.sendType.short }),
      ]),
    ]),
    el("h3", { className: "card__title", text: model.title }),
    el("p", { className: "card__intro", text: model.intro.split("\n")[0] }),
    el("p", { className: "card__status" }, model.tried
      ? [createIcon("check"), el("span", { text: "やってみた" })]
      : [el("span", { text: "まだ" })]),
    el("button", {
      type: "button",
      className: "card__open",
      text: "ひらく",
      "data-open": String(model.id),
    }),
  ]);
}

function renderCards() {
  listRoot.replaceChildren(...filterChallenges(challenges, activeFilter).map(renderCard));
}

function helpBlock(helpId) {
  const help = HELP_TEXTS[helpId];
  if (!help) return null;
  const panel = el("span", {
    className: "help__panel",
    id: `help-${helpId}`,
    text: help.body,
    hidden: true,
  });
  const button = el("button", {
    type: "button",
    className: "help__button",
    "data-help": helpId,
    "aria-expanded": "false",
    "aria-controls": `help-${helpId}`,
  }, [createIcon("help", { size: 16 }), el("span", { text: "くわしく" })]);

  // マウスがない端末でも届くよう、押しても乗せても開く。
  // 乗せて開いたものは離れれば閉じ、押して開いたものは押すまで開いたまま。
  // 両方を「切り替え」にすると、マウスで押したとき開いた直後に閉じてしまう。
  const setOpen = (open) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("mouseenter", () => {
    if (button.dataset.pinned !== "true") setOpen(true);
  });
  button.addEventListener("mouseleave", () => {
    if (button.dataset.pinned !== "true") setOpen(false);
  });
  return el("span", { className: "help" }, [button, panel]);
}

function stepList(steps) {
  return el("ol", { className: "steps" }, steps.map((step) => el("li", {
    className: "steps__item",
    value: step.number,
  }, [
    el("span", { text: step.text }),
    step.help ? helpBlock(step.help) : null,
  ])));
}

// 全30回の1回目に同じ制約を付ける。回ごとの本文には書かない。
function limitsLine(model) {
  return el("span", { className: "prompt__limits", text: promptLimits(model.send.type) });
}

// 空欄をうめて送る回。文そのものが入力欄になる。
// 自分の見立てを書く行為と、送る文を組み立てる行為を1つにする。
function promptWithBlank(model) {
  const { before, after } = splitTemplate(model.send.prompt);
  const input = el("input", {
    type: "text",
    id: "send-input",
    className: "blank-input",
    value: sendDraft,
    placeholder: model.send.hint ?? "",
    autocomplete: "off",
    maxLength: 80,
  });
  input.addEventListener("input", () => {
    sendDraft = input.value;
  });
  return el("p", { className: "prompt prompt--fill", "data-prompt": "send" }, [
    el("span", { text: before }),
    input,
    el("span", { text: after }),
    limitsLine(model),
  ]);
}

function sendHints(model) {
  if (!model.promptBlank || !model.send.hint) return null;
  return el("p", { className: "hints" }, [
    el("span", { className: "hints__label", text: "例：" }),
    el("button", {
      type: "button",
      className: "hint",
      text: model.send.hint,
      "data-sendhint": model.send.hint,
    }),
  ]);
}

function promptBlock(model) {
  return el("section", { className: `block block--${model.sendType.id}` }, [
    el("p", { className: "block__label" }, [
      createIcon(model.sendType.icon),
      el("span", { text: `1回目 — ${model.sendType.label}` }),
    ]),
    stepList(model.steps.send),
    sendHints(model),
    model.promptBlank ? promptWithBlank(model) : el("p", {
      className: "prompt",
      "data-prompt": "send",
      tabIndex: -1,
    }, [
      el("span", { text: model.send.prompt }),
      limitsLine(model),
    ]),
    el("button", {
      type: "button",
      className: "copy-button",
      "data-copy": "send",
    }, [
      createIcon("copy"),
      el("span", { text: model.promptBlank ? "うめた文をコピー" : "この文章をコピー" }),
    ]),
  ].filter(Boolean));
}

function fillBlock(model) {
  const { before, after } = splitTemplate(model.followUp.template);
  const input = el("input", {
    type: "text",
    id: "blank-input",
    className: "blank-input",
    value: blankDraft,
    placeholder: model.followUp.hints[0] ?? "",
    autocomplete: "off",
    maxLength: 60,
  });
  // 文そのものが入力欄。別に組み立て結果を置くと、携帯でキーボードに隠れる。
  const sentence = el("p", { className: "prompt prompt--fill", "data-prompt": "fill" }, [
    el("span", { text: before }),
    input,
    el("span", { text: after }),
  ]);
  input.addEventListener("input", () => {
    blankDraft = input.value;
  });

  return el("section", { className: "block block--fill" }, [
    el("p", { className: "block__label" }, [
      createIcon(FILL_TYPE.icon),
      el("span", { text: `2回目 — ${FILL_TYPE.label}` }),
    ]),
    stepList(model.steps.follow),
    el("p", { className: "hints" }, [
      el("span", { className: "hints__label", text: "例：" }),
      ...model.followUp.hints.map((hint) => el("button", {
        type: "button",
        className: "hint",
        text: hint,
        "data-hint": hint,
      })),
    ]),
    sentence,
    el("p", { className: "field-note", text: "名前など個人が分かる言葉は書かないでください。書いた言葉は端末にも保存されません。" }),
    el("button", {
      type: "button",
      className: "copy-button",
      "data-copy": "fill",
    }, [createIcon("copy"), el("span", { text: "うめた文をコピー" })]),
  ]);
}

function renderDetail() {
  const challenge = getChallengeById(challenges, activeId);
  if (!challenge) return;
  const model = createViewModel(challenge, tried);
  dialogTitle.textContent = model.title;

  detailRoot.replaceChildren(
    el("p", { className: "detail__meta" }, [
      el("span", { className: `chip chip--${model.category}`, text: model.categoryName }),
      model.tried ? el("span", { className: "chip chip--tried" }, [
        createIcon("check"), el("span", { text: "やってみた" }),
      ]) : null,
    ]),
    el("div", { className: "detail__intro" },
      model.intro.split("\n").map((line) => el("p", { text: line }))),
    // 3段階（送る→読む→送る）を1本の流れとして見せる。丸い番号の印と縦線は stage-flow が受け持つ。
    el("div", { className: "stage-flow" }, [
      promptBlock(model),
      // 採用・修正・却下は、記入欄ではなく文で伝える。10回講座・校務版と操作の型を変えない。
      // smoke.test.mjs が .reply の全文を「返事が来ます」で始まると検査するため、
      // 段階の番号は（innerTextに含まれない）CSSの疑似要素の丸印だけで示す。
      el("p", { className: "reply" }, [
        createIcon("arrow"),
        el("span", {}, [
          el("span", { text: model.reply }),
          el("span", { className: "reply__decide", text: DECIDE_NOTE }),
        ]),
      ]),
      fillBlock(model),
    ]),
    el("p", { className: "closing-note" }, [
      createIcon("flag", { size: 16 }),
      el("span", { text: CLOSING_NOTE }),
    ]),
    el("p", { className: "safety" }, [
      createIcon("warning", { size: 16 }),
      el("span", { text: SAFETY_NOTE }),
    ]),
    el("div", { className: "detail__actions" }, [
      el("button", {
        type: "button",
        className: model.tried ? "tried-button tried-button--on" : "tried-button",
        "data-toggle-tried": String(model.id),
        "aria-pressed": String(model.tried),
      }, [createIcon("check"), el("span", { text: model.tried ? "やってみた" : "やってみたことにする" })]),
      el("button", {
        type: "button",
        className: "quiet-button",
        text: "この回のURLをコピー",
        "data-share": String(model.id),
      }),
    ]),
  );
}

function showDialog() {
  if (!dialog.open) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  renderToast();
}

function openChallenge(id, { updateHash = true, source = null } = {}) {
  const challenge = getChallengeById(challenges, id);
  if (!challenge) return;
  if (source && !dialog.open) {
    returnFocus = source;
    returnId = challenge.id;
  }
  activeId = challenge.id;
  clearDrafts();
  closeHandled = false;
  renderDetail();
  showDialog();
  if (updateHash && window.location.hash !== `#c-${challenge.id}`) {
    window.location.hash = `c-${challenge.id}`;
  }
  closeButton.focus();
}

function removeHash() {
  if (parseChallengeHash(window.location.hash)) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

// close イベントの発火はブラウザによって差があるため、閉じる処理から直接も呼ぶ。
// 二重に走っても害がないよう、開くたびに旗を戻す。
function finishClose() {
  if (closeHandled) return;
  closeHandled = true;
  activeId = null;
  clearDrafts();
  removeHash();
  const selector = getFocusSelector(returnId);
  const replacement = selector ? listRoot.querySelector(selector) : null;
  const target = returnFocus?.isConnected ? returnFocus : replacement;
  returnFocus = null;
  returnId = null;
  renderToast();
  if (target?.isConnected) {
    target.focus();
  } else {
    listRoot.tabIndex = -1;
    listRoot.focus();
  }
}

function closeDialog() {
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
  finishClose();
}

async function copyText(text, message) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(text);
    showToast(message);
    return true;
  } catch {
    return false;
  }
}

function promptTextFor(name) {
  const challenge = getChallengeById(challenges, activeId);
  if (!challenge) return "";
  if (name === "fill") return buildFilledText(challenge.followUp.template, blankDraft);
  const body = usesPromptBlank(challenge)
    ? buildFilledText(challenge.send.prompt, sendDraft)
    : challenge.send.prompt;
  return withLimits(body, challenge.send.type);
}

async function copyPrompt(name) {
  const text = promptTextFor(name);
  if (!text) return;
  const copied = await copyText(text, "コピーしました。ChatGPTなどの生成AIを開いて貼り付けてください。");
  if (!copied) showToast("コピーできませんでした。文章を選んでコピーしてください");
}

function refreshAll() {
  persist();
  renderSummary();
  renderCards();
  if (activeId) renderDetail();
}

function closeResetConfirmation() {
  resetConfirmation.hidden = true;
  resetButton.setAttribute("aria-expanded", "false");
  resetButton.focus();
}

function resetTried() {
  let cleared = false;
  if (storage) {
    try {
      clearTried(storage);
      cleared = true;
    } catch {
      showStorageWarning();
    }
  }
  tried = [];
  renderSummary();
  renderCards();
  if (activeId) renderDetail();
  closeResetConfirmation();
  showToast(cleared ? "記録を消しました" : "端末に保存された記録を削除できませんでした");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.filter) {
    activeFilter = button.dataset.filter;
    renderFilters();
    renderCards();
  } else if (button.dataset.open) {
    openChallenge(Number(button.dataset.open), { source: button });
  } else if (button.dataset.copy) {
    copyPrompt(button.dataset.copy);
  } else if (button.dataset.hint) {
    const input = detailRoot.querySelector("#blank-input");
    if (input) {
      input.value = button.dataset.hint;
      blankDraft = button.dataset.hint;
      input.focus();
    }
  } else if (button.dataset.sendhint) {
    const input = detailRoot.querySelector("#send-input");
    if (input) {
      input.value = button.dataset.sendhint;
      sendDraft = button.dataset.sendhint;
      input.focus();
    }
  } else if (button.dataset.help) {
    const panel = detailRoot.querySelector(`#help-${button.dataset.help}`);
    if (panel) {
      const pinned = button.dataset.pinned === "true";
      button.dataset.pinned = String(!pinned);
      panel.hidden = pinned;
      button.setAttribute("aria-expanded", String(!pinned));
    }
  } else if (button.dataset.toggleTried) {
    tried = toggleTried(tried, Number(button.dataset.toggleTried));
    refreshAll();
    showToast(isTried(tried, Number(button.dataset.toggleTried))
      ? "やってみた記録をつけました"
      : "やってみた記録を外しました");
  } else if (button.dataset.share) {
    const url = `${window.location.origin}${window.location.pathname}#c-${button.dataset.share}`;
    copyText(url, "この回のURLをコピーしました").then((copied) => {
      if (!copied) showToast(`コピーできませんでした。${url}`);
    });
  } else if (button === resetButton) {
    resetConfirmation.hidden = false;
    resetButton.setAttribute("aria-expanded", "true");
    confirmResetButton.focus();
  } else if (button === confirmResetButton) {
    resetTried();
  } else if (button === cancelResetButton) {
    closeResetConfirmation();
  }
});

closeButton.addEventListener("click", closeDialog);
dialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog();
  }
});
dialog.addEventListener("close", finishClose);
window.addEventListener("hashchange", () => {
  const hash = classifyChallengeHash(window.location.hash);
  if (hash.type === "valid") openChallenge(hash.id, { updateHash: false });
  else if (hash.type === "empty" && dialog.open) closeDialog();
});

if (!storage) {
  showStorageWarning();
} else {
  try {
    checkStorageAvailability(storage);
  } catch {
    showStorageWarning();
  }
}
resetControls.hidden = false;
renderSummary();
renderFilters();
renderCards();
const initialHash = classifyChallengeHash(window.location.hash);
if (initialHash.type === "valid") openChallenge(initialHash.id, { updateHash: false });
