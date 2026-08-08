import { CATEGORIES } from "./challenges.js";
import { isTried } from "./state.js";

// 操作の種類。ラベルとアイコンを主、色を従にする。
// 色が見分けられなくても、ラベルだけで何をするか決まるようにしておく。
export const SEND_TYPES = {
  fill: {
    id: "fill",
    label: "空欄をうめてから送る",
    short: "空欄をうめる",
    icon: "pencil",
  },
  paste: {
    id: "paste",
    label: "自分の文を貼ってから送る",
    short: "自分の文を貼る",
    icon: "paste",
  },
  attach: {
    id: "attach",
    label: "資料を添付してから送る",
    short: "資料を添付",
    icon: "attach",
  },
  asis: {
    id: "asis",
    label: "そのままコピーして送る",
    short: "そのままコピー",
    icon: "copy",
  },
};

// 2回目は全30回とも空欄をうめて送る。1回目の fill と同じ見せ方にする。
export const FILL_TYPE = SEND_TYPES.fill;

// 30本から参照する共通の補足。チャレンジごとに書き分けない。
export const HELP_TEXTS = {
  attach: {
    title: "添付ボタンの場所",
    body: "ChatGPTなら入力欄の左にあるクリップ（＋）の形のボタンです。押すと「写真を撮る」「ファイルを選ぶ」が出ます。Geminiなら画像のアイコンです。",
  },
  once: {
    title: "1回で送る",
    body: "送信は1回だけです。先に資料や自分の文を送ってから文章を別に送るのではなく、添付や貼り付けが済んだ状態で文章を入れて、1回押します。",
  },
  newmsg: {
    title: "新しいメッセージ",
    body: "同じ会話の続きに、もう一度入力して送ります。新しい会話を始める必要はありません。前のやりとりはAIが覚えています。",
  },
  paste: {
    title: "貼り付け",
    body: "長い文でもかまいません。改行が入っていても大丈夫です。携帯なら、コピーしたあと入力欄を長押しすると「ペースト」が出ます。",
  },
};

// 全30回の1回目の末尾に付ける制約。
// この講座の目的は詳しい授業助言を得ることではなく、回答を短時間で吟味すること。
// 回答が長いと着眼点にたどり着く前に読む負荷が勝ち、検索結果の権威性は教師の判断を弱める。
export const PROMPT_LIMITS =
  "Web検索はせず、ここに書いた情報だけを使ってください。各項目は2文以内で書いてください。";

// 教材や授業案を渡す回では、渡したものの外へ広げさせない。
export const MATERIAL_LIMITS = {
  paste: "貼った内容にない一般論は足さないでください。",
  attach: "資料にない一般論は足さないでください。",
};

export function promptLimits(type) {
  const material = MATERIAL_LIMITS[type];
  return material ? `${material}${PROMPT_LIMITS}` : PROMPT_LIMITS;
}

export function withLimits(text, type) {
  return `${String(text ?? "")}\n\n${promptLimits(type)}`;
}

// 採用・修正・却下は、記入欄や選択ボタンではなく文で伝える。
// 画面に記入欄を並べると、10回講座・校務版と操作の型が変わり、
// 参加のたびにやり方を覚え直すことになる。
// 「却下」で終わる回があってよい。使わない判断も、その回の結論として認める。
export const DECIDE_NOTE =
  "読んだら、採用するか、直すか、使わないかを決めます。使わないという判断も、その回の結論です。";

export const FOLLOW_UP_STEPS = [
  { text: "下の空欄を、自分の言葉でうめます" },
  { text: "できた文を、新しいメッセージとして送信します", help: "newmsg" },
];

// 全30回で同じ文なので、回ごとの本文には書かない。
// 書く場所はこの画面ではなく手元にする。授業記録に触れた言葉を端末に残さないため。
export const CLOSING_NOTE =
  "最後に、次の授業で変える一点を一行だけ書き留めます。授業案ではなく、発問、順番、時間の使い方、見取る場面のような、実行できる形にします。書く場所はこの画面ではなく、手元の手帳や指導案です。";

export const SAFETY_NOTE =
  "子どもの名前は「児童A」などに置き換えます。学習の記録、健康に関すること、家庭のことは入力しません。";

export const BLANK_MARKER = "____";
export const BLANK_PLACEHOLDER = "　　　　";

export const CATEGORY_NAMES = Object.fromEntries(
  CATEGORIES.map(({ id, name }) => [id, name]),
);

export function categoryCounts(challenges) {
  return CATEGORIES.map((category) => ({
    ...category,
    count: challenges.filter((item) => item.category === category.id).length,
  }));
}

export function filterChallenges(challenges, category) {
  return CATEGORY_NAMES[category]
    ? challenges.filter((item) => item.category === category)
    : challenges;
}

export function parseChallengeHash(hash) {
  const match = /^#c-(\d+)$/.exec(hash);
  const id = match ? Number(match[1]) : 0;
  return Number.isInteger(id) && id >= 1 && id <= 30 ? id : null;
}

export function classifyChallengeHash(hash) {
  if (hash === "") return { type: "empty", id: null };
  const id = parseChallengeHash(hash);
  return id === null ? { type: "invalid", id: null } : { type: "valid", id };
}

export function getChallengeById(challenges, id) {
  const numeric = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
  return challenges.find((item) => item.id === numeric) ?? null;
}

export function getFocusSelector(id) {
  return Number.isInteger(id) && id >= 1 && id <= 30 ? `[data-open="${id}"]` : null;
}

export function splitTemplate(template) {
  const text = String(template ?? "");
  const index = text.indexOf(BLANK_MARKER);
  return index === -1
    ? { before: text, after: "" }
    : { before: text.slice(0, index), after: text.slice(index + BLANK_MARKER.length) };
}

export function buildFilledText(template, value = "") {
  const filled = String(value ?? "").trim();
  return String(template ?? "")
    .replace(BLANK_MARKER, filled === "" ? BLANK_PLACEHOLDER : filled);
}

// 空欄をうめて送る回では、1回目の文そのものに空欄がある。
// 自分の見立てを書く行為と、送る文を組み立てる行為を1つにするため、
// 記入欄を別に立てない。書くのは送る文の一部だけ。
export function usesPromptBlank(challenge) {
  return challenge.send.type === "fill";
}

// 手順の番号は「1回目」から「2回目」まで通しで振る。
// 回答を挟んだ一続きの流れとして見せるため、途中で1に戻さない。
export function numberedSteps(challenge) {
  const send = challenge.send.steps.map((step, index) => ({ ...step, number: index + 1 }));
  const offset = send.length;
  const follow = FOLLOW_UP_STEPS.map((step, index) => ({ ...step, number: offset + index + 1 }));
  return { send, follow };
}

export function createViewModel(challenge, tried) {
  return {
    ...challenge,
    categoryName: CATEGORY_NAMES[challenge.category] ?? "",
    sendType: SEND_TYPES[challenge.send.type] ?? SEND_TYPES.fill,
    steps: numberedSteps(challenge),
    promptBlank: usesPromptBlank(challenge),
    tried: isTried(tried, challenge.id),
  };
}
