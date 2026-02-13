#!/usr/bin/env node
/**
 * generate-site.js
 *
 * Reads all .md files from the oncall-kb directory, parses bookmarks.md for
 * quick-links, reads raw/slack-summary.md for stats, and bundles everything
 * into a single self-contained HTML file at oncall-kb.html.
 *
 * Usage:
 *   node tools/generate-site.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const KB_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(KB_ROOT, 'oncall-kb.html');
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'tools', '.DS_Store']);
const IGNORED_FILES = new Set(['oncall-kb.html']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively find all .md files under `dir`, returning paths relative to KB_ROOT. */
function findMarkdownFiles(dir, relBase = '') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(relBase, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        results.push(...findMarkdownFiles(full, rel));
      }
    } else if (entry.isFile() && entry.name.endsWith('.md') && !IGNORED_FILES.has(entry.name)) {
      results.push(rel);
    }
  }
  return results;
}

/** Derive a human-readable title from a filename. */
function titleFromFilename(filename) {
  return path
    .basename(filename, '.md')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Derive a category from the directory part of a relative path. */
function categoryFromPath(relPath) {
  const dir = path.dirname(relPath);
  if (dir === '.') return 'root';
  return dir;
}

/** Assign a badge colour based on category. */
function badgeColor(category) {
  const map = {
    runbooks: '#e67e22',
    services: '#3498db',
    architecture: '#9b59b6',
    raw: '#27ae60',
    root: '#7f8c8d',
  };
  return map[category] || '#95a5a6';
}

/** Parse bookmarks.md into structured sections of links. */
function parseBookmarks(mdContent) {
  const sections = [];
  let current = null;
  for (const line of mdContent.split('\n')) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      current = { title: headingMatch[1].trim(), links: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    // Markdown link: - [text](url) -- description
    const linkMatch = line.match(/^[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*(--\s*(.+))?/);
    if (linkMatch) {
      current.links.push({
        text: linkMatch[1],
        url: linkMatch[2],
        description: (linkMatch[4] || '').trim(),
      });
      continue;
    }

    // Table row with a link: | [text](url) | ... | ... |  or  | #channel | id | desc |
    const tableLink = line.match(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/);
    if (tableLink) {
      // Try to extract description from subsequent columns
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      current.links.push({
        text: tableLink[1],
        url: tableLink[2],
        description: cols.length > 1 ? cols.slice(1).join(' - ') : '',
      });
      continue;
    }

    // Slack channel table: | #channel-name | ID | Purpose |
    const slackRow = line.match(/\|\s*(#[\w-]+)\s*\|\s*([\w-]*)\s*\|\s*(.+?)\s*\|/);
    if (slackRow) {
      const channelName = slackRow[1];
      const purpose = slackRow[3].replace(/^--\s*/, '').trim();
      current.links.push({
        text: channelName,
        url: `https://wealthsimple.slack.com/channels/${channelName.replace('#', '')}`,
        description: purpose,
      });
    }
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Build KB data structure
// ---------------------------------------------------------------------------

console.log('Scanning for .md files ...');
const mdFiles = findMarkdownFiles(KB_ROOT);
console.log(`  Found ${mdFiles.length} markdown files.`);

const documents = [];
const navTree = {};

for (const relPath of mdFiles) {
  const absPath = path.join(KB_ROOT, relPath);
  const content = fs.readFileSync(absPath, 'utf-8');
  const category = categoryFromPath(relPath);

  // Extract first H1 as title, fallback to filename-derived title
  const h1 = content.match(/^#\s+(.+)/m);
  const title = h1 ? h1[1].trim() : titleFromFilename(relPath);

  const doc = {
    id: relPath.replace(/[\/\\. ]/g, '-').toLowerCase(),
    path: relPath,
    title,
    category,
    badge: badgeColor(category),
    content,
  };
  documents.push(doc);

  // Build nav tree
  if (!navTree[category]) navTree[category] = [];
  navTree[category].push({ id: doc.id, path: relPath, title });
}

// Parse bookmarks
let bookmarks = [];
const bookmarksDoc = documents.find(d => d.path === 'bookmarks.md');
if (bookmarksDoc) {
  bookmarks = parseBookmarks(bookmarksDoc.content);
  console.log(`  Parsed ${bookmarks.length} bookmark sections.`);
}

// Read slack summary stats
let slackStats = null;
const slackDoc = documents.find(d => d.path.includes('slack-summary'));
if (slackDoc) {
  const m = slackDoc.content.match(/Total threads analyzed:\*\*\s*(\d+)/);
  const m2 = slackDoc.content.match(/Total messages:\*\*\s*(\d+)/);
  slackStats = {
    threads: m ? parseInt(m[1], 10) : null,
    messages: m2 ? parseInt(m2[1], 10) : null,
  };
  console.log(`  Slack stats: ${slackStats.threads} threads, ${slackStats.messages} messages.`);
}

// Determine the "field guide" entry to highlight
const fieldGuideId =
  (documents.find(d => d.path === 'oncall-field-guide.md') || {}).id || documents[0].id;

// ---------------------------------------------------------------------------
// Category display names & ordering
// ---------------------------------------------------------------------------
const categoryMeta = {
  root: { label: 'Overview', icon: '\uD83D\uDCD6', order: 0 },
  runbooks: { label: 'Runbooks', icon: '\uD83D\uDCD9', order: 1 },
  services: { label: 'Services', icon: '\u2699\uFE0F', order: 2 },
  architecture: { label: 'Architecture', icon: '\uD83C\uDFD7\uFE0F', order: 3 },
  raw: { label: 'Raw Data', icon: '\uD83D\uDCCA', order: 4 },
};

const sortedCategories = Object.keys(navTree).sort(
  (a, b) => ((categoryMeta[a] || {}).order || 99) - ((categoryMeta[b] || {}).order || 99)
);

// ---------------------------------------------------------------------------
// Generate the HTML
// ---------------------------------------------------------------------------
const timestamp = new Date().toISOString();

// Build the application JavaScript as a plain string to avoid template literal
// escaping issues with regex patterns and backslashes.
const appJS = [
'(function() {',
'  "use strict";',
'',
'  var KB = window.KB_DATA;',
'  var documents = KB.documents;',
'  var bookmarks = KB.bookmarks;',
'  var navTree = KB.navTree;',
'  var sortedCategories = KB.sortedCategories;',
'  var categoryMeta = KB.categoryMeta;',
'  var fieldGuideId = KB.fieldGuideId;',
'',
'  var searchInput = document.getElementById("search-input");',
'  var searchResults = document.getElementById("search-results");',
'  var searchPanel = document.getElementById("search-results-panel");',
'  var navTreeEl = document.getElementById("nav-tree");',
'  var quickLinksEl = document.getElementById("quick-links-content");',
'  var docTitle = document.getElementById("doc-title");',
'  var docBreadcrumb = document.getElementById("doc-breadcrumb");',
'  var docBody = document.getElementById("doc-body");',
'  var docToc = document.getElementById("doc-toc");',
'  var tocLinks = document.getElementById("toc-links");',
'',
'  var currentDocId = null;',
'  var docIndex = {};',
'  documents.forEach(function(d) { docIndex[d.id] = d; });',
'',
'  var orderedDocs = [];',
'  sortedCategories.forEach(function(cat) {',
'    (navTree[cat] || []).forEach(function(item) { orderedDocs.push(item.id); });',
'  });',
'',
'  // --- Configure marked ---',
'  var renderer = new marked.Renderer();',
'',
'  renderer.link = function(token) {',
'    var href = token.href || "";',
'    var text = token.text || "";',
'    if (href && !href.startsWith("http") && !href.startsWith("#") && href.includes(".md")) {',
'      var normalId = href.replace(/[\\/\\\\. ]/g, "-").toLowerCase();',
'      if (docIndex[normalId]) {',
'        return \'<a href="#" class="internal-link" data-doc="\' + normalId + \'">\' + text + "</a>";',
'      }',
'    }',
'    var target = href.startsWith("#") ? "" : \' target="_blank" rel="noopener"\';',
'    return \'<a href="\' + href + \'"\' + target + ">" + text + "</a>";',
'  };',
'',
'  renderer.code = function(token) {',
'    var code = token.text || "";',
'    var lang = (token.lang || "").toLowerCase();',
'    if (lang === "mermaid") {',
'      return \'<div class="mermaid-container"><pre class="mermaid">\' + code + "</pre></div>";',
'    }',
'    var highlighted;',
'    try {',
'      if (lang && hljs.getLanguage(lang)) {',
'        highlighted = hljs.highlight(code, { language: lang }).value;',
'      } else {',
'        highlighted = hljs.highlightAuto(code).value;',
'      }',
'    } catch (e) {',
'      highlighted = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");',
'    }',
'    return \'<pre><code class="hljs\' + (lang ? " language-" + lang : "") + \'">\' + highlighted + \'</code><button class="copy-btn" onclick="copyCode(this)">Copy</button></pre>\';',
'  };',
'',
'  marked.setOptions({ renderer: renderer, gfm: true, breaks: false });',
'',
'  window.copyCode = function(btn) {',
'    var code = btn.parentElement.querySelector("code");',
'    var text = code.textContent;',
'    navigator.clipboard.writeText(text).then(function() {',
'      btn.textContent = "Copied!";',
'      btn.classList.add("copied");',
'      setTimeout(function() { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);',
'    });',
'  };',
'',
'  function buildNav() {',
'    var html = "";',
'    sortedCategories.forEach(function(cat) {',
'      var meta = categoryMeta[cat] || { label: cat, icon: "", order: 99 };',
'      var items = navTree[cat] || [];',
'      var badgeStyle = "background:" + (items[0] ? docIndex[items[0].id].badge : "#95a5a6");',
'      html += \'<div class="nav-section" data-cat="\' + cat + \'">\';',
'      html += \'<div class="nav-section-header" onclick="toggleNavSection(this)">\';',
'      html += \'<span class="arrow open">&#9654;</span>\';',
'      html += "<span>" + meta.icon + " " + meta.label + "</span>";',
'      html += \'<span class="badge" style="\' + badgeStyle + \'">\' + items.length + "</span>";',
'      html += "</div>";',
'      html += \'<div class="nav-items open">\';',
'      items.forEach(function(item) {',
'        var isFieldGuide = item.id === fieldGuideId;',
'        var cls = "nav-item" + (isFieldGuide ? " field-guide" : "");',
'        html += \'<div class="\' + cls + \'" data-id="\' + item.id + \'" onclick="navigateTo(\\\'\' + item.id + \'\\\')">\' + item.title + "</div>";',
'      });',
'      html += "</div></div>";',
'    });',
'    navTreeEl.innerHTML = html;',
'  }',
'',
'  window.toggleNavSection = function(header) {',
'    var arrow = header.querySelector(".arrow");',
'    var items = header.nextElementSibling;',
'    var isOpen = items.classList.contains("open");',
'    if (isOpen) { items.classList.remove("open"); arrow.classList.remove("open"); }',
'    else { items.classList.add("open"); arrow.classList.add("open"); }',
'  };',
'',
'  function buildQuickLinks() {',
'    var html = "";',
'    bookmarks.forEach(function(section) {',
'      html += \'<div class="ql-section">\';',
'      html += \'<div class="ql-section-title">\' + escapeHtml(section.title) + "</div>";',
'      section.links.forEach(function(link) {',
'        html += \'<a class="ql-link" href="\' + escapeHtml(link.url) + \'" target="_blank" rel="noopener">\';',
'        html += \'<span class="ql-dot"></span>\';',
'        html += \'<span class="ql-link-text">\';',
'        html += \'<span class="ql-link-title">\' + escapeHtml(link.text) + "</span>";',
'        if (link.description) {',
'          html += \'<div class="ql-link-desc">\' + escapeHtml(link.description) + "</div>";',
'        }',
'        html += "</span></a>";',
'      });',
'      html += "</div>";',
'    });',
'    quickLinksEl.innerHTML = html;',
'  }',
'',
'  function escapeHtml(str) {',
'    var d = document.createElement("div");',
'    d.textContent = str;',
'    return d.innerHTML;',
'  }',
'',
'  window.navigateTo = function(docId) {',
'    var doc = docIndex[docId];',
'    if (!doc) return;',
'    currentDocId = docId;',
'    document.querySelectorAll(".nav-item").forEach(function(el) {',
'      el.classList.toggle("active", el.dataset.id === docId);',
'    });',
'    var parts = doc.path.split("/");',
'    if (parts.length > 1) {',
'      docBreadcrumb.innerHTML = parts.slice(0, -1).map(function(p) { return "<span>" + p + "</span>"; }).join(" / ") + " / " + parts[parts.length - 1];',
'    } else { docBreadcrumb.textContent = doc.path; }',
'    docTitle.textContent = doc.title;',
'    docBody.innerHTML = marked.parse(doc.content);',
'    docBody.querySelectorAll("pre").forEach(function(pre) {',
'      if (!pre.querySelector(".copy-btn") && !pre.classList.contains("mermaid")) {',
'        var btn = document.createElement("button");',
'        btn.className = "copy-btn"; btn.textContent = "Copy";',
'        btn.onclick = function() { window.copyCode(btn); };',
'        pre.style.position = "relative"; pre.appendChild(btn);',
'      }',
'    });',
'    docBody.querySelectorAll(".internal-link").forEach(function(a) {',
'      a.addEventListener("click", function(e) { e.preventDefault(); navigateTo(a.dataset.doc); });',
'    });',
'    buildToc(); renderMermaid();',
'    document.getElementById("content-area").scrollTop = 0;',
'    closeSearch();',
'    history.replaceState(null, "", "#" + docId);',
'  };',
'',
'  function buildToc() {',
'    var headings = docBody.querySelectorAll("h2, h3");',
'    if (headings.length < 2) { docToc.style.display = "none"; return; }',
'    docToc.style.display = "block";',
'    var html = "";',
'    headings.forEach(function(h, i) {',
'      var id = "heading-" + i;',
'      h.id = id;',
'      var level = h.tagName === "H3" ? " toc-h3" : "";',
'      html += \'<a class="toc-link\' + level + \'" onclick="scrollToHeading(\\\'\' + id + \'\\\')">\' + h.textContent + "</a>";',
'    });',
'    tocLinks.innerHTML = html;',
'  }',
'',
'  window.scrollToHeading = function(id) {',
'    var el = document.getElementById(id);',
'    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });',
'  };',
'',
'  function renderMermaid() {',
'    var diagrams = docBody.querySelectorAll(".mermaid");',
'    if (diagrams.length === 0) return;',
'    try {',
'      mermaid.initialize({',
'        startOnLoad: false,',
'        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",',
'        securityLevel: "loose",',
'        flowchart: { useMaxWidth: true }',
'      });',
'      diagrams.forEach(function(el, i) {',
'        var code = el.textContent;',
'        mermaid.render("mermaid-" + Date.now() + "-" + i, code).then(function(result) {',
'          el.innerHTML = result.svg;',
'        }).catch(function(e) { console.warn("Mermaid render failed:", e); });',
'      });',
'    } catch (e) { console.warn("Mermaid init failed:", e); }',
'  }',
'',
'  function fuzzyMatch(query, text) {',
'    var lower = text.toLowerCase();',
'    var terms = query.toLowerCase().split(/\\s+/).filter(Boolean);',
'    return terms.every(function(t) { return lower.includes(t); });',
'  }',
'',
'  function getSnippet(content, query, maxLen) {',
'    maxLen = maxLen || 200;',
'    var lower = content.toLowerCase();',
'    var terms = query.toLowerCase().split(/\\s+/).filter(Boolean);',
'    var bestIdx = -1;',
'    for (var i = 0; i < terms.length; i++) {',
'      var idx = lower.indexOf(terms[i]);',
'      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;',
'    }',
'    if (bestIdx === -1) bestIdx = 0;',
'    var start = Math.max(0, bestIdx - 40);',
'    var end = Math.min(content.length, start + maxLen);',
'    var snippet = (start > 0 ? "..." : "") + content.substring(start, end) + (end < content.length ? "..." : "");',
'    snippet = snippet.replace(/[#*_~\\[\\]\\(\\)\\|>]/g, "");',
'    terms.forEach(function(t) {',
'      var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + ")", "gi");',
'      snippet = snippet.replace(re, "<mark>$1</mark>");',
'    });',
'    return snippet;',
'  }',
'',
'  function performSearch(query) {',
'    if (!query || query.length < 2) { searchResults.classList.remove("visible"); return; }',
'    var results = [];',
'    documents.forEach(function(doc) {',
'      if (fuzzyMatch(query, doc.title + " " + doc.content)) results.push(doc);',
'    });',
'    if (results.length === 0) {',
'      searchPanel.innerHTML = \'<div class="search-no-results">No results for "<strong>\' + escapeHtml(query) + \'</strong>"</div>\';',
'    } else {',
'      searchPanel.innerHTML = results.slice(0, 20).map(function(doc) {',
'        var snippet = getSnippet(doc.content, query);',
'        return \'<div class="search-result" onclick="navigateTo(\\\'\' + doc.id + \'\\\')">\' +',
'          \'<div class="search-result-title">\' + escapeHtml(doc.title) + "</div>" +',
'          \'<div class="search-result-path">\' + escapeHtml(doc.path) + "</div>" +',
'          \'<div class="search-result-snippet">\' + snippet + "</div></div>";',
'      }).join("");',
'    }',
'    searchResults.classList.add("visible");',
'  }',
'',
'  searchInput.addEventListener("input", function() { performSearch(this.value.trim()); });',
'',
'  function closeSearch() {',
'    searchResults.classList.remove("visible");',
'    searchInput.value = "";',
'    searchInput.blur();',
'  }',
'',
'  searchResults.addEventListener("click", function(e) {',
'    if (e.target === searchResults) closeSearch();',
'  });',
'',
'  document.addEventListener("keydown", function(e) {',
'    if (e.key === "/" && document.activeElement !== searchInput) {',
'      e.preventDefault(); searchInput.focus(); return;',
'    }',
'    if (e.key === "Escape") { closeSearch(); return; }',
'    if (document.activeElement === searchInput) return;',
'    if (e.key === "[" || e.key === "]") {',
'      var idx = orderedDocs.indexOf(currentDocId);',
'      if (idx === -1) return;',
'      var newIdx = e.key === "[" ? Math.max(0, idx - 1) : Math.min(orderedDocs.length - 1, idx + 1);',
'      navigateTo(orderedDocs[newIdx]);',
'    }',
'  });',
'',
'  document.getElementById("theme-toggle").addEventListener("click", function() {',
'    var html = document.documentElement;',
'    var current = html.dataset.theme;',
'    html.dataset.theme = current === "dark" ? "light" : "dark";',
'    this.textContent = html.dataset.theme === "dark" ? "\\u2606" : "\\u263E";',
'    if (currentDocId) renderMermaid();',
'  });',
'',
'  document.getElementById("toggle-left").addEventListener("click", function() {',
'    document.getElementById("left-sidebar").classList.toggle("collapsed");',
'  });',
'  document.getElementById("collapse-left").addEventListener("click", function() {',
'    document.getElementById("left-sidebar").classList.add("collapsed");',
'  });',
'  document.getElementById("toggle-right").addEventListener("click", function() {',
'    document.getElementById("right-sidebar").classList.toggle("collapsed");',
'  });',
'  document.getElementById("collapse-right").addEventListener("click", function() {',
'    document.getElementById("right-sidebar").classList.add("collapsed");',
'  });',
'',
'  buildNav();',
'  buildQuickLinks();',
'  var hashDoc = location.hash ? location.hash.substring(1) : null;',
'  if (hashDoc && docIndex[hashDoc]) { navigateTo(hashDoc); }',
'  else { navigateTo(fieldGuideId); }',
'',
'})();',
].join('\n');

const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BOR Write On-Call KB</title>
<!-- Markdown renderer -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<!-- Mermaid diagram renderer -->
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"><\/script>
<!-- Highlight.js for code syntax highlighting -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/atom-one-dark.min.css">
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"><\/script>
<style>
/* ===== CSS Reset & Variables ===== */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --sidebar-w: 280px;
  --right-w: 320px;
  --topbar-h: 54px;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

/* Dark theme (default) */
[data-theme="dark"] {
  --bg-primary: #1a1b26;
  --bg-secondary: #1e1f2e;
  --bg-tertiary: #252636;
  --bg-hover: #2a2b3d;
  --bg-active: #33354a;
  --bg-code: #1e1f2e;
  --bg-inline-code: #2a2b3d;
  --text-primary: #c0caf5;
  --text-secondary: #a9b1d6;
  --text-muted: #565f89;
  --text-heading: #e0e6ff;
  --border-color: #2f3146;
  --accent: #7aa2f7;
  --accent-hover: #89b4fa;
  --link-color: #7dcfff;
  --search-bg: #252636;
  --badge-text: #fff;
  --scrollbar-bg: #1a1b26;
  --scrollbar-thumb: #3b3d57;
  --shadow: 0 2px 8px rgba(0,0,0,0.3);
  --table-border: #2f3146;
  --table-header-bg: #252636;
  --table-stripe: #1e1f2e;
  --green-dot: #9ece6a;
  --warning: #e0af68;
  --error: #f7768e;
}

/* Light theme */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fc;
  --bg-tertiary: #f0f1f5;
  --bg-hover: #e8e9ed;
  --bg-active: #dcdde3;
  --bg-code: #f6f8fa;
  --bg-inline-code: #eff1f5;
  --text-primary: #24292f;
  --text-secondary: #57606a;
  --text-muted: #8b949e;
  --text-heading: #1a1e24;
  --border-color: #d8dee4;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --link-color: #0969da;
  --search-bg: #f0f1f5;
  --badge-text: #fff;
  --scrollbar-bg: #f8f9fc;
  --scrollbar-thumb: #c1c4cc;
  --shadow: 0 2px 8px rgba(0,0,0,0.08);
  --table-border: #d8dee4;
  --table-header-bg: #f0f1f5;
  --table-stripe: #f8f9fc;
  --green-dot: #2da44e;
  --warning: #bf8700;
  --error: #cf222e;
}

/* ===== Scrollbar ===== */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--scrollbar-bg); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* ===== Layout ===== */
html, body { height: 100%; font-family: var(--font-sans); background: var(--bg-primary); color: var(--text-primary); }
body { display: flex; flex-direction: column; overflow: hidden; }

#topbar {
  height: var(--topbar-h);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex; align-items: center;
  padding: 0 16px; gap: 12px;
  flex-shrink: 0; z-index: 100;
}
#topbar .logo { font-weight: 700; font-size: 16px; color: var(--accent); white-space: nowrap; }
#topbar .logo span { color: var(--text-muted); font-weight: 400; font-size: 13px; margin-left: 6px; }

#search-box {
  flex: 1; max-width: 480px; position: relative;
}
#search-input {
  width: 100%; padding: 7px 12px 7px 34px;
  background: var(--search-bg); border: 1px solid var(--border-color);
  border-radius: 6px; color: var(--text-primary); font-size: 14px; outline: none;
}
#search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(122,162,247,0.25); }
#search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 14px; pointer-events: none; }
#search-shortcut {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); font-size: 11px; border: 1px solid var(--border-color);
  border-radius: 3px; padding: 1px 5px; pointer-events: none;
}

.topbar-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.topbar-btn {
  background: none; border: 1px solid var(--border-color); border-radius: 6px;
  color: var(--text-secondary); padding: 5px 10px; cursor: pointer; font-size: 13px;
  transition: all 0.15s;
}
.topbar-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.topbar-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }

#main-layout {
  display: flex; flex: 1; overflow: hidden;
}

/* Left sidebar */
#left-sidebar {
  width: var(--sidebar-w); min-width: var(--sidebar-w);
  background: var(--bg-secondary); border-right: 1px solid var(--border-color);
  display: flex; flex-direction: column; overflow: hidden;
  transition: min-width 0.2s, width 0.2s;
}
#left-sidebar.collapsed { width: 0; min-width: 0; overflow: hidden; }
#left-sidebar.collapsed .sidebar-content { display: none; }

.sidebar-header {
  padding: 12px 14px; border-bottom: 1px solid var(--border-color);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--text-muted);
}
.sidebar-header button {
  background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px;
  padding: 2px 4px; border-radius: 3px;
}
.sidebar-header button:hover { background: var(--bg-hover); color: var(--text-primary); }

.sidebar-content { flex: 1; overflow-y: auto; padding: 8px 0; }

.nav-section { margin-bottom: 4px; }
.nav-section-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; cursor: pointer; font-size: 13px; font-weight: 600;
  color: var(--text-secondary); user-select: none; transition: color 0.15s;
}
.nav-section-header:hover { color: var(--text-primary); }
.nav-section-header .arrow { font-size: 10px; transition: transform 0.2s; }
.nav-section-header .arrow.open { transform: rotate(90deg); }
.nav-section-header .badge {
  font-size: 10px; padding: 1px 6px; border-radius: 10px;
  color: var(--badge-text); margin-left: auto; font-weight: 500;
}

.nav-items { display: none; }
.nav-items.open { display: block; }

.nav-item {
  display: block; padding: 5px 14px 5px 32px;
  font-size: 13px; color: var(--text-secondary); cursor: pointer;
  text-decoration: none; transition: all 0.1s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-item.active { background: var(--bg-active); color: var(--accent); font-weight: 500; }
.nav-item.field-guide { color: var(--warning); font-weight: 600; }
.nav-item.field-guide.active { color: var(--accent); }

/* Main content */
#content-area {
  flex: 1; overflow-y: auto; padding: 0;
  display: flex; flex-direction: column;
}

#doc-header {
  padding: 24px 40px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}
#doc-header h1 { font-size: 26px; font-weight: 700; color: var(--text-heading); margin-bottom: 8px; }
#doc-breadcrumb { font-size: 13px; color: var(--text-muted); }
#doc-breadcrumb span { color: var(--accent); }

#doc-toc {
  padding: 12px 40px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  display: none;
}
#doc-toc .toc-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px;
}
#doc-toc .toc-links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
#doc-toc .toc-link {
  font-size: 13px; color: var(--text-secondary); text-decoration: none; cursor: pointer;
}
#doc-toc .toc-link:hover { color: var(--accent); }
#doc-toc .toc-link.toc-h3 { padding-left: 12px; font-size: 12px; color: var(--text-muted); }

#doc-body {
  padding: 24px 40px 48px; flex: 1;
  max-width: 900px;
  line-height: 1.7; font-size: 15px;
}

/* Right sidebar (quick links) */
#right-sidebar {
  width: var(--right-w); min-width: var(--right-w);
  background: var(--bg-secondary); border-left: 1px solid var(--border-color);
  display: flex; flex-direction: column; overflow: hidden;
  transition: min-width 0.2s, width 0.2s;
}
#right-sidebar.collapsed { width: 0; min-width: 0; overflow: hidden; }
#right-sidebar.collapsed .sidebar-content { display: none; }

.ql-section { margin-bottom: 16px; }
.ql-section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); padding: 0 14px;
  margin-bottom: 6px;
}
.ql-link {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 4px 14px; font-size: 12px; text-decoration: none;
  color: var(--text-secondary); transition: all 0.1s;
}
.ql-link:hover { background: var(--bg-hover); color: var(--text-primary); }
.ql-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green-dot); margin-top: 5px; flex-shrink: 0; }
.ql-link-text { flex: 1; line-height: 1.4; }
.ql-link-title { font-weight: 500; }
.ql-link-desc { font-size: 11px; color: var(--text-muted); margin-top: 1px; }

/* Search results overlay */
#search-results {
  position: fixed; top: var(--topbar-h); left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6); z-index: 200; display: none;
  justify-content: center; padding-top: 20px;
}
#search-results.visible { display: flex; }
#search-results-panel {
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: 10px; width: 640px; max-height: 70vh;
  overflow-y: auto; box-shadow: var(--shadow);
}
.search-result {
  padding: 12px 20px; cursor: pointer; border-bottom: 1px solid var(--border-color);
  transition: background 0.1s;
}
.search-result:hover { background: var(--bg-hover); }
.search-result:last-child { border-bottom: none; }
.search-result-title { font-weight: 600; font-size: 14px; color: var(--text-heading); margin-bottom: 4px; }
.search-result-path { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.search-result-snippet { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.search-result-snippet mark { background: rgba(122,162,247,0.3); color: var(--accent); border-radius: 2px; padding: 0 2px; }
.search-no-results { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 14px; }

/* ===== Rendered Markdown Styles ===== */
#doc-body h1 { font-size: 24px; font-weight: 700; color: var(--text-heading); margin: 32px 0 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
#doc-body h2 { font-size: 20px; font-weight: 600; color: var(--text-heading); margin: 28px 0 10px; }
#doc-body h3 { font-size: 16px; font-weight: 600; color: var(--text-heading); margin: 22px 0 8px; }
#doc-body h4 { font-size: 15px; font-weight: 600; color: var(--text-heading); margin: 18px 0 6px; }
#doc-body p { margin: 0 0 14px; }
#doc-body a { color: var(--link-color); text-decoration: none; }
#doc-body a:hover { text-decoration: underline; }
#doc-body ul, #doc-body ol { margin: 0 0 14px; padding-left: 24px; }
#doc-body li { margin-bottom: 4px; }
#doc-body blockquote {
  border-left: 3px solid var(--accent); padding: 8px 16px; margin: 0 0 14px;
  background: var(--bg-tertiary); border-radius: 0 6px 6px 0; color: var(--text-secondary);
}
#doc-body hr { border: none; border-top: 1px solid var(--border-color); margin: 24px 0; }
#doc-body img { max-width: 100%; border-radius: 6px; }
#doc-body strong { color: var(--text-heading); }
#doc-body code {
  font-family: var(--font-mono); font-size: 0.88em;
  background: var(--bg-inline-code); padding: 2px 6px; border-radius: 4px;
}
#doc-body pre {
  position: relative; margin: 0 0 16px; border-radius: 8px;
  background: var(--bg-code); border: 1px solid var(--border-color);
  overflow-x: auto;
}
#doc-body pre code {
  display: block; padding: 16px; font-size: 13px; line-height: 1.6;
  background: transparent; border-radius: 0;
}
.copy-btn {
  position: absolute; top: 8px; right: 8px; background: var(--bg-hover);
  border: 1px solid var(--border-color); border-radius: 4px;
  color: var(--text-muted); padding: 3px 8px; font-size: 11px; cursor: pointer;
  opacity: 0; transition: opacity 0.15s;
}
#doc-body pre:hover .copy-btn { opacity: 1; }
.copy-btn:hover { background: var(--accent); color: #fff; }
.copy-btn.copied { background: var(--green-dot); color: #fff; }

#doc-body table {
  border-collapse: collapse; width: 100%; margin: 0 0 16px;
  font-size: 14px;
}
#doc-body th {
  background: var(--table-header-bg); text-align: left;
  padding: 8px 12px; font-weight: 600; border: 1px solid var(--table-border);
  color: var(--text-heading);
}
#doc-body td { padding: 8px 12px; border: 1px solid var(--table-border); }
#doc-body tr:nth-child(even) { background: var(--table-stripe); }

/* Mermaid overrides */
.mermaid-container { margin: 0 0 16px; overflow-x: auto; }
.mermaid { background: transparent !important; }

/* Footer */
#footer {
  padding: 8px 16px; font-size: 11px; color: var(--text-muted);
  text-align: center; border-top: 1px solid var(--border-color);
  background: var(--bg-secondary); flex-shrink: 0;
}

/* Responsive */
@media (max-width: 1200px) {
  #right-sidebar { width: 0; min-width: 0; overflow: hidden; }
  #right-sidebar .sidebar-content { display: none; }
}
@media (max-width: 900px) {
  #left-sidebar { width: 0; min-width: 0; overflow: hidden; }
  #left-sidebar .sidebar-content { display: none; }
  #doc-body { padding: 16px 20px 40px; }
  #doc-header { padding: 16px 20px 12px; }
}
</style>
</head>
<body>

<!-- Top Bar -->
<header id="topbar">
  <button class="topbar-btn" id="toggle-left" title="Toggle navigation">&#9776;</button>
  <div class="logo">BOR Write On-Call KB<span>v1.0</span></div>
  <div id="search-box">
    <span id="search-icon">&#128269;</span>
    <input id="search-input" type="text" placeholder="Search all documents..." autocomplete="off" />
    <span id="search-shortcut">/</span>
  </div>
  <div class="topbar-actions">
    <button class="topbar-btn" id="theme-toggle" title="Toggle dark/light mode">&#9788;</button>
    <button class="topbar-btn" id="toggle-right" title="Toggle quick links">&#9881;</button>
  </div>
</header>

<!-- Search Results Overlay -->
<div id="search-results">
  <div id="search-results-panel"></div>
</div>

<!-- Main Layout -->
<div id="main-layout">

  <!-- Left Sidebar: Navigation -->
  <aside id="left-sidebar">
    <div class="sidebar-header">
      <span>Navigation</span>
      <button id="collapse-left" title="Collapse">&laquo;</button>
    </div>
    <nav class="sidebar-content" id="nav-tree"></nav>
  </aside>

  <!-- Content Area -->
  <main id="content-area">
    <div id="doc-header">
      <div id="doc-breadcrumb"></div>
      <h1 id="doc-title"></h1>
    </div>
    <div id="doc-toc">
      <div class="toc-title">On this page</div>
      <div class="toc-links" id="toc-links"></div>
    </div>
    <article id="doc-body"></article>
  </main>

  <!-- Right Sidebar: Quick Links -->
  <aside id="right-sidebar">
    <div class="sidebar-header">
      <span>Quick Links</span>
      <button id="collapse-right" title="Collapse">&raquo;</button>
    </div>
    <div class="sidebar-content" id="quick-links-content"></div>
  </aside>

</div>

<!-- Footer -->
<div id="footer">
  Last generated: ${timestamp} &middot; <span id="doc-count">${documents.length}</span> documents indexed &middot; Keyboard: <kbd>/</kbd> search &middot; <kbd>Esc</kbd> close &middot; <kbd>[</kbd> prev &middot; <kbd>]</kbd> next
</div>

<!-- Embedded KB Data -->
<script>
window.KB_DATA = {
  documents: ${JSON.stringify(documents)},
  bookmarks: ${JSON.stringify(bookmarks)},
  slackStats: ${JSON.stringify(slackStats)},
  navTree: ${JSON.stringify(navTree)},
  sortedCategories: ${JSON.stringify(sortedCategories)},
  categoryMeta: ${JSON.stringify(categoryMeta)},
  fieldGuideId: ${JSON.stringify(fieldGuideId)},
  generated: ${JSON.stringify(timestamp)}
};
<\/script>

<!-- Application JS -->
<script>
${appJS}
<\/script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
const sizeMB = (Buffer.byteLength(html, 'utf-8') / (1024 * 1024)).toFixed(2);

console.log('');
console.log('========================================');
console.log('  Generated: oncall-kb.html');
console.log('  Size: ' + sizeMB + ' MB');
console.log('  Documents: ' + documents.length);
console.log('  Bookmark sections: ' + bookmarks.length);
console.log('========================================');
console.log('');
console.log('To regenerate after adding new data:');
console.log('  node tools/generate-site.js');
console.log('');
