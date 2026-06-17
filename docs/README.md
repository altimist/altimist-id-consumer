# Documentation

> **Purpose:** Map of what lives where in this folder. Anyone landing here
> should know how to find what they need without reading every file.
> **Update when:** Adding/removing a doc category, restructuring `docs/`.
> **Related:** [`../README.md`](../README.md) for the project overview,
> [`../CLAUDE.md`](../CLAUDE.md) for Claude Code rules.

---

## What's in here

| Folder / file | Purpose |
|---|---|
| [`architecture.md`](./architecture.md) | High-level system architecture — components, how they communicate, where data lives, dependencies. |
| [`design/`](./design/README.md) | UX design (Garrett's 5 planes: Strategy, Scope, Structure, Skeleton, Surface). User-facing projects only. |
| [`specs/`](./specs/README.md) | Feature specifications. Each spec is the contract for what gets built. |
| [`epics/`](./epics/README.md) | Epic briefs — multi-feature deliveries grouped by domain. |
| [`runbooks/`](./runbooks/README.md) | Operational procedures (deploy, rollback, incident response). |
| [`roadmap.md`](./roadmap.md) | Phase / release timeline mapping specs to delivery windows. |

---

## How the layers fit together

```
Theme  →  Epic  →  Feature spec  →  User stories
(strategic) (domain group) (one feature)  (inside the spec)
```

- **Themes** live at the org level in [`altimist/altimist-strategy`](https://github.com/altimist/altimist-strategy) (cross-product, slow-changing).
- **Epics** live in [`epics/`](./epics/README.md) (per-product, multi-sprint deliveries grouped by domain).
- **Features** live in [`specs/`](./specs/README.md) (one file per feature).
- **User stories** live inside each feature spec.
- **Phases** are a delivery-timing concept (when), tracked in metadata + [`roadmap.md`](./roadmap.md). Orthogonal to epics (what).

Each spec lists both its `Epic` (domain) and `Phase` (timing) in metadata.

---

## When to add what

- **Substantial new feature** → write a spec in `specs/` first (see [Spec-First rule](../CLAUDE.md))
- **Group of related upcoming features** → write an epic brief in `epics/`
- **Operational procedure others might need at 2am** → write a runbook in `runbooks/`
- **Architecture change** → update `architecture.md` (and add an ADR if you want, in a future `decisions/` folder)
- **UX work** → fill in `design/` (work top-down: 1-strategy → 5-surface)
