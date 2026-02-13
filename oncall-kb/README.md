# BOR Write On-Call Knowledge Base

Local knowledge base for BOR Write / Ledger Management on-call shifts. Built from Notion docs, Slack threads, repo analysis, and architecture visualizations.

## Quick Start

During an incident, start here:

1. **What service is affected?** → [`services/`](services/)
2. **DLQ items need attention?** → [`runbooks/dlq-management.md`](runbooks/dlq-management.md)
3. **Need a specific procedure?** → [`runbooks/howto-quick-reference.md`](runbooks/howto-quick-reference.md)
4. **Looking for a dashboard/tool?** → [`bookmarks.md`](bookmarks.md)
5. **How do services connect?** → [`architecture/system-map.md`](architecture/system-map.md)
6. **Past incidents for patterns?** → [`raw/slack-analysis.json`](raw/slack-analysis.json)

## Structure

```
oncall-kb/
├── README.md                              ← You are here
├── bookmarks.md                           ← All dashboards, tools, Jira boards, Slack channels
├── services/
│   ├── oracle-gl-publisher.md             ← GL Publisher service overview + failure modes
│   ├── ledge.md                           ← Ledge service overview + failure modes
│   └── so-orders.md                       ← SO Orders service overview + failure modes
├── runbooks/
│   ├── dlq-management.md                  ← DLQ triage decision tree + safe actions
│   └── howto-quick-reference.md           ← 30+ condensed HOW-TO procedures with SQL
├── architecture/
│   ├── system-map.md                      ← 28 services, 22 Mermaid diagrams, data flows
│   ├── archviz-data.json                  ← Full architecture visualization data
│   └── archviz-summary.json               ← Condensed service metadata
├── raw/
│   └── slack-analysis.json                ← Categorized incident data from Slack threads
└── tools/
    ├── extract-slack-thread.sh            ← Slack API thread extractor (needs xoxp token)
    ├── slack-browser-extract.js           ← Browser console Slack extractor (no token needed)
    └── extract-archviz.js                 ← Architecture HTML → JSON converter
```

## Key Services

| Service | What It Does | On-Call Impact |
|---------|-------------|----------------|
| **Oracle GL Publisher** | Transforms Kafka activities → Oracle GL entries | DLQ failures, stuck imports, Oracle timeouts |
| **Ledge** | Back-office UI for ledger ops (replaces Oracle Forms) | Connection pool exhaustion, Oracle EBS issues |
| **SO Orders** | Order management for all asset types (Tier-1) | Stuck orders, SQS DLQ, batch processing |

## Sources

- **Notion**: [BOR Write On-Call Handbook](https://www.notion.so/wealthsimple/BOR-Write-On-Call-Handbook-4563585ccca84762b94166058d9a1c96)
- **Slack**: #bor-write-alerts (90 days of threads)
- **Repos**: ledge, oracle-gl-publisher, so-orders (local)
- **Architecture**: archviz HTML visualization (28 services, 22 diagrams)

## Updating This KB

After your on-call shift, add new learnings:
- New incident patterns → update relevant `runbooks/` doc
- New tools/dashboards discovered → add to `bookmarks.md`
- New failure modes → update relevant `services/` doc
- Extract more Slack threads → see instructions below

---

## Maintenance: How to Refresh Data

### Step 1: Extract New Slack Threads

We don't have Slack MCP integration yet, so extraction is manual via browser console.

1. Open `#bor-write-alerts` in browser: https://app.slack.com/client/E04G3BX5QPN/C017AUU0N2Y
2. Open DevTools Console (Cmd+Option+J)
3. Copy-paste the entire contents of `tools/slack-browser-extract.js` into the console
4. Run:
   ```js
   extractThreads("C017AUU0N2Y", 30)  // last 30 days, adjust as needed
   ```
5. A `.md` file will auto-download
6. Move it to the `raw/` directory:
   ```bash
   mv ~/Downloads/slack-bor-write-alerts-threads-*.md oncall-kb/raw/
   ```
7. Run the analyzer to update stats:
   ```bash
   node oncall-kb/tools/analyze-threads.js
   ```

**Other useful channels to extract:**
| Channel | ID | Purpose |
|---------|----|---------|
| #bor-write-alerts | C017AUU0N2Y | Main alerts (PagerDuty, Sentry, Datadog) |
| #bor-write-on-call | C0175002067 | Team discussion, ticket questions |
| #ledger-mgmt-oncall | C0175002067 | External requests from other teams |

### Step 2: Fetch New FLAMB/EOC Tickets

Copy-paste this prompt to Claude to refresh ticket data:

```
Read the on-call KB at /Users/saima.khan/workspace/oncall-kb/README.md for context.

Fetch recent FLAMB and EOC BOR Write Jira tickets from the last 2 months using
Notion search (mcp__notion__notion-search). Run these searches:

1. "FLAMB reversal" with date filter for last 2 months
2. "FLAMB book value correction" with date filter
3. "EOC BOR Write" with date filter for last 2 months
4. "EOC account synced Oracle" with date filter
5. "EOC ledger missing transaction" with date filter
6. "EOC GL Publisher" with date filter

For each ticket found, fetch full details with mcp__notion__notion-fetch.

Update these files with the new findings:
- /Users/saima.khan/workspace/oncall-kb/raw/flamb-tickets-recent.md
- /Users/saima.khan/workspace/oncall-kb/raw/eoc-tickets-recent.md

Then update the field guide at oncall-field-guide.md if any new ticket
patterns emerge that aren't already covered in the Top 15.

Finally regenerate the HTML: node tools/generate-site.js
```

### Step 3: Update the On-Call Handbook Content

If the Notion handbook has been updated, copy-paste this prompt to Claude:

```
Fetch the latest BOR Write On-Call Handbook from Notion:
https://www.notion.so/wealthsimple/BOR-Write-On-Call-Handbook-4563585ccca84762b94166058d9a1c96

Also fetch the HOW-TO page:
https://www.notion.so/5e19786b1c4c4538927de20faf9e32ad

Compare with the existing runbooks in /Users/saima.khan/workspace/oncall-kb/runbooks/
and update:
- runbooks/dlq-management.md — if DLQ rules changed
- runbooks/howto-quick-reference.md — if new procedures were added
- runbooks/flamb-eoc-guide.md — if reversal rules or routing changed
- bookmarks.md — if new dashboards/tools were added

Then regenerate: node tools/generate-site.js
```

### Step 4: Add a Specific Incident Write-up

After handling a notable incident, paste this to Claude:

```
I just handled an on-call incident. Here are the details:

[Paste the Slack thread, ticket link, or your notes here]

Please:
1. Create an incident write-up at oncall-kb/incidents/YYYY-MM-DD-short-title.md
2. Update the relevant service doc if a new failure mode was discovered
3. Update the field guide if this represents a new ticket type pattern
4. Regenerate the HTML: node tools/generate-site.js
```

### Step 5: Regenerate the HTML App

After ANY content changes, regenerate:

```bash
cd /Users/saima.khan/workspace/oncall-kb
node tools/generate-site.js
open oncall-kb.html
```

This bundles all `.md` files into a single navigable HTML file.

---

## Full Refresh (All Steps Combined)

Copy-paste this to Claude for a complete data refresh:

```
I want to refresh my on-call knowledge base at /Users/saima.khan/workspace/oncall-kb/

Please do ALL of the following using subagents in parallel:

1. Fetch latest FLAMB tickets (last 2 months) from Notion search and update
   raw/flamb-tickets-recent.md

2. Fetch latest EOC BOR Write tickets (last 2 months) from Notion search and
   update raw/eoc-tickets-recent.md

3. Fetch the latest BOR Write On-Call Handbook from Notion and update any
   runbooks that have changed

4. If I have new Slack thread exports in ~/Downloads/slack-*.md, analyze them
   with: node tools/analyze-threads.js

5. Update oncall-field-guide.md if new patterns emerged

6. Regenerate the HTML app: node tools/generate-site.js
```
