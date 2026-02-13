#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# extract-slack-thread.sh
# Extracts a Slack thread to markdown, ready for the on-call knowledge base.
#
# Usage:
#   ./extract-slack-thread.sh <slack-thread-url> [output-file.md]
#
# Examples:
#   ./extract-slack-thread.sh "https://wealthsimple.slack.com/archives/C12345ABC/p1700000000123456"
#   ./extract-slack-thread.sh "https://wealthsimple.slack.com/archives/C12345ABC/p1700000000123456" incident-2024-01.md
#
# Setup:
#   1. Create a Slack app at https://api.slack.com/apps
#   2. Add OAuth scopes: channels:history, groups:history, users:read, channels:read, groups:read
#   3. Install to workspace and copy User OAuth Token (xoxp-...)
#   4. Store token: echo "xoxp-your-token" > ~/.config/oncall-tools/slack-token
#      chmod 600 ~/.config/oncall-tools/slack-token
# =============================================================================

CONFIG_DIR="$HOME/.config/oncall-tools"
TOKEN_FILE="$CONFIG_DIR/slack-token"
USER_CACHE_FILE="$CONFIG_DIR/.user-cache.json"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --- Check dependencies ---
for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
        echo -e "${RED}Error: '$cmd' is required but not installed.${NC}" >&2
        exit 1
    fi
done

# --- Load token ---
if [[ ! -f "$TOKEN_FILE" ]]; then
    echo -e "${RED}Error: Slack token not found at $TOKEN_FILE${NC}" >&2
    echo ""
    echo "Setup instructions:"
    echo "  mkdir -p $CONFIG_DIR"
    echo "  echo 'xoxp-your-token-here' > $TOKEN_FILE"
    echo "  chmod 600 $TOKEN_FILE"
    exit 1
fi

SLACK_TOKEN="$(cat "$TOKEN_FILE" | tr -d '[:space:]')"

if [[ -z "$SLACK_TOKEN" || "$SLACK_TOKEN" != xoxp-* ]]; then
    echo -e "${RED}Error: Invalid token. Must start with 'xoxp-'${NC}" >&2
    exit 1
fi

# --- Parse arguments ---
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <slack-thread-url> [output-file.md]"
    echo ""
    echo "Example: $0 'https://wealthsimple.slack.com/archives/C12345/p1700000000123456'"
    exit 1
fi

SLACK_URL="$1"
OUTPUT_FILE="${2:-}"

# --- Parse URL into channel + thread_ts ---
# URL format: https://<workspace>.slack.com/archives/<channel_id>/p<timestamp>
if [[ "$SLACK_URL" =~ archives/([A-Z0-9]+)/p([0-9]+) ]]; then
    CHANNEL_ID="${BASH_REMATCH[1]}"
    RAW_TS="${BASH_REMATCH[2]}"
    # Slack timestamps: first 10 digits are epoch seconds, rest are microseconds
    THREAD_TS="${RAW_TS:0:10}.${RAW_TS:10}"
else
    echo -e "${RED}Error: Could not parse Slack URL.${NC}" >&2
    echo "Expected format: https://<workspace>.slack.com/archives/<CHANNEL_ID>/p<TIMESTAMP>" >&2
    exit 1
fi

echo -e "${GREEN}Channel: $CHANNEL_ID | Thread: $THREAD_TS${NC}"

# --- Helper: Slack API call with pagination ---
slack_api() {
    local endpoint="$1"
    shift
    curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        "https://slack.com/api/$endpoint" "$@"
}

# --- Get channel info ---
echo -e "${YELLOW}Fetching channel info...${NC}"
CHANNEL_INFO=$(slack_api "conversations.info" -d "channel=$CHANNEL_ID")

if [[ "$(echo "$CHANNEL_INFO" | jq -r '.ok')" != "true" ]]; then
    CHANNEL_NAME="unknown-channel"
    echo -e "${YELLOW}Warning: Could not fetch channel info (may need channels:read scope). Continuing...${NC}"
else
    CHANNEL_NAME=$(echo "$CHANNEL_INFO" | jq -r '.channel.name // "unknown"')
fi

# --- Fetch thread replies (with pagination) ---
echo -e "${YELLOW}Fetching thread messages...${NC}"
ALL_MESSAGES="[]"
CURSOR=""
PAGE=1

while true; do
    PARAMS="channel=$CHANNEL_ID&ts=$THREAD_TS&limit=200&inclusive=true"
    if [[ -n "$CURSOR" ]]; then
        PARAMS="$PARAMS&cursor=$CURSOR"
    fi

    RESPONSE=$(slack_api "conversations.replies" -d "$PARAMS")

    if [[ "$(echo "$RESPONSE" | jq -r '.ok')" != "true" ]]; then
        ERROR=$(echo "$RESPONSE" | jq -r '.error // "unknown error"')
        echo -e "${RED}Error fetching thread: $ERROR${NC}" >&2
        if [[ "$ERROR" == "not_in_channel" ]]; then
            echo "Hint: Join the channel first, or use a bot token with the right scopes." >&2
        fi
        exit 1
    fi

    BATCH=$(echo "$RESPONSE" | jq '.messages // []')
    BATCH_COUNT=$(echo "$BATCH" | jq 'length')
    ALL_MESSAGES=$(echo "$ALL_MESSAGES $BATCH" | jq -s '.[0] + .[1]')

    echo -e "  Page $PAGE: $BATCH_COUNT messages"

    CURSOR=$(echo "$RESPONSE" | jq -r '.response_metadata.next_cursor // ""')
    if [[ -z "$CURSOR" ]]; then
        break
    fi
    PAGE=$((PAGE + 1))
done

TOTAL=$(echo "$ALL_MESSAGES" | jq 'length')
echo -e "${GREEN}Total messages: $TOTAL${NC}"

if [[ "$TOTAL" -eq 0 ]]; then
    echo -e "${RED}No messages found in thread.${NC}" >&2
    exit 1
fi

# --- Build user cache (resolve user IDs to names) ---
echo -e "${YELLOW}Resolving user names...${NC}"

# Initialize cache file if needed
if [[ ! -f "$USER_CACHE_FILE" ]]; then
    echo '{}' > "$USER_CACHE_FILE"
fi

USER_IDS=$(echo "$ALL_MESSAGES" | jq -r '.[].user // empty' | sort -u)
USER_CACHE=$(cat "$USER_CACHE_FILE")

for UID in $USER_IDS; do
    CACHED_NAME=$(echo "$USER_CACHE" | jq -r --arg uid "$UID" '.[$uid] // ""')
    if [[ -z "$CACHED_NAME" ]]; then
        USER_RESP=$(slack_api "users.info" -d "user=$UID")
        if [[ "$(echo "$USER_RESP" | jq -r '.ok')" == "true" ]]; then
            DISPLAY_NAME=$(echo "$USER_RESP" | jq -r '.user.profile.display_name // .user.real_name // .user.name // "unknown"')
            USER_CACHE=$(echo "$USER_CACHE" | jq --arg uid "$UID" --arg name "$DISPLAY_NAME" '. + {($uid): $name}')
            echo -e "  Resolved: $UID -> $DISPLAY_NAME"
        else
            USER_CACHE=$(echo "$USER_CACHE" | jq --arg uid "$UID" '. + {($uid): "unknown-user"}')
        fi
        sleep 0.3  # Rate limiting
    fi
done

# Save updated cache
echo "$USER_CACHE" > "$USER_CACHE_FILE"

# --- Convert messages to markdown ---
echo -e "${YELLOW}Converting to markdown...${NC}"

# Get thread date from first message
THREAD_DATE=$(echo "$ALL_MESSAGES" | jq -r '.[0].ts' | cut -d. -f1 | xargs -I{} date -r {} "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown date")

MARKDOWN="# Slack Thread: #${CHANNEL_NAME}
**Date:** ${THREAD_DATE}
**Thread URL:** ${SLACK_URL}
**Messages:** ${TOTAL}

---
"

# Process each message
while IFS= read -r MSG; do
    USER_ID=$(echo "$MSG" | jq -r '.user // "bot"')
    USERNAME=$(echo "$USER_CACHE" | jq -r --arg uid "$USER_ID" '.[$uid] // "bot"')
    TS=$(echo "$MSG" | jq -r '.ts' | cut -d. -f1)
    TIMESTAMP=$(date -r "$TS" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
    TEXT=$(echo "$MSG" | jq -r '.text // ""')

    # Resolve <@U12345> user mentions in message text
    while [[ "$TEXT" =~ \<@([A-Z0-9]+)\> ]]; do
        MENTION_UID="${BASH_REMATCH[1]}"
        MENTION_NAME=$(echo "$USER_CACHE" | jq -r --arg uid "$MENTION_UID" '.[$uid] // $uid')
        TEXT="${TEXT//<@$MENTION_UID>/@$MENTION_NAME}"
    done

    # Resolve <#C12345|channel-name> channel mentions
    TEXT=$(echo "$TEXT" | sed -E 's/<#[A-Z0-9]+\|([^>]+)>/#\1/g')

    # Resolve URLs: <https://...|label> -> [label](url) or just the URL
    TEXT=$(echo "$TEXT" | sed -E 's/<(https?:\/\/[^|>]+)\|([^>]+)>/[\2](\1)/g')
    TEXT=$(echo "$TEXT" | sed -E 's/<(https?:\/\/[^>]+)>/\1/g')

    # Check for attachments/files
    ATTACHMENTS=""
    FILE_COUNT=$(echo "$MSG" | jq '.files // [] | length')
    if [[ "$FILE_COUNT" -gt 0 ]]; then
        ATTACHMENTS="\n> _[${FILE_COUNT} file(s) attached]_"
    fi

    # Check for reactions
    REACTIONS=""
    REACTION_COUNT=$(echo "$MSG" | jq '.reactions // [] | length')
    if [[ "$REACTION_COUNT" -gt 0 ]]; then
        REACTIONS=$(echo "$MSG" | jq -r '.reactions[] | ":\(.name): x\(.count)"' | tr '\n' ' ')
        REACTIONS="\n> Reactions: $REACTIONS"
    fi

    MARKDOWN+="
### ${USERNAME} — ${TIMESTAMP}

${TEXT}${ATTACHMENTS}${REACTIONS}

---
"
done < <(echo "$ALL_MESSAGES" | jq -c '.[]')

# --- Output ---
if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$MARKDOWN" > "$OUTPUT_FILE"
    echo -e "${GREEN}Saved to: $OUTPUT_FILE${NC}"
else
    echo "$MARKDOWN"
fi

echo -e "${GREEN}Done!${NC}"
