# Pokerbot

Pokerbot is an authenticated heads-up No-Limit Texas Hold'em training app built with SvelteKit.

It supports:
- live hands against a server-run bot (`/play/session/[sessionId]`)
- deterministic per-decision grading
- persistent session + hand history in SQLite
- completed-session review at `/review/[sessionId]`

The core game, grading, and bot logic are non-LLM. AI is optional and used only to rewrite coaching text.

## Product goals

- **Training-first, not casino simulation**
- **Deterministic review quality**
- **Server-authoritative game state**
- **Tight play → review loop**
- **Optional AI enhancement, never source of truth**

## Stack

### Framework/runtime
- SvelteKit 2
- Svelte 5
- Vite
- TypeScript

### UI
- Tailwind CSS 4
- Bits UI / shadcn-style primitives (`src/lib/components/ui`)
- Tabler + Lucide icons

### Auth/persistence
- Better Auth
- Drizzle ORM / Drizzle Kit
- SQLite (`better-sqlite3`)

### AI (optional)
- `ai`
- `@openrouter/ai-sdk-provider`

## Environment variables

Required or commonly used:
- `DATABASE_URL`
- `ORIGIN`
- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OPENROUTER_API_KEY` (optional)
- `OPENROUTER_MODEL` (optional, defaults to `openrouter/auto`)

## Scripts

```sh
pnpm dev
pnpm build
pnpm preview
pnpm check
pnpm lint
pnpm format
pnpm db:push
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm auth:schema
```

## Routing model

- `/` public landing
- `/login`, `/signout` auth
- `/play` session setup + recent sessions
- `/play/session/[sessionId]` live hand room
- `/review/[sessionId]` canonical completed-session review

Key behavior:
- Active sessions stay in `/play/session/[sessionId]`
- Completed sessions redirect to `/review/[sessionId]` server-side

## Architecture overview

### High-level layers

1. **Routes (`src/routes`)**
   - UI and server actions
2. **Poker domain (`src/lib/poker`)**
   - Rules engine, action generation, analysis, bot policy, evaluation
3. **Server modules (`src/lib/server`)**
   - Auth, DB access, training queries/session writes/grading
4. **UI primitives (`src/lib/components/ui`)**
   - Reusable components

### Core file map

```text
src/
  hooks.server.ts
  routes/
    (auth)/
    (game)/play/
    (game)/play/session/[sessionId]/
    (game)/review/[sessionId]/
  lib/
    poker/
      engine.ts
      process.ts
      bot.ts
      preflop-policy.ts
      postflop-policy.ts
      exploit-layer.ts
      opponent-model.ts
      analysis.ts
      ranges.ts
      evaluator.ts
      deck.ts
      types.ts
    server/
      auth.ts
      db/
      training/
```

## State and persistence

### Server is authoritative

- Session state: `training_session`
- Hand state JSON: `training_hand.state_json`
- Hand review: `hand_review`
- Decision review: `decision_review`

Client state is presentational only (drawer/sidebar visibility, sizing panel, slider amount).

### `HandState` highlights

`HandState` stores:
- metadata (`handNumber`, `street`, `toAct`, `dealer`)
- cards (`playerCards`, `botCards`, `boardCards`, `allBoardCards`)
- betting state (`pot`, stacks, blinds, per-street bets)
- raise rules state (`currentBet`, `lastFullRaiseSize`)
- history/outcome (`handActions`, `outcome`, action options)
- bot trace context (`lastBotDecision`, `botDecisionHistory`, `opponentModel`)

`lastFullRaiseSize` is used to keep min-raise legality and all-in reopen logic correct.

## Session flow

1. `createTrainingSession()` creates session + first hand
2. Live load pulls session, current hand, reviews, opponent model
3. Player acts via `?/act` → `processPlayerAction()`
4. Bot acts via `?/bot` → `advanceBotTurns()` + `botDecide()`
5. Hand completion triggers `saveHandReview()`
6. Next hand or session completion/redirect to review

## Poker engine (`src/lib/poker/engine.ts`)

Responsibilities:
- create/shuffle/deal new hands
- post blinds
- build legal action options
- normalize action amounts
- apply actions + advance streets
- runout all-in showdowns
- settle outcomes

Notable behavior:
- Min-raise uses tracked full raise size (`lastFullRaiseSize`)
- Jam-only spots produce `all-in` options directly
- Under-min all-ins do not incorrectly reopen raising

`src/lib/poker/process.ts` is the thin orchestration layer between routes and the engine.

## Bot decision framework (current)

The bot is now a **structured policy pipeline** (versioned trace: `policy-v2`), not a single monolithic heuristic function.

### 1) Baseline plan

- **Preflop**: `buildPreflopDecisionPlan()`
  - context detection (button open, BB vs open, etc.)
  - combo membership vs configured ranges
  - effective stack depth + spot features
- **Postflop**: `buildPostflopBaselineDecisionPlan()`
  - utility scoring from equity, pressure, pot odds, blockers, SPR, range/nut advantage
  - dynamic sizing ratio within legal bet/raise bounds

### 2) Difficulty style runtime (`bot.ts`)

`fish`, `rec`, `amateur`, `pro` apply controlled biases and temperature:
- aggressive/passive tendencies
- all-in discipline
- stochasticity level (softmax temperature)

### 3) Opponent posterior model (`opponent-model.ts`)

Bayesian posteriors are updated from historical player actions:
- proactive aggression
- fold/call/raise vs pressure
- river bluffing

Snapshots include confidence, tags (`overfolds`, `calling-station`, `passive`, etc.), and summary text.

### 4) Constrained exploit layer (`exploit-layer.ts`)

Exploit adjustments are bounded by:
- difficulty-based exploit budget
- posterior confidence

This nudges utilities (not hard-overrides) toward exploitative lines while keeping behavior stable.

### 5) Sampling + trace output

Final action is sampled from softmax probabilities over adjusted utilities.

Each bot action records a structured trace with:
- baseline + adjusted options
- selected action/amount
- factors/profile adjustments
- exploit adjustments + budget usage
- posterior snapshot and debug metrics

### Current limits

- Policy is still hand-crafted utility modeling (not solver-derived CFR policy)
- Preflop uses curated range buckets, not solved lookup tables
- Exploit remains intentionally conservative/bounded

## Grading and review

Grading is deterministic and server-side.

`grading.ts` scores each player decision and writes:
- per-hand summary/grade
- per-decision score/severity/rationale/evidence

Review UI shows:
- session overview and average grade
- hand summaries (strengths, mistakes, recommended lines)
- per-decision rationale/evidence

## Live play UI behavior

- Action controls are anchored at the bottom of live play
- Desktop uses right sidebar; mobile uses a `sheet` drawer
- If bust occurs, post-hand action is `End session` (not `Next hand`)

### Bet/Raise/All-in controls

- `Bet`/`Raise` opens sizing panel with slider
- **All-in is not always shown as a separate button**
  - if a normal sizing action exists, all-in is represented by slider max (button/confirm label switches to `All-in` at max)
  - in jam-only spots (no legal non-all-in size), a direct `All-in` action button is shown

## Design principles

- Server authority over game state
- Small client state
- Explicit modules with focused responsibilities
- Deterministic training logic first
- AI output can polish text, not replace core decisions

## Near-term roadmap

- Improve preflop coverage and calibration
- Improve postflop utility calibration + abstraction quality
- Expand opponent posterior features
- Keep trace quality high for explainability
- Evaluate migration path toward more solver-trained policy components

## Status snapshot

- Auth: implemented (Better Auth)
- Persistence: implemented (Drizzle + SQLite)
- Live room + review route: implemented
- Deterministic grading: implemented
- Optional AI coaching rewrite: implemented
- Bot framework: implemented (`preflop/postflop baseline + style + constrained exploit + trace`)
- Long-term solver-grade policy work: planned
