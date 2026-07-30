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
  CLOSING_LABEL,
  CLOSING_TEXT,
  CORE_NOTE,
  DECIDE_LABEL,
  DECIDE_NOTE,
  DECIDE_REASON_LABEL,
  DECIDE_REASON_TOGGLE,
  FILL_TYPE,
  HELP_TEXTS,
  HYPOTHESIS_LABEL,
  HYPOTHESIS_NOTE,
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
let hypothesisDraft = "";
let decideChoice = "";
let reasonDraft = "";
let nextDraft = "";
// 理由の記入欄は、判断を選ぶまで出さない。開いたかどうかは開き直しても保つ。
let reasonOpen = false;

function clearDrafts() {
  blankDraft = "";
  hypothesisDraft = "";
  decideChoice = "";
  reasonDraft = "";
  nextDraft = "";
  reasonOpen = false;
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

// 一行だけ書く欄。書いた言葉はこの変数の中だけに置き、どこへも送らない。
// 文の中に置くときだけ、2回目の空欄と同じインラインの見た目にする。
function lineInput(id, value, placeholder, onInput, className = "line-input") {
  const input = el("input", {
    type: "text",
    id,
    className,
    value,
    placeholder,
    autocomplete: "off",
    maxLength: 80,
  });
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

// AIに送る前に、自分の考えを先に置く。
// 比べる相手がないと、返事の整った文がそのまま自分の考えになる。
function hypothesisBlock(model) {
  const children = [
    el("p", { className: "block__label" }, [
      createIcon("note"),
      el("span", { text: HYPOTHESIS_LABEL }),
    ]),
    el("p", { className: "self-question", text: model.hypothesis.text }),
  ];
  // 空欄をうめて送る回では、1回目の文の空欄がそのまま自分の考えの置き場所になる。
  // ここにもう一つ入力欄を置くと、同じことを2回書かせることになる。
  if (model.promptBlank) {
    children.push(el("p", {
      className: "field-note",
      text: "書いた言葉は、下の1回目の文の空欄にそのまま入ります。",
    }));
  } else {
    children.push(lineInput("hypothesis-input", hypothesisDraft, model.hypothesis.hint, (value) => {
      hypothesisDraft = value;
    }));
  }
  children.push(el("p", { className: "hints" }, [
    el("span", { className: "hints__label", text: "例：" }),
    el("button", {
      type: "button",
      className: "hint",
      text: model.hypothesis.hint,
      "data-hyphint": model.hypothesis.hint,
    }),
  ]));
  children.push(el("p", { className: "field-note", text: HYPOTHESIS_NOTE }));
  return el("section", { className: "block block--self" }, children);
}

// 全30回の1回目に同じ制約を付ける。回ごとの本文には書かない。
function limitsLine(model) {
  return el("span", { className: "prompt__limits", text: promptLimits(model.send.type) });
}

function promptWithBlank(model) {
  const { before, after } = splitTemplate(model.send.prompt);
  const input = lineInput("hypothesis-input", hypothesisDraft, model.hypothesis.hint, (value) => {
    hypothesisDraft = value;
  }, "blank-input");
  return el("p", { className: "prompt prompt--fill", "data-prompt": "send" }, [
    el("span", { text: before }),
    input,
    el("span", { text: after }),
    limitsLine(model),
  ]);
}

function promptBlock(model) {
  return el("section", { className: `block block--${model.sendType.id}` }, [
    el("p", { className: "block__label" }, [
      createIcon(model.sendType.icon),
      el("span", { text: `1回目 — ${model.sendType.label}` }),
    ]),
    stepList(model.steps.send),
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
  ]);
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

// 採用・修正・却下を、本文に書いた注意ではなく画面の行為にする。
// 選んだ結果は端末に残さないので、押した印はこの画面を開いている間だけ残る。
function decideBlock(model) {
  return el("section", { className: "block block--self" }, [
    el("p", { className: "block__label" }, [
      createIcon("decide"),
      el("span", { text: DECIDE_LABEL }),
    ]),
    el("ul", { className: "decide-list" }, model.decideChoices.map((choice) => el("li", {}, [
      el("button", {
        type: "button",
        className: decideChoice === choice.id
          ? "decide-button decide-button--on"
          : "decide-button",
        "data-decide": choice.id,
        "aria-pressed": String(decideChoice === choice.id),
      }, [
        el("span", { className: "decide-button__head", text: choice.head }),
        el("span", { text: choice.text }),
      ]),
    ]))),
    el("p", { className: "field-note", text: DECIDE_NOTE }),
    // 判断は残すが、理由は深めたい人だけが開く。
    // 4か所すべて埋めないと終わらない教材に見せないため、初期表示しない。
    el("button", {
      type: "button",
      className: "quiet-button",
      id: "reason-toggle",
      "data-reason-toggle": "open",
      "aria-expanded": String(reasonOpen),
      "aria-controls": "reason-field",
      text: DECIDE_REASON_TOGGLE,
      hidden: decideChoice === "",
    }),
    el("div", { className: "reason-field", id: "reason-field", hidden: !reasonOpen }, [
      el("p", { className: "self-question", text: DECIDE_REASON_LABEL }),
      lineInput("reason-input", reasonDraft, "", (value) => {
        reasonDraft = value;
      }),
    ]),
  ]);
}

function closingBlock() {
  return el("section", { className: "block block--self" }, [
    el("p", { className: "block__label" }, [
      createIcon("flag"),
      el("span", { text: CLOSING_LABEL }),
    ]),
    el("p", { className: "self-question", text: CLOSING_TEXT }),
    lineInput("next-input", nextDraft, "", (value) => {
      nextDraft = value;
    }),
    el("p", {
      className: "field-note",
      text: "残しておきたいときは、手帳か指導案に書き写してください。この欄は画面を閉じると消えます。",
    }),
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
    el("p", { className: "core-note", text: CORE_NOTE }),
    el("div", { className: "detail__intro" },
      model.intro.split("\n").map((line) => el("p", { text: line }))),
    hypothesisBlock(model),
    promptBlock(model),
    el("p", { className: "reply" }, [createIcon("arrow"), el("span", { text: model.reply })]),
    decideBlock(model),
    fillBlock(model),
    closingBlock(),
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
    ? buildFilledText(challenge.send.prompt, hypothesisDraft)
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
  } else if (button.dataset.hyphint) {
    const input = detailRoot.querySelector("#hypothesis-input");
    if (input) {
      input.value = button.dataset.hyphint;
      hypothesisDraft = button.dataset.hyphint;
      input.focus();
    }
  } else if (button.dataset.decide) {
    // もう一度押すと選び直せるようにする。決めきれない回もある。
    decideChoice = decideChoice === button.dataset.decide ? "" : button.dataset.decide;
    // 描き直すと入力欄から焦点が飛ぶため、押した印だけを差し替える。
    for (const node of detailRoot.querySelectorAll("[data-decide]")) {
      const on = node.dataset.decide === decideChoice;
      node.className = on ? "decide-button decide-button--on" : "decide-button";
      node.setAttribute("aria-pressed", String(on));
    }
    if (decideChoice === "") reasonOpen = false;
    const toggle = detailRoot.querySelector("#reason-toggle");
    const field = detailRoot.querySelector("#reason-field");
    if (toggle) {
      toggle.hidden = decideChoice === "";
      toggle.setAttribute("aria-expanded", String(reasonOpen));
    }
    if (field) field.hidden = !reasonOpen;
  } else if (button.dataset.reasonToggle) {
    reasonOpen = !reasonOpen;
    const field = detailRoot.querySelector("#reason-field");
    if (field) field.hidden = !reasonOpen;
    button.setAttribute("aria-expanded", String(reasonOpen));
    if (reasonOpen) detailRoot.querySelector("#reason-input")?.focus();
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
