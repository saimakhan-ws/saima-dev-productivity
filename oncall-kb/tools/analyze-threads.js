#!/usr/bin/env node

/**
 * analyze-threads.js
 *
 * Reads a Slack thread export markdown file, parses each thread into
 * structured data, and produces:
 *   1. raw/slack-analysis.json   - per-thread structured data
 *   2. raw/slack-summary.md      - aggregate summary with breakdowns
 */

const fs = require('fs');
const path = require('path');

// -- Config -------------------------------------------------------------------
const INPUT_FILE  = '/Users/saima.khan/Downloads/slack-bor-write-alerts-threads-90d-2026-02-13.md';
const OUTPUT_DIR  = '/Users/saima.khan/workspace/oncall-kb/raw';
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'slack-analysis.json');
const MD_OUTPUT   = path.join(OUTPUT_DIR, 'slack-summary.md');

const THREAD_SEPARATOR = '========================================';

const BOT_SENDERS = new Set([
  'bot',
  'pagerduty_slack_bot',
  'sentry',
]);

const KEY_TERMS = [
  'DLQ',
  'connection pool',
  'HikariCP',
  'Oracle',
  'ORA-',
  'Kafka',
  'deploy',
  'redeploy',
  'timeout',
  'import',
  'reversal',
  'stuck',
  'failed',
  'optimistic lock',
  'OOM',
  'lending',
  'fee',
  'settlement',
];

// Known service names to filter bracket matches
const KNOWN_SERVICES = new Set([
  'oracle-gl-publisher',
  'ledge',
  'api-container',
  'workers',
  'ledge-temporal-worker',
  'grouped-activities-processor',
  'audit-status-processor',
  'queue-processor',
  'import-check-service',
]);

// -- Helpers ------------------------------------------------------------------

/**
 * Parse a single thread block into a structured object.
 */
function parseThread(block) {
  const lines = block.split('\n');

  // Thread number
  const threadMatch = block.match(/^# Thread (\d+)/m);
  const thread_number = threadMatch ? parseInt(threadMatch[1], 10) : null;

  // Date
  const dateMatch = block.match(/\*\*Date:\*\*\s*(\S+)/);
  const date = dateMatch ? dateMatch[1] : null;

  // Message count
  const msgMatch = block.match(/\*\*Messages:\*\*\s*(\d+)/);
  const message_count = msgMatch ? parseInt(msgMatch[1], 10) : null;

  // Parse individual messages
  // Messages start with **SenderName** -- _date, time_
  const messages = [];
  const msgRegex = /^\*\*(.+?)\*\*\s*\u2014\s*_(.+?)_\s*$/;

  let currentSender = null;
  let currentTimestamp = null;
  let currentBody = [];

  for (const line of lines) {
    const m = line.match(msgRegex);
    if (m) {
      // Save previous message
      if (currentSender !== null) {
        messages.push({
          sender: currentSender,
          timestamp: currentTimestamp,
          text: currentBody.join('\n').trim(),
        });
      }
      currentSender = m[1].trim();
      currentTimestamp = m[2].trim();
      currentBody = [];
    } else if (currentSender !== null && line !== '---' && line !== '') {
      currentBody.push(line);
    }
  }
  // Push the last message
  if (currentSender !== null) {
    messages.push({
      sender: currentSender,
      timestamp: currentTimestamp,
      text: currentBody.join('\n').trim(),
    });
  }

  // First non-bot sender
  const firstHumanMsg = messages.find(
    (msg) => !BOT_SENDERS.has(msg.sender.toLowerCase())
  );
  const first_sender = firstHumanMsg ? firstHumanMsg.sender : null;
  const first_message_text = firstHumanMsg ? firstHumanMsg.text : null;

  // has_pagerduty
  const lowerBlock = block.toLowerCase();
  const has_pagerduty = lowerBlock.includes('pagerduty');

  // has_sentry
  const has_sentry = lowerBlock.includes('sentry');

  // Service extraction
  const serviceSet = new Set();
  const serviceRegex = /\[([\w][\w-]*)\]/g;
  let sMatch;
  while ((sMatch = serviceRegex.exec(block)) !== null) {
    const candidate = sMatch[1].toLowerCase();
    if (KNOWN_SERVICES.has(candidate)) {
      serviceSet.add(candidate);
    }
  }
  const service = Array.from(serviceSet);

  // People involved (excluding bots)
  const peopleSet = new Set();
  for (const msg of messages) {
    if (!BOT_SENDERS.has(msg.sender.toLowerCase())) {
      peopleSet.add(msg.sender);
    }
  }
  // Also extract names mentioned by PagerDuty "by [Name](...)"
  const ackRegex = /by \[([A-Z][a-zA-Z ]+)\]\(/g;
  let ackMatch;
  while ((ackMatch = ackRegex.exec(block)) !== null) {
    const name = ackMatch[1].trim();
    if (
      !name.toLowerCase().includes('datadog') &&
      !name.toLowerCase().includes('pagerduty') &&
      !name.toLowerCase().includes('service account')
    ) {
      peopleSet.add(name);
    }
  }
  const people_involved = Array.from(peopleSet);

  // Key terms
  const key_terms = [];
  for (const term of KEY_TERMS) {
    const termLower = term.toLowerCase();
    if (lowerBlock.includes(termLower)) {
      key_terms.push(term);
    }
  }

  return {
    thread_number,
    date,
    message_count,
    first_sender,
    first_message_text,
    has_pagerduty,
    has_sentry,
    service,
    people_involved,
    key_terms,
  };
}

/**
 * Generate a markdown summary from the parsed threads.
 */
function generateSummary(threads) {
  const lines = [];
  lines.push('# Slack Thread Analysis Summary');
  lines.push(`> Generated on ${new Date().toISOString().split('T')[0]} from \`slack-bor-write-alerts-threads-90d-2026-02-13.md\``);
  lines.push('');

  // -- Total thread count --
  lines.push('## Overview');
  lines.push(`- **Total threads analyzed:** ${threads.length}`);

  // Date range
  const dates = threads.map((t) => t.date).filter(Boolean).sort();
  if (dates.length > 0) {
    lines.push(`- **Date range:** ${dates[0]} to ${dates[dates.length - 1]}`);
  }

  // Average messages per thread
  const totalMsgs = threads.reduce((sum, t) => sum + (t.message_count || 0), 0);
  lines.push(`- **Total messages:** ${totalMsgs}`);
  lines.push(`- **Average messages per thread:** ${(totalMsgs / threads.length).toFixed(1)}`);
  lines.push('');

  // -- Breakdown by service --
  lines.push('## Breakdown by Service');
  lines.push('');
  const serviceCounts = {};
  for (const t of threads) {
    if (t.service.length === 0) {
      serviceCounts['(unidentified)'] = (serviceCounts['(unidentified)'] || 0) + 1;
    }
    for (const s of t.service) {
      serviceCounts[s] = (serviceCounts[s] || 0) + 1;
    }
  }
  const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]);
  lines.push('| Service | Thread Count |');
  lines.push('|---------|-------------|');
  for (const [svc, count] of sortedServices) {
    lines.push(`| ${svc} | ${count} |`);
  }
  lines.push('');

  // -- Breakdown by key terms --
  lines.push('## Breakdown by Key Terms');
  lines.push('');
  const termCounts = {};
  for (const t of threads) {
    for (const term of t.key_terms) {
      termCounts[term] = (termCounts[term] || 0) + 1;
    }
  }
  const sortedTerms = Object.entries(termCounts).sort((a, b) => b[1] - a[1]);
  lines.push('| Key Term | Thread Count |');
  lines.push('|----------|-------------|');
  for (const [term, count] of sortedTerms) {
    const pct = ((count / threads.length) * 100).toFixed(1);
    lines.push(`| ${term} | ${count} (${pct}%) |`);
  }
  lines.push('');

  // -- Top contributors --
  lines.push('## Top Contributors');
  lines.push('');
  const peopleCounts = {};
  for (const t of threads) {
    for (const p of t.people_involved) {
      peopleCounts[p] = (peopleCounts[p] || 0) + 1;
    }
  }
  const sortedPeople = Object.entries(peopleCounts).sort((a, b) => b[1] - a[1]);
  lines.push('| Person | Threads Involved |');
  lines.push('|--------|-----------------|');
  for (const [person, count] of sortedPeople.slice(0, 20)) {
    lines.push(`| ${person} | ${count} |`);
  }
  lines.push('');

  // -- Timeline chart (threads per week) --
  lines.push('## Timeline: Threads per Week');
  lines.push('');

  // Group by ISO week (Monday start)
  const weekCounts = {};
  for (const t of threads) {
    if (!t.date) continue;
    const d = new Date(t.date + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = monday.toISOString().split('T')[0];
    weekCounts[weekKey] = (weekCounts[weekKey] || 0) + 1;
  }

  const sortedWeeks = Object.entries(weekCounts).sort((a, b) => a[0].localeCompare(b[0]));
  const maxWeekCount = Math.max(...sortedWeeks.map(([, c]) => c));

  lines.push('```');
  lines.push('Week Starting    | Count | Distribution');
  lines.push('-----------------+-------+' + '-'.repeat(52));
  for (const [week, count] of sortedWeeks) {
    const barLen = Math.round((count / maxWeekCount) * 50);
    const bar = '\u2588'.repeat(barLen);
    lines.push(`${week}  |  ${String(count).padStart(3)}  | ${bar}`);
  }
  lines.push('```');
  lines.push('');

  // -- PagerDuty / Sentry involvement --
  lines.push('## Alert Source Involvement');
  lines.push('');
  const pdCount = threads.filter((t) => t.has_pagerduty).length;
  const sentryCount = threads.filter((t) => t.has_sentry).length;
  lines.push(`- **Threads mentioning PagerDuty:** ${pdCount} (${((pdCount / threads.length) * 100).toFixed(1)}%)`);
  lines.push(`- **Threads mentioning Sentry:** ${sentryCount} (${((sentryCount / threads.length) * 100).toFixed(1)}%)`);
  lines.push('');

  // -- Most common co-occurring key terms --
  lines.push('## Common Key Term Co-occurrences');
  lines.push('');
  const coOccurrences = {};
  for (const t of threads) {
    const terms = [...t.key_terms].sort();
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const pair = `${terms[i]} + ${terms[j]}`;
        coOccurrences[pair] = (coOccurrences[pair] || 0) + 1;
      }
    }
  }
  const sortedPairs = Object.entries(coOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (sortedPairs.length > 0) {
    lines.push('| Term Pair | Thread Count |');
    lines.push('|-----------|-------------|');
    for (const [pair, count] of sortedPairs) {
      lines.push(`| ${pair} | ${count} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// -- Main ---------------------------------------------------------------------
function main() {
  console.log(`Reading ${INPUT_FILE} ...`);
  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');

  // Split into thread blocks
  const blocks = raw.split(THREAD_SEPARATOR).map((b) => b.trim()).filter(Boolean);
  console.log(`Found ${blocks.length} thread blocks.`);

  const threads = [];
  for (const block of blocks) {
    if (!block.match(/^# Thread \d+/m)) {
      console.warn('  Skipping non-thread block (no "# Thread N" header).');
      continue;
    }
    threads.push(parseThread(block));
  }
  console.log(`Parsed ${threads.length} threads.`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write JSON
  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(threads, null, 2), 'utf-8');
  console.log(`Wrote ${JSON_OUTPUT}`);

  // Write summary markdown
  const summary = generateSummary(threads);
  fs.writeFileSync(MD_OUTPUT, summary, 'utf-8');
  console.log(`Wrote ${MD_OUTPUT}`);

  // Print quick stats to console
  console.log('\n--- Quick Stats ---');
  console.log(`Total threads: ${threads.length}`);
  const termCounts = {};
  for (const t of threads) {
    for (const term of t.key_terms) {
      termCounts[term] = (termCounts[term] || 0) + 1;
    }
  }
  const topTerms = Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log('Top key terms:');
  for (const [term, count] of topTerms) {
    console.log(`  ${term}: ${count}`);
  }
}

main();
