# Branch migration and GitHub governance record

## Local baseline

The governance work started from `fix/nest-dynamic-config-error` at
`cc38a494bc99b8717619c80618b53650c7b310ba`, whose parent is the Phase 7 tip.
The branch history is linear from `development` through Phase 2, Phase 4,
Phase 5, Phase 6, Phase 7, and the current fix. The resulting governance
commit is the candidate tip for the one-time `development` bootstrap.

## Archive map

Before deleting completed branches, create immutable tags at these tips:

| Branch | Tip | Archive tag |
| --- | --- | --- |
| `codex/phase-01-continuation` | `9fc43a0` | `archive/codex-phase-01` |
| `feature/phase-02-identity-organization-authorization` | `d3b99e9` | `archive/phase-02` |
| `feature/phase-04-market-search-interaction` | `f60def6` | `archive/phase-04` |
| `feature/phase-05-ai-demand-innovation` | `4a6e9e4` | `archive/phase-05` |
| `feature/phase-06-analytics-dashboard-export-assistant` | `e8255b3` | `archive/phase-06` |
| `feature/phase-07-production-security-deployment-operations` | `c31b1f5` | `archive/phase-07` |
| `fix/nest-dynamic-config-error` | governance candidate tip | `archive/pre-development-bootstrap` |

Do not force-update an existing ref. If `development` exists remotely before
the bootstrap, stop and reconcile it with the repository owner. If it is still
absent, create it once at the verified governance candidate tip, then enable
branch protection before normal feature work resumes.

## Required GitHub settings

Apply the same rules to `main` and `development`:

- Pull request required.
- One approving review from a non-author.
- Required checks: `verify`, `container-smoke`.
- Branch must be up to date before merge.
- All review conversations resolved.
- Squash merge only.
- Direct pushes, force-pushes, and branch deletion blocked.
- Emergency bypass limited to documented administrator hotfixes.

As of this record, the connected GitHub integration is read-only and no PRs
were returned. Remote tags, branch creation/deletion, PR creation, and branch
protection remain pending repository owner/maintain permission.
