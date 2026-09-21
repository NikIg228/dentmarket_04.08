# CONSOLIDATION-2026-09-21 — one canonical Market checkout

Owner: Оркестратор / 01a02859-08f3-7082-920d-49400f0fbb09.
State: local consolidation/retirement accepted; main publication candidate verified.
Authorized: preserve primary and adapt missing parts of 04bd37c security package;
no new product features, integrations or production operations.
Canonical root: `C:\Users\user\Desktop\dentmarket-kz-main`.
Starting branch: `codex/frontend-pilot-composition`; HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`.
Primary WIP: 82 modified +246 untracked files, preserved in verified snapshots.
Backup: `C:\Users\user\Documents\Codex\project-backups\consolidation-20260921T062521Z`.
Git history bundles verified; source archives individually hash/CRC verified.
Ignored working environments/databases unchanged; not a runtime-data backup.

Execution record/provenance:
`C:\Users\user\Documents\Codex\2026-08-22\zeny-main-dentmarket-kz\CONSOLIDATION_PROGRESS.md`.

Implemented: single-root/one-writer instructions; adapted missing document-reference
validation on write and read, including archived records and commerce projections.
Preserved current participants/agreements/refunds and prepayment-document reuse.
One independent security review found5 concrete issues, reproduced by8 failing
tests, then corrected in the same boundary. Focused52 PASS. Full npm test PASS:
14Turbo tasks,10cached; API318,buyer71,supplier43. Earlier PDF timeout passed in
isolation and final full run without changing timeout/assertions. Typecheck15 tasks
PASS, final API typecheck PASS after review changes. API/schemas build PASS.
PostgreSQL gate PASS on existing dentmarket_audit_20260914, never working DB:
tenant isolation, rollback, concurrent idempotency/stock/cart race. First attempt
blocked by Windows Prisma DLL held by the preflight process; corrected test wrapper
to exit probe before generation; second attempt PASS. No new DB/roles/extensions.
Real JWT/API document regression23 cases PASS; legitimate create/version and
cross-tenant/legacy denial, embedded-document and linked-version non-disclosure.
Owned API stopped; synthetic sessions revoked/mail removed; test rows/files retained
only in audit DB for readback. No live payments, signatures or external messages.
Evidence: outputs/consolidation-20260921/{tests-final.log,typecheck.log,
review-typecheck-final.log,review-regression.log,postgres-live.log,document-graph-live.json}.
Source preservation: all10trees checked; no missing originals/unexpected changes,
all8donors unchanged. Report/hash evidence in orchestrator workspace:
CONSOLIDATION_RESULT_2026-09-21.md and consolidation_preservation_final.json.
Owner follow-up 2026-09-21 authorizes donor retirement and standing verified
commit/push. Fresh source/backup verification and supplemental private local-file
backup precede removal. origin/main is 8646bf6, an ancestor of local HEAD;
74 local commits ahead, zero remote-only. Current branch has no upstream.
Owner explicitly confirmed origin/main for this and future completed tasks.
The Market donor and all seven CRM donors are removed through Git after backup
checks. Only canonical roots remain. No application source changed during cleanup.
This is not production certification.
Publication preflight: owner chose main; normal push dry-run passed; main has
no branch-protection gate. Inspected CI/security on push; image release requires
tag/manual, database/DAST require manual actions (not run). Source and976 outgoing
historical blobs passed bounded credential-pattern review, with only template
placeholder PEM headers (11-byte placeholder, not a key). Not a full security scan.
Additional local gates PASS: full npm run build (10 tasks,366.42s), production
configuration, readiness contract, rate-limit/error-envelope tests and auth
contract. Logs: outputs/consolidation-20260921/publication-*.log. Exact results:
orchestrator market_publication_gates.json. Existing typecheck/full tests/PG
regressions reused for hash-identical source inputs. Next build's four generated
next-env.d.ts import rewrites restored to the original tested dev declarations.
No application source or working data changed in retirement/publication work.
This pre-commit checkpoint does not assert a push/CI result in advance. Final
commit/remote SHA/CI readback is recorded after publication in orchestrator
WORKTREE_RETIREMENT_2026-09-21.md; verify actual branch/upstream when resuming.
Gate budget: command20min, suite45min, max3 attempts per blocker.
Delivery gate: reviewed commits, local main fast-forward, normal origin/main
push, remote SHA readback and actual CI status. No new feature work authorized.
