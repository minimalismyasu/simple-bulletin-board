const STORAGE_KEY = "link-rss-home-v1";
const MAX_ITEMS = 80;
const FEED_PATHS = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/index.xml"];
const PROXY_BUILDERS = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://r.jina.ai/http://${stripProtocol(url)}`,
];

const state = {
  subscriptions: [],
  items: [],
  search: "",
  sort: "newest",
};

const elements = {
  form: document.getElementById("add-form"),
  input: document.getElementById("source-url"),
  refreshAll: document.getElementById("refresh-all"),
  clearAll: document.getElementById("clear-all"),
  status: document.getElementById("status"),
  subscriptions: document.getElementById("subscriptions"),
  articles: document.getElementById("articles"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  subscriptionCount: document.getElementById("subscription-count"),
  itemCount: document.getElementById("item-count"),
  lastUpdated: document.getElementById("last-updated"),
  resultCount: document.getElementById("result-count"),
  subscriptionTemplate: document.getElementById("subscription-template"),
  articleTemplate: document.getElementById("article-template"),
  submitButton: document.querySelector("#add-form button[type='submit']"),
};

let refreshHandle = null;

bootstrap();

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addSource(elements.input.value);
});

elements.refreshAll.addEventListener("click", async () => {
  await refreshAllFeeds(true);
});

elements.clearAll.addEventListener("click", () => {
  if (!window.confirm("Delete all RSS sources?")) return;
  state.subscriptions = [];
  state.items = [];
  saveState();
  render();
  setStatus("All sources removed.");
});

elements.search.addEventListener("input", () => {
  state.search = elements.search.value.trim();
  saveState();
  render();
});

elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value === "oldest" ? "oldest" : "newest";
  saveState();
  render();
});

elements.subscriptions.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-source");
  if (!button) return;

  const card = button.closest("[data-subscription-id]");
  if (!card) return;

  const subscriptionId = card.dataset.subscriptionId;
  state.subscriptions = state.subscriptions.filter((item) => item.id !== subscriptionId);
  state.items = state.items.filter((item) => item.subscriptionId !== subscriptionId);
  saveState();
  render();
  setStatus("Source removed.");
});

async function bootstrap() {
  loadState();
  render();
  if (state.subscriptions.length) {
    await refreshAllFeeds(false);
  }

  refreshHandle = window.setInterval(() => {
    refreshAllFeeds(false);
  }, 15 * 60 * 1000);
}

async function addSource(rawInput) {
  const inputUrl = normalizeUrl(rawInput);
  if (!inputUrl) {
    setStatus("Please enter a valid URL.");
    return;
  }

  const exists = state.subscriptions.some(
    (item) => item.sourceUrl === inputUrl || item.feedUrl === inputUrl,
  );
  if (exists) {
    setStatus("That source is already added.");
    elements.input.value = "";
    return;
  }

  setStatus("Finding RSS...");
  elements.submitButton.disabled = true;

  try {
    const discovered = await discoverFeed(inputUrl);
    const subscription = {
      id: crypto.randomUUID(),
      sourceUrl: inputUrl,
      feedUrl: discovered.feedUrl,
      title: discovered.title,
      siteUrl: discovered.siteUrl || inputUrl,
      favicon: discovered.favicon || buildFavicon(inputUrl),
      addedAt: Date.now(),
      updatedAt: 0,
    };

    state.subscriptions.unshift(subscription);
    saveState();
    elements.input.value = "";
    render();
    setStatus(`Added: ${subscription.title}`);
    await refreshSubscription(subscription, true);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to add RSS source.");
  } finally {
    elements.submitButton.disabled = false;
  }
}

async function refreshAllFeeds(showStatus) {
  if (!state.subscriptions.length) {
    if (showStatus) setStatus("No sources yet.");
    render();
    return;
  }

  if (showStatus) setStatus("Refreshing...");

  for (const subscription of state.subscriptions) {
    await refreshSubscription(subscription, false);
  }

  saveState();
  render();

  if (showStatus) setStatus("Updated.");
}

async function refreshSubscription(subscription, allowRender) {
  try {
    const feedText = await fetchText(subscription.feedUrl);
    const parsed = parseFeed(feedText, { siteUrl: subscription.siteUrl });

    subscription.title = parsed.title || subscription.title;
    subscription.siteUrl = parsed.siteUrl || subscription.siteUrl;
    subscription.favicon = parsed.favicon || subscription.favicon;
    subscription.updatedAt = Date.now();

    const nextItems = parsed.items.map((item) => ({
      ...item,
      subscriptionId: subscription.id,
      sourceTitle: subscription.title,
      sourceUrl: subscription.siteUrl || subscription.sourceUrl,
      favicon: subscription.favicon,
    }));

    const preserved = state.items.filter((item) => item.subscriptionId !== subscription.id);
    state.items = dedupeItems([...nextItems, ...preserved]).slice(0, MAX_ITEMS);

    saveState();
    if (allowRender) render();
    return true;
  } catch (error) {
    console.warn("Feed refresh failed", subscription, error);
    if (!subscription.updatedAt) subscription.updatedAt = Date.now();
    return false;
  }
}

async function discoverFeed(siteUrl) {
  const candidates = makeCandidates(siteUrl);

  for (const candidate of candidates) {
    try {
      const text = await fetchText(candidate);
      if (looksLikeFeed(text)) {
        const parsed = parseFeed(text, { siteUrl });
        return {
          feedUrl: candidate,
          title: parsed.title || inferTitleFromUrl(siteUrl),
          siteUrl: parsed.siteUrl || siteUrl,
          favicon: parsed.favicon || buildFavicon(siteUrl),
        };
      }
    } catch {
      // continue
    }
  }

  const html = await fetchText(siteUrl);
  const feedLink = findFeedLink(html, siteUrl);
  if (feedLink) {
    const feedText = await fetchText(feedLink);
    if (!looksLikeFeed(feedText)) {
      throw new Error("A feed candidate was found, but it was not a readable RSS feed.");
    }

    const parsed = parseFeed(feedText, { siteUrl });
    return {
      feedUrl: feedLink,
      title: parsed.title || inferTitleFromUrl(siteUrl),
      siteUrl: parsed.siteUrl || siteUrl,
      favicon: parsed.favicon || buildFavicon(siteUrl),
    };
  }

  throw new Error("Could not find RSS/Atom. Try the feed URL directly.");
}

function makeCandidates(siteUrl) {
  const url = new URL(siteUrl);
  const candidates = new Set([url.href]);

  if (looksLikeFeedUrl(url.href)) {
    candidates.add(url.href);
  }

  for (const path of FEED_PATHS) {
    candidates.add(new URL(path, url).href);
  }

  return [...candidates];
}

function findFeedLink(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const links = [...doc.querySelectorAll("link[rel]")];

  for (const link of links) {
    const rel = (link.getAttribute("rel") || "").toLowerCase();
    const type = (link.getAttribute("type") || "").toLowerCase();
    if (!rel.includes("alternate")) continue;
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) continue;

    const href = link.getAttribute("href");
    if (!href) continue;
    return new URL(href, baseUrl).href;
  }

  const anchors = [...doc.querySelectorAll('a[href*="rss"], a[href*="feed"], a[href*="atom"]')];
  const href = anchors[0]?.getAttribute("href");
  return href ? new URL(href, baseUrl).href : "";
}

function parseFeed(xmlText, fallback = {}) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("RSS/XML parse failed.");
  }

  const rootName = doc.documentElement?.nodeName?.toLowerCase?.() || "";
  if (rootName === "rss") {
    return parseRss(doc, fallback);
  }

  if (rootName === "feed") {
    return parseAtom(doc, fallback);
  }

  throw new Error("This document is not RSS/Atom.");
}

function parseRss(doc, fallback) {
  const channel = doc.querySelector("channel");
  const title = textContent(channel, "title") || fallbackTitle(fallback);
  const siteUrl = textContent(channel, "link") || fallback.siteUrl || "";
  const favicon = buildFavicon(siteUrl || fallback.siteUrl || "");
  const items = [...doc.querySelectorAll("item")].slice(0, 20).map((item) => {
    const contentEncoded = item.getElementsByTagNameNS("*", "encoded")[0]?.textContent || "";
    return {
      id: hashString(
        textContent(item, "guid") || textContent(item, "link") || textContent(item, "title") || "",
      ),
      title: sanitize(textContent(item, "title") || "Untitled"),
      link: textContent(item, "link") || siteUrl || fallback.siteUrl || "",
      summary: sanitize(textContent(item, "description") || contentEncoded || ""),
      publishedAt: parseDate(textContent(item, "pubDate") || ""),
    };
  });

  return { title, siteUrl, favicon, items };
}

function parseAtom(doc, fallback) {
  const title = textContent(doc, "feed > title") || fallbackTitle(fallback);
  const linkNode = [...doc.querySelectorAll("feed > link")].find(
    (node) => !node.getAttribute("rel") || node.getAttribute("rel") === "alternate",
  );
  const siteUrl = linkNode?.getAttribute("href") || fallback.siteUrl || "";
  const favicon = buildFavicon(siteUrl || fallback.siteUrl || "");
  const items = [...doc.querySelectorAll("entry")].slice(0, 20).map((entry) => {
    const linkNode = [...entry.querySelectorAll("link")].find(
      (node) => !node.getAttribute("rel") || node.getAttribute("rel") === "alternate",
    );
    const link = linkNode?.getAttribute("href") || "";

    return {
      id: hashString(textContent(entry, "id") || link || textContent(entry, "title") || ""),
      title: sanitize(textContent(entry, "title") || "Untitled"),
      link,
      summary: sanitize(textContent(entry, "summary") || textContent(entry, "content") || ""),
      publishedAt: parseDate(textContent(entry, "updated") || textContent(entry, "published") || ""),
    };
  });

  return { title, siteUrl, favicon, items };
}

async function fetchText(url) {
  const target = normalizeUrl(url);
  if (!target) throw new Error("Invalid URL.");

  const candidates = [target, ...PROXY_BUILDERS.map((builder) => builder(target))];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Fetch failed.");
}

function looksLikeFeed(text) {
  const sample = text.trim().slice(0, 2000).toLowerCase();
  return sample.includes("<rss") || sample.includes("<feed") || sample.includes("<item>");
}

function looksLikeFeedUrl(url) {
  return /(?:rss|atom|feed|xml)(?:[/?#]|$)/i.test(url);
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    try {
      return new URL(`https://${trimmed}`).href;
    } catch {
      return "";
    }
  }
}

function stripProtocol(value) {
  return value.replace(/^https?:\/\//i, "");
}

function parseDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function textContent(root, selector) {
  return root?.querySelector(selector)?.textContent?.trim() || "";
}

function fallbackTitle(fallback) {
  return inferTitleFromUrl(fallback.siteUrl || "");
}

function inferTitleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "RSS";
  }
}

function buildFavicon(url) {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
  } catch {
    return "";
  }
}

function sanitize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = item.id || `${item.link}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    state.subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
    state.items = Array.isArray(parsed.items) ? parsed.items : [];
    state.search = typeof parsed.search === "string" ? parsed.search : "";
    state.sort = parsed.sort === "oldest" ? "oldest" : "newest";
    elements.search.value = state.search;
    elements.sort.value = state.sort;
  } catch {
    state.subscriptions = [];
    state.items = [];
    state.search = "";
    state.sort = "newest";
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      subscriptions: state.subscriptions,
      items: state.items,
      search: state.search,
      sort: state.sort,
    }),
  );
}

function render() {
  renderSubscriptions();
  renderFeed();
  renderStats();
}

function renderSubscriptions() {
  elements.subscriptions.innerHTML = "";

  if (!state.subscriptions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No RSS sources yet. Paste a URL above.";
    elements.subscriptions.appendChild(empty);
    return;
  }

  for (const subscription of state.subscriptions) {
    const fragment = elements.subscriptionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".subscription");
    const favicon = fragment.querySelector(".favicon");
    const title = fragment.querySelector(".source-title");
    const url = fragment.querySelector(".source-url");
    const count = fragment.querySelector(".source-count");
    const updated = fragment.querySelector(".source-updated");

    card.dataset.subscriptionId = subscription.id;
    favicon.src = subscription.favicon || buildFavicon(subscription.siteUrl || subscription.sourceUrl);
    favicon.alt = `${subscription.title} favicon`;
    title.textContent = subscription.title || inferTitleFromUrl(subscription.siteUrl || subscription.sourceUrl);
    url.textContent = subscription.siteUrl || subscription.sourceUrl;
    count.textContent = `${state.items.filter((item) => item.subscriptionId === subscription.id).length} items`;
    updated.textContent = subscription.updatedAt ? `Updated ${formatTime(subscription.updatedAt)}` : "Not updated yet";

    elements.subscriptions.appendChild(fragment);
  }
}

function renderFeed() {
  const query = state.search.toLowerCase();
  const entries = state.items.filter((item) => {
    if (!query) return true;
    const haystack = [item.title, item.summary, item.sourceTitle, item.sourceUrl].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  entries.sort((a, b) => {
    if (state.sort === "oldest") return (a.publishedAt || 0) - (b.publishedAt || 0);
    return (b.publishedAt || 0) - (a.publishedAt || 0);
  });

  elements.articles.innerHTML = "";
  elements.resultCount.textContent = `${entries.length} items`;

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.items.length
      ? "No articles match your search."
      : "Add an RSS source and the home feed will appear here.";
    elements.articles.appendChild(empty);
    return;
  }

  for (const item of entries) {
    const fragment = elements.articleTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".entry");
    const favicon = fragment.querySelector(".entry-favicon");
    const feed = fragment.querySelector(".entry-feed");
    const time = fragment.querySelector(".entry-time");
    const link = fragment.querySelector(".entry-link");
    const title = fragment.querySelector(".entry-title");
    const summary = fragment.querySelector(".entry-summary");

    card.dataset.entryId = item.id;
    favicon.src = item.favicon || "";
    favicon.alt = "";
    feed.textContent = item.sourceTitle || item.sourceUrl || "RSS";
    time.textContent = formatTime(item.publishedAt);
    link.href = item.link || item.sourceUrl || "#";
    title.textContent = item.title || "Untitled";
    summary.textContent = item.summary || "No summary available.";

    elements.articles.appendChild(fragment);
  }
}

function renderStats() {
  elements.subscriptionCount.textContent = String(state.subscriptions.length);
  elements.itemCount.textContent = String(state.items.length);
  const latest = state.subscriptions
    .map((item) => item.updatedAt || 0)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  elements.lastUpdated.textContent = latest ? formatTime(latest) : "-";
}

function setStatus(message) {
  elements.status.textContent = message;
}

function formatTime(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
