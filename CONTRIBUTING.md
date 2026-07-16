# Contributing to BeastDex

Thanks for taking an interest in BeastDex! This doc covers how to get set up locally and what to
expect when opening a PR.

## Getting set up

See the [README](./README.md#-getting-started) for install and running the dev server.
No `.env` file is required to get a working local build — everything defaults to public endpoints.

## Before opening a PR

Run these locally and make sure they pass:

```bash
bun run lint
bun run test
bun run build
```

There's no CI pipeline yet, so these are the checks a reviewer will expect you to have already run.

## Commit messages

This repo loosely follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add sweep-buy to the marketplace floor view
fix: Shiny/Animated filters used wrong value format
chore: dedupe hardcoded torii endpoint into a shared constant
```

`feat:` for new functionality, `fix:` for bug fixes, `chore:` for maintenance/cleanup that doesn't
change behavior. Keep the summary line short and focused on *why* over *what* where possible.

## Code style

- TypeScript, functional React components, Tailwind for styling.
- Prefer editing/extending existing components over introducing new abstractions — see the
  existing `components/` and `services/` structure before adding a new pattern.
- Don't add speculative config, feature flags, or error handling for cases that can't occur —
  match the existing code's level of defensiveness.
- Comments should explain *why*, not *what* — avoid restating what the code already makes obvious.
- Run `bun run lint` before pushing; new `no-explicit-any` errors or unused vars will be flagged
  in review (some pre-existing ones are still around — no need to fix those in an unrelated PR).

## Opening a PR

- Keep PRs focused — one feature or fix per PR is easier to review than a bundle of unrelated changes.
- Describe *why* the change is needed in the PR description, not just what changed.
- Link any relevant issue.

## Reporting bugs / requesting features

Open a [GitHub issue](https://github.com/spaghettiOnToast/BeastDex/issues) with steps to reproduce
(for bugs) or the use case you're trying to solve (for features).
