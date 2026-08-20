# B4.5-R2E — current security regression

Status: `BLOCKED` (the scan completed with reportable residual findings).

- Target revision: `ad66e3954f3af6ccf57beb7b3292be6f04a1c365` (`ad66e39`).
- Codex Security scan: `797606a1-946e-4c7c-ae43-22b304b4fc0f`.
- Mode: standard repository scan, complete coverage (`1053` tracked files; `6/6` review surfaces closed).
- Result: `5` reportable findings — `2 High`, `3 Medium`.
- TAC advisory: not granted; the result is based on the complete local review and recorded scan artifacts.

## Requested remediation controls

- [x] AI tools have an explicit operation-to-permission map, platform-operator restrictions, and regression tests.
- [x] Integration, payment, and signature webhooks require a verified raw body/HMAC before persistence; route throttling and a `1 MiB` body limit are enforced.
- [x] CSV parsing enforces a parser-level `5,000` row limit, record-size limit, and `100`-column limit; XLSX and shared import schemas enforce the same column/field bounds.
- [x] Runtime error responses, refresh rotation, MFA/login counters, tenant idempotency, promotion ownership, inventory scope, and outbound error disclosure were hardened.

## Residual findings blocking B4.3

- [ ] **High — payment external-side-effect TOCTOU** (`payment.external-side-effect-toctou`, CWE-362/CWE-841): provider calls happen before an atomic operation claim for authorization, capture, refund, cancel, and payout. A durable operation claim and provider idempotency key are required.
- [ ] **High — pending payment finalization** (`payment.pending-finalization`, CWE-841): `PENDING` provider responses can still finalize allocations, orders, inventory, ledger, refund, or cancellation state. Only verified provider success may finalize irreversible effects.
- [ ] **Medium — signature terminal-state race** (`signature.callback-terminal-race`, CWE-362/CWE-841): concurrent verified callbacks can overwrite a terminal signature state. Use a conditional/versioned transition.
- [ ] **Medium — PDF resource amplification** (`imports.pdf-resource-amplification`, CWE-400): text items and characters are processed before parser-level ceilings. Enforce per-page and total item/character budgets before nested extraction.
- [ ] **Medium — stale inventory availability** (`inventory.balance-stale-quantity`, CWE-362): `setBalance` derives availability from a reservation snapshot read outside the write transaction. Recompute under a lock/versioned conditional update.

The R2E report is complete, but B4.3 must not start and the R2E checkbox must remain unchecked until the residual findings are remediated, the affected regressions pass, and a new complete-coverage scan is run on the resulting commit.

## Verification evidence for `ad66e39`

- [x] `pnpm test` — API 163 tests, schemas 39, api-client 7, buyer 5, supplier 1; all workspace packages passed.
- [x] `pnpm typecheck` — 12/12 workspace tasks.
- [x] `pnpm build` — 8/8 workspace tasks.
- [x] `pnpm verify:postgres` — tenant isolation, rollback, idempotency, and scarce-stock concurrency passed.
- [x] `pnpm verify:runtime-split` — API/worker/all capability matrix and entrypoint guards passed.
- [x] `pnpm verify:platform-authority` — authority and AI role regressions passed.
- [x] `pnpm verify:outbound-security` — 25/25 targeted tests and static bypass gate passed.
- [x] `pnpm verify:production-config`.
- [x] `pnpm verify:security-storage`.
- [x] `pnpm audit --prod --audit-level high` — no known vulnerabilities.
- [x] `pnpm verify:web` — 17/17 Playwright scenarios.
- [x] `pnpm verify:security` — headers, request IDs, rate limits, and MFA flow passed.
- [x] `pnpm verify:core-contract` — 293 operations, 17 verified core operations, 38 component schemas.

Applied practices: backend/access-control review, security finding remediation and validation, code-review risk triage, and regression-test gates. Skills used: `codex-security:fix-finding` and `codex-security:security-scan`.
