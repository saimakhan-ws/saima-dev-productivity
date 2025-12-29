# Custom Command: /pr

## Context Gathering
1. **Search:** Look for `@.github/pull_request_template.md`.
2. **Diff:** Run `git diff $(git merge-base main HEAD)..HEAD` to see the changes in the current feature branch.

## Logic
1. **Match Template:** Parse the headers and comments in the template. 
2. **Drafting:** - Fill in the 'Description' by summarizing the `git diff`.
   - If there is a 'Testing' section, list the tests found in my shell history.
   - If there are checkboxes (`- [ ]`), check the ones that apply based on the code (e.g., if I added tests, check the 'Includes tests' box).
3. **Approval:** Show me the generated Title and Body.

## Execution
1. Once I approve, run:
   `gh pr create --draft --title "<generated_title>" --body "<generated_body>"`
