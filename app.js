const STORAGE_KEY = "circuit-board-posts-v1";
const SETTINGS_KEY = "circuit-board-settings-v1";
const DRAFT_KEY = "circuit-board-draft-v1";

const CATEGORY_META = {
  general: { label: "一般", color: "#24f0ff" },
  event: { label: "イベント", color: "#ffba4d" },
  support: { label: "サポート", color: "#a9ff4b" },
  idea: { label: "アイデア", color: "#ff4ad8" },
  alert: { label: "注意", color: "#ff5e84" },
};

const seedPosts = [
  {
    id: crypto.randomUUID(),
    title: "掲示板へようこそ",
    name: "運営",
        handle: "@運営",
    category: "general",
    message:
      "この掲示板は、見やすい公開スペースと収益化の導線を両立させるために作っています。",
    createdAt: Date.now() - 1000 * 60 * 68,
    updatedAt: Date.now() - 1000 * 60 * 68,
    pinned: true,
    likes: 12,
    replies: [
      {
        id: crypto.randomUUID(),
        name: "モデレーター",
        handle: "@運営",
        message: "初めての人向けに固定しています。",
        createdAt: Date.now() - 1000 * 60 * 54,
      },
    ],
  },
  {
    id: crypto.randomUUID(),
    title: "イベント受付",
    name: "案内",
        handle: "@案内",
    category: "event",
    message: "出欠確認、会場案内、当日の更新はこのスレッドでお願いします。",
    createdAt: Date.now() - 1000 * 60 * 34,
    updatedAt: Date.now() - 1000 * 60 * 34,
    pinned: false,
    likes: 8,
    replies: [
      {
        id: crypto.randomUUID(),
        name: "参加者",
        handle: "@参加者",
        message: "これで予定が見やすくなりました。",
        createdAt: Date.now() - 1000 * 60 * 19,
      },
    ],
  },
  {
    id: crypto.randomUUID(),
    title: "機能案",
    name: "参加者",
        handle: "@アイデア",
    category: "idea",
    message: "プロ版でロゴ変更、モデレーション、バックアップ履歴があると便利です。",
    createdAt: Date.now() - 1000 * 60 * 11,
    updatedAt: Date.now() - 1000 * 60 * 11,
    pinned: false,
    likes: 5,
    replies: [],
  },
];

const elements = {
  form: document.getElementById("post-form"),
  title: document.getElementById("title"),
  name: document.getElementById("name"),
  handle: document.getElementById("handle"),
  category: document.getElementById("category"),
  message: document.getElementById("message"),
  status: document.getElementById("status"),
  clearForm: document.getElementById("clear-form"),
  submitButton: document.getElementById("submit-button"),
  themeToggle: document.getElementById("theme-toggle"),
  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),
  seedReset: document.getElementById("seed-reset"),
  proCta: document.getElementById("pro-cta"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  filterCategory: document.getElementById("filter-category"),
  posts: document.getElementById("posts"),
  template: document.getElementById("post-template"),
  postCount: document.getElementById("post-count"),
  pinnedCount: document.getElementById("pinned-count"),
  latestUpdated: document.getElementById("latest-updated"),
  resultCount: document.getElementById("result-count"),
};

const openReplies = new Set();
const replyDrafts = new Map();

let posts = loadPosts();
let settings = loadSettings();
let editingId = null;

applyTheme(settings.theme || "night");
elements.sort.value = settings.sort || "newest";
elements.filterCategory.value = settings.filterCategory || "all";
elements.search.value = settings.search || "";
loadDraft();
render();

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const payload = collectDraft();
  if (!payload.title || !payload.message) {
    setStatus("件名と本文の両方を入力してください。");
    return;
  }

  if (editingId) {
    posts = posts.map((post) =>
      post.id === editingId
        ? {
            ...post,
            ...payload,
            updatedAt: Date.now(),
          }
        : post,
    );
    editingId = null;
    elements.submitButton.textContent = "投稿";
    setStatus("投稿を更新しました。");
  } else {
    posts.unshift({
      id: crypto.randomUUID(),
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      likes: 0,
      replies: [],
    });
    setStatus("投稿しました。");
  }

  savePosts();
  clearDraft();
  render();
  elements.title.focus();
});

elements.form.addEventListener("input", saveDraft);
elements.form.addEventListener("change", saveDraft);

elements.clearForm.addEventListener("click", () => {
  editingId = null;
  elements.submitButton.textContent = "投稿";
  clearDraft({ resetCategory: true });
  setStatus("下書きを消去しました。");
});

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "day" ? "night" : "day";
  applyTheme(nextTheme);
  settings.theme = nextTheme;
  saveSettings();
    setStatus(`テーマを${nextTheme === "day" ? "昼" : "夜"}に切り替えました。`);
});

elements.exportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(posts, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `circuit-board-backup-${formatStamp(Date.now())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("バックアップを保存しました。");
});

elements.importJson.addEventListener("change", async () => {
  const file = elements.importJson.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextPosts = normalizeImportedPosts(parsed);
    if (!nextPosts.length) {
      throw new Error("使える投稿データが見つかりませんでした。");
    }
    posts = nextPosts;
    savePosts();
    render();
    setStatus("バックアップを読み込みました。");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "読み込みに失敗しました。");
  } finally {
    elements.importJson.value = "";
  }
});

elements.seedReset.addEventListener("click", () => {
  const confirmed = window.confirm("初期サンプルに戻します。よろしいですか？");
  if (!confirmed) return;

  posts = seedPosts.map((post) => ({
    ...post,
    id: crypto.randomUUID(),
    replies: (post.replies || []).map((reply) => ({ ...reply, id: crypto.randomUUID() })),
  }));
  editingId = null;
  openReplies.clear();
  replyDrafts.clear();
  elements.submitButton.textContent = "投稿";
  savePosts();
  clearDraft({ resetCategory: true });
  render();
  setStatus("初期化しました。");
});

elements.proCta.addEventListener("click", () => {
  window.alert(
    "プロ版の訴求:\n\n・ロゴや配色の変更\n・カテゴリ追加\n・モデレーションキュー\n・バックアップ履歴\n・分析機能",
  );
});

elements.search.addEventListener("input", () => {
  settings.search = elements.search.value;
  saveSettings();
  render();
});

elements.sort.addEventListener("change", () => {
  settings.sort = elements.sort.value;
  saveSettings();
  render();
});

elements.filterCategory.addEventListener("change", () => {
  settings.filterCategory = elements.filterCategory.value;
  saveSettings();
  render();
});

elements.posts.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const article = button.closest("[data-post-id]");
  if (!article) return;

  const postId = article.dataset.postId;

  if (button.classList.contains("pin-btn")) {
    posts = posts.map((post) =>
      post.id === postId ? { ...post, pinned: !post.pinned, updatedAt: Date.now() } : post,
    );
    savePosts();
    render();
    setStatus("固定状態を切り替えました。");
    return;
  }

  if (button.classList.contains("like-btn")) {
    posts = posts.map((post) =>
      post.id === postId
        ? { ...post, likes: (post.likes || 0) + 1, updatedAt: Date.now() }
        : post,
    );
    savePosts();
    render();
    return;
  }

  if (button.classList.contains("edit-btn")) {
    const post = posts.find((item) => item.id === postId);
    if (!post) return;
    editingId = post.id;
    elements.title.value = post.title || "";
    elements.name.value = post.name || "";
    elements.handle.value = post.handle || "";
    elements.category.value = post.category || "general";
    elements.message.value = post.message || "";
    elements.submitButton.textContent = "更新";
    setStatus("編集中です。");
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.title.focus();
    return;
  }

  if (button.classList.contains("delete-btn")) {
    const confirmed = window.confirm("この投稿を削除しますか？");
    if (!confirmed) return;
    posts = posts.filter((post) => post.id !== postId);
    if (editingId === postId) {
      editingId = null;
      elements.submitButton.textContent = "投稿";
      clearDraft({ resetCategory: false });
    }
    openReplies.delete(postId);
    replyDrafts.delete(postId);
    savePosts();
    render();
    setStatus("投稿を削除しました。");
    return;
  }

  if (button.classList.contains("reply-toggle")) {
    const panel = article.querySelector(".reply-panel");
    const isOpen = !panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    if (isOpen) {
      openReplies.delete(postId);
      button.textContent = "返信";
    } else {
      openReplies.add(postId);
      button.textContent = "返信を閉じる";
    }
  }
});

elements.posts.addEventListener("submit", (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;

  event.preventDefault();
  const postId = form.dataset.postId;
  const nameInput = form.querySelector("[name='reply-name']");
  const messageInput = form.querySelector("[name='reply-message']");
  const name = (nameInput?.value || "").trim() || "ゲスト";
  const message = (messageInput?.value || "").trim();
  if (!message) return;

  posts = posts.map((post) => {
    if (post.id !== postId) return post;
    const replies = Array.isArray(post.replies) ? post.replies : [];
    return {
      ...post,
      replies: [
        ...replies,
        {
          id: crypto.randomUUID(),
          name,
          handle: "",
          message,
          createdAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    };
  });

  savePosts();
  replyDrafts.delete(postId);
  render();
  setStatus("返信を投稿しました。");
});

elements.posts.addEventListener("input", (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;

  const postId = form.dataset.postId;
  const nameInput = form.querySelector("[name='reply-name']");
  const messageInput = form.querySelector("[name='reply-message']");

  replyDrafts.set(postId, {
    name: nameInput?.value || "",
    message: messageInput?.value || "",
  });
});

elements.posts.addEventListener("change", (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;

  const postId = form.dataset.postId;
  const nameInput = form.querySelector("[name='reply-name']");
  const messageInput = form.querySelector("[name='reply-message']");

  replyDrafts.set(postId, {
    name: nameInput?.value || "",
    message: messageInput?.value || "",
  });
});

function loadPosts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedPosts;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedPosts;
    return parsed.map(normalizeImportedPost).filter(Boolean);
  } catch {
    return seedPosts;
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { theme: "night", sort: "newest", filterCategory: "all", search: "" };
    }
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme === "day" ? "day" : "night",
      sort: ["newest", "oldest", "updated"].includes(parsed.sort) ? parsed.sort : "newest",
      filterCategory: Object.keys(CATEGORY_META).includes(parsed.filterCategory)
        ? parsed.filterCategory
        : "all",
      search: typeof parsed.search === "string" ? parsed.search : "",
    };
  } catch {
    return { theme: "night", sort: "newest", filterCategory: "all", search: "" };
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    elements.title.value = draft.title || "";
    elements.name.value = draft.name || "";
    elements.handle.value = draft.handle || "";
    elements.category.value = draft.category || "general";
    elements.message.value = draft.message || "";
  } catch {
    clearDraft({ resetCategory: false });
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
  } catch {
    setStatus("下書きを保存できませんでした。ストレージが制限されている可能性があります。");
  }
}

function clearDraft({ resetCategory = false } = {}) {
  elements.title.value = "";
  elements.name.value = "";
  elements.handle.value = "";
  elements.message.value = "";
  if (resetCategory) {
    elements.category.value = "general";
  }
  localStorage.removeItem(DRAFT_KEY);
}

function collectDraft() {
  const title = elements.title.value.trim().slice(0, 60);
  const name = elements.name.value.trim().slice(0, 30) || "ゲスト";
  const handle = normalizeHandle(elements.handle.value);
  const category = Object.keys(CATEGORY_META).includes(elements.category.value)
    ? elements.category.value
    : "general";
  const message = elements.message.value.trim().slice(0, 400);
  return { title, name, handle, category, message };
}

function normalizeHandle(value) {
  const text = value.trim().replace(/\s+/g, "");
  if (!text) return "";
  return text.startsWith("@") ? text.slice(0, 21) : `@${text.slice(0, 20)}`;
}

function normalizeImportedPosts(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(normalizeImportedPost)
    .filter(Boolean)
    .map((post) => ({
      ...post,
      title: post.title || "件名なし",
      name: post.name || "ゲスト",
      handle: post.handle || "",
      category: Object.keys(CATEGORY_META).includes(post.category) ? post.category : "general",
      message: String(post.message || "").trim(),
      createdAt: Number(post.createdAt) || Date.now(),
      updatedAt: Number(post.updatedAt) || Number(post.createdAt) || Date.now(),
      pinned: Boolean(post.pinned),
      likes: Number(post.likes) || 0,
      replies: Array.isArray(post.replies)
        ? post.replies.map((reply) => ({
            id: typeof reply.id === "string" ? reply.id : crypto.randomUUID(),
            name: typeof reply.name === "string" ? reply.name : "ゲスト",
            handle: typeof reply.handle === "string" ? reply.handle : "",
            message: String(reply.message || "").trim(),
            createdAt: Number(reply.createdAt) || Date.now(),
          }))
        : [],
    }))
    .filter((post) => post.message.length > 0);
}

function normalizeImportedPost(post) {
  if (!post || typeof post !== "object") return null;

  const createdAt = Number(post.createdAt ?? post.time ?? Date.now());
  const updatedAt = Number(post.updatedAt ?? createdAt);
  const category = typeof post.category === "string" ? post.category : "general";

  return {
    id: typeof post.id === "string" ? post.id : crypto.randomUUID(),
    title: typeof post.title === "string" ? post.title : "件名なし",
    name: typeof post.name === "string" ? post.name : "ゲスト",
    handle: typeof post.handle === "string" ? post.handle : "",
    category: Object.keys(CATEGORY_META).includes(category) ? category : "general",
    message: String(post.message ?? post.content ?? "").trim(),
    createdAt,
    updatedAt,
    pinned: Boolean(post.pinned),
    likes: Number(post.likes) || 0,
    replies: Array.isArray(post.replies)
      ? post.replies.map((reply) => ({
          id: typeof reply.id === "string" ? reply.id : crypto.randomUUID(),
          name: typeof reply.name === "string" ? reply.name : "ゲスト",
          handle: typeof reply.handle === "string" ? reply.handle : "",
          message: String(reply.message || "").trim(),
          createdAt: Number(reply.createdAt) || Date.now(),
        }))
      : [],
  };
}

function savePosts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch {
    setStatus("投稿を保存できませんでした。ストレージが制限されている可能性があります。");
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    setStatus("設定を保存できませんでした。ストレージが制限されている可能性があります。");
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "day" ? "day" : "night";
  settings.theme = theme === "day" ? "day" : "night";
}

function render() {
  const query = settings.search.trim().toLowerCase();
  const sortMode = settings.sort || "newest";
  const filterCategory = settings.filterCategory || "all";

  const visiblePosts = posts
    .filter((post) => {
      const haystack = [
        post.title,
        post.name,
        post.handle,
        post.category,
        post.message,
        ...(Array.isArray(post.replies) ? post.replies.map((reply) => reply.message) : []),
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      const matchesCategory = filterCategory === "all" || post.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === "oldest") return a.createdAt - b.createdAt;
      if (sortMode === "updated") return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });

  elements.posts.innerHTML = "";
  elements.postCount.textContent = String(posts.length);
  elements.pinnedCount.textContent = String(posts.filter((post) => post.pinned).length);
  elements.resultCount.textContent = `${visiblePosts.length}件`;
  elements.latestUpdated.textContent = formatStamp(
    posts.length ? Math.max(...posts.map((post) => post.updatedAt || post.createdAt)) : null,
  );

  if (!visiblePosts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = posts.length
      ? "検索条件に一致する投稿がありません。"
      : "まだ投稿がありません。左のフォームから最初のスレッドを作成してください。";
    elements.posts.appendChild(empty);
    return;
  }

  for (const post of visiblePosts) {
    const fragment = elements.template.content.cloneNode(true);
    const article = fragment.querySelector(".post");
    const badge = fragment.querySelector(".badge");
    const name = fragment.querySelector(".post-name");
    const handle = fragment.querySelector(".post-handle");
    const title = fragment.querySelector(".post-title");
    const message = fragment.querySelector(".post-message");
    const time = fragment.querySelector(".post-time");
    const updated = fragment.querySelector(".post-updated");
    const pinBtn = fragment.querySelector(".pin-btn");
    const likeBtn = fragment.querySelector(".like-btn");
    const likeCount = fragment.querySelector(".like-count");
    const replyToggle = fragment.querySelector(".reply-toggle");
    const replyPanel = fragment.querySelector(".reply-panel");
    const replyList = fragment.querySelector(".reply-list");
    const replyCount = fragment.querySelector(".reply-count");
    const replyName = fragment.querySelector(".reply-name");
    const replyMessage = fragment.querySelector(".reply-message");
    const replyForm = fragment.querySelector(".reply-form");

    article.dataset.postId = post.id;
    article.classList.toggle("pinned", Boolean(post.pinned));

    const meta = CATEGORY_META[post.category] || CATEGORY_META.general;
    badge.textContent = meta.label;
    badge.style.background = meta.color;

    name.textContent = post.name || "ゲスト";
    handle.textContent = post.handle || "@匿名";
    title.textContent = post.title || "件名なし";
    message.textContent = post.message;
    time.textContent = `投稿 ${formatStamp(post.createdAt)}`;
    updated.textContent =
      post.updatedAt && post.updatedAt !== post.createdAt
        ? `更新 ${formatStamp(post.updatedAt)}`
        : "更新なし";

    pinBtn.textContent = post.pinned ? "固定中" : "固定";
    pinBtn.setAttribute("aria-label", post.pinned ? "固定解除" : "固定");

    likeCount.textContent = String(post.likes || 0);
    likeBtn.title = "いいね";
    replyCount.textContent = `${(post.replies || []).length}件の返信`;

    if (post.replies && post.replies.length) {
      replyList.innerHTML = "";
      for (const reply of post.replies) {
        const item = document.createElement("article");
        item.className = "reply-item";
        item.innerHTML = `
          <div class="reply-meta">
            <strong>${escapeHtml(reply.name || "ゲスト")}</strong>
            <span>${formatStamp(reply.createdAt)}</span>
          </div>
          <p class="reply-body">${escapeHtml(reply.message)}</p>
        `;
        replyList.appendChild(item);
      }
    } else {
      replyList.innerHTML = '<p class="empty-state">まだ返信はありません。</p>';
    }

    const isOpen = openReplies.has(post.id);
    replyPanel.classList.toggle("hidden", !isOpen);
    replyToggle.textContent = isOpen ? "返信を閉じる" : "返信";
    replyForm.dataset.postId = post.id;
    const draft = replyDrafts.get(post.id);
    replyName.value = draft?.name || "";
    replyMessage.value = draft?.message || "";

    elements.posts.appendChild(fragment);
  }
}

function setStatus(text) {
  elements.status.textContent = text;
}

function formatStamp(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
