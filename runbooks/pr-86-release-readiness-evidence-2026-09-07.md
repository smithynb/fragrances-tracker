# PR #86 release-readiness evidence

Date: 2026-09-07
Branch: `agent/backend-audit-integration`
HEAD: `abf65d83f84e63385235cae881137a27c6ca2e33`

## Gate

The current dirty-worktree code gate passes, but no release-SHA code gate has been established. The
release gate is **BLOCKED / NO-GO**. PR #86 is still draft, GitHub reports `MERGEABLE` and `CLEAN`,
and the `status: needs-work` label remains. No ready-for-review, merge, deploy, or provider
mutation was performed.

The platform owner must also supply and approve a recoverable Convex backup/restore procedure before
backend rollback can begin. No approved backend backup/restore procedure is documented in this
repository. The compatible frontend-first rollback sequence remains useful, but it cannot authorize
backend rollback without that procedure.

The current blocker is now independently confirmed. The read-only command
`bun --env-file=.env.local ./node_modules/.bin/convex function-spec --prod` resolved the project
default production deployment to `https://fantastic-quail-352.convex.cloud`. Its redacted summary
was `functions=23`, `bottles.js:deleteBottle=true`, `bottles.js:deleteBottleBatch=false`, and
`bottles.js:watchBottleDeletion=false`. Vercel read-only inspection found the linked
`fragrances-tracker` project with root directory `my-app` and an encrypted production
`NEXT_PUBLIC_CONVEX_URL` variable. No secret or user data was printed. The new Convex backend must
deploy and become ready before the frontend can be promoted. Because some Convex CLI versions omit
internal functions from `function-spec`, the false entries are a metadata gap to resolve in the
deployment/function view, not a claim based on an unscoped data query. Vercel's encrypted value was
not read, so matching that runtime variable to the Convex URL remains an authorized release check.

## Current dirty-worktree verification

The fresh Luna verification on this exact, dirty worktree reported:

- `bun install --frozen-lockfile`: passed with Bun 1.3.10, 641 installs / 744 packages checked,
  with no changes.
- `bun run test:run`: passed, 19 files and 178 tests.
- `bun run typecheck`, `bun run lint`, and `bun run format:check`: passed.
- `bun audit --json`: passed with `{}`.
- `NEXT_PUBLIC_CONVEX_URL=https://ci-placeholder.convex.cloud bun run build`: passed; Next 16.3.0
  built `/`, `/_not-found`, and `/signin`.
- `git diff --check` and `git diff origin/main...HEAD --check`: passed.

These are local or fixture-backed checks. Convex backend tests use `convex-test`, UI tests mock
Convex hooks, and the build uses a placeholder URL. No authenticated Google OAuth plus 101-log
live deletion smoke was run. No live batch/retry/isolation evidence exists. The production
`function-spec` query above proves provider metadata access and target identity, not schema/index
readiness or end-to-end behavior. Because the worktree was dirty and uncommitted, these 19-file /
178-test results are not suitable to identify a release SHA. After the intended changes are
committed, rerun the full gates at that exact SHA with a clean tree.

## Review and repair history

The fresh independent `gpt-5.6-terra` adversarial review found no material code defect. It judged
the owner and tombstone nonce guards, 50-row batching, bounded watchdog/retry behavior, stale-job
handling, and failed-deletion recovery UI sound. It still called out the two release blockers:
CI has no Convex deploy/schema/index gate, and no live production-equivalent OAuth plus multi-batch
deletion smoke exists. It also rejected the earlier codegen dry-run as deployment-free evidence.

Exactly three repair cycles completed. No fourth cycle was performed:

1. Added rollback compatibility guidance and bounded watchdog failure/backoff with owner recovery.
2. Preserved watchdog coverage across active and successor batches, including the real scheduled
   failure sequence in regression coverage.
3. Added the owner-visible failed-deletion projection/retry path and the final bounded active-job
   observation, with isolation and data-minimization coverage.

Earlier `bunx convex codegen --dry-run --typecheck enable` output left generated files unchanged
but included `Downloading current deployment state...` and `Uploading functions to Convex...`.
The CLI help says dry-run does not modify deployed code, but the output does not prove its remote
effect or target. This uncertainty is recorded, not treated as a release gate or deployment
record. The documentation pass did not rerun that command.

## Worktree boundary

The phrase "no tracked/untracked user files changed" in the prior resume verification means that
the verification worker did not edit those paths. It does **not** mean this checkout is clean.
Known pre-existing changes remain:

- tracked modifications: `my-app/bun.lock`, `my-app/convex/bottles.test.ts`,
  `my-app/convex/bottles.ts`, `my-app/convex/schema.ts`, `my-app/convex/validators.ts`,
  `my-app/package.json`, and `my-app/src/components/bottle-collection.tsx`;
- untracked user paths: `.antigravitycli/`, `.vercel/`, `CLAUDE.md`, `docs/`,
  `my-app/src/components/failed-bottle-deletions.test.tsx`, and
  `my-app/src/components/failed-bottle-deletions.tsx`;
- the `runbooks/` directory was already untracked and contained the rollback runbook before this
  documentation pass.

This pass changed only documentation under `runbooks/`: the existing rollback runbook and this
evidence report. It did not edit, stage, commit, push, deploy, merge, delete, or change any
product, test, dependency, CI, protected `docs/`, `.antigravitycli/`, `.vercel/`, or `CLAUDE.md`
path.
