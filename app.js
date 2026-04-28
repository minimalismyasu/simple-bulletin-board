const STORAGE_KEY = "neon-board-posts-v2";
const SETTINGS_KEY = "neon-board-settings-v1";

const CATEGORY_META = {
  general: { label: "GENERAL", color: "#22f0ff" },
  news: { label: "NEWS", color: "#ffb84d" },
  help: { label: "HELP", color: "#a7ff4d" },
  idea: { label: "IDEA", color: "#ff4bd8" },
  bug: { label: "BUG", color: "#ff5c7d" },
};

const seedPosts = [
  {
    id: crypto.randomUUID(),
    name: "Operator",
    handle: "@core",
    category: "general",
    message: "Welcome. This is a cyberpunk-style bulletin board.",
    createdAt: Date.now() - 1000 * 60 * 62,
    updatedAt: Date.now() - 1000 * 60 * 62,
    pinned: true,
  },
  {
    id: crypto.randomUUID(),
    name: "Switch",
    handle: "@helpdesk",
    category: "help",
    message: "Use search, filters, and sorting to find posts fast.",
    createdAt: Date.now() - 1000 * 60 * 21,
    updatedAt: Date.now() - 1000 * 60 * 21,
    pinned: false,
  },
  {
    id: crypto.randomUUID(),
    name: "Nova",
    handle: "@idea",
    category: "idea",
    message: "Backup export makes this feel much more practical.",
    createdAt: Date.now() - 1000 * 60 * 7,
    updatedAt: Date.now() - 1000 * 60 * 7,
    pinned: false,
  },
];

const elements = {
  form: document.getElementById("post-form"),
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

let posts = loadPosts();
let settings = loadSettings();
let editingId = null;

applyTheme(settings.theme ?? "night");
elements.sort.value = settings.sort ?? "newest";
elements.filterCategory.value = settings.filterCategory ?? "all";
elements.search.value = settings.search ?? "";
render();

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = elements.message.value.trim();
  if (!message) {
    setStatus("Please enter a message.");
    elements.message.focus();
    return;
  }

  const payload = {
    name: normalizeValue(elements.name.value, "Guest", 30),
    handle: normalizeHandle(elements.handle.value),
    category: elements.category.value,
    message,
  };

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
    elements.submitButton.textContent = "Post";
    setStatus("Post updated.");
  } else {
    posts.unshift({
      id: crypto.randomUUID(),
      ...payload,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    });
    setStatus("Posted.");
  }

  savePosts();
  clearComposer({ keepCategory: true });
  render();
  elements.name.focus();
});

elements.clearForm.addEventListener("click", () => {
  editingId = null;
  elements.submitButton.textContent = "Post";
  clearComposer({ keepCategory: true });
  setStatus("Composer cleared.");
});

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "day" ? "night" : "day";
  applyTheme(nextTheme);
  settings.theme = nextTheme;
  saveSettings();
  setStatus(`Theme switched to ${nextTheme.toUpperCase()}.`);
});

elements.exportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(posts, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neon-board-backup-${formatDateTime(Date.now()).replaceAll("/", "-").replaceAll(":", "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Backup downloaded.");
});

elements.importJson.addEventListener("change", async () => {
  const file = elements.importJson.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextPosts = normalizeImportedPosts(parsed);
    if (!nextPosts.length) {
      throw new Error("No post data found.");
    }
    posts = nextPosts;
    savePosts();
    render();
    setStatus("Backup imported.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Import failed.");
  } finally {
    elements.importJson.value = "";
  }
});

elements.seedReset.addEventListener("click", () => {
  const confirmed = window.confirm("Reset everything to the initial posts?");
  if (!confirmed) return;

  posts = seedPosts.map((post) => ({ ...post, id: crypto.randomUUID() }));
  editingId = null;
  elements.submitButton.textContent = "Post";
  savePosts();
  clearComposer({ keepCategory: false });
  render();
  setStatus("Reset to seed posts.");
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
      post.id === postId
        ? { ...post, pinned: !post.pinned, updatedAt: Date.now() }
        : post,
    );
    savePosts();
    render();
    setStatus("Pin toggled.");
    return;
  }

  if (button.classList.contains("edit-btn")) {
    const post = posts.find((item) => item.id === postId);
    if (!post) return;
    editingId = post.id;
    elements.name.value = post.name ?? "";
    elements.handle.value = post.handle ?? "";
    elements.category.value = post.category ?? "general";
    elements.message.value = post.message ?? "";
    elements.submitButton.textContent = "Update";
    setStatus("Editing post.");
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.message.focus();
    return;
  }

  if (button.classList.contains("delete-btn")) {
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;
    posts = posts.filter((post) => post.id !== postId);
    if (editingId === postId) {
      editingId = null;
      elements.submitButton.textContent = "Post";
      clearComposer({ keepCategory: true });
    }
    savePosts();
    render();
    setStatus("Post deleted.");
  }
});

function loadPosts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedPosts;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedPosts;
    return parsed
      .map(normalizeImportedPost)
      .filter(Boolean)
      .map((post) => ({
        ...post,
        pinned: Boolean(post.pinned),
      }));
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

function savePosts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "day" ? "day" : "night";
  settings.theme = theme === "day" ? "day" : "night";
}

function clearComposer({ keepCategory } = { keepCategory: true }) {
  elements.name.value = "";
  elements.handle.value = "";
  elements.message.value = "";
  if (!keepCategory) {
    elements.category.value = "general";
  }
}

function normalizeValue(value, fallback, maxLength) {
  const text = value.trim().slice(0, maxLength);
  return text || fallback;
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
      id: post.id || crypto.randomUUID(),
      name: post.name || "Guest",
      handle: post.handle || "",
      category: Object.keys(CATEGORY_META).includes(post.category) ? post.category : "general",
      message: String(post.message || "").trim(),
      createdAt: Number(post.createdAt) || Date.now(),
      updatedAt: Number(post.updatedAt) || Number(post.createdAt) || Date.now(),
      pinned: Boolean(post.pinned),
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
    name: typeof post.name === "string" ? post.name : "Guest",
    handle: typeof post.handle === "string" ? post.handle : "",
    category: Object.keys(CATEGORY_META).includes(category) ? category : "general",
    message: String(post.message ?? post.content ?? "").trim(),
    createdAt,
    updatedAt,
    pinned: Boolean(post.pinned),
  };
}

function render() {
  const query = settings.search.trim().toLowerCase();
  const sortMode = settings.sort ?? "newest";
  const filterCategory = settings.filterCategory ?? "all";

  const visiblePosts = posts
    .filter((post) => {
      const haystack = [
        post.name,
        post.handle,
        post.category,
        post.message,
        CATEGORY_META[post.category]?.label ?? "",
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
  elements.resultCount.textContent = `${visiblePosts.length} items`;
  elements.latestUpdated.textContent = formatCompactDate(
    posts.length ? Math.max(...posts.map((post) => post.updatedAt || post.createdAt)) : null,
  );

  if (!visiblePosts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = posts.length
      ? "No posts match the current search or category."
      : "No posts yet. Use the form to create the first one.";
    elements.posts.appendChild(empty);
    return;
  }

  for (const post of visiblePosts) {
    const fragment = elements.template.content.cloneNode(true);
    const article = fragment.querySelector(".post");
    const badge = fragment.querySelector(".badge");
    const name = fragment.querySelector(".post-name");
    const handle = fragment.querySelector(".post-handle");
    const message = fragment.querySelector(".post-message");
    const time = fragment.querySelector(".post-time");
    const updated = fragment.querySelector(".post-updated");
    const pinBtn = fragment.querySelector(".pin-btn");

    article.dataset.postId = post.id;
    article.classList.toggle("pinned", Boolean(post.pinned));

    const meta = CATEGORY_META[post.category] ?? CATEGORY_META.general;
    badge.textContent = meta.label;
    badge.style.background = meta.color;

    name.textContent = post.name || "Guest";
    handle.textContent = post.handle || "@anon";
    message.textContent = post.message;
    time.textContent = `Posted ${formatDateTime(post.createdAt)}`;
    updated.textContent =
      post.updatedAt && post.updatedAt !== post.createdAt
        ? `Updated ${formatDateTime(post.updatedAt)}`
        : "No updates";

    pinBtn.textContent = post.pinned ? "★" : "☆";
    pinBtn.setAttribute("aria-label", post.pinned ? "Unpin" : "Pin");

    elements.posts.appendChild(fragment);
  }
}

function setStatus(text) {
  elements.status.textContent = text;
}

function formatDateTime(timestamp) {
  const value = new Date(timestamp);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatCompactDate(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
