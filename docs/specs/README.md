# Feature Specs

> **Purpose:** Hold the contract for every substantial feature in this project
> — what it is, who it's for, what success looks like.
> **Update when:** Adding a new spec, changing scope of an existing one, or
> moving a spec through its status lifecycle (Draft → Review → Approved →
> In progress → Shipped → Archived).
> **Related:** [`../epics/`](../epics/README.md) for the epic groupings that
> specs belong to, [`../roadmap.md`](../roadmap.md) for delivery timing.

---

## What goes here

One markdown file per feature. Filename: `<id>-<short-kebab-name>.md`.
Example: `F-001-user-onboarding.md`.

The ID prefix sorts naturally; the short name is human-readable.

---

## How specs fit into the workflow

```
Theme (org)  →  Epic (domain)  →  Feature spec (here)  →  User stories (inside spec)
                                       │
                                       ▼
                              (then implementation)
```

- A feature spec lists both its `Epic` (which domain it serves) and
  `Phase` (when it ships) in metadata.
- Every acceptance criterion in a spec traces back to a user story. If
  it doesn't trace, it's either out of scope or there's a missing story.
- The spec is the contract. Build to it. Test against it. Review against it.

---

## When to write a spec

See the **Spec-First** rule in [`CLAUDE.md`](../../CLAUDE.md). Short version:

**Write a spec when** the work is substantial — multi-layer, user-facing,
data model change, new endpoint, security-sensitive, or > ~2 hours.

**Skip the spec when** the work is trivial — bug fix restoring intended
behaviour, refactor with no behavioural change, copy edit, dependency bump.

When unsure, propose drafting a spec and let the user decide.

---

## How to use the template

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `<id>-<short-kebab-name>.md`
2. Fill in metadata (give it a unique ID, set status to `Draft`)
3. **Start with user stories.** They drive everything else. If you can't
   write the user stories, you don't understand the feature yet.
4. Derive goals, acceptance criteria, flows, data model, edge cases from
   the stories.
5. Move status to `Review` when ready for feedback. `Approved` once
   incorporated.
6. Reference the spec ID in PR titles and commit messages once
   implementation begins.

---

## Status lifecycle

| Status | Meaning |
|---|---|
| Draft | Being written, not ready for review |
| Review | Open for feedback; reviewers leave comments |
| Approved | Reviewer feedback incorporated; ready to build |
| In progress | Implementation underway (referenced in commits/PRs) |
| Shipped | Merged to main / production; spec is the historical record |
| Archived | Superseded or cancelled — kept for reference, not active |
