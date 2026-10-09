<!-- Altimist Baseline v13 — START -->

## Working Principles

Behavioural guidelines for coding work. Bias toward caution over speed — for trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports, variables, and functions that *your* changes made unused. Leave pre-existing dead code alone unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform vague tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

    1. [Step] → verify: [check]
    2. [Step] → verify: [check]
    3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. "Done" Means Wired In and Switched On

Writing the code is not the finish line. A change is complete only when it is reachable and exercised in the real path — not merely present in the repo.

- Re-read the result against the original request: every part of the ask maps to something done — nothing silently dropped, nothing invented.
- A claim you couldn't verify this session is labelled unverified, not stated as fact.
- New code is wired in before it's done: referenced, called from a real entry point, and switched on (flag, config, env var) — then observed running, not just compiling. The verification gate and `/review`, where installed, are stronger checks than your own re-read.
- If activation needs something this environment can't do (a deploy, a secret, prod access), say exactly what remains to turn it on — never imply it's live when it isn't.

The test: could someone act on your "done" without discovering leftover work?

## Spec-First for Substantial Features

Before implementing a substantial feature, check for an existing spec in `docs/specs/`. If none exists, propose drafting one with the user before writing code.

**A feature is "substantial" if it meets any of these:**

- Touches multiple layers (UI + API + DB)
- Adds a new user-facing capability
- Requires a data model change or new database table
- Requires a new API endpoint or external integration
- Will likely take more than ~2 hours of focused work
- Affects security, auth, or permissions

**Trivial work that doesn't need a spec:** bug fixes restoring intended behaviour, refactors with no behavioural change, copy/typo edits, single utility functions, dependency bumps.

**When unsure, ask the user:** *"This feels substantial — should I draft a spec in `docs/specs/` first?"*

**For projects without a `docs/specs/` folder:** the spec-first rule doesn't apply — use the project's own conventions.

## Altimist Claude Code tooling

The [Altimist plugin](https://github.com/altimist/altimist-claude-plugin) ships team skills plus a verification gate. When it's installed (one-time setup: the [install runbook](https://github.com/altimist/altimist-claude-config/blob/main/docs/runbooks/install-plugin.md)), prefer it over hand-rolling:

- **Spec a feature** → `/create-feature-spec` (interview → user stories, goals, acceptance criteria), then `/implement-spec` for the red→green→refactor loop — the easiest way to satisfy the **Spec-First** rule above.
- **Second opinion on a change** → `/review` — spec-aware adversarial review; `--codex` / `--both` adds a cross-vendor pass.
- **Read a PDF / Word doc** → `/doc2md` (see the **Reading Documents** section).
- **Ideas and the live plan** → `/record-idea` to capture an idea, `/triage-ideas` to fold, park or promote waiting ideas, `/revise-plan` to change the live plan (see **Ideas and the live plan**).
- **Verification gate** — runs the project's typecheck → lint → test before a code-changing turn can finish, and blocks until they pass (`VERIFY_OFF=1` bypasses for a session). Makes **Goal-Driven Execution** a mechanism, not a reminder.

If the plugin isn't installed these skills won't resolve — install it once per machine via the runbook above and restart Claude Code. Don't improvise install or update commands from memory — the runbook is the source of truth.

## Loop & Autonomy Guardrails

These apply whenever a session runs work in a **loop** — `/loop`, `/goal`, a scheduled routine, or fanning out sub-agents — i.e. any time an *agent*, not a human, decides the next action. A loop is not a cron job: a script runs fixed steps; a loop reads state, picks the next action, checks the result, and decides whether to continue, retry, or stop. Without the guardrails below it isn't a loop — it's a token furnace.

**Never start a loop without all three:**

- **A verifiable "done."** An objective stop target — "tests X pass", "CI green", "reviewer confirms criterion N" — never "until it looks right." A fuzzy goal makes the loop optimise toward a fake target. The spec's acceptance criteria are the goal; the verify gate and `/review` are how it's checked.
- **A separate checker.** Verification stronger than the agent's own say-so — the verify gate (typecheck→lint→test) and the adversarial `spec-reviewer`. The actor and the checker must not be the same judgement.
- **Hard breaks.** A max-iteration cap, no-progress detection (stop if N rounds change nothing), and a token/$ budget stated up front. Log spend; review it. Cost is part of the design, not an afterthought.

**Keep the human at the decisions that matter:**

- **Approve, don't trigger.** Removing yourself from the *trigger* is the point; staying at *approval* for anything that spends money or can't be undone is not — provisioning paid resources, production deploys, and outbound external comms always stop for a human (the same gate as confirming any outward-facing action, and as the human approval step on a Terraform apply). Here "external comms" means **customer- or public-facing, or irreversible** messages — *not* internal status digests to our own channels (CI/Dependabot-style notifications), which a read-only routine may post unattended.
- **Start simple, earn autonomy.** A solo loop with good verification beats a swarm for almost everything. Run a loop manually-triggered and monitored until it has proven itself; only then schedule it. Add autonomy when it pays for itself, not before.

Full rationale and the routine catalogue: [`altimist-strategy/research/loop-engineering-2026.md`](https://github.com/altimist/altimist-strategy/blob/main/research/loop-engineering-2026.md).

## Platform — Cloudflare

**Cloudflare is Altimist's operating platform.** Workers, Pages, R2, D1, KV, Queues, Workflows and Cloudflare DNS are the default runtime for everything we build and ship. When a design needs hosting, storage, a database, a queue, a cron or a scheduled job, reach for the Cloudflare primitive first, and justify anything else explicitly.

**Vercel has been removed from the Altimist tech stack.** Don't add a Vercel deployment, a `vercel.json`, a Vercel environment variable or a Vercel-specific integration to any project. If you are about to suggest `vercel env add`, `vercel deploy`, a Vercel dashboard step, or a Vercel preview URL — stop. The answer is the Cloudflare equivalent.

**Vercel seats still exist for one reason: completing the migration off Vercel.** A seat holder is not a deployment gatekeeper, is not required to author or merge anyone's PR, and confers no special standing in review. Treat any remaining Vercel deployment as legacy to be retired, not as a supported target.

Where a repo's own `CLAUDE.md`, README or workflow still describes a Vercel flow, that repo has **not been migrated yet**. The description is historical, the migration is the work, and the correct move is to note it rather than follow it. Say so plainly rather than quietly deploying to Vercel because the docs said to.

## Git Workflow

### Protected branches

- **`main`** is protected on every Altimist repo. Never push directly.
- **`staging`** is additionally protected on projects that keep a shared pre-production environment (see Review & Preview Workflow).
- All other branches (feature branches, topic branches, experiments) are unrestricted — any team member can push to them freely.

We recommend configuring **GitHub branch protection rules** on each repo to enforce this mechanically: require PRs into `main` (and `staging` where a project has one), block direct pushes, optionally require status checks. The CLAUDE.md rule is the convention; branch protection is the belt-and-braces.

### Workflow

- Branch from `main` (or `staging`, where a project has one and you are targeting it) → commit → push → open PR → review → merge.
- Before opening a PR, check the repo status and the latest PRs to avoid duplicates. Gathering information (`git status`, `gh pr list`, etc.) never requires confirmation.

### Who creates PRs and who merges

Any team member can open a PR and merge it. **Self-merge is allowed** after review — the PR is the visible, traceable record. Small teams trade "two pairs of eyes" for velocity; the spec, test suite, and PR diff serve as the quality signal. Add a reviewer when the change is risky, when it touches a shared standard, or when you want a second opinion.

There is no per-platform gatekeeper and no hand-off to a named individual. (Historic note, because older docs and habits still say otherwise: Vercel attributed a deployment to the PR *author*, so PRs once had to be authored by one of the two seat holders. That constraint is gone, along with the platform that created it.)

### State verification

- **Verify remote state before claiming it.** Once a PR is opened or work is pushed, its state (open / merged / closed; branch position; deploy status) is unknown until observed — anyone with merge rights may have acted on it. Before saying *"the PR is open"* or *"main hasn't moved"*, run the check (`gh pr view <n>`, `gh pr list`, `git fetch`). Cheap to verify; expensive to be wrong.
- **Pull latest before pushing.** Upstream may have moved while you were working. Run `git fetch` and rebase or merge the latest target branch into your feature branch before pushing, to avoid landing on a stale base.

## Altimist Design & Branding

For user-facing visual output — web UI, artifacts, dashboards, charts, slides, styled docs — default to the [Altimist Design System](https://github.com/altimist/altimist-design-system): the agent-readable source of truth for the brand. Don't invent colours, fonts, or spacing — take exact values from `tokens/tokens.json` and follow that repo's README for wiring (distribution is copy-in per [ADR-033](https://github.com/altimist/altimist-strategy/blob/main/decisions/ADR-033-distribute-design-system-as-copy-in.md); there is no npm package). This doesn't apply to non-visual work (APIs, CLIs, data pipelines) — brand what a human sees.

- **Respect the project's existing theme.** Introduce or change theming only when that is the task — never as a side effect of an unrelated change (Surgical Changes applies). If a project has no theme and the task is visual, propose the design system rather than ad-hoc styling.
- **Charts:** use the design system's `dataViz` tokens as the series palette. When a design-focused skill runs (`dataviz`, `artifact-design`, `frontend-design` where installed), apply Altimist tokens from the start — the brand is the default theme, not an afterthought.

## Documentation

Every material change should leave the project's documentation accurate.

**Before opening a PR, verify whether your change needs to update:**

- **README** — install steps, commands, env vars, supported features
- **Architecture docs** — how components fit together, decisions and trade-offs
- **Specs** — if the project uses spec-driven development (e.g. `docs/specs/`)
- **Inline comments** — only where the code is genuinely non-obvious

**What counts as material:**

- New feature, API endpoint, env var, CLI command, or config option
- Behaviour change visible to users or other developers
- Architecture change (new component, removed dependency, changed data flow)

**What doesn't:** bug fixes restoring intended behaviour, refactors with no behavioural change, tests for existing behaviour, typos, formatting.

If a needed doc lives in another repo, open a follow-up issue and link it from the PR.

## Reading Documents (.pdf / .docx)

Don't Read `.pdf` or `.docx` files directly — PDFs cost ~1,500–3,000 tokens **per page** (read as page images), and docx isn't natively readable at all. Convert to Markdown first and read/grep the `.md` sidecar (`spec.pdf` → `spec.pdf.md`): run `/doc2md <file>` (PDF → pymupdf4llm, docx → MarkItDown — fixed rules, see the plugin's `docs/specs/F-001-doc2md.md`). With the Altimist plugin (≥ 0.9.0) installed, a hook **auto-redirects `.pdf` reads**; **`.docx` is not auto-redirected** — Claude Code's Read rejects `.docx` as binary before the hook can run, so **always `/doc2md` a docx first**, then read the `.md`. `DOC2MD_OFF=1` opts out, and a Read with an explicit `pages` parameter bypasses it for intentional visual reads (figures, scans).

## Review & Preview Workflow (projects with a staging environment)

Some projects keep a dedicated `staging` branch: a shared, always-deployable pre-production environment that a change is exercised on before promotion. It exists because a reviewer should be able to use the change, not just read the diff.

- Developers commit and push to their own feature branches as normal.
- **No one pushes directly to `staging` or `main`.** Both are protected.
- **Open and merge your own PRs** once checks are green.
- Merging to `staging` deploys to the project's staging host (e.g. `staging.<prod-domain>`, or a separate `.dev` domain).
- Reviewers exercise the change on the staging URL before approving.
- When `staging` is validated, open a PR from `staging` to `main` and merge.
- Merging to `main` triggers the production deploy.

**Constraint:** `staging` must always be deployable. Never merge a broken feature into `staging` — it's shared, and a broken staging blocks everyone else's testing.

**Drift between `staging` and `main` is structural, not content-level.** With `--merge`-style PRs, after each `staging` → `main` promotion `staging` shows as N commits behind `main` (the merge commits themselves), but file contents match exactly. This is the steady state — do **not** run post-release `main` → `staging` syncs as routine housekeeping. They create commit churn without changing any file.

**Exception — when `staging` → `main` shows real conflicts:**

- **Trigger:** parallel feature streams have both landed on `main` while bypassing each other's `staging` (e.g. a hotfix went direct to `main` while another feature was going through `staging`).
- **Action:** do a one-time `main` → `staging` merge on the `staging` branch, resolve conflicts in favour of `staging`'s prose where it documents current deployed reality, push the merge commit, then proceed with the `staging` → `main` PR.
- **Trail:** mention "one-time backflow" in the merge commit message so future readers understand the exception isn't routine.

**Not every project has a staging branch, and most don't need one.** Worker-only services, CLI packages, Databricks workloads and Docker services commonly deploy straight from `main` — see the project's own `CLAUDE.md` for specifics.

## Environment variables and secrets are Terraform-governed

**Never add or edit an environment variable at its destination.** No Cloudflare dashboard, no GitHub Actions secret set by hand, no Terraform Cloud workspace variable (and no Vercel dashboard on whatever has not yet been migrated). If this repo's env vars or CI secrets are managed (most Altimist apps are — `mission-control`, `altimist-id`, and every onboarded repo), the only correct path is:

**1Password (`Altimist - IaC` vault, item titled after the repo, field in the `env` section) → declared in [`altimist/altimist-saas-iac`](https://github.com/altimist/altimist-saas-iac) → applied by merging to `main` there.**

Failure modes to know, because all of them are silent:

- **Putting a value in 1Password does nothing on its own.** Nothing reads it until it's declared in `altimist-saas-iac` and an apply has run. No error — the variable simply isn't there.
- **A secret set with `wrangler secret put` is outside IaC.** It works, and it drifts: nothing reconciles it, and nobody else can see what it is. Use it for a Worker that IaC does not yet own, and say so; for an onboarded repo, declare it in `altimist-saas-iac` instead.
- **Legacy, Vercel only:** Vercel baked env in at *build* time, so an existing deployment never picked up a new variable — a real commit rebuilt and re-pointed the domain, while `vercel redeploy` rebuilt but did **not** move the alias. This trap dies with the migration; it is recorded because half-migrated projects can still hit it.

Apply happens on merge to `main` via a GitHub Action (ADR-026) — **never run `terraform apply` from a laptop**. Rotate secrets in 1Password, never at the destination: value drift is undetectable by design.

**Full walkthrough, including the `env_targets` syntax and the trap table:** `docs/env-secrets-onboarding.md` in `altimist-saas-iac`. Clone it (`~/projects/altimist/altimist-saas-iac`) before changing configuration — a session scoped to this repo cannot see it otherwise, and will otherwise suggest the dashboard.

## Source of truth — Altimist strategy

Strategic context for this repo lives in [`altimist/altimist-strategy`](https://github.com/altimist/altimist-strategy):

- **Whitepapers** (`whitepapers/`) — canonical theses (e.g. Finternet-Native Identity v1.3). Specs and architecture in this repo must align with the whitepapers relevant to its domain. Divergence must be flagged explicitly with a "Departs from whitepaper" callout or an ADR — never dressed up as derivation.
- **ADRs** (`decisions/`) — recorded strategic decisions. Treat as binding for the topic they cover.
- **Themes** (`themes/`) — multi-repo strategic objectives; align this repo's roadmap with the theme(s) it serves. Epics live in each product repo's `docs/epics/`.
- **The live plan** (`plan/CURRENT.md`) — what Altimist is executing now. See **Ideas and the live plan** below.
- **Ideas** (`ideas/`) — ideas on future direction, triaged against the live plan.

Each consumer repo should list the *specific* whitepapers / ADRs that bind it (usually one or two) in its own `CLAUDE.md` Project section — see [altimist-id](https://github.com/altimist/altimist-id/blob/main/CLAUDE.md#source-of-truth--the-altimist-finternet-native-identity-whitepaper) for the pattern.

If a user request asks for something a binding whitepaper or ADR precludes, surface the conflict before writing code. These aren't permanently fixed — but operational artifacts shouldn't drift ahead of strategy without a deliberate revision step.

**Keep a local clone** at `~/projects/altimist/altimist-strategy` (`gh repo clone altimist/altimist-strategy ~/projects/altimist/altimist-strategy` if it's missing). Read strategy files from `origin/main` after a `git fetch` — `git -C <clone> show origin/main:<path>` — not from the working tree, which may be on any branch and any age.

## Ideas and the live plan

Ideas about where Altimist goes next, and the plan being executed now, both live in `altimist-strategy` — not in this repo, not in a personal memory store, not in a chat.

- **Before substantial work**, read `plan/CURRENT.md`. If the request isn't on the current milestone, say so before building — the same way you surface a conflict with a binding ADR. Off-plan work isn't forbidden; it should be a visible choice.
- **When someone floats an idea** that isn't the task at hand — a feature, a product direction, a process change — run `/record-idea` rather than letting it die in the session or land in a personal memory store. It asks only for what's missing, and an ideas-only PR merges once checks pass.
- **When ideas are waiting** (`status: new` in `ideas/`) and the user asks what's next, or a week has passed since the last triage, run `/triage-ideas`. It decides nothing alone — each idea is one decision card for the user.
- **When finished work meets the current milestone's success criteria**, or the user changes scope or a date, run `/revise-plan`.
- **Folding ideas into the plan** follows the fold-in rule in `ideas/README.md`: only cheap (about a day), on-objective ideas that move no date, add no vendor and need no ADR go straight in. Anything that changes milestone scope or date needs both founders. Never edit `plan/CURRENT.md` by hand — the skills keep the revision log.

<!-- Altimist Baseline v13 — END -->

## Project

`@altimist/altimist-id-consumer` is the **consumer-side** library that packages
the AltimistID auth pattern for Next.js apps. It ships the ADR-031 method as an
installable package: a single Node-runtime `middleware.ts` enforcement choke
point doing DB-backed session validation plus a **default-deny** route policy,
roles derived from verifiable-credential presence (staff/visitor), an
iron-session sealed cookie, the hosted-handoff popup login (sign-in + register),
logout, and session-revocation tooling. A consumer supplies only its **config**,
a **data-layer adapter**, and its **route classification** — everything else is
the package.

Counterpart to [`@altimist/did-web-client`](https://github.com/altimist/did-web-client)
(the verification primitives this library builds on) and modelled on its repo
layout. Tracks **mission-control #283**. Reference implementation:
`trading-journal` F-001.

## Source of truth — ADR-031 + the identity whitepaper

- **[ADR-031](https://github.com/altimist/altimist-strategy/blob/main/decisions/ADR-031-altimistid-consumer-middleware-choke-point.md)** —
  *binding.* This package is the canonical embodiment of ADR-031. Builds on
  ADR-009/014/019/023.
- **[finternet-native-identity-v1.3](https://github.com/altimist/altimist-strategy/blob/main/whitepapers/finternet-native-identity-v1.3.md)** —
  the identity-layer thesis this serves (T-003).

If a change would diverge from ADR-031, flag it before writing code.

## Stack

- **TypeScript, ESM-only.** `tsc` → `dist/`. Three subpath exports: `.` (Node
  core), `./prisma` (Prisma adapter), `./browser` (popup login logic).
- **Vitest** for tests (in-memory `AidStore` + mocked `did-web-client`; no DB).
- Targets Node 20+ (the core also runs anywhere; only `./prisma` needs Node).
- **Deps:** `@altimist/did-web-client`, `iron-session`, `zod`.
- **Peer deps:** `next` (≥15.5) for `.`; `@prisma/client` for `./prisma`. No React
  dependency anywhere (the design system owns UI).

## Commands

```bash
npm install
npm test                # vitest
npm run typecheck       # tsc --noEmit
npm run build           # tsc to dist/
```

## Publishing

Published to npm as `@altimist/altimist-id-consumer` under the `@altimist` scope
(public access). Owner `altimistdev`, 2FA on writes. Bump version, then
`npm publish` (runs `prepublishOnly` = test + build, then prompts for OTP).
Consumers pin a specific version. `0.x` — API may churn until mission-control
migrates (mc#336).

## Architectural invariants pinned by tests

- **The core (`.`) imports neither `@prisma/client` nor `react`.** Prisma lives
  only in `./prisma`; UI lives in the design system. Guarded by a purity test.
- **Never calls altimist.id on the request path** — inherits the
  `@altimist/did-web-client` invariant (verification is local against public DID
  docs; the hosted handoff is a sign-in-time redirect, not a per-request call).
- **`AidStore` is the only data-layer seam.** The core performs no DB access
  except through that interface; error policy (best-effort audit, fail-closed
  validation) lives in the core, not in adapters.
