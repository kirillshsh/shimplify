---
name: shimplify
description: Simplify code
---

# shimplify: Code Review and Cleanup

Review all changed files for reuse, quality, and efficiency directly in the current branch. Fix any issues found without creating extra branches or worktrees.

If you are already running as a subagent (for example via `simplify-reuse`, `simplify-quality`, or `simplify-efficiency`), you are the leaf executor for that task. Do not spawn additional subagents and do not call `codex exec` as a workaround for delegation. Do the review and any fixes yourself directly in the current branch. The review fan-out below is only for the top-level orchestrator handling the user's request directly.

## Phase 1: Identify the Diff Reference

Determine what to review and build a **diff reference** string that the review passes will use in the current branch:

1. If there are staged changes (`git diff --cached --stat` is non-empty) → diff reference is `HEAD` (subagents run `git diff HEAD`).
2. Else if there are unstaged changes (`git diff --stat` is non-empty) → diff reference is `UNSTAGED` (subagents run `git diff`).
3. Else if the user specified a commit or range → use that as the diff reference (e.g. `abc1234`, `HEAD~3..HEAD`).
4. Else → use the last commit: diff reference is `HEAD~1..HEAD` (subagents run `git diff HEAD~1..HEAD`).

Also list the changed files (`git diff --name-only <ref>`) so you can mention them in the subagent prompts.
If the user did not provide a commit hash, commit name, or diff range, keep `HEAD~1..HEAD` as the fallback diff reference, but also prepare explicit scope hints for subagents: target files, target functions, and adjacent call paths or hot paths that likely need review and simplification.

## Phase 2: Spawn Three Review Subagents in Parallel

Only do this when you are the top-level agent handling the shimplify request directly. If you are already a subagent, skip this fan-out and continue the work yourself. Do not create extra branches or worktrees for review.

Codex spawn call shape: use `spawn_agent` with `fork_context: false` and the custom `agent_type` values `simplify-reuse`, `simplify-quality`, and `simplify-efficiency`. Do not use the built-in `explorer` agent for this workflow. Do not pass `model` or `reasoning_effort`; the installed custom agent files set `model = "gpt-5.5"` and `model_reasoning_effort = "xhigh"`. Do not pass `fork_context: true` together with `agent_type`; a full-history fork inherits those fields and Codex rejects that schema. If the custom agent types are unavailable, ask the user to restart Codex or reinstall the skill instead of silently substituting another agent.

Spawn all three subagents **simultaneously**. Do NOT paste the diff into the prompt — pass only the diff reference, file list, and any explicit scope hints you have. Each subagent will fetch the diff itself and explore surrounding code as needed.
Every subagent prompt must include the leaf-agent guard below verbatim. This guard is mandatory because these review agents must not re-enter the `shimplify` skill and create another fan-out loop.
All three review subagents are read-only. They must not modify files or propose patches. Their response must contain only a concise list of findings, if any; otherwise they must reply with `No findings.`.
When the diff reference falls back to `HEAD~1..HEAD` because the user did not specify a commit or range, include these fields in every subagent prompt:
- `Target files: <TARGET_FILES>`
- `Target functions: <TARGET_FUNCTIONS>`
- `Hot paths / adjacent call paths: <HOT_PATHS>`

Leaf-agent guard:
> You are a leaf review subagent for one bounded shimplify check. Do not read, open, invoke, or follow the `shimplify` skill or its installed `SKILL.md` file. Do not spawn subagents and do not call `codex exec`; do the requested read-only review yourself from this prompt and the repo code only.

### Subagent 1 → `simplify-reuse`

Spawn with `agent_type: "simplify-reuse"`.

> You are a leaf review subagent for one bounded shimplify check. Do not read, open, invoke, or follow the `shimplify` skill or its installed `SKILL.md` file. Do not spawn subagents and do not call `codex exec`; do the requested read-only review yourself from this prompt and the repo code only.
> Review recent code changes for reuse opportunities.
> Diff reference: `<DIFF_REF>`
> Changed files: `<FILE_LIST>`
> Target files: `<TARGET_FILES>`
> Target functions: `<TARGET_FUNCTIONS>`
> Hot paths / adjacent call paths: `<HOT_PATHS>`
> Run `git diff <DIFF_REF>` yourself to see the full diff, then search the codebase for existing utilities that could replace newly written code. If commit/range was not explicitly provided, treat the target files/functions/hot paths as required scope, even beyond the direct diff lines. Return only a concise list of findings, if any; otherwise reply with `No findings.`. Do not modify files or propose patches.

### Subagent 2 → `simplify-quality`

Spawn with `agent_type: "simplify-quality"`.

> You are a leaf review subagent for one bounded shimplify check. Do not read, open, invoke, or follow the `shimplify` skill or its installed `SKILL.md` file. Do not spawn subagents and do not call `codex exec`; do the requested read-only review yourself from this prompt and the repo code only.
> Review recent code changes for quality issues.
> Diff reference: `<DIFF_REF>`
> Changed files: `<FILE_LIST>`
> Target files: `<TARGET_FILES>`
> Target functions: `<TARGET_FUNCTIONS>`
> Hot paths / adjacent call paths: `<HOT_PATHS>`
> Run `git diff <DIFF_REF>` yourself to see the full diff, then check for: redundant state, parameter sprawl, copy-paste, leaky abstractions, stringly-typed code, unnecessary nesting. If commit/range was not explicitly provided, treat the target files/functions/hot paths as required scope, even beyond the direct diff lines. Return only a concise list of findings, if any; otherwise reply with `No findings.`. Do not modify files or propose patches.

### Subagent 3 → `simplify-efficiency`

Spawn with `agent_type: "simplify-efficiency"`.

> You are a leaf review subagent for one bounded shimplify check. Do not read, open, invoke, or follow the `shimplify` skill or its installed `SKILL.md` file. Do not spawn subagents and do not call `codex exec`; do the requested read-only review yourself from this prompt and the repo code only.
> Review recent code changes for efficiency issues.
> Diff reference: `<DIFF_REF>`
> Changed files: `<FILE_LIST>`
> Target files: `<TARGET_FILES>`
> Target functions: `<TARGET_FUNCTIONS>`
> Hot paths / adjacent call paths: `<HOT_PATHS>`
> Run `git diff <DIFF_REF>` yourself to see the full diff, then check for: unnecessary work, missed concurrency, hot-path bloat, no-op updates, TOCTOU, memory leaks, overly broad operations. If commit/range was not explicitly provided, treat the target files/functions/hot paths as required scope, even beyond the direct diff lines. Return only a concise list of findings, if any; otherwise reply with `No findings.`. Do not modify files or propose patches.

## Phase 3: Aggregate and Fix

Wait for all three subagents to complete. Read their findings and:

1. **Aggregate** — collect all findings into a single list, grouped by file.
2. **Filter** — skip false positives and findings not worth addressing. Do not argue with findings, just skip silently.
3. **Fix** — after all three review agents have finished, apply the accepted code changes yourself directly in the current branch. The review agents must not edit files, and you must not create a separate worker flow, extra branch, or extra worktree for the fixes.
If a commit is needed after simplification fixes, squash the changes into the original commit being simplified (or amend it), and do not create a separate "simplification" commit.
4. **Summarize** — briefly list what was fixed, or confirm the code was already clean.
