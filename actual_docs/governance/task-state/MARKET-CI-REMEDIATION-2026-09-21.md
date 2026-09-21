# MARKET-CI-REMEDIATION-2026-09-21

Updated: 2026-09-21 (Asia/Qyzylorda). Status: active.
Owner/writer: orchestrator task 01a02859-08f3-7082-920d-49400f0fbb09.
Authority: user approved fixing the three reported Market CI blockers, then
verified normal publication to main. CRM is excluded.

## Scope and contract

- Canonical checkout only: `C:\Users\user\Desktop\dentmarket-kz-main`.
  Baseline main/origin/main: `f9c19dfae6664f9986954b097e9e5ff0568d5533`;
  clean before edits; no other active Market writer in app snapshot.
- Dependency advisory remediation: Next/sharp/multer, compatible versions only;
  do not run audit fix --force or migrate Nest to another major.
- Outbound verification: reconcile the inventory with the extracted auth-mail
  helper after independently checking actual security/compatibility boundaries.
- PostgreSQL gate: owned synthetic supplier/agreement/catalog fixtures instead
  of depending on pre-existing pilot data. Never remove the agreement gate.
- No product features, public API/schema migrations, CRM edits, new worktrees,
  deployments, database privilege changes, working/demo DB seeding or resets.
- Given fresh test DB/reference seeds, verification creates its own valid
  agreement/catalog, checks the existing transaction/tenant/concurrency rules,
  and removes owned fixtures. Existing supplier data is not reused or changed.
- Provider auth mail preserves operator-configured destinations, rejection of
  redirects, timeout, redacted errors and private local-file mode. Tenant-supplied
  outbound destinations retain the central gateway enforcement.

## Evidence and execution plan

Baseline failed CI: [CI 35577008296](https://github.com/NikIg228/dentmarket_04.08/actions/runs/35577008296),
[Security 35577008257](https://github.com/NikIg228/dentmarket_04.08/actions/runs/35577008257).
Three reproduced remote failures: production dependency audit (7 high/1 critical
dependency findings), stale auth-sessions URL inventory, absent seeded active
marketplace agreement. These are baseline attempt 1, not passes.

Required gates on final relevant inputs: focused transport/auth/upload and
fixture regressions; production npm audit; outbound security; verify:postgres;
root typecheck/test/build; production-config/readiness/rate-limit-auth (release
equivalent); security-storage and applicable CI jobs after push; diff review.
No previous lockfile-dependent pass reused after dependency updates.

Test DB: only existing `dentmarket_audit_20260914` at loopback:5432 locally;
CI uses its ephemeral service DB. No credentials in evidence. Own API process
and run-prefixed fixtures only; no real provider deliveries. Budgets: command
20 min, suite45 min, probe2 min, diagnosis15 min per blocker; max3 attempts
(baseline plus2 with changed hypothesis/input). Stop on unexpected concurrent
writes, unsafe DB target, failed required gate or exhausted attempts.

Skills: fix-finding (fresh read-only investigation and one candidate review),
Agency Git Workflow Master (scoped conventional commits; project main/one-folder
rules override generic branch/worktree examples).

## Current implementation and evidence

- Next is pinned uniformly to16.3.3 in root and all4web apps; sharp0.35.4;
  multer2.3.0 is a scoped vulnerable-range override. Nest stays11. No audit-force.
  Only this dependency family and required transitive artifacts changed.
- Mail investigation: ADR007 applies the gateway to tenant destinations;
  ADR008 permits operator-configured providers and test loopbackHTTP. The
  transport was not vulnerable by the asserted inventory invariant and is
  unchanged. Inventory now tracks auth-mail plus both link-building callers;
  no policy keys or gateway assertions removed.
- PostgreSQL now creates an owned supplier/warehouse/synthetic agreement from
  reference seeds; metadata explicitly says notLegallyBinding. Adds an actual
  HTTP403 check for unsigned agreement before existing successful commerce
  flows; cleanup deletes owned agreement/document/supplier and asserts no residue.
- Fresh focused checks: outbound security PASS; auth/local-mail/resume/upload
  49/49 PASS; `npm audit --omit=dev --audit-level=high` PASS,0vulnerabilities.
  Evidence: ignored `outputs/ci-remediation-20260921/*-results.json` and logs.
- Toolchain: Node24.18.0/npm12.0.1 locally; CI uses its configured Node24/npm.
- Local PostgreSQL PASS179.773s, including new unsigned-agreement403, tenant,
  rollback, idempotency, scarce-stock/cart races and owned-fixture cleanup.
  Root typecheck PASS73.212s. First root test run: FAIL,317/318API tests passed;
  PDF text-extraction test exceeded its unchanged5s timeout during parallel
  PostgreSQL verification. Same timeout was observed before these changes.
  One unchanged retry after the other suite exits tests the resource-contention
  hypothesis; no assertion/time limit changed. Full build/remaining gates pending.
  Source runtime not deployed. Commit/push/remote CI: pending.

Upstream remediation references (checked2026-09-21):
[Next Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36),
[Next AVIF](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4),
[sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
[multer async filter](https://github.com/advisories/GHSA-qvfw-j98x-7q72).
The dependency audit is a vulnerable-version check, not an application exploit
proof. Fresh schema from zero is verified by the CI service DB, not claimed from
an existing local audit DB.

Root test retry PASS14/14tasks (318/318API;13unchanged task caches);16.253s.
Supplemental dependency smoke PASS: native PNG/JPEG processing, legitimate
multipart file and async-filter oversized-file rejection. Harness first failed
on sharp's private package.json export; corrected to public sharp.versions,
then passed. Not an application RCE exploit simulation.

Independent candidate review found one confirmed cleanup defect: catalog IDs
were tracked after a full loop iteration, so a mid-iteration failure could
leave an offer that blocks product/new supplier cleanup. Fixed by recording
each successful create immediately. No source-backed additional issue found.
No second review cycle. Final fixture verification must cover this final diff.

## Final local verification (2026-09-21)

| Gate | Result / evidence |
| --- | --- |
| Dependency audit | PASS,0vulnerabilities (`audit.log`) |
| Outbound gateway/inventory | PASS25tests +inventory (`outbound-security.log`) |
| Auth/local mail/resume/upload | PASS49tests (`auth-upload.log`) |
| Root typecheck | PASS15tasks,73.212s (`typecheck.log`) |
| Root tests | PASS14tasks,API318tests on one retry; first PDF timeout retained |
| Root production build | PASS10tasks including4Next16.3.3web builds,285.263s |
| Production config/readiness | PASS7.203s/0.329s |
| Rate-limit and auth contract | PASS9tests/contract;13.312s/1.529s |
| Security storage script | PASS config-only; DB audit explicitly skipped without URL |
| Final PostgreSQL | PASS38.324s, real HTTP/database checks and cleanup |
| Partial-setup fault injection | PASS18.214s, throws on first lot after offer/balance creation; all owned suppliers/agreements removed |
| Candidate review | One confirmed cleanup defect fixed; one independent review cycle |
| Diff/lockfile review | PASS; only approved dependency family and test/inventory/docs changes |

All logs/results: `outputs/ci-remediation-20260921/` (ignored, local).
The fault harness first attempted removed Prisma$use before any fixture writes;
corrected to installed Prisma$extends, then PASS. Real final verifier did not
need a product-code change. Final direct PostgreSQL script reused the identical
schemas/API artifacts built by the full npm alias; its prerequisites were not
skipped. Normal and injected-failure fixtures were cleaned up. No owned server
remains. Next build's generated next-env changes restored to original content.

Release-equivalent npm alias components all passed separately on the same
runtime inputs; security-storage does not certify working/production DB contents.
No deployments, external integrations or full production acceptance claimed.
Attempts retained: original CI baseline1; patched audit/outbound2PASS;
PostgreSQL2PASS then final cleanup-adjusted3PASS; root tests1timeout/2PASS.

State: locally verified; commit/push and fresh GitHub CI pending.
Next: scoped conventional commit, normal fast-forward publication, CI readback.

## Follow-up: Docker backup stdin (approved 2026-09-21)

Previous changes published as279cc826faf22338b74cacc046faae87978c3ac1;
GitHub confirmed audit, outbound and PostgreSQL gates. Subsequent backup/restore
failed: `pg_restore --list` reads0bytes although pg_dump's nonempty-file check
passed. Docker command omits --interactive while the host supplies a file on fd0.
Source: CI35580074851/job106270658249; backup-restore-runbook §2–4.

User now explicitly authorizes this bounded repair and CI verification.
Owner: same orchestrator; clean main/origin/main279cc82, sole Market writer.
Scope: backup verifier's process invocation, pure helper and regression tests,
its npm alias, runbook and this checkpoint. No runtime/product/CRM/dependency
updates; no working DB access, local restore/CREATEDB, new worktrees or deployment.
Given Docker plus stdinFile, keep stdin open without allocating a TTY; both
archive-list and restore receive binary bytes. Native mode and no-input commands
retain their existing arguments. Ownership/source-target/checksum/cleanup guards
remain unchanged.

DoD: regression fails on old invocation and passes after fix; node --check;
production-config/diff checks; normal commit/push/main SHA readback; actual
backup/restore gate on the existing ephemeral GitHub PostgreSQL job. Docker is
not installed locally, so pure command-contract tests are not called a live drill.
Unchanged application tests/build evidence remains reusable per Workflow4.2;
CI still runs its full configured matrix. Max3 attempts: remote baseline1;
patched CI2 planned. Probe2min, local tests2min, CI45min, diagnosis15min.
Stop on new unrelated failures or exhausted budget; do not weaken a gate.

Separate pre-existing blocker, outside this approval: prior main verify job
106270657931 reached verify:search-commerce and failed404 `Buyer organization
not found` for its configured fixture. No fix attempted; overall CI cannot be
called green merely because backup/restore passes. Next: isolated regression.
Practice: Agency Git Workflow Master; no subagents needed for this small fix.

Local results for backup follow-up:
- Old command regression: expected FAIL2/7 (list/restore stdin), unchanged
  native/no-input/image/argument controls PASS5/7.
- Fixed pure invocation adds --interactive only for stdinFile, never a TTY.
  Regression PASS7/7; all3changed/new JS files `node --check` PASS;
  `node scripts/verify-production-config.mjs` PASS; `git diff --check` PASS.
- Both real pg_restore call sites use the same tested helper. fd0/fd1 opening,
  binary buffering, error handling, target ownership and cleanup are unchanged.
- No TS, application, lockfile or runtime environment inputs changed. Prior
  local typecheck/test/build retained as REUSED_PASS, not fresh reruns. npm alias
  now runs the new focused tests before its unchanged build/drill prerequisites.
- Full Docker restore pending in CI; no local DB connected or altered.
  Publication/CI evidence will be recorded in ignored outputs and orchestrator
  report after commit, avoiding a self-referential evidence-only CI loop.
