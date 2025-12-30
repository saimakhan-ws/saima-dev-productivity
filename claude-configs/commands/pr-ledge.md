# Custom Command: /pr-ledge

## Step 1: User Interview
1. **Ask:** Use the `AskUserQuestion` tool to ask me: "What is the Jira ID for this PR? (e.g., PROJ-123)".
2. **Persistence:** Store this ID in memory for the duration of this command.

## Step 2: Verification Step
1. **Format:** Run `./gradlew ktlintFormat`.
2. **Build & Test:** Run `./gradlew build`. 
   - *Note:* If the build fails, analyze the stack trace, report the failure to me, and stop. Do not create the PR.

## Step 3: PR Creation
1. **Template:** Read `@.github/pull_request_template.md`.
2. **Drafting:**
   - Title: Generate a concise title based on the git diff.
   - Body: Fill the template. 
   - **Verification Note:** Add a line in the 'Testing' section: "✅ Verified locally with `./gradlew build` and formatted with `ktlint`."
3. **Execute:** Run `gh pr create --draft --title "<title>" --body "<body>"`

## Output
- Print the URL of the draft PR.
