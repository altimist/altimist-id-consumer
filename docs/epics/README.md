# Epics

> **Purpose:** Hold briefs for multi-feature deliveries grouped by domain
> (e.g. authentication, messaging, billing). Each epic is a manifest of the
> features that compose it.
> **Update when:** Adding a new epic, changing the features in an epic, or
> moving an epic through its lifecycle.
> **Related:** [`../specs/`](../specs/README.md) for individual features,
> [`../roadmap.md`](../roadmap.md) for delivery timing.

---

## What goes here

One markdown file per epic. Filename: `<id>-<short-kebab-name>.md`.
Example: `E-001-authentication.md`.

---

## Epic vs. Phase — they're orthogonal

| Concept | What it answers | Where it lives |
|---|---|---|
| **Epic** | "Which domain does this belong to?" | this folder, plus `Epic` field on each spec |
| **Phase** | "When are we shipping this?" | spec metadata + [`../roadmap.md`](../roadmap.md) |

A single feature has both an Epic (domain) and a Phase (timing).

---

## How to use the template

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `<id>-<short-kebab-name>.md`
2. Fill in metadata (give it a unique ID, set status to `Planned`)
3. List the features in scope (links to spec files in [`../specs/`](../specs/))
4. Define epic-level outcomes — these are bigger than any single feature
5. Each spec in scope should reference this epic in its metadata

---

## When to write an epic brief

Write an epic brief when:
- Multiple features cluster around a single domain or capability
- The features are cohesive enough that a single owner should orchestrate them
- The bundle is big enough that no single feature spec captures the whole story

Don't write an epic for a single feature — just write the spec.

---

## Status lifecycle

| Status | Meaning |
|---|---|
| Planned | Identified, not yet started; specs may not exist yet |
| In progress | At least one feature spec is being implemented |
| Shipped | All features in scope are merged and validated |
| Cancelled | Decided not to do; brief kept as historical record |
