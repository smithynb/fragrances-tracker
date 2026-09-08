# PR #86 Tombstone Cleanup Rollback Runbook

- **Runbook version:** 1.1
- **Compatibility floor:** the bounded tombstone cleanup contract introduced by PR #85/#86
- **Status:** reviewable instructions; no production action is performed by this file or by the repair

This runbook covers rollback of the frontend or backend after the tombstone-based bottle deletion
code has been deployed. A tombstone hides a bottle immediately while `wearLogs` are removed in
bounded background batches. Do not treat a hidden bottle as proof that its data is gone.

## Compatibility contract to preserve

While any tombstone or scheduled cleanup exists, keep all of these names and meanings unchanged:

| Surface                           | Required compatibility                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bottles.deletingAt`              | Tombstone and deletion nonce. A cleanup job may act only when this value still matches its expected nonce.                                 |
| `bottles.cleanupJobId`            | Current scheduled batch job reference. Keep it until the cleanup generation is drained or deliberately repaired.                           |
| `bottles.cleanupStatus`           | Optional `pending`/`failed` operator state. `failed` is recoverable; it is not permission to delete rows manually.                         |
| `bottles.cleanupAttempts`         | Optional bounded-attempt counter. The current cap is four cleanup generations.                                                             |
| `bottles.cleanupNextRetryAt`      | Optional next watchdog deadline; retain it for operator inspection.                                                                        |
| `bottles.cleanupLastError`        | Optional operator-visible terminal reason. Do not overwrite it with an unreviewed guess.                                                   |
| `bottles.by_user_and_deleting_at` | Index used to hide tombstoned bottles from user reads.                                                                                     |
| `bottles.by_user_and_cleanup_status` | Index used to list failed tombstones for the owning user's recovery panel.                                                               |
| `wearLogs.by_bottle`              | Index used for each bounded child-removal batch.                                                                                           |
| `bottles.deleteBottleBatch`       | Internal owner/nonce-guarded batch path; it removes at most 50 child logs per invocation and deletes the parent last.                      |
| `bottles.watchBottleDeletion`     | Internal owner/nonce-guarded bounded watchdog path; it uses 5m/15m/30m/60m deadlines and then records `failed` without scheduling forever. |

Do not remove, rename, make required, or repurpose any listed field, index, or internal path until
the preconditions below are satisfied. Optional fields are intentional: old bottle documents may
not have them yet.

## Forward release sequence

This is an operator checklist, not a deployment script. The read-only checks below may be run
without changing provider state. Commands marked **authority required** deploy code, change
production data, or exercise real user accounts. Do not run those commands from this runbook
without an approved release window, the correct production credentials, and a recoverable
snapshot.

### 1. Confirm the production target, read-only

From the repository root, select a committed release candidate. A clean source tree is a hard
precondition. If `git status --porcelain=v1` prints anything, stop. Do not call the current `HEAD`
a release SHA while tracked or untracked changes exist. The reviewed SHA itself must contain the
deletion contract, not merely a dirty checkout layered on top of it:

```bash
set -eu
git status --short --branch
test -z "$(git status --porcelain=v1 --untracked-files=all)"
CANDIDATE_SHA="$(git rev-parse --verify HEAD)"
git show --no-patch --format='%H %s' "$CANDIDATE_SHA"
for required_token in \
  'my-app/convex/schema.ts|deletingAt' \
  'my-app/convex/schema.ts|cleanupJobId' \
  'my-app/convex/schema.ts|cleanupStatus' \
  'my-app/convex/schema.ts|cleanupAttempts' \
  'my-app/convex/schema.ts|cleanupNextRetryAt' \
  'my-app/convex/schema.ts|cleanupLastError' \
  'my-app/convex/schema.ts|by_user_and_deleting_at' \
  'my-app/convex/schema.ts|by_user_and_cleanup_status' \
  'my-app/convex/schema.ts|by_bottle' \
  'my-app/convex/bottles.ts|deleteBottleBatch' \
  'my-app/convex/bottles.ts|watchBottleDeletion'
do
  required_path="${required_token%%|*}"
  required_text="${required_token#*|}"
  if ! git grep -q -F -e "$required_text" "$CANDIDATE_SHA" -- "$required_path"; then
    printf 'STOP: missing %s in %s at %s\n' "$required_text" "$required_path" "$CANDIDATE_SHA" >&2
    exit 1
  fi
done
for required_path in \
  my-app/src/components/failed-bottle-deletions.tsx \
  my-app/src/components/bottle-collection.tsx
do
  if ! git cat-file -e "$CANDIDATE_SHA:$required_path"; then
    printf 'STOP: missing frontend recovery path %s at %s\n' "$required_path" "$CANDIDATE_SHA" >&2
    exit 1
  fi
done
for required_component in \
  'my-app/src/components/failed-bottle-deletions.tsx|FailedBottleDeletions' \
  'my-app/src/components/bottle-collection.tsx|FailedBottleDeletions'
do
  required_path="${required_component%%|*}"
  required_text="${required_component#*|}"
  if ! git grep -q -F -e "$required_text" "$CANDIDATE_SHA" -- "$required_path"; then
    printf 'STOP: missing frontend recovery component %s in %s at %s\n' \
      "$required_text" "$required_path" "$CANDIDATE_SHA" >&2
    exit 1
  fi
done
vercel project inspect --cwd /home/code/fragrances-tracker --non-interactive --no-color
vercel env ls production --cwd /home/code/fragrances-tracker --non-interactive --no-color
```

Every command above must succeed and the status check must be empty. If the candidate is dirty,
uncommitted, or missing any contract match, the release gate is **no-go**. Commit the intended
scope, record that SHA, and rerun the full verification at that exact SHA before continuing.

The linked Vercel project must have `my-app` as its root directory. `NEXT_PUBLIC_CONVEX_URL` may
be shown as encrypted metadata; do not use a local development value as proof of the production
target.

Use the authenticated Convex CLI to inspect the project default production deployment. This is
read-only and must not be replaced with `convex dev`:

```bash
cd /home/code/fragrances-tracker/my-app
bun --env-file=.env.local ./node_modules/.bin/convex function-spec --prod \
  > /tmp/pr86-production-function-spec.json
jq -e '.url and (.functions | any(.identifier == "bottles.js:deleteBottle"))' \
  /tmp/pr86-production-function-spec.json
```

Record only the deployment URL, the presence of the expected public functions, and the command
status. Do not paste the full function spec or environment file into a ticket. At the 2026-09-07
readiness check, `--prod` resolved to `https://fantastic-quail-352.convex.cloud`. The current
metadata contained `bottles.js:deleteBottle` but not `bottles.js:deleteBottleBatch` or
`bottles.js:watchBottleDeletion`, which is a stop condition until the additive backend deploy is
complete. Some CLI versions omit internal functions from `function-spec`; after deployment also
verify the two internal names in the Convex deployment/function view.

If the Convex URL, Vercel project, or release commit is not the approved target, stop. Do not
guess from a development deployment name, and do not fetch secrets to make the target look
confirmed.

### 2. Run the local, docs-only gates

These commands do not deploy or mutate provider data. They are release evidence only when run at
the clean, committed candidate SHA from step 1. Results from a dirty worktree must be labelled
dirty-worktree evidence and cannot identify the release SHA:

```bash
cd /home/code/fragrances-tracker/my-app
bun install --frozen-lockfile
bun run test:run
bun run typecheck
bun run lint
bun run format:check
bun audit --json
NEXT_PUBLIC_CONVEX_URL=https://ci-placeholder.convex.cloud bun run build
cd /home/code/fragrances-tracker
git diff --check
git diff origin/main...HEAD --check
```

Do not treat `convex codegen --dry-run --typecheck enable` as a deployment-free gate for this
release. An earlier run left generated files unchanged but printed `Downloading current deployment
state...` and `Uploading functions to Convex...`; its remote effect and target cannot be proven
from local output. Use the explicit backend deployment step below when authority is available,
and record its deployment result.

### 3. Deploy Convex first, additive only (authority required)

After the target and local gates pass, deploy the schema, indexes, and functions to the confirmed
production deployment from an approved CI or operator secret context. Keep the deploy key out of
shell history and logs:

```bash
cd /home/code/fragrances-tracker/my-app
bunx convex deploy --typecheck enable --codegen enable \
  --message "PR #86 tombstone cleanup release"
```

The command must run with the approved production `CONVEX_DEPLOY_KEY` supplied by the secret
manager, or with the provider's equivalent authenticated production context. Do not substitute
the local development deployment. This deployment is additive: optional tombstone fields,
`by_user_and_deleting_at`, `by_user_and_cleanup_status`, and the cleanup functions must be
available before the frontend is promoted. Stop on any schema, index, typecheck, or function
bundle error.

### 4. Wait for readiness and recheck the backend (read-only after deploy)

Wait for the Convex deployment command and dashboard to report completion. If an index backfill or
schema update is shown, wait until it reports ready. Then repeat the target check and verify the
public and internal function names in the deployment view:

```bash
cd /home/code/fragrances-tracker/my-app
bun --env-file=.env.local ./node_modules/.bin/convex function-spec --prod \
  > /tmp/pr86-production-function-spec-after-deploy.json
```

Confirm the production dashboard/function view contains `bottles.deleteBottleBatch` and
`bottles.watchBottleDeletion`, and that the schema/index view contains the tombstone fields and
the indexes named in the compatibility table. Record the deployment ID, completion time, and any
index-readiness message. Do not continue to the frontend if a new function or index is missing.

### 5. Deploy the frontend second (authority required)

Only after the backend checks pass, promote the linked Vercel project. The linked project has
`my-app` as its configured root directory:

```bash
vercel deploy --prod --cwd /home/code/fragrances-tracker --yes
```

Record the Vercel deployment ID and URL. Confirm the production build uses the same Convex URL
recorded in step 1. If the frontend deploy finishes before the backend is ready, do not expose it
to users. Return to the current frontend or use the frontend-first rollback order below while the
new Convex deployment remains in place.

### 6. Run mandatory post-promotion launch verification (authority required)

Run this step only after the Vercel production promotion in step 5. It is mandatory launch
verification and monitoring, not a pre-promotion no-go gate. Use disposable Google accounts and a
production-equivalent deployment. Do not use personal accounts or real user data. The normal
multi-batch path must exercise the promoted production frontend. Exercise the controlled
failure/retry path in an approved isolated production-equivalent deployment as part of the same
launch verification window.

1. Sign in as user A and user B. Create one control bottle for B and one target bottle for A.
   Add at least 101 wear logs to A's target so cleanup requires more than two 50-row batches.
2. As A, request deletion. Immediately verify that A's bottle list, bottle detail, wear-log list,
   per-bottle logs, and statistics hide the target. The target must not reappear while its tombstone
   exists.
3. In the Convex scheduled-function/data view, observe the first and successor cleanup jobs. Each
   batch may remove at most 50 logs. Wait for eventual completion, then verify the target parent and
   all 101 child logs are gone, no cleanup job is failed, and B's control bottle and logs are
   unchanged.
4. In the isolated test deployment, cancel or fail a batch after a watchdog has observed active
   work. Verify that the tombstone stays hidden, reaches the bounded `failed` state rather than
   retrying forever, and exposes only A's bottle name and retry control. As A, use **Retry deletion**
   and verify a new deletion nonce starts cleanup. Confirm stale jobs from the old nonce do nothing
   and the retried cleanup eventually removes the parent and all children.
5. As B, verify A's target, failed-deletion projection, retry action, and logs are inaccessible.
   As A, verify B's control bottle and logs remain inaccessible. Record only pass/fail, counts,
   deployment IDs, and timestamps, not account tokens or user content.

If OAuth completion, multi-batch completion, retry recovery, or cross-user isolation cannot be
verified after promotion, do not declare the release complete. Open an incident, freeze further
rollout, and invoke the compatible rollback and recovery actions below. Fixture tests, mocked Convex
hooks, a placeholder build URL, and a successful sign-in redirect do not clear this launch check.

### 7. If a forward gate or post-promotion smoke fails

For a failure in steps 1–5, stop before promoting the frontend. For a failure in the post-promotion
launch verification, open the incident and use the documented compatible rollback action. Keep the
new Convex backend and its cleanup handlers serving while active tombstones drain. Do not remove the
new fields, indexes, or internal functions to make an older frontend work. If the frontend has
already been promoted, use the frontend-first rollback below. Only after all cleanup preconditions
are zero may an approved backend rollback begin.

## Preconditions (all required before backend rollback)

1. Obtain an approved rollback window and identify the exact frontend commit, backend commit,
   Convex deployment, and schema version being rolled back. This document does not authorize a
   deployment, data mutation, job cancellation, or production command.
2. **No-go until an approved backup/restore procedure exists.** No approved backend backup/restore
   procedure is documented in this repository. The platform owner must supply and approve the
   recoverable Convex snapshot and restoration procedure before backend rollback can begin. Record
   its owner, version, snapshot timestamp, deployment, and restoration evidence. A dashboard
   read-only check or a per-table export is not a substitute and may change document IDs or break
   ownership references.
3. In the Convex dashboard's read-only data view, inspect `bottles` and confirm all of the
   following are zero, or stop:
   - documents with `deletingAt` present;
   - documents with `cleanupStatus = "failed"`;
   - documents with `cleanupJobId` present.
4. In the Convex scheduled-functions view, filter for `bottles.deleteBottleBatch` and
   `bottles.watchBottleDeletion`. Confirm there are no rows in any state that the deployment
   retains (pending, in-progress, failed, canceled, or completed). If the dashboard retains
   terminal history, keep the compatibility contract above until the retention entries are gone
   or the platform owner explicitly confirms that those entries cannot execute or reference the
   old paths.
5. Confirm no approved incident repair is in progress and record the operator who performed the
   read-only checks. A nonzero count is a stop condition, not a reason to force the rollback.

## Safe drain and recovery actions

Keep the current backend and schema deployed while draining. Let pending or in-progress batches
finish. For a `failed` tombstone, the signed-in owner's collection shows a **Deletion needs
attention** recovery panel containing only the failed bottle name and a **Retry deletion** button.
That button requests the existing authenticated `deleteBottle` mutation. The mutation rate-limits
the request, checks ownership, starts a new deletion nonce, and causes stale jobs from the
previous generation to no-op. Verify the new generation by its fields; do not edit the nonce in
the dashboard.

If the owner retry reaches the cap again, or the owner is unavailable, pause the rollback and open
an approved data-repair procedure. That procedure must name the bottle ID, owner ID, deletion nonce,
remaining child-log count, and recovery action before changing data. Never directly delete the
parent before its child logs, never delete another user's logs, and never cancel an active cleanup
job as a shortcut.

## Rollback order

1. Keep the bounded-cleanup backend and schema serving while the rollback is assessed.
2. Roll back the frontend first, to a build verified not to call backend functions removed by the
   target version. An older frontend may ignore the optional cleanup metadata; it must not expose
   tombstoned bottles as active data.
3. Drain and repair cleanup generations using the safe actions above. Re-run every read-only
   precondition check.
4. Only after all checks are zero may the backend implementation be rolled back. During this
   rollback, leave the optional tombstone fields, all compatibility indexes, and the internal cleanup paths in
   place even if the old code no longer writes them. Removing compatibility surfaces is a separate,
   reviewed migration after the retention/terminal-job condition is independently verified.
5. After the rollback, verify the frontend build, authenticated bottle reads, and scheduled
   function view. Record the deployment and snapshot IDs in the change record.

If any precondition becomes nonzero between checks and deployment, stop and return to the current
backend. Do not use `git reset`, force-deploy an old schema, or issue an unreviewed production
mutation as part of this runbook.
