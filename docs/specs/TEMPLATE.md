# Feature Spec: <Feature Name>

> **Purpose:** Define what this feature is, who it's for, and what it must do
> — before any code is written. The spec is the contract between intent and
> build.
> **Update when:** Requirements shift, acceptance criteria change, or scope is
> reduced/expanded during build. Stale specs are worse than no specs.
> **Related:** [`../architecture.md`](../architecture.md) for system context,
> [`../design/`](../design/README.md) for UX, [`../epics/`](../epics/README.md)
> for the epic this belongs to.

---

## How to use this template

1. **Copy** this file to `docs/specs/<id>-<short-name>.md` (e.g. `F-001-user-onboarding.md`)
2. **Start with user stories.** If you can't write them, you don't understand
   the feature yet. Everything below derives from them.
3. **Move status to `Review`** when ready for feedback; `Approved` once
   incorporated.
4. **Reference the spec ID** in PR titles and commit messages.

---

## Metadata

| Field | Value |
|---|---|
| Spec ID | F-XXX |
| Status | Draft |
| Epic | <link to epic in [`../epics/`](../epics/), or "None"> |
| Phase | <e.g. "Phase 1", or "Backlog"> |
| Owner | @<github-handle> |
| Reviewers | @<handle>, @<handle> |
| Created | YYYY-MM-DD |
| Last updated | YYYY-MM-DD |
| Target release | TBD |
| Depends on | None |

---

## Where this fits

This feature is part of **Epic: <name>** ([brief](../epics/E-XXX-name.md)),
which serves **Theme: <name>** (in [`altimist/altimist-strategy`](https://github.com/altimist/altimist-strategy)).

Sibling features in the same epic (in scope or planned):
- F-YYY: <name>
- F-ZZZ: <name>

---

## Summary

<One paragraph. What is this feature? Why does it exist? A team member reading
only this should grasp the headline.>

---

## User Stories

The shape of the work, in users' words. **Every acceptance criterion below
traces back to a user story.** If a criterion can't trace back, either the
criterion is out of scope or there's a missing story.

Format: **As a <role>, I want to <action>, so that <outcome>.**

Cover, at minimum:
- The primary user (the person this is mostly for)
- Any secondary users (admins, operators, viewers, integrators)
- Edge-case users where relevant (first-time vs. returning, free vs. paid,
  mobile vs. desktop)

---

### US-1: <Short verb-led title, e.g. "Create a task">

As a **<role>**, I want to **<action>**, so that **<outcome>**.

**Why this matters:** <1–2 lines on the underlying need, pain, or opportunity.
Helps reviewers judge whether the proposed solution fits the actual problem.>

---

### US-2: <Short title>

As a **<role>**, I want to **<action>**, so that **<outcome>**.

**Why this matters:** ...

---

### US-3: <Short title>

...

---

## Goals & Non-Goals

**Goals** — outcomes this feature must achieve (phrase as outcomes, not features).

- <e.g. "Reduce time-to-first-task for new users from N minutes to M">
- ...

**Non-Goals** — what this feature deliberately does NOT do. Often more important
than the goals; sets the perimeter.

- ...
- ...

---

## User Flows

Walk through the main paths users take. One flow per primary user story, plus
flows for tricky branches.

### Flow 1: <Name>

Maps to: US-1

1. User does X
2. System responds Y
3. User does Z
4. System persists, confirms, ...

### Flow 2: <Name>

Maps to: US-2

...

---

## Acceptance Criteria

Testable, binary statements. Each references the user story it satisfies.

### Functional

- [ ] **(US-1)** <Specific behaviour>
- [ ] **(US-1)** <Another>
- [ ] **(US-2)** ...

### Non-functional

- [ ] **Performance:** <e.g. "Initial render < 500ms on 4G">
- [ ] **Accessibility:** <e.g. "Keyboard-navigable; WCAG 2.1 AA contrast">
- [ ] **Security:** <e.g. "Only authenticated users can call the API">
- [ ] **Observability:** <e.g. "Errors logged with context; key actions emit analytics">

---

## Data Model

Schema, types, relationships. Skip if no data model change.

```
// Prisma, TypeScript, SQL — whatever fits the project's stack
```

---

## API

Endpoints, request/response shapes, error cases. Skip if no API change.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /api/example | ... | required |
| POST | /api/example | ... | required |

**Errors:**
- 400: invalid input
- 401: not authenticated
- 403: not authorised
- 404: not found

---

## UX & Visual Design

Skip if backend-only.

- **Wireframes:** <link or embed>
- **Final design:** <Figma / design system reference>
- **Microcopy:** <inline or link>
- **Empty / loading / error states:** <describe or link>
- **Design plane:** see [`../design/4-skeleton.md`](../design/4-skeleton.md) and
  [`../design/5-surface.md`](../design/5-surface.md)

---

## Edge Cases & Error Handling

What happens when things go wrong?

- **Empty state:** ...
- **Loading state:** ...
- **Error state:** ...
- **Concurrent edits / race conditions:** ...
- **Permission denied:** ...
- **Network failure / offline:** ...
- **Validation failures:** ...

---

## Strategic Implications

Bridge from this feature to the wider Altimist strategy. Captures anything
that has implications beyond the feature itself — typically surfaced during
spec authoring and worth carrying into [`altimist/altimist-strategy`](https://github.com/altimist/altimist-strategy).

Skip any subsection that doesn't apply.

### Theme updates needed

Existing themes that should be updated as a result of this spec — new epic
to add to a theme's manifest, KPI worth tracking, status note, etc.

- `T-XXX-name`: <what to update>

### Decisions worth recording

Non-obvious decisions made during this spec that deserve an ADR in
`altimist-strategy/decisions/`. (The spec captures the *what*; an ADR
captures the *why* permanently.)

- <Decision and the trade-off accepted>

### New themes proposed

Strategic objectives that surfaced during this spec but don't fit any
existing theme — flag to leadership for consideration.

- <Proposed theme and why it matters>

### Cross-repo impacts

Knock-on effects in other Altimist repos that need coordination.

- `<other-repo>`: <what changes there>

### Open questions for leadership

Strategic questions above the spec author's pay grade — surface for Arthur
or the relevant decision-maker.

- <Question>

---

## Open Questions

Unresolved decisions that could change the spec. Each has an owner and a target
resolution date.

- [ ] **<Question>** — owner: @<handle>, target: <date>
- [ ] ...

---

## Out of Scope (this iteration)

Deliberately deferred. Often the shopping list for the next iteration.

- ...
- ...

---

## References

- Related specs: [F-XXX](./F-XXX-other.md)
- Architecture context: [`../architecture.md`](../architecture.md)
- Design system: [`../design/`](../design/README.md)
- External discussions: <links>
