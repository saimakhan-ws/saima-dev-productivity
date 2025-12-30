# Kotlin & Testing Standards

## General Coding Patterns
- **Logging:** Always instantiate loggers within a `companion object`. 
  - *Standard:* `private val log = LoggerFactory.getLogger(javaClass.enclosingClass)`

## Testing Guidelines (MockK & Assertions)
Apply these rules to all `**/*Test.kt` and `**/*Spec.kt` files to ensure clarity and maintainability.

### Verification Functions
- **Zero Invocations:** Use `verifyNever` instead of `verify(exactly = 0)`.
  - *Rationale:* Expresses "never called" intent more clearly.
- **Single Invocations:** Use `verifyExactly { ... }` instead of a plain `verify { ... }` when a function must be called exactly once.
  - *Rationale:* Explicitly documents the intent for a single call.

### Assertions (AssertJ)
- **Multiple Assertions:** Wrap multiple `assertThat` calls in a `SoftAssertions.assertSoftly` block.
  - *Example:*
    ```kotlin
    SoftAssertions.assertSoftly { softly ->
        softly.assertThat(actual).isEqualTo(expected)
        softly.assertThat(actualList).hasSize(1)
    }
    ```
  - *Rationale:* Allows all assertions to run even if one fails, providing better diagnostic data.

## Repository Analysis
- Before significant refactors, run a one-time analysis of existing files to match current project-specific patterns (dependency injection, naming, etc.).
