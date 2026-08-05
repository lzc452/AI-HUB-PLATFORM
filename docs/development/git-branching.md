# Git Branching and GitHub Delivery

This repository uses a development-integration model for all product phases.

```text
main                 releasable production history
  ^ release PR
development          shared integration branch
  ^ squash merge PR
feature/phase-XX-*   phase-level delivery branch
```

## Branches

- `main` contains only releasable versions. Changes enter through `release/vX.Y` pull requests.
- `development` is the integration branch for active phase work. Changes enter through feature pull requests.
- `feature/phase-XX-*` contains one phase and is the only long-lived feature branch for that phase. Each task is a separate Conventional Commit.
- `release/vX.Y` is created from `development` for final verification, release notes, and version tagging.
- `hotfix/*` is reserved for urgent production fixes. A hotfix is reviewed into both `main` and `development`.
- `codex/phase-01-continuation` is retained as a historical archive branch and is not a development entry point.

Long-lived branches are intentionally limited to `main`, `development`, an
active phase branch, `release/*`, and `hotfix/*`. Completed phase branches are
preserved with immutable archive tags and a migration record before deletion.

The Phase 2 branch is:

```text
feature/phase-02-identity-organization-authorization -> development
```

## Daily Workflow

1. Start from the latest `development` branch.
2. Work on the phase feature branch.
3. Keep each task in an independent commit and run targeted tests before committing.
4. Run `git diff --check`, push immediately after each completed task, and update the same Draft PR.
5. Convert the PR to Ready only after the full verification gate and review are complete.
6. Squash merge the PR into `development`; do not rewrite pushed history.

Example task commits:

```text
feat(identity): add organization schema [P2-T01]
feat(identity): add password sessions and reset flow [P2-T02]
feat(identity): add DingTalk sync port [P2-T03]
feat(authz): add RBAC and audience authorization [P2-T04]
feat(api): protect identity administration endpoints [P2-T05]
test(phase-02): close verification and gate evidence [P2-T06]
```

## Pull Request Contract

Every feature or release PR must identify its scope, task IDs, changed modules, targeted tests, migration impact, external credential or deployment risk, `pnpm verify` result, Docker Compose smoke result, and rollback procedure. Use the repository PR template so this evidence stays with the PR.

The Phase 2 PR remains one Draft PR throughout task delivery. It is converted to Ready only after all tasks are committed, pushed, reviewed, and verified.

## Gates and Protection

The GitHub Actions `verify` workflow runs on pushes to delivery branches and on
pull requests targeting `main` or `development`. Its required checks are:

- `verify`
- `container-smoke`

Repository administrators must protect both `main` and `development` with these settings:

- Require a pull request and at least one approving review from a non-author.
- Require all review conversations to be resolved.
- Require branches to be up to date before merge.
- Require the `verify` and `container-smoke` checks to pass.
- Allow squash merge only; disable merge commits and rebase merges.
- Block direct pushes, force pushes, and branch deletion.
- Restrict bypasses to documented emergency hotfixes performed by an administrator.

GitLab CI is not an authoritative or required pipeline for this repository.

Branch protection is a GitHub repository setting rather than a versioned file. After changing it, verify the rules in the repository Settings page and record the date and administrator in the release or governance PR.

## Release and Rollback

```text
development -> release/vX.Y -> full gates -> release PR -> main -> tag vX.Y
```

The release workflow publishes `api`, `worker`, and `web` images to GHCR with
commit-SHA tags only. The release manifest records the resulting immutable
digests and BuildKit SBOM/provenance attestations. A production deployment is
an explicit, manually approved checkpoint; host credentials and deployment
targets remain outside the repository.

- An unmerged feature is rolled back by closing its PR; pushed history is preserved.
- A change already merged into `development` is rolled back with a revert PR.
- A released production fix uses `hotfix/*`, followed by separate reviewed PRs into `main` and `development`.
- Never reset or force-push shared branches to roll back a change.
