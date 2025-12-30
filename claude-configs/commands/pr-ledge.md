# Custom Command: /pr-ledge

## Step 1: User Interview & Setup
1. **Ask:** Use the `AskUserQuestion` tool to ask me: "What is the Jira ID for this PR? (e.g., PROJ-123)".
2. **Persistence:** Store this ID in memory for the duration of this command.

## Step 2: Sync & Rebase
1. **Fetch:** Run `git fetch origin main`.
2. **Rebase Attempt:** Run `git rebase origin/main`.
3. **Status Check:** - If rebase is **successful**: Inform me "✅ Rebase successful. Branch is now up to date with origin/main."
   - If there are **conflicts**: 
     - Inform me "❌ Rebase failed due to conflicts."
     - Output the conflicting files.
     - **Stop execution** and instruct me: "Please resolve the conflicts manually, then run `/pr-ledge` again."

## Step 3: Verification Step
1. **Format:** Run `./gradlew ktlintFormat`.
2. **Build & Test:** Run `./gradlew build`. 
   - *Note:* If the build fails, analyze the stack trace, report the failure to me, and stop. Do not create the PR.

## Step 4: PR Creation
1. **Template:** Read `@.github/pull_request_template.md`.
2. **Drafting:**
   - **Title:** Format as `[<Jira-ID>] <Concise title based on git diff>`.
   - **Body:** Fill the template. 
   - **Link:** Automatically include a link to `https://wealthsimple.atlassian.net/browse/<Jira-ID>` in the description.
   - **Verification Note:** Add a line in the 'Testing' section: "✅ Verified locally with `./gradlew build` and formatted with `ktlint`."
3. **Execute:** Run `gh pr create --draft --title "<title>" --body "<body>"`

## Output
- Print the URL of the draft PR.