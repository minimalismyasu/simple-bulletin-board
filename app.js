const STORAGE_KEY = "simple-board-posts-v1";

const form = document.getElementById("post-form");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const postsEl = document.getElementById("posts");
const template = document.getElementById("post-template");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const clearAllButton = document.getElementById("clear-all");

const seedPosts = [
  {
    id: crypto.randomUUID(),
    name: "管理人",
    message: "ようこそ。ここはとてもシンプルな掲示板です。",
    createdAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: crypto.randomUUID(),
    name: "ゲスト",
    message: "気軽にひとことどうぞ。",
    createdAt: Date.now() - 1000 * 60 * 12,
  },
];

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return seedPosts;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return seedPosts;
    }

    return parsed.filter((post) => post && typeof post === "object");
  } catch {
    return seedPosts;
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function setStatus(message) {
  statusEl.textContent = message;
}

function renderPosts(posts) {
  postsEl.innerHTML = "";
  countEl.textContent = `${posts.length} 件`;

  if (posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "まだ投稿がありません。最初のひとことを書いてみましょう。";
    postsEl.appendChild(empty);
    return;
  }

  for (const post of posts.slice().sort((a, b) => b.createdAt - a.createdAt)) {
    const node = template.content.cloneNode(true);
    node.querySelector(".post-name").textContent = post.name || "名無し";
    node.querySelector(".post-message").textContent = post.message;

    const timeEl = node.querySelector(".post-time");
    timeEl.textContent = formatDate(post.createdAt);
    timeEl.dateTime = new Date(post.createdAt).toISOString();

    postsEl.appendChild(node);
  }
}

let posts = loadPosts();
renderPosts(posts);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();
  if (!message) {
    setStatus("メッセージを入力してください。");
    messageInput.focus();
    return;
  }

  const post = {
    id: crypto.randomUUID(),
    name: nameInput.value.trim() || "名無し",
    message,
    createdAt: Date.now(),
  };

  posts = [post, ...posts];
  savePosts(posts);
  renderPosts(posts);
  form.reset();
  nameInput.focus();
  setStatus("投稿しました。");
});

clearAllButton.addEventListener("click", () => {
  const confirmed = window.confirm("すべての投稿を消します。よろしいですか？");
  if (!confirmed) {
    return;
  }

  posts = [];
  savePosts(posts);
  renderPosts(posts);
  setStatus("すべて削除しました。");
});
