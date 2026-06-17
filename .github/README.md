# `.github/`

> **Purpose:** GitHub-specific configuration — PR templates, issue templates, CI
> workflows, and metadata GitHub reads to shape the repo experience.
> **Update when:** Changing PR/issue templates, adding workflows, or adjusting
> repo-level GitHub config.

---

## What's in here

| File / folder | Purpose |
|---|---|
| [`PULL_REQUEST_TEMPLATE.md`](./PULL_REQUEST_TEMPLATE.md) | Auto-fills new PR descriptions; embodies baseline rules (docs checklist, pre-flight, preview URL). |
| `workflows/` *(add when needed)* | Stack-specific CI workflows. Not shipped in the template — see below. |
| `ISSUE_TEMPLATE/` *(optional)* | Bug / feature / question templates. Add when issue volume warrants it. |

---

## Adding CI workflows

The template ships **without** a workflow file because the right CI is stack-specific. Common starting points:

### Node / TypeScript

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

### Python

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: ruff check .
      - run: pytest
```

### Any stack

Use the same pattern: checkout → set up runtime → install deps → run lint/typecheck/test. Keep CI under 5 minutes for the inner loop.

---

## CI conventions

- **CI must pass** before a PR is merged. The PR template's pre-flight checklist asks you to confirm local checks pass; CI is the second line of defence.
- **Don't disable CI** to land work. Fix the failure or revert.
- **Secrets** belong in repo settings → Actions secrets, never inline.
- **Concurrency** — use `concurrency: { group: ${{ github.ref }}, cancel-in-progress: true }` to cancel superseded runs and save minutes.
