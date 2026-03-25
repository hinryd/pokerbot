# Pokerbot

Pokerbot is a full-stack authenticated heads-up No-Limit Texas Hold'em training app built with SvelteKit. It lets a signed-in player configure a session, play hands against a bot, receive deterministic per-decision grading, and review session results in a dedicated review route.

This README documents the current architecture, how state flows through the app, the server and database design, the current poker engine, important implementation decisions, and the roadmap for replacing the current heuristic bot with a dynamic non-LLM bot.

## Product goals

- **Heads-up training, not casino simulation**
  - The product is oriented around improving decision quality.

- **Deterministic review first**
  - Hand review and decision scoring are generated from server-side analysis and grading logic.

- **Authenticated persistent sessions**
  - Sessions, hand states, and reviews are stored in SQLite through Drizzle.

- **Live play + review loop**
  - You play in the live room at `/play/session/[sessionId]`.
  - Completed sessions are reviewed at `/review/[sessionId]`.

- **Server-side AI is optional and secondary**
  - The core app works without an LLM.
  - AI is currently used only as an optional explanation rewrite layer in `src/lib/server/training/analysis.ts`.

## Current stack

## Framework and runtime

- **SvelteKit 2**
  - Routing, server load/actions, form actions, and app shell.

- **Svelte 5**
  - Component model and client reactivity.

- **Vite**
  - Local dev server and build tooling.

- **TypeScript**
  - Shared types across routes, server modules, and poker engine.

## Styling and UI

- **Tailwind CSS 4**
  - Utility-first styling.

- **Bits UI / shadcn-style component library**
  - Most UI primitives live under `src/lib/components/ui`.

- **Tabler / Lucide icons**
  - Iconography.

## Auth and persistence

- **Better Auth**
  - Session and account management.

- **Drizzle ORM**
  - Type-safe database access.

- **SQLite via better-sqlite3**
  - Local persistent storage.

## AI integration

- **AI SDK**
  - Used for optional server-side coaching generation.

- **OpenRouter provider**
  - Optional provider for the coaching rewrite layer.

## Core dependencies that matter most

- **`@sveltejs/kit`**
  - App framework.

- **`svelte`**
  - UI runtime.

- **`tailwindcss`**
  - Styling system.

- **`better-auth`**
  - Authentication and cookie-backed session handling.

- **`drizzle-orm` / `drizzle-kit`**
  - ORM, schema management, migrations, and studio support.

- **`better-sqlite3`**
  - SQLite driver.

- **`ai` / `@openrouter/ai-sdk-provider`**
  - Optional coaching explanation generation.

- **`bits-ui`**
  - Headless primitives used by the component library.

## Environment variables

The app currently expects the following variables.

- **`DATABASE_URL`**
  - SQLite file path.

- **`ORIGIN`**
  - Canonical application origin used by Better Auth.

- **`BETTER_AUTH_SECRET`**
  - Better Auth secret.

- **`GITHUB_CLIENT_ID`**
  - GitHub OAuth client id.

- **`GITHUB_CLIENT_SECRET`**
  - GitHub OAuth client secret.

- **`OPENROUTER_API_KEY`**
  - Optional. If absent, AI coaching falls back to deterministic thought text.

- **`OPENROUTER_MODEL`**
  - Optional. Defaults to `openrouter/auto`.

## Important scripts

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

## App architecture

## High-level architecture

The app has four main layers:

- **UI routes**
  - Svelte pages in `src/routes` render the landing page, auth flow, session configuration, live play view, and review view.

- **Server route handlers**
  - `+page.server.ts` files load page data and process form actions.

- **Domain engine**
  - Poker rules, hand state transitions, range analysis, bot decisions, and grading live under `src/lib/poker`.

- **Persistence layer**
  - Auth, DB access, and training-specific queries/session/review writes live under `src/lib/server`.

## Request lifecycle

At a high level:

- **`src/hooks.server.ts`**
  - Reads the Better Auth session from request headers.
  - Stores `session` and `user` on `event.locals`.
  - Delegates to Better Auth's SvelteKit handler.

- **`src/routes/+layout.server.ts`**
  - Exposes `user` and `session` to the root layout.

- **`src/routes/+layout.svelte`**
  - Renders the fixed app shell header.
  - Shows auth state and global navigation.

## Route structure

## Root routes

- **`src/routes/+page.svelte`**
  - Public entry page.

- **`src/routes/+layout.svelte`**
  - Global shell and top navigation.

- **`src/routes/+layout.server.ts`**
  - Injects `user` and `session` into layout data.

## Auth routes

- **`src/routes/(auth)/login`**
  - Sign-in route.

- **`src/routes/(auth)/signout`**
  - Sign-out form endpoint.

## Game routes

- **`src/routes/(game)/play/+page.svelte`**
  - Session setup UI.
  - Recent sessions list.

- **`src/routes/(game)/play/+page.server.ts`**
  - Loads defaults and recent sessions.
  - Starts a new session and redirects to live play.

- **`src/routes/(game)/play/session/[sessionId]/+page.svelte`**
  - Live gameplay UI.
  - Shows bot/player stacks, board, actions, and sidebar review info.

- **`src/routes/(game)/play/session/[sessionId]/+page.server.ts`**
  - Loads the current hand and prior review context.
  - Handles player action, bot action, next hand, and end session.

- **`src/routes/(game)/review/[sessionId]/+page.svelte`**
  - Canonical review page for completed sessions.

- **`src/routes/(game)/review/[sessionId]/+page.server.ts`**
  - Loads the session review feed and aggregate grade.

## Important routing decisions

These are current product decisions reflected in the codebase.

- **Review route is canonical**
  - Completed sessions now resolve to `/review/[sessionId]`.
  - The legacy `/(game)/[sessionId]` route was removed.

- **Live session remains canonical for active play**
  - Active sessions use `/play/session/[sessionId]`.

- **Completed session redirects happen server-side**
  - Live route loads and actions redirect to `/review/[sessionId]` once the session is complete.

## Folder structure

```text
src/
  hooks.server.ts
  routes/
    +layout.server.ts
    +layout.svelte
    +page.svelte
    (auth)/
      login/
      signout/
    (game)/
      play/
        +page.svelte
        +page.server.ts
        session/[sessionId]/
          +page.svelte
          +page.server.ts
      review/[sessionId]/
        +page.svelte
        +page.server.ts
  lib/
    components/
      ui/
    poker/
      analysis.ts
      bot.ts
      deck.ts
      defaults.ts
      engine.ts
      evaluator.ts
      process.ts
      ranges.ts
      types.ts
    server/
      auth.ts
      db/
        index.ts
        schema.ts
        auth.schema.ts
      training/
        analysis.ts
        grading.ts
        queries.ts
        session.ts
```

## What each important folder owns

- **`src/routes`**
  - User-facing pages and server actions.

- **`src/lib/poker`**
  - Core poker domain logic.
  - Hand state, rules, analysis, decisioning, and evaluation.

- **`src/lib/server`**
  - Anything that depends on auth, database, secrets, or persistence.

- **`src/lib/components/ui`**
  - Reusable UI primitives.

## State management

## Server state is the source of truth

This app is intentionally server-centric.

- **Persistent session state** lives in SQLite.
- **Live hand state** is serialized as JSON in `training_hand.state_json`.
- **Review state** is persisted in `hand_review` and `decision_review`.
- **Auth state** is resolved in `hooks.server.ts` and exposed via layout data.

## Client state is intentionally thin

The live session page uses small local UI state for presentation only, for example:

- info sidebar visibility
- mobile info drawer open state
- raise/bet sizing slider value
- whether the sizing panel is currently expanded

Client state is not authoritative for poker logic.

## Hand state model

The core state object is `HandState` in `src/lib/poker/types.ts`.

It includes:

- **metadata**
  - `handNumber`
  - `dealer`
  - `toAct`
  - `street`

- **cards**
  - `playerCards`
  - `botCards`
  - `boardCards`
  - `allBoardCards`

- **betting state**
  - `pot`
  - `playerStack`
  - `botStack`
  - `smallBlind`
  - `bigBlind`
  - `currentBet`
  - `playerBetThisStreet`
  - `botBetThisStreet`
  - `actionsThisStreet`

- **history and outcomes**
  - `handActions`
  - `outcome`
  - `actionOptions`

## Session state flow

The current state flow is:

- **Create session**
  - `createTrainingSession()` inserts `training_session`.
  - It immediately inserts hand 1 via `insertHand()`.

- **Load active session**
  - `play/session/[sessionId]/+page.server.ts` loads session, current hand, and latest review.

- **Player acts**
  - Form posts to `?/act`.
  - `processPlayerAction()` validates and applies the move.
  - Updated `HandState` is written back to `training_hand.state_json`.

- **Bot acts**
  - Live page auto-submits a hidden form when `toAct === 'bot'`.
  - `advanceBotTurns()` calls `botDecide()` and applies the chosen action.

- **Hand completes**
  - `saveHandReview()` grades player decisions and writes review rows.

- **Next hand or end session**
  - If someone busts, the session completes and redirects to review.
  - Otherwise a new hand is created and the session advances.

## Server architecture

## Authentication

- **`src/lib/server/auth.ts`**
  - Configures Better Auth.
  - Uses Drizzle as the adapter.
  - Supports email/password and GitHub login.

- **`src/hooks.server.ts`**
  - Reads the session on every request.
  - Sets `event.locals.user` and `event.locals.session`.

## Database access

- **`src/lib/server/db/index.ts`**
  - Creates the SQLite client and Drizzle instance.

- **`src/lib/server/db/schema.ts`**
  - Defines application tables.

## Training-specific server modules

- **`src/lib/server/training/session.ts`**
  - Creates sessions.
  - Inserts new hands.

- **`src/lib/server/training/queries.ts`**
  - Query layer for sessions, hands, and reviews.
  - Rehydrates `HandState` from JSON.

- **`src/lib/server/training/grading.ts`**
  - Deterministic decision scoring.
  - Writes `hand_review` and `decision_review` records.

- **`src/lib/server/training/analysis.ts`**
  - Optional AI coaching wrapper.
  - Uses deterministic review evidence as prompt input.

## Database model

## `training_session`

Stores session-level information:

- owner user id
- difficulty
- stack configuration
- status
- current hand number
- overall grade
- progress label

## `training_hand`

Stores each hand as serialized game state:

- session id
- hand number
- status
- `state_json`

## `hand_review`

Stores per-hand review output:

- grade
- summary
- strengths
- mistakes
- recommended line
- thought process
- status

## `decision_review`

Stores per-player-decision feedback:

- chosen action
- recommended action
- score
- severity
- rationale
- structured evidence JSON

## Poker engine architecture

## `src/lib/poker/engine.ts`

Owns the rules and state transitions.

Responsibilities:

- create a fresh hand
- post blinds
- compute legal action options
- normalize action amounts
- apply actions
- advance streets
- run out all-in showdowns
- settle the pot

## `src/lib/poker/process.ts`

Thin orchestration layer.

- `processPlayerAction()`
  - Applies validated player actions.

- `advanceBotTurns()`
  - Calls the bot, normalizes its amount, and advances the hand.

## `src/lib/poker/evaluator.ts`

- Evaluates showdown winners.

## `src/lib/poker/deck.ts`

- Builds and shuffles a deck.
- Deals hole cards and board runouts.

## `src/lib/poker/analysis.ts`

This is the current strategic analysis layer used by both grading and the bot.

It currently provides:

- spot analysis
- hand strength
- draw strength
- pot odds
- range equity
- nut advantage
- opponent bluff/value share
- blocker analysis
- session profile analysis
- hand timeline reconstruction

## `src/lib/poker/ranges.ts`

This module currently contains range and equity tooling such as:

- range parsing
- combo expansion
- blocker accounting
- sampled range-vs-range equity

## Current bot architecture

## Current state

The current bot lives in `src/lib/poker/bot.ts` and is still heuristic-based.

It currently uses:

- `analyzeSpot()` outputs
- difficulty-specific aggression and pressure configuration
- player profile flags like:
  - passive
  - overfolds
  - calling station
  - underbluffs river
- randomization
- legal action lookup from `buildActionOptions()`

This is good enough for prototyping, but it is not the long-term architecture.

## Current limitations

- **Preflop behavior is too brittle**
  - It can overfold versus raises.

- **Decision logic is still scalar-threshold driven**
  - It compresses complex spots into a few thresholds.

- **Personalities are difficulty presets, not real styles**
  - `apprentice`, `contender`, and `shark` are not yet independent strategic identities.

- **Interpretability is review-side, not bot-side**
  - The bot does not yet persist a structured decision trace for its own actions.

## Grading and review architecture

## Current grading system

The player review system is deterministic and server-side.

- The server reconstructs the player decision timeline.
- Each player action is scored with contextual evidence.
- A hand-level review is generated from the decision set.

## What grading uses today

The current grader considers:

- pot odds
- equity and range equity
- position
- board texture
- nut advantage
- blocker quality
- opponent bluff/value composition
- session-level player tendencies

## Review UI architecture

The review route shows:

- session-level overview
- average grade
- per-hand summary
- strengths
- mistakes
- recommended line
- thought process
- per-decision rationale and evidence

## Current live session UI decisions

These recent decisions are important because the README should reflect the actual product behavior.

- **Completed sessions redirect to `/review/[sessionId]`**

- **The full review button was removed from the live session header**

- **If a completed hand causes a bust, the live room shows `End session` instead of `Next hand`**

- **The always-visible all-in button was removed from the player controls**
  - The live room now exposes a `Bet` or `Raise` button.
  - Pressing it opens a sizing panel with a slider and confirm button.

- **The mobile info panel is a bottom-triggered drawer**
  - Mobile uses the shared `sheet` primitive.

- **Desktop keeps the right-side info panel**
  - Desktop uses an inline `<aside>`.

- **The board was maximized and the action controls were pushed to the bottom of the live play screen**
  - The live play layout now uses fixed height and `flex-1` sections so the board occupies the center and the action bar stays anchored at the bottom.

## Important design principles in this codebase

- **Server authority over game state**
  - The server owns the official hand state.

- **Small client state**
  - The client should only manage ephemeral presentation state.

- **Simple file boundaries**
  - Rules engine, bot logic, grading, query layer, and UI are separated.

- **Deterministic analysis first**
  - The training product should remain useful without any LLM dependency.

- **AI as enhancement, not source of truth**
  - The AI layer may rewrite explanations but should not invent the actual review logic.

## Dynamic high-level bot plan

This is the target architecture for the next-generation bot.

## Goal

Build a dynamic heads-up NLHE bot that:

- attacks and defends properly preflop and postflop
- supports personalities:
  - `fish`
  - `rec`
  - `amateur`
  - `pro`
- explains its choices with structured interpretability
- uses no LLM in the decision core
- avoids threshold heuristics as the policy engine

## Core idea

The long-term bot should be built from:

- **baseline strategy model**
- **opponent modeling**
- **constrained exploitation**
- **structured decision traces**

Not from `if/else` poker advice rules.

## Target architecture

## 1. Baseline strategy engine

Replace the heuristic bot with a policy engine built from solved or trained strategy.

Recommended options:

- MCCFR
- CFR+
- Deep CFR
- Single Deep CFR

The engine should return:

- legal actions
- action probabilities
- EV per action
- info set or abstraction id
- range summaries

## 2. Exact preflop strategy layer

Preflop should be solved or table-driven first.

It should index by things like:

- effective stack
- position
- raise size
- re-raise sequence
- action history

This is the highest-impact fix for the current overfolding problem.

## 3. Approximate postflop strategy engine

Postflop should move to a trained policy over a controlled abstraction.

Inputs should be based on:

- public state
- betting history
- stack-to-pot ratio
- board representation
- bot range belief
- player range belief

Not manual tactical rules.

## 4. Opponent model

The bot should maintain online beliefs about the player using principled estimation.

Recommended approach:

- Beta-Bernoulli posteriors for binary tendencies
- Dirichlet posteriors for action distributions

Examples of tracked tendencies:

- fold to raise / 3-bet
- open frequency
- c-bet frequency
- turn barrel frequency
- river overfolding
- showdown strength profile

## 5. Exploitation layer

Exploit should be constrained, not unconstrained.

The bot should blend:

- baseline equilibrium-ish strategy
- best response to current posterior opponent model

under a trust-region style constraint so noisy reads do not create wild behavior.

## 6. Personality system

Personalities should not be simple aggression sliders.

They should be defined by:

- different baseline checkpoints or policy heads
- different opponent priors
- different exploit constraints
- different action sampling temperatures

Recommended personality labels:

- **`fish`**
  - wide, noisy, weak, unstable, easy to exploit

- **`rec`**
  - somewhat coherent, still imbalanced, slow to adapt

- **`amateur`**
  - decent base strategy, moderate adaptation, still leakier than pro

- **`pro`**
  - strongest baseline, strongest defense frequencies, best exploit discipline

## 7. Interpretability layer

The bot should emit a structured decision trace for every bot action.

It should store:

- baseline policy
- exploit-adjusted policy
- final mixed strategy
- sampled action
- action EVs
- range summaries
- opponent posterior snapshot
- top decision factors
- confidence / uncertainty

This trace should be rendered via templates in the UI rather than generated by an LLM.

## 8. Persistence changes for the new bot

The app will likely need new stored fields such as:

- bot personality
- bot version
- opponent model snapshot
- decision trace JSON per bot action

These should live in durable server-side tables rather than client state.

## 9. Suggested implementation milestones

- **Milestone 1**
  - Add new decision-trace and bot-profile types.

- **Milestone 2**
  - Replace heuristic preflop responses with solved preflop lookup tables.

- **Milestone 3**
  - Add postflop abstraction and baseline policy inference.

- **Milestone 4**
  - Add Bayesian opponent posteriors.

- **Milestone 5**
  - Add constrained exploit layer.

- **Milestone 6**
  - Add bot interpretability traces to live play and review.

- **Milestone 7**
  - Split personalities into real strategic profiles: `fish`, `rec`, `amateur`, `pro`.

## 10. What should not be done

The long-term bot should avoid:

- threshold decision trees as the main strategy engine
- fake natural-language chain-of-thought
- unexplained hidden-information claims
- personality systems built only from aggression coefficients

## Suggested future module structure for the next bot

```text
src/lib/poker/
  policy/
    preflop.ts
    postflop.ts
    sampler.ts
    abstractions.ts
  opponent/
    posterior.ts
    priors.ts
    updates.ts
  bot/
    runtime.ts
    personalities.ts
    trace.ts
    exploit.ts
```

## Development guidance

When working in this repo:

- keep the server as the source of truth
- keep UI state ephemeral and local
- prefer explicit types and narrow module responsibilities
- keep grading deterministic even if AI text generation is enabled
- treat the non-LLM bot engine as the authoritative strategic core

## Current status summary

- **Auth**
  - Implemented with Better Auth.

- **Persistence**
  - Implemented with Drizzle + SQLite.

- **Live session room**
  - Implemented.

- **Review route**
  - Implemented at `/review/[sessionId]`.

- **Deterministic grading**
  - Implemented.

- **Optional AI coaching rewrite**
  - Implemented as a server-side enhancement.

- **Current bot**
  - Functional but still heuristic-based.

- **Dynamic non-LLM personality bot**
  - Planned, not yet implemented.
