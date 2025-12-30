---
description: Initialize this repository with my personal Kotlin and Testing standards
---

# Setup Repository Standards

## 1. Locate Master Guidelines
- Locate my master guidelines file at `~/workspace/saima-dev-productivity/claude-configs/KOTLIN_RULES.md`.
- Read the content of that file.

## 2. Update CLAUDE.md
- Check if a `CLAUDE.md` file exists in the root of the current repository.
- **If it does not exist:**
    - Create a new `CLAUDE.md` file.
    - Write the content from my master guidelines into it.
    - Add a header at the top: "# Project Rules & Standards".
- **If it already exists:**
    - Append the content of my master guidelines to the end of the existing file.
    - Ensure there is a clear separator like `---` or a new header "## Personal Coding Standards" before appending.

## 3. Project Analysis
- Run a quick scan of the `@src/test` directory to confirm if the project uses MockK or Mockito.
- If it uses Mockito instead of MockK, suggest updating the `CLAUDE.md` rules to match Mockito syntax.

## 4. Confirmation
- Inform me: "Successfully initialized CLAUDE.md with your Kotlin and Testing standards."
- Ask: "Would you like me to perform a one-time analysis of the existing code to see if there are other repo-specific patterns I should add to CLAUDE.md?"
