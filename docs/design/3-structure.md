# 3. Structure (Information Architecture)

> **Purpose:** How the product's content and functions are organised — sitemap,
> navigation hierarchy, user flows between key tasks.
> **Update when:** Adding a top-level section, changing primary navigation,
> reworking how users get from A to B.
> **Where this fits:** Plane 3 of 5. Above: [Scope](./2-scope.md). Below:
> [Skeleton](./4-skeleton.md).

---

## Sitemap

The top-level structure. Use indentation or an ASCII tree.

```
Home
├── <Section>
│   ├── <Subsection>
│   └── <Subsection>
├── <Section>
└── Settings
    ├── <Subsection>
    └── <Subsection>
```

---

## Navigation

How users move around. Primary nav, secondary nav, breadcrumbs, contextual nav.

- **Primary navigation:** ... (always visible — main sections)
- **Secondary navigation:** ... (within a section)
- **Contextual navigation:** ... (in-content links, related items)
- **Utility navigation:** ... (settings, account, sign out)

---

## User Flows

Walk through the main paths a user takes for top tasks. One flow per primary
user story (referenced from feature specs).

### Flow: <Task name>

1. User starts at ...
2. Clicks ...
3. Sees ...
4. Does ...
5. Ends at ...

### Flow: <Task name>

...

---

## Information Hierarchy

What's prominent vs. tucked away? What's the priority order on the home
page / dashboard / main view?

- **Most prominent:** ...
- **Secondary:** ...
- **Discoverable but de-emphasised:** ...
- **Hidden behind a menu / settings:** ...
