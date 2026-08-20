# B4.5-R2E — current security regression

Status: `COMPLETE`.

- Target revision: `8f450ea1c60100cb050dd30ddcb6202297354a0d` (`8f450ea`).
- Codex Security scan: `64b65075-d7f3-4c23-b6e2-1535e6067b80`.
- Mode: standard repository scan, complete coverage (`1055/1055` tracked files; `8/8` review surfaces closed).
- Result: `0` reportable findings.
- TAC advisory: `not_granted`; protected TAC output may be unavailable, but the local canonical scan completed and was indexed.
- Active worker advisory: the session had three usable worker slots, below the six-slot suggestion; coverage remained complete.

## Remediation controls

- [x] AI tools have an explicit operation-to-permission map, platform-operator restrictions, and regression tests.
- [x] Integration, payment, and signature webhooks require verified raw body/HMAC before persistence; route throttling and a `1 MiB` body limit are enforced.
- [x] CSV parsing enforces parser-level `5,000` row, record-size, and `100`-column limits; XLSX/PDF and shared import paths enforce bounded materialization.
- [x] Runtime error responses, refresh rotation, MFA/login counters, tenant idempotency, promotion ownership, inventory scope, and outbound error disclosure are hardened.
- [x] Payment authorization/capture/void/refund/payout claim a durable operation key before provider calls and pass a deterministic provider idempotency key.
- [x] `PENDING` provider responses remain processing-only; irreversible allocation, order, inventory, ledger, refund, and cancellation effects are applied only by verified success/webhook finalization.
- [x] Signature completion uses a conditional terminal transition; concurrent callbacks converge without overwriting a terminal state, and processing idempotency records are not poisoned by transient failures.
- [x] PDF parsing rejects per-page text-item and total-character budgets before nested extraction and aborts at the parser row ceiling.
- [x] Inventory availability is recomputed from a fresh transaction snapshot with Serializable isolation and version-conditional updates.

## Previously blocking findings — closed and rescanned

- [x] High — `payment.external-side-effect-toctou` (`CWE-362/CWE-841`): durable `PaymentAttempt` operation claims and deterministic provider keys now precede every external payment side effect.
- [x] High — `payment.pending-finalization` (`CWE-841`): pending responses create processing records only; verified provider success finalizes through `applyProviderWebhook` exactly once.
- [x] Medium — `signature.callback-terminal-race` (`CWE-362/CWE-841`): conditional signature transition and idempotent terminal convergence prevent conflicting callback overwrites.
- [x] Medium — `imports.pdf-resource-amplification` (`CWE-400`): PDF item/character/row budgets are enforced before nested row extraction.
- [x] Medium — `inventory.balance-stale-quantity` (`CWE-362`): balance snapshot and version check execute inside a Serializable write transaction.

The complete-coverage scan found no new reportable vulnerability. B4.5-R2E is closed; B4.3 may proceed after the documentation and gate evidence below remain green.

## Verification evidence for `8f450ea`

- [x] `pnpm test` — 11/11 workspace tasks; API 48 files / 167 tests, schemas 39, api-client 7, buyer 5, supplier 1.
- [x] `pnpm typecheck` — 12/12 workspace tasks.
- [x] `pnpm build` — 8/8 workspace tasks.
- [x] `pnpm verify:postgres` — tenant isolation, rollback, idempotency, scarce-stock concurrency, and pilot seed passed.
- [x] `pnpm verify:runtime-split` — API/worker/all capability matrix and entrypoint guards passed.
- [x] `pnpm verify:platform-authority` — authority and AI role regressions passed.
- [x] `pnpm verify:outbound-security` — 25/25 targeted tests and static bypass gate passed.
- [x] `pnpm verify:production-config`.
- [x] `pnpm verify:security-storage` — encrypted columns checked; no plaintext sensitive keys.
- [x] `pnpm audit --prod --audit-level high` — no known vulnerabilities.
- [x] `pnpm verify:web` — 17/17 Playwright scenarios.
- [x] `pnpm verify:core-contract` — 293 operations, 17 verified core operations, 38 component schemas, 50/500 pilot catalog.
- [x] `pnpm verify:outbox` — 8/8 tests.
- [x] Codex Security R2E `64b65075-d7f3-4c23-b6e2-1535e6067b80` — complete coverage, 0 reportable findings.
- [x] `git diff --check` before commit.

Applied practices: backend/access-control review, payment state-machine review, source-to-sink security validation, code-review risk triage, focused regression testing, PostgreSQL concurrency verification, and browser acceptance gates. Skills used: `codex-security:fix-finding`, `codex-security:security-scan`, backend architect, code reviewer, and testing practices.
