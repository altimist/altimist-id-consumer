# Runbooks

> **Purpose:** Operational procedures for repeatable, sometimes-stressful
> situations — deploys, rollbacks, incident response, recovery from outages.
> **Add a runbook when:** A procedure exists that would be needed at 2am by
> someone other than the original author.
> **File naming:** `<verb>-<thing>.md` (e.g. `deploy-staging.md`,
> `rollback-production.md`, `restore-database.md`).

---

## What makes a good runbook

- **Specific.** "Run this exact command, in this exact order."
- **Self-contained.** Don't link out for critical steps; copy them in.
- **Reversible.** For destructive steps, document how to undo.
- **Decision-marked.** Where the procedure branches ("if X, do A; else B"),
  call it out explicitly.
- **Time-stamped.** Note when the runbook was last verified (procedures rot).

---

## Suggested runbooks (when applicable)

- `deploy-staging.md` — how to push to staging
- `deploy-production.md` — how the prod deploy works
- `rollback.md` — how to revert a bad deploy
- `restore-database.md` — recovery from data loss
- `incident-response.md` — what to do when something is on fire
- `rotate-secrets.md` — how to rotate API keys, tokens, env vars
- `onboard-developer.md` — local setup for a new contributor
- `decommission.md` — how to shut this thing down cleanly

Add only the ones this project actually needs.

---

## Template

```markdown
# <Verb> <Thing>

> **When to use this:** <trigger conditions>
> **Last verified:** YYYY-MM-DD by @<handle>
> **Estimated duration:** <e.g. "10 minutes">
> **Reversible?** Yes / No / Partially — see Rollback section

## Prerequisites

- ...

## Procedure

1. Step
2. Step
3. Step

## Verify

How to confirm the procedure worked.

## Rollback

How to undo, if needed.

## Common failure modes

- **Symptom:** ...
- **Cause:** ...
- **Fix:** ...
```
