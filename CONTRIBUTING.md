# Contributing to Fundly

Read this before making any change, whether you're a human or an AI agent
working on this repo.

## The rule: no direct pushes to `main`

`main` is a protected branch. You **cannot** push directly to it and you
**cannot** merge a pull request yourself, even if GitHub lets you open one —
branch protection requires an approving review from the repo owner
(`@fundlygames`, enforced via `.github/CODEOWNERS`) before anything merges.

This is intentional: `main` deploys straight to the live production site
(fundly.games) on every push via GitHub Pages. Nothing reaches customers
without the owner reviewing and approving it first.

## Workflow

1. Create a branch off `main` for your change: `git checkout -b your-branch-name`
2. Make your change, commit it.
3. Push your branch (not `main`) and open a pull request against `main`.
4. Wait for the owner to review and approve. Do not merge it yourself —
   you likely don't have permission to anyway, and even if you did, don't.
5. Once approved and merged, it deploys automatically.

If you're an AI agent operating on behalf of a contributor: do not attempt to
push to `main`, do not attempt to merge your own PR, and do not try to work
around branch protection. If a push or merge is rejected, that is the
protection working as intended — open a PR and wait for review instead.

## Local development

No build step — this is a static site (HTML/CSS/JS) plus Supabase edge
functions. See `AGENTS.md` for the project layout and how to run it locally.
