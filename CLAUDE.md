# CLAUDE.md

## Principles

- Simplicity above all. The best solution is the simplest one that fully solves the problem. Speculative abstractions age poorly — earn complexity through proven need.
- Hold yourself to a staff engineer standard. Only propose changes you would confidently ship to production. Challenge your own work before presenting it.
- If a solution feels wrong, iterate until it doesn't. Demand excellence.

## Code

- Understand before modifying. Read the surrounding code, follow its conventions, and let consistency guide your decisions.
- Build from small, composable pieces. Colocate what belongs together. Let the type system carry its weight — if a type is hard to express, rethink the design.
- Formatting is tooling's job. Never fight the formatter.
- Solve the stated problem — not adjacent ones. A bug fix is not a refactoring opportunity. If the right fix requires broadening scope, ask first.

## Architecture

- Extend before inventing. Prefer growing an existing module over creating a new one unless there is a clear, distinct boundary.
- Dependencies flow inward. Shared packages never depend on application code.
- Abstractions are extracted, not predicted. Duplication across multiple call sites earns a shared utility; a single use case does not.

## Git

- Imperative mood, atomic commits. Each commit represents one logical change, described by what it does — not what you did.
- Feature branches for non-trivial work. Never force-push shared branches.
- Review your own diff before committing. Read it as a reviewer would.
- Do not commit until the task is resolved. Plans, intermediate artifacts, and work-in-progress belong in the working tree until the work is complete.

## Workflow

For non-trivial work (three or more steps), enter planning mode before writing code. Delegate research to subagents — one focused task per agent — and keep the main context window clean. Summarize at milestones, not line by line.

The `claude/` directory preserves knowledge across sessions. If the directory or any file below does not exist, create it when there is something worth recording.

- **`claude/project.md`** — Project overview: workspace layout, what each package does, key file paths, tech stack, external services, and common commands. **At the start of every session**, read this file first. If it does not exist, explore the codebase and create it before doing anything else. Update it at the end of any session that changes the project structure (new packages, moved files, added services, dependency changes).
- **`claude/lessons.md`** — Corrections, mistakes, and efficiency discoveries. Append as they happen. Review at the start of every session.
- **`claude/context.md`** — Function signatures, architectural decisions, and anything costly to rediscover. Append only — never overwrite.
