---
name: standup
description: Use when preparing daily standup updates - gathers Claude conversation history, GitHub PRs authored and reviewed, Jira tickets, Notion docs, and Google Drive meeting notes from the past 24h, interviews for subjective inputs, compiles a Slack-formatted standup, and copies to clipboard
---

# Daily Standup Generator

Generate a standup update by gathering activity from the last 24 hours (or 72h on Mondays) and interviewing for subjective inputs.

## Team Standup Format (Slack markdown)

```
Daily Standup Submission from @Saima Khan

*How do you feel today?*
<answer>

*What did you do since your last check-in?*
<bullets grouped by topic/project>

*What will you do today?*
<answer>

*Any blockers or impediments?*
<answer>
```

## Step 1: Determine Time Window

The window is always **yesterday 9:00 AM EST to today 9:00 AM EST**, except on Monday where it's **Friday 9:00 AM EST to today 9:00 AM EST**. This ensures consistent coverage regardless of when you run the skill.

Calculate the cutoff in UTC:
- **Monday:** Friday 9:00 AM EST = Friday 14:00 UTC
- **All other days:** Yesterday 9:00 AM EST = Yesterday 14:00 UTC

Use these timestamps for all data gathering below.

## Step 2: Gather Data (use 5 parallel subagents)

### Subagent 1: Claude Conversation History

Run a bash command to extract user and assistant messages from the time window:

```bash
python3 -c "
import json, os, glob
from datetime import datetime, timedelta, timezone

# Calculate cutoff: yesterday 9 AM EST (or Friday 9 AM EST on Monday)
now = datetime.now(timezone.utc)
today_9am_est = now.replace(hour=14, minute=0, second=0, microsecond=0)
if now.weekday() == 0:  # Monday
    cutoff = today_9am_est - timedelta(days=3)  # Friday 9 AM EST
else:
    cutoff = today_9am_est - timedelta(days=1)  # Yesterday 9 AM EST
seen_sessions = set()
entries = []

for project_dir in glob.glob(os.path.expanduser('~/.claude/projects/*')):
    for jsonl_file in glob.glob(os.path.join(project_dir, '*.jsonl')):
        # Only read files modified within the window
        mtime = datetime.fromtimestamp(os.path.getmtime(jsonl_file), tz=timezone.utc)
        if mtime < cutoff:
            continue
        with open(jsonl_file) as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    if entry.get('type') in ('user', 'assistant') and 'timestamp' in entry:
                        ts = datetime.fromisoformat(entry['timestamp'].replace('Z', '+00:00'))
                        if ts >= cutoff:
                            sid = entry.get('sessionId', 'unknown')
                            msg_raw = entry.get('message', '')
                            # Parse message content
                            if isinstance(msg_raw, str):
                                try:
                                    msg_obj = json.loads(msg_raw.replace(chr(39), chr(34)))
                                except:
                                    msg_obj = {'content': msg_raw}
                            else:
                                msg_obj = msg_raw
                            content = msg_obj.get('content', '')
                            if isinstance(content, list):
                                content = ' '.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text')
                            # Truncate long messages
                            content = content[:500] if content else ''
                            if content.strip():
                                entries.append({
                                    'session': sid,
                                    'type': entry['type'],
                                    'time': entry['timestamp'],
                                    'content': content,
                                    'project': project_dir.split('/')[-1]
                                })
                except:
                    pass

# Group by session, output summary
from collections import defaultdict
sessions = defaultdict(list)
for e in entries:
    sessions[e['session']].append(e)

for sid, msgs in sessions.items():
    project = msgs[0]['project']
    print(f'\\n=== Session in {project} ===')
    for m in msgs[:20]:  # Cap per session
        role = 'YOU' if m['type'] == 'user' else 'CLAUDE'
        print(f'[{role}] {m[\"content\"][:300]}')
"
```

Take the output and summarize into concise work items grouped by topic/project. Ignore meta-conversations (e.g., about configuring Claude itself) unless they resulted in meaningful output.

### Subagent 2: GitHub PRs

Run these two commands:

```bash
# Calculate cutoff date: yesterday 9 AM EST (or Friday 9 AM EST on Monday)
# On Monday: CUTOFF=$(date -u -v-fridayH ... ) — use Friday 14:00 UTC
# Other days: CUTOFF=$(date -u -v-1d -j -f "%H:%M:%S" "14:00:00" +%Y-%m-%dT%H:%M:%S)

# PRs authored
gh search prs --author @me --created ">=$CUTOFF" --json title,repository,number,state,url --limit 20

# PRs reviewed
gh search prs --reviewed-by @me --updated ">=$CUTOFF" --json title,repository,number,state,url --limit 20

# PRs updated (pushed commits, responded to comments, etc.)
gh search prs --involves @me --updated ">=$CUTOFF" --json title,repository,number,state,url --limit 20
```

Deduplicate across the three lists (a PR may appear in multiple). Format:
- Authored PRs as individual bullets
- Reviewed PRs as a single bullet with a comma-separated list
- PRs that only appear in the "updated" list (not authored or reviewed) — include as "Updated/worked on: repo#123, repo#456"

### Subagent 3: Notion Docs

Use the Notion MCP tools:

1. Search for docs created by Saima Khan (user ID: `2a1d872b-594c-81e3-bce8-0002ba2cd8b9`) in the time window:
   ```
   notion-search with query "*" and filters: created_by_user_ids + created_date_range
   ```

2. Search for docs edited recently (may overlap with created — deduplicate by page ID):
   ```
   notion-search with query "*" and filters: created_date_range for last_edited range
   ```

Extract page titles. Skip trivially small edits if possible (e.g., meeting notes auto-created by Notion calendar integration — include them but don't overweight).

### Subagent 4: Jira Tickets

Use Notion AI search (connected sources) to find Jira activity:

```
notion-search with query "Saima Khan" and content_search_mode "ai_search"
filters: created_date_range with start_date = cutoff date
```

From the results, filter to entries where `type` is `"jira"` AND the result mentions Saima Khan (in highlight, as creator, assignee, or commenter). Extract:
- Ticket ID and title (e.g., "LW-2825: Dependabots related investigation and fixes")
- Your involvement: created, commented, assigned, or transitioned

Ignore Jira boards/projects (results that are just board listings without specific ticket activity).

### Subagent 5: Google Drive Meeting Notes

From the same Notion AI search results (subagent 4 can share the search), filter to entries where `type` is `"google-drive"` AND the highlight mentions Saima Khan.

These are typically Gemini-generated meeting notes. Extract:
- Meeting name and date
- Key discussion points or action items involving you (from the highlight text)
- Skip generic shared docs that just happen to mention your name in a list

Format as meeting summaries like: "Discussed C2 planning with Emmed and Marina" or "Action item: finish reliability work by end of week"

## Step 3: Compile Draft

Compile all gathered data into a draft standup immediately — do NOT wait for user input first. Use placeholder text for the subjective fields:

- **"How do you feel today?"** → `[will ask]`
- **"What did you do"** section: Group bullets by topic/project, NOT by data source. If the same project appears in Claude conversations, PRs, and Notion — merge under one heading.
- **Reviewed PRs**: Single bullet like "Reviewed PRs: repo#123, repo#456"
- **Keep concise**: Aim for 6-8 bullets max in the "what did you do" section. Consolidate related items.
- **"What will you do today?"** → `[will ask]`
- **"Any blockers or impediments?"** → `[will ask]`
- **Use Slack markdown**: `*bold*` for headers, `-` for bullets, no code blocks unless quoting something specific.

Present this draft to the user so they can see what was gathered while you ask the interview questions.

## Step 4: Interview

Show the draft and ask the user these questions using AskUserQuestion:

1. **"How do you feel today?"** — Options: Green, Yellow, Red, plus Other for elaboration
2. **"What will you do today?"** — Free text (Other only)
3. **"Any blockers or impediments?"** — Options: "None", plus Other for details

Also ask: **"Anything to add, remove, or change in the 'what did you do' section?"**

## Step 5: Finalize

Merge interview answers into the draft. If the user requested changes to the "what did you do" section, apply them. Show the final standup and ask: "Looks good? Say 'yes' to copy to clipboard."

If the user requests further changes, apply and re-show. Loop until approved.

## Step 6: Output

Once approved:

1. Print the final standup to terminal
2. Copy to clipboard: `echo "<final standup>" | pbcopy`
3. Confirm: "Copied to clipboard — paste into Slack!"

## Important Notes

- GitHub username: `saimakhan-ws`
- Notion user ID: `2a1d872b-594c-81e3-bce8-0002ba2cd8b9`
- **Optimization:** Subagents 3, 4, and 5 can share Notion search results. Run one broad AI search for "Saima Khan" with date filter, then split results by `type` field: `page` → Notion docs, `jira` → Jira tickets, `google-drive` → meeting notes. This means you can combine subagents 3+4+5 into a single subagent if preferred.
- If a data source returns nothing, skip it silently — don't mention empty sources
- Deduplicate across sources — if a PR and a Claude conversation are about the same work, combine them
- For Jira results: ignore board/project-level results (e.g., "EOC: Engineering On-Call") — only include specific tickets where you were active
- For Google Drive results: focus on meeting notes that mention your name in the context of discussions or action items, not shared spreadsheets or unrelated docs
- Output must be valid Slack markdown (not GitHub markdown)
