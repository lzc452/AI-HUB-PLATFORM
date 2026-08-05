## Scope

- Phase or release:
- Task IDs:
- Summary:
- Target branch: `development` / `main`
- Release tag or image digest, when applicable:

## Change Evidence

- Changed modules/files:
- Database migration involved: `yes` / `no`
- External credentials, deployment, or compatibility risk: `none` / describe below
- Rollback procedure:
- `.codex/` or CI/CD configuration changed: `yes` / `no`

## Verification

- [ ] Targeted tests passed
- [ ] `git diff --check` passed
- [ ] `pnpm verify` passed
- [ ] Docker Compose smoke passed
- [ ] `corepack pnpm governance:check` passed when repository tooling changed
- [ ] Documentation and dashboard evidence updated where required

## Review and Merge

- [ ] All review conversations are resolved
- [ ] Branch is up to date with the target branch
- [ ] This PR is ready to squash merge
