# Hlidskjalf Rewrite Plan

## Summary

Hlidskjalf is a ~850-line zero-dependency CLI dashboard for the monorepo's dev workflow. The code works but reads like it was written incrementally — the architecture is sound but the implementation is noisy. This plan rewrites it to be significantly cleaner without changing behavior or adding heavy dependencies.

**What's clean already (keep as-is):**
- `output-parser.ts` — Small, well-tested, clear regex table. No changes needed.
- `types.ts` — Minimal, correct. No changes needed.
- `workspace.ts` — Clean discovery/sort/filter logic. No changes needed (tests need import fix).

**What's ugly (rewrite):**
- `renderer.ts` — ANSI string soup makes rows unreadable. Mixes input handling, layout math, and styling in one closure.
- `process-manager.ts` — Mixes process spawning, log buffering, output parsing, and async orchestration. Awkward manual listener attach/detach for `waitForPackages`.
- `index.ts` — Manual arg parsing when `node:util.parseArgs` exists. Docker management doesn't belong here. Orchestration mixes UI state (selectedIndex) with lifecycle.

---

## Phase 1: Fix broken tests

The tests import from `../lib/` but source files are at `../`. Tests cannot run.

- `src/__tests__/workspace.test.ts` — change `../lib/types.js` → `../types.js`, `../lib/workspace.js` → `../workspace.js`
- `src/__tests__/output-parser.test.ts` — change `../lib/output-parser.js` → `../output-parser.js`

---

## Phase 2: Extract docker management

Move `startDocker()` from `index.ts` into `src/docker.ts`.

**New file: `src/docker.ts`**
```ts
export function startDocker(root: string): Promise<() => Promise<void>>
```

Simple extract — the function is self-contained. This removes ~30 lines from index.ts and gives docker management a clear home.

---

## Phase 3: Clean up CLI entry point

Replace manual arg parsing with `node:util.parseArgs` (built-in since Node 18.3).

**Before (~25 lines):**
```ts
function parseArgs(argv: string[]): DashboardOptions {
  const root = process.cwd()
  const docker = !argv.includes('--no-docker')
  const filter: string[] = []
  let order: SortOrder = 'alphabetical'
  for (const arg of argv) {
    if (arg.startsWith('--filter=')) { ... }
    if (arg.startsWith('--order=')) { ... }
  }
  return { root, docker, filter: filter.length > 0 ? filter : undefined, order }
}
```

**After (~15 lines):**
```ts
import { parseArgs } from 'node:util'

function parseCli(argv: string[]): DashboardOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      'no-docker': { type: 'boolean', default: false },
      filter: { type: 'string', multiple: true },
      order: { type: 'string', default: 'alphabetical' },
    },
  })

  const filter = values.filter?.map((f) => f.replace(/^\{(.+)\}$/, '$1'))

  return {
    root: process.cwd(),
    docker: !values['no-docker'],
    filter: filter?.length ? filter : undefined,
    order: values.order === 'run' ? 'run' : 'alphabetical',
  }
}
```

Also slim `createDashboard()` by pulling the docker call and workspace discovery into helper sequences, making the main function a clear step-by-step orchestrator.

---

## Phase 4: Simplify process manager

### 4a: Replace manual listener pattern in `waitForPackages`

**Before (awkward manual attach/detach):**
```ts
private async waitForPackages(packages: WorkspaceEntry[]): Promise<void> {
  const names = new Set(packages.map((p) => p.name))
  return new Promise((resolve) => {
    const check = () => {
      const allReady = [...names].every((name) => {
        const info = this.infos.get(name)
        return info?.status === 'watching' || info?.status === 'error'
      })
      if (allReady) {
        this.off('update', listener)
        resolve()
      }
    }
    const listener = () => check()
    this.on('update', listener)
    check()
  })
}
```

**After (clean async iteration with `events.on`):**
```ts
import { on } from 'node:events'

private async waitForPackages(packages: WorkspaceEntry[]): Promise<void> {
  const names = new Set(packages.map((p) => p.name))

  const isDone = () =>
    [...names].every((n) => {
      const s = this.infos.get(n)?.status
      return s === 'watching' || s === 'error'
    })

  if (isDone()) return

  for await (const _ of on(this, 'update')) {
    if (isDone()) break
  }
}
```

### 4b: Simplify log buffer

Replace array slice (creates new array on every line over 500) with `splice` (mutates in place):

```ts
// Before
info.logs = info.logs.slice(-MAX_LOG_LINES)

// After
if (info.logs.length > MAX_LOG_LINES) {
  info.logs.splice(0, info.logs.length - MAX_LOG_LINES)
}
```

Actually, this already has the length check. The fix is just switching from `slice` (allocates) to `splice` (in-place).

### 4c: Inline the output handling

The `handleOutput` closure in `spawnProcess` does three things: buffer logs, parse status, emit updates. This is fine but can be tightened by extracting a `processLine(name, line)` method that the closure just calls, reducing nesting.

---

## Phase 5: Clean up renderer

This is the biggest win. The current renderer has three problems:
1. ANSI string concatenation makes rows unreadable
2. Layout building and terminal I/O are tangled
3. Input handling is mixed into the renderer

### 5a: Add a tiny `style` helper (not a library)

Replace raw ANSI concatenation with composable style functions:

```ts
// ~15 lines, replaces the ANSI constants block
const esc = (code: string) => `\x1b[${code}m`
const style = {
  bold: (s: string) => `${esc('1')}${s}${esc('0')}`,
  dim: (s: string) => `${esc('2')}${s}${esc('0')}`,
  red: (s: string) => `${esc('31')}${s}${esc('0')}`,
  green: (s: string) => `${esc('32')}${s}${esc('0')}`,
  yellow: (s: string) => `${esc('33')}${s}${esc('0')}`,
  cyan: (s: string) => `${esc('36')}${s}${esc('0')}`,
  gray: (s: string) => `${esc('90')}${s}${esc('0')}`,
}
```

**Before (hard to read):**
```ts
`${arrow}${nameColor}${pad(proc.entry.name, nameWidth)}${nameReset}` +
  `${DIM}${pad(typeLabel, 6)}${RESET}` +
  `${status.color}● ${pad(status.label, 10)}${RESET}` +
  `${DIM}${proc.url ?? ''}${RESET}`
```

**After (scannable):**
```ts
[
  isSelected ? style.cyan(`▸ ${pad(name, nameWidth)}`) : `  ${pad(name, nameWidth)}`,
  style.dim(pad(typeLabel, 6)),
  statusColor(`● ${pad(statusLabel, 10)}`),
  style.dim(url ?? ''),
].join('')
```

### 5b: Separate input handling

Extract keyboard input into a standalone function that returns an async iterable or takes a callback. This decouples "listen for keys" from "render frames":

```ts
export function listenForKeys(callback: (key: 'up' | 'down' | 'quit') => void): () => void
```

The renderer becomes purely a "give me state, I'll draw it" function.

### 5c: Simplify `renderFrame`

Break the monolithic function into composable pieces:
- `renderHeader(cols, allReady)` → string
- `renderTable(processes, selectedIndex, cols)` → string[]
- `renderLogs(selected, rows, tableHeight, cols)` → string[]

Each returns plain strings. The top-level `render()` just joins them and writes once.

---

## Phase 6 (Optional): Add picocolors

If the team wants slightly nicer DX, **picocolors** (7 kB, zero runtime deps, 94M weekly downloads) could replace the `style` helper from Phase 5. It's the thinnest possible color wrapper:

```ts
import pc from 'picocolors'
pc.bold(pc.cyan(name))  // instead of style.bold(style.cyan(name))
```

This is a readability preference, not a necessity. The hand-rolled `style` helper from 5a is ~15 lines and perfectly fine. Recommend skipping this unless the team has a strong preference.

---

## New file structure (unchanged from current)

```
src/
  index.ts          — CLI entry (slimmed ~60 lines)
  docker.ts         — NEW: docker compose management (~30 lines)
  types.ts          — unchanged
  workspace.ts      — unchanged
  process-manager.ts — simplified (~180 lines, down from 226)
  output-parser.ts  — unchanged
  renderer.ts       — rewritten (~180 lines, down from 232, much more readable)
  __tests__/
    workspace.test.ts      — fixed imports
    output-parser.test.ts  — fixed imports
```

## What this does NOT do

- Add runtime dependencies (unless Phase 6 is approved)
- Change behavior — the dashboard looks and works identically
- Restructure workspace.ts or output-parser.ts — they're already clean
- Add new features — this is a pure cleanup

## Estimated line count

| File | Before | After | Change |
|------|--------|-------|--------|
| index.ts | 182 | ~100 | -82 |
| docker.ts | — | ~30 | +30 (extracted) |
| types.ts | 27 | 27 | 0 |
| workspace.ts | 165 | 165 | 0 |
| process-manager.ts | 226 | ~180 | -46 |
| output-parser.ts | 51 | 51 | 0 |
| renderer.ts | 232 | ~180 | -52 |
| **Total** | **883** | **~733** | **~-150** |

Net reduction of ~150 lines with significantly improved readability, especially in the renderer and process manager. The remaining code is cleaner, more composable, and easier to test.
