# CLAUDE.md

## Docs

The repo holds the canonical record of the project. Read these before working in the area they cover, and update them in the same pull request when that area changes.

- `.claude/docs/overview.md`: layout, commands, environment, deploy, cloud-session notes
- `.claude/docs/decisions.md`: choices made and alternatives turned down
- `.claude/docs/midgard.md`: the contract with the midgard frontend

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
- Migrations run before the new code goes live, while the old code still serves, and a rollback doesn't undo them. Every migration must work with the code already running: drop or rename a column one deploy after the code stops using it.

## Testing

- `*.integration.test.ts` files need Docker and skip without it, as in cloud sessions. A skip is not a pass; CI runs them.

## Git

- Imperative mood, atomic commits. Each commit represents one logical change, described by what it does — not what you did.
- Feature branches for non-trivial work. Never force-push shared branches.
- Review your own diff before committing. Read it as a reviewer would.

## Workflow

For non-trivial work (three or more steps), enter planning mode before writing code. Delegate research to subagents — one focused task per agent — and keep the main context window clean. Summarize at milestones, not line by line.
