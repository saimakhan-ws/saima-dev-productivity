/**
 * Slack Browser Console Thread Extractor (API-based)
 *
 * HOW TO USE:
 * ===========
 * 1. Open Slack in browser (https://app.slack.com/client/...)
 * 2. Open DevTools (Cmd+Option+J on Mac)
 * 3. Paste this ENTIRE script into the Console tab
 * 4. Press Enter — it auto-detects your token and workspace
 * 5. Run commands below
 *
 * COMMANDS:
 * =========
 *   extractThreads("C017AUU0N2Y", 30)
 *     → Find & extract all threads from channel in last 30 days
 *     → Downloads a combined .md file
 *
 *   extractThread("C017AUU0N2Y", "1700000000.123456")
 *     → Extract a single thread by channel + thread timestamp
 *
 *   extractThreadByUrl("https://app.slack.com/client/.../C017AUU0N2Y/thread/C017AUU0N2Y-1700000000123456")
 *     → Extract by pasting a Slack thread URL
 */

(async function() {
  'use strict';

  // ============================================================
  // Auto-detect Slack session token from the page
  // ============================================================
  function getToken() {
    // Method 1: From boot_data on the page
    try {
      const bootData = document.querySelector('[data-boot]');
      if (bootData) {
        const data = JSON.parse(bootData.getAttribute('data-boot'));
        if (data.api_token) return data.api_token;
      }
    } catch(e) {}

    // Method 2: From localStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        if (val && val.startsWith('xoxc-')) return val;
        // Sometimes nested in JSON
        if (val && val.includes('xoxc-')) {
          const match = val.match(/(xoxc-[a-zA-Z0-9-]+)/);
          if (match) return match[1];
        }
      }
    } catch(e) {}

    // Method 3: From redux store or global state
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        if (s.textContent.includes('xoxc-')) {
          const match = s.textContent.match(/(xoxc-[a-zA-Z0-9-]+)/);
          if (match) return match[1];
        }
      }
    } catch(e) {}

    // Method 4: From cookie (Slack stores token as `d` cookie sometimes)
    try {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const [k, v] = c.trim().split('=');
        if (k === 'd' && v && v.startsWith('xoxd-')) return v;
      }
    } catch(e) {}

    return null;
  }

  const TOKEN = getToken();
  if (!TOKEN) {
    console.error('Could not auto-detect Slack token. Try this manual method:');
    console.error('1. In DevTools Network tab, filter by "api/"');
    console.error('2. Click any request, look at the Form Data for "token"');
    console.error('3. Run: window._SLACK_TOKEN = "xoxc-your-token-here"');
    console.error('4. Then re-paste this script');
    if (window._SLACK_TOKEN) {
      console.log('Using manually set token.');
    } else {
      return;
    }
  }

  const token = TOKEN || window._SLACK_TOKEN;
  console.log(`Token found: ${token.substring(0, 10)}...`);

  // User cache
  const userCache = {};

  // ============================================================
  // Slack API helpers
  // ============================================================
  async function slackPost(method, params) {
    const body = new URLSearchParams({ token, ...params });
    const resp = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',  // send session cookies (required for xoxc- tokens)
      body,
    });
    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Slack API ${method} failed: ${data.error}`);
    }
    return data;
  }

  async function resolveUser(userId) {
    if (!userId) return 'bot';
    if (userCache[userId]) return userCache[userId];
    try {
      const data = await slackPost('users.info', { user: userId });
      const name = data.user.profile.display_name || data.user.real_name || data.user.name || userId;
      userCache[userId] = name;
      return name;
    } catch(e) {
      userCache[userId] = userId;
      return userId;
    }
  }

  async function getChannelName(channelId) {
    try {
      const data = await slackPost('conversations.info', { channel: channelId });
      return data.channel.name;
    } catch(e) {
      return channelId;
    }
  }

  // ============================================================
  // Core: Get channel history (all messages, paginated)
  // ============================================================
  async function getChannelHistory(channelId, oldest) {
    const messages = [];
    let cursor = '';
    let page = 0;

    while (true) {
      page++;
      const params = { channel: channelId, limit: '200', oldest: String(oldest) };
      if (cursor) params.cursor = cursor;

      const data = await slackPost('conversations.history', params);
      messages.push(...(data.messages || []));
      console.log(`  Channel history page ${page}: ${data.messages?.length || 0} messages (total: ${messages.length})`);

      cursor = data.response_metadata?.next_cursor || '';
      if (!cursor) break;
      await sleep(300); // rate limit
    }

    return messages;
  }

  // ============================================================
  // Core: Get thread replies (paginated)
  // ============================================================
  async function getThreadReplies(channelId, threadTs) {
    const messages = [];
    let cursor = '';

    while (true) {
      const params = { channel: channelId, ts: threadTs, limit: '200', inclusive: 'true' };
      if (cursor) params.cursor = cursor;

      const data = await slackPost('conversations.replies', params);
      messages.push(...(data.messages || []));

      cursor = data.response_metadata?.next_cursor || '';
      if (!cursor) break;
      await sleep(300);
    }

    return messages;
  }

  // ============================================================
  // Format messages to markdown
  // ============================================================
  async function messagesToMarkdown(messages, title, channelName, threadUrl) {
    let md = `# ${title}\n`;
    md += `**Channel:** #${channelName}\n`;
    if (threadUrl) md += `**URL:** ${threadUrl}\n`;
    md += `**Date:** ${messages[0] ? new Date(parseFloat(messages[0].ts) * 1000).toISOString().split('T')[0] : 'unknown'}\n`;
    md += `**Messages:** ${messages.length}\n\n---\n\n`;

    for (const msg of messages) {
      const sender = await resolveUser(msg.user);
      const ts = new Date(parseFloat(msg.ts) * 1000);
      const timeStr = ts.toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'medium' });
      let text = msg.text || '';

      // Resolve <@U123> mentions
      const userMentions = text.match(/<@([A-Z0-9]+)>/g) || [];
      for (const mention of userMentions) {
        const uid = mention.slice(2, -1);
        const name = await resolveUser(uid);
        text = text.replace(mention, `@${name}`);
      }

      // Resolve <#C123|name> channel mentions
      text = text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

      // Resolve URLs
      text = text.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');
      text = text.replace(/<(https?:\/\/[^>]+)>/g, '$1');

      // File attachments
      let attachments = '';
      if (msg.files && msg.files.length > 0) {
        attachments = '\n> ' + msg.files.map(f => `[${f.name || 'file'}](${f.url_private || '#'})`).join(', ');
      }

      // Reactions
      let reactions = '';
      if (msg.reactions && msg.reactions.length > 0) {
        reactions = '\n> ' + msg.reactions.map(r => `:${r.name}: x${r.count}`).join(' ');
      }

      md += `**${sender}** — _${timeStr}_\n\n${text}${attachments}${reactions}\n\n---\n\n`;
    }

    return md;
  }

  // ============================================================
  // PUBLIC: Extract all threads from a channel
  // ============================================================
  window.extractThreads = async function(channelId, daysBack = 30) {
    const oldest = (Date.now() / 1000 - daysBack * 86400).toFixed(0);
    const channelName = await getChannelName(channelId);
    console.log(`Scanning #${channelName} for threads in the last ${daysBack} days...`);

    const history = await getChannelHistory(channelId, oldest);

    // Filter to messages that are thread parents (have reply_count > 0)
    const threadParents = history.filter(m => m.reply_count && m.reply_count > 0);
    console.log(`Found ${threadParents.length} threads out of ${history.length} messages.`);

    if (threadParents.length === 0) {
      console.log('No threads found.');
      return;
    }

    // Show summary
    const summaryRows = [];
    for (const tp of threadParents) {
      const sender = await resolveUser(tp.user);
      summaryRows.push({
        date: new Date(parseFloat(tp.ts) * 1000).toISOString().split('T')[0],
        sender,
        replies: tp.reply_count,
        preview: (tp.text || '').substring(0, 80),
      });
    }
    console.table(summaryRows);

    // Extract each thread
    const allMarkdowns = [];
    for (let i = 0; i < threadParents.length; i++) {
      const tp = threadParents[i];
      console.log(`[${i+1}/${threadParents.length}] Extracting thread (${tp.reply_count} replies)...`);

      const replies = await getThreadReplies(channelId, tp.ts);
      const md = await messagesToMarkdown(replies, `Thread ${i+1}`, channelName);
      allMarkdowns.push(md);

      await sleep(500); // rate limit between threads
    }

    const combined = allMarkdowns.join('\n\n========================================\n\n');
    const filename = `slack-${channelName}-threads-${daysBack}d-${new Date().toISOString().split('T')[0]}.md`;
    downloadFile(combined, filename);

    console.log(`\nDone! Downloaded ${threadParents.length} threads as ${filename}`);
    console.log(`Total size: ${(combined.length / 1024).toFixed(1)}KB`);
    return threadParents.length;
  };

  // ============================================================
  // PUBLIC: Extract a single thread
  // ============================================================
  window.extractThread = async function(channelId, threadTs) {
    const channelName = await getChannelName(channelId);
    console.log(`Extracting thread from #${channelName}...`);

    const replies = await getThreadReplies(channelId, threadTs);
    console.log(`Got ${replies.length} messages.`);

    const md = await messagesToMarkdown(replies, `Thread from #${channelName}`, channelName);
    const date = new Date(parseFloat(threadTs) * 1000).toISOString().split('T')[0];
    downloadFile(md, `slack-thread-${channelName}-${date}.md`);
    return replies.length;
  };

  // ============================================================
  // PUBLIC: Extract by Slack URL
  // ============================================================
  window.extractThreadByUrl = async function(url) {
    // Formats:
    //   .../archives/C123/p1700000000123456
    //   .../C123/thread/C123-1700000000123456
    let channelId, threadTs;

    const archiveMatch = url.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
    const threadMatch = url.match(/thread\/([A-Z0-9]+)-(\d+)/);

    if (archiveMatch) {
      channelId = archiveMatch[1];
      const raw = archiveMatch[2];
      threadTs = raw.substring(0, 10) + '.' + raw.substring(10);
    } else if (threadMatch) {
      channelId = threadMatch[1];
      const raw = threadMatch[2];
      threadTs = raw.substring(0, 10) + '.' + raw.substring(10);
    } else {
      console.error('Could not parse URL. Expected format with /archives/CHANNEL/pTIMESTAMP or /thread/CHANNEL-TIMESTAMP');
      return;
    }

    return await extractThread(channelId, threadTs);
  };

  // ============================================================
  // Utilities
  // ============================================================
  function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`Downloaded: ${filename}`);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // Init
  // ============================================================
  console.log(`
╔═══════════════════════════════════════════════════╗
║  Slack Thread Extractor (API mode) loaded!        ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  extractThreads("CHANNEL_ID", 30)                 ║
║    → All threads from last 30 days, downloads .md ║
║                                                   ║
║  extractThread("CHANNEL_ID", "1700000.123456")    ║
║    → Single thread by channel + ts                ║
║                                                   ║
║  extractThreadByUrl("https://slack.com/...")       ║
║    → Single thread by URL                         ║
║                                                   ║
║  Your channel: extractThreads("C017AUU0N2Y", 30)  ║
╚═══════════════════════════════════════════════════╝
  `);

})();
