# <Project Name>

> **Replace this README** with content specific to your project. The
> sections below are placeholders showing what's typically expected.

<One-paragraph description of what this project is and who it's for.>

## Install

```bash
# Installation steps go here
```

## Usage

```bash
# Common commands go here
```

## Development

```bash
# Setup steps for working on this project
```

## Deployment

<Where this deploys (Vercel staging + main, npm registry, Docker on
specific server, Databricks, etc.). Reference [`CLAUDE.md`](./CLAUDE.md)
for the standard branch workflow.>

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — Claude Code rules (Altimist baseline + project-specific)
- [`docs/`](./docs/README.md) — architecture, design, specs, epics, runbooks
- [`docs/architecture.md`](./docs/architecture.md) — system architecture overview
- [`docs/specs/`](./docs/specs/README.md) — feature specifications
- [`docs/epics/`](./docs/epics/README.md) — epic briefs (multi-feature deliveries)
- [`docs/design/`](./docs/design/README.md) — UX design (Garrett's 5 planes; for user-facing projects)

## License

UNLICENSED — internal Altimist.

---

## Template setup checklist

> Delete this section once you've finished setting up.

- [ ] Replace this README's content with project-specific information
- [ ] Fetch the latest baseline from [`altimist/altimist-claude-code-baseline`](https://github.com/altimist/altimist-claude-code-baseline) and paste into `CLAUDE.md`
- [ ] Fill in `CLAUDE.md` project section (stack, commands, project-specific rules)
- [ ] Fill in `docs/architecture.md`
- [ ] Decide which `docs/` subdirectories you'll use; remove the ones you won't
- [ ] Update `LICENSE` if not UNLICENSED
- [ ] Update `.gitignore` for your stack
- [ ] If deploying to Vercel: create the `staging` branch (`git branch staging && git push -u origin staging`) and configure Vercel to deploy it
- [ ] Delete this checklist
