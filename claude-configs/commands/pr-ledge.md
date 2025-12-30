# Custom Command: /pr-ledge

## Step 1: Initial Working Directory Check
1. **Check Status:** Run `git status --porcelain`.
2. **Handle Dirty State:** If the output is NOT empty:
   - Use `AskUserQuestion`: "⚠️ You have uncommitted changes. Would you like to proceed anyway? (yes/no)"
   - If the response is "no", **stop execution**.

## Step 2: Existing PR Check
1. **Check for PR:** Run `gh pr list --head $(git branch --show-current) --json url,number,title`.
2. **Conditional Logic:** If an existing PR is found:
   - Use `AskUserQuestion`: "🔍 An existing PR (#<number>) was found. Should I push the latest changes to update it? (yes/no)"
   - If "yes": 
     - Use `AskUserQuestion`: "📝 Would you also like to update the PR description based on the template? (yes/no)"
     - Store the "Update Description" preference.
   - If "no", **stop execution**.
3. **New PR Path:** If no PR is found, proceed to Step 3 as a new PR flow.

## Step 3: User Interview & Setup
1. **Ask:** Use the `AskUserQuestion` tool to ask: "What is the Jira ID for this PR? (e.g., PROJ-123)".
2. **Persistence:** Store this ID in memory for the duration of this command.

## Step 4: Sync & Rebase
1. **Fetch:** Run `git fetch origin main`.
2. **Rebase Attempt:** Run `git rebase origin/main`.
3. **Status Check:** - If rebase is **successful**: Inform me "✅ Rebase successful. Branch is now up to date with origin/main."
   - If there are **conflicts**: 
     - Inform me "❌ Rebase failed due to conflicts."
     - Output the conflicting files.
     - **Stop execution** and instruct me: "Please resolve the conflicts manually, then run `/pr-ledge` again."

## Step 5: Verification & Linting Side Effects
1. **Format:** Run `./gradlew ktlintFormat`.
2. **Check for Side Effects:** Run `git status --porcelain`.
3. **Handle Linting Changes:** If new changes are detected after formatting:
   - Use `AskUserQuestion`: "🧹 `ktlintFormat` created uncommitted changes (auto-fixes). Do you want to commit these and proceed? (yes/no)"
   - If "yes": Run `git add . && git commit -m "style: apply ktlint auto-formatting"`.
   - If "no": **Stop execution**.
4. **Build & Test:** Run `./gradlew build`. 
   - *Note:* If the build fails, analyze the stack trace, report the failure to me, and stop. Do not create the PR.

## Step 6: PR Execution (Create or Update)
1. **Template Prep:** Read `@.github/pull_request_template.md`.
2. **Drafting:**
   - **Title:** Format as `[<Jira-ID>] <Concise title based on git diff>`.
   - **Body:** Fill the template and include the link to `https://wealthsimple.atlassian.net/browse/<Jira-ID>`.
   - **Verification Note:** Add: "✅ Verified locally with `./gradlew build` and formatted with `ktlint`."
3. **Push Changes:** Run `git push origin $(git branch --show-current) --force-with-lease`.
4. **Execute CLI:**
   - **If Update Existing:** - If "Update Description" was "yes": Run `gh pr edit --title "<title>" --body "<body>"`.
     - Else: Inform me "✅ Changes pushed. PR description left unchanged."
   - **If Create New:** Run `gh pr create --draft --title "<title>" --body "<body>"`.

## Output
- Print the URL of the draft PR.