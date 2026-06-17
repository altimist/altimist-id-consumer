# UX Design — The Five Planes

> **Purpose:** Capture the design thinking for user-facing features using
> Jesse James Garrett's *Elements of User Experience* framework. Each plane
> answers a different question, building from abstract to concrete.
> **Update when:** Strategic intent shifts, feature scope changes, IA is
> reworked, layouts change, or visual treatment is refined.
> **Related:** [`../specs/`](../specs/README.md) for feature-level contracts,
> [`../architecture.md`](../architecture.md) for the technical "what".
> **Skip this folder if:** the project has no UI (CLI tools, libraries,
> internal services). Backend services don't need it.

---

## The five planes (abstract → concrete)

```
Abstract  ┌─────────────────────────────────────────────┐
          │ 1. STRATEGY  — Why does this exist?         │
          │    Who is it for? What need does it solve?  │
          ├─────────────────────────────────────────────┤
          │ 2. SCOPE     — What features and content?   │
          │    What's in, what's out?                   │
          ├─────────────────────────────────────────────┤
          │ 3. STRUCTURE — How is it organised?         │
          │    Information architecture, user flows.    │
          ├─────────────────────────────────────────────┤
          │ 4. SKELETON  — Where do things sit?         │
          │    Wireframes, layout, interaction patterns.│
          ├─────────────────────────────────────────────┤
          │ 5. SURFACE   — How does it look and feel?   │
          │    Visual design, branding, sensory detail. │
Concrete  └─────────────────────────────────────────────┘
```

Each plane builds on the one above. **Don't jump to the surface before
strategy is clear** — visual design without strategic intent produces
beautiful but pointless products.

---

## How to use this folder

- Work **top-down** when starting a new product or major redesign.
  Strategy → Scope → Structure → Skeleton → Surface.
- Update **bottom-up** when iterating on a shipped product. A surface
  tweak may not need strategy changes; a strategic shift cascades down.
- Cross-reference from feature specs (`docs/specs/`) — a spec's UX section
  links to the relevant plane(s).
- Each file has a header explaining what it covers and when to update it.

---

## Files

- [`1-strategy.md`](./1-strategy.md) — Why this product exists, who it's for, success metrics
- [`2-scope.md`](./2-scope.md) — Functional and content requirements, in/out of scope
- [`3-structure.md`](./3-structure.md) — Information architecture, navigation, user flows
- [`4-skeleton.md`](./4-skeleton.md) — Wireframes, layout patterns, interaction conventions
- [`5-surface.md`](./5-surface.md) — Visual design, typography, colour, motion, copy voice
