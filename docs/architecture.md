# Architecture

> **Purpose:** High-level system structure — components, how they communicate,
> where data lives, key dependencies. The "what is this thing made of" doc.
> **Update when:** Adding a component, changing a dependency, altering data
> flow, removing a major piece, or making a significant trade-off worth recording.
> **Related:** [`design/`](./design/README.md) for UX, [`specs/`](./specs/README.md)
> for per-feature contracts, [`epics/`](./epics/README.md) for multi-feature deliveries.

---

## System Overview

<Two or three paragraphs describing what this system is, what it does, and how
it fits into the broader Altimist ecosystem (if applicable). New contributors
should grasp the headline from this section alone.>

---

## Components

<For each component (service, package, module, library), describe:>

### <Component Name>

- **Purpose:** ...
- **Tech:** ...
- **Owns:** ... (which data, which behaviours)
- **Talks to:** ... (other components, external APIs)

### <Component Name>

...

---

## Data Flow

<Describe the main paths data takes through the system. ASCII diagrams
welcome — they survive Git diffs better than image attachments.>

```
[User]
   │
   ▼
[Component A] ──► [Component B]
                      │
                      ▼
                  [Database]
```

---

## External Dependencies

| Dependency | Purpose | Failure mode |
|---|---|---|
| <e.g. Vercel Postgres> | Primary data store | Reads/writes fail; app shows error state |
| <e.g. SharePoint Graph API> | Document indexing | Indexing pauses; existing data still served |

---

## Key Trade-offs

<Decisions made deliberately, with the alternative considered and the reason.
This is the "why" record. Examples:>

- **Polling, not WebSockets.** Vercel serverless functions don't support
  persistent WebSockets. Polling at 2s intervals is the right primitive
  for this constraint.
- **Hashed tokens, not encrypted.** SHA-256 hash means we can verify but
  never recover; lost tokens require regeneration. Cost: re-onboard. Benefit:
  zero exposure even if DB leaks.

---

## Future / Open

<What's planned that would change this architecture? Pending decisions?
Known limitations?>

- ...
