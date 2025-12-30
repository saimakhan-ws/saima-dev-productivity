---
description: Create a feature branch and carry over uncommitted changes
argument-hint: "[Jira ID or URL]"
---

# Feature Branch Creator (with auto-move)

## 1. Extract Jira ID
- If an argument was provided, use it.
- Otherwise, use `AskUserQuestion`: "What is the Jira ID or URL for this feature?"
- Extract the ID (e.g., `LO-2164`) from the input.

## 2. Handle Uncommitted Changes
- Run `git status --porcelain` to check for local changes.
- If changes exist:
    1. **Stash:** Run `git stash push --include-untracked -m "Temp stash for <Jira-ID>"`
    2. **Note:** Inform me: "I've temporarily stashed your local changes to move them."

## 3. Create Branch
- Run `git checkout -b <Jira-ID>`
- If branch already exists, ask to switch to it instead.

## 4. Restore Changes
- If a stash was created in Step 2:
    1. **Pop:** Run `git stash pop`
    2. **Success:** Inform me: "Your local changes have been moved to branch <Jira-ID>."

## 5. Summary
- Run `git status` to show the current state.
- Ask: "I'm ready on branch <Jira-ID>. What should we code first?"
