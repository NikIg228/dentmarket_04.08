# B4.5 — security/dependency audit

**Дата:** 2026-08-19
**Статус фазы:** `[x]` scan и dependency remediation завершены
**Статус проекта по application security:** `BLOCKED` до B4.5-R2C (2 Medium findings)

## 1. Scope и доказательная база

- Scan ID: `7a5358c7-a6f3-459d-a1fa-8bc22ef5c822`.
- Проверенный revision: `e24913c9f50643ee602686bc6432a35bfc03473a`.
- Режим: standard repository scan, manual source-to-sink validation и
  registry-backed production dependency audit.
- Покрытие: dependency graph, JWT/session/tenant boundaries, role delegation,
  shared catalog, AI tools, integrations, notifications, uploads/parsers,
  storage, payment/EDS callbacks и browser sinks.
- Coverage partial: scan не доказывает production DNS/firewall/WAF/egress и не
  получил один I/O worker receipt; критичные I/O paths дополнительно просмотрены
  independent baseline и root review.

## 2. Итог B4.5

| Область                 |                                   До |                                                               После | Статус               |
| ----------------------- | -----------------------------------: | ------------------------------------------------------------------: | -------------------- |
| Production dependencies |                  15 high, 6 moderate |                                             0 known vulnerabilities | `[x]`                |
| Source findings high    | 4, если исключить dependency finding |                                                                   0 | `[x]` R1A, `[x]` R1B |
| Source findings medium  |                                    4 |                                                                   2 | `[x]` R2A, `[x]` R2B; 2 open |
| Typecheck               |                                    — |                                                         12/12 tasks | `[x]`                |
| Unit/integration tests  |                                    — | API 143/143; schemas 38/38; api-client 7/7; Buyer 5/5; Supplier 1/1 | `[x]`                |
| Production build        |                                    — |                                                           8/8 tasks | `[x]`                |
| PostgreSQL integration  |                                    — |                  tenant, rollback, idempotency, scarce stock passed | `[x]`                |
| Browser regression      |                                    — |                                                     17/17, 1 worker | `[x]`                |

Фаза B4.5 означает, что scan выполнен, findings зафиксированы, dependency
finding исправлен и compatibility доказана. Она не означает, что оставшиеся
уязвимости прикладного кода закрыты или что проект production-ready.

## 3. Dependency remediation

- Next.js обновлён с 16.2.10 до 16.2.11 во всех web-приложениях и root tooling.
- `pdfjs-dist` обновлён с 5.7.284 до 6.2.108; PDF import/render tests прошли.
- Узкие pnpm overrides фиксируют уязвимые transitive ranges:
  `sharp` 0.35.3, `postcss` 8.5.26, `brace-expansion` 1.1.18/2.1.4,
  `js-yaml` 4.3.1, `deepmerge-ts` 8.0.1 и `nanoid` 5.1.16.
- `nanoid` 5.1.16 выбран вместо заявленного advisory patch 3.3.18, потому что
  registry resolver не отдавал 3.3.18 как устанавливаемую версию; production
  build, API tests и browser flows подтвердили совместимость выбранной patched
  major-ветки.
- Lockfile пересобран pnpm 11; Turbo/Vite/Vitest не обновлялись относительно
  исходного lockfile в рамках этой задачи.

## 4. Открытые source findings

| Готово | Приоритет | Finding                                                | Основная граница                             |
| ------ | --------- | ------------------------------------------------------ | -------------------------------------------- |
| [x]    | High      | User-selected AI role exposes operator data            | Client role → global AI tools                |
| [x]    | High      | Tenant admins can grant arbitrary platform permissions | Tenant role write → global permission        |
| [x]    | High      | Supplier can mutate arbitrary shared product cards     | Broad permission + global ID write           |
| [x]    | High      | Supplier integration SSRF with response disclosure     | Tenant base URL → worker fetch/result        |
| [x]    | Medium    | Ordinary tenants enumerate organizations/capabilities  | Tenant permission → unscoped query           |
| [x]    | Medium    | XLSX decompression can exhaust API memory              | Compressed upload → bounded ZIP metadata → ExcelJS |
| [ ]    | Medium    | Revoked sessions remain valid until JWT expiry         | Revoked `jti` → stateless middleware         |
| [ ]    | Medium    | Notification webhook allows blind SSRF                 | Tenant destination → background fetch        |

## 5. Hardening direction

Scan-backed hardening portfolio рекомендует два центральных in-process control
внутри текущего modular monolith:

1. Platform authority policy: grantable permission sets, operator-only actions,
   final resource identity и server-derived AI tool authority.
2. Outbound request gateway: HTTPS, DNS/IP/port policy, redirect revalidation,
   timeouts, response limits и безопасная telemetry.

Сначала всё равно нужны tactical patches исходных paths. Session revocation и
XLSX limits лучше закрывать отдельными локальными change sets: active-session
check с bounded cache/invalidation и ZIP central-directory limits до ExcelJS с
оценкой parser isolation.

## 6. Выполненные gates

- [x] `pnpm audit --prod --audit-level high` — `No known vulnerabilities found`.
- [x] `pnpm typecheck` — 12/12.
- [x] `pnpm test` — все test packages зелёные.
- [x] `pnpm build` — 8/8.
- [x] `pnpm verify:production-config`.
- [x] `pnpm verify:security-storage` с реальной PostgreSQL.
- [x] `pnpm verify:security`.
- [x] `pnpm verify:postgres`.
- [x] `pnpm verify:runtime-split`.
- [x] `pnpm verify:core-contract`.
- [x] `pnpm verify:web` — 17/17.
- [x] `pnpm verify:platform-authority` — organization enumeration regression
      `tenant_denied_operator_allowed`.
- [x] `pnpm verify:outbound-security` — 25/25 targeted tests и static bypass gate.
- [x] Hardening portfolio создан без изменения sealed scan evidence.

Основной Playwright suite использует один worker. Два последовательных запуска
с четырьмя workers дали разные action/setup timeouts при общей PostgreSQL/API и
низкой доступной памяти; те же сценарии изолированно проходили. Последовательный
gate проверяет тот же набор assertions и устраняет ресурсную недетерминированность.

## 7. B4.5-R1A — platform authority remediation

- [x] Центральная `PlatformAuthorityPolicy` отделяет tenant RBAC от
      marketplace-operator authority.
- [x] Tenant role creation/assignment не принимает глобальные, чужие или
      privilege-escalating роли; legacy global/foreign assignments не участвуют в
      effective permissions.
- [x] Public и social acceptance сохранённого приглашения повторно проверяют
      ownership каждой роли до транзакции и не создают side effects при отказе.
- [x] Canonical product, variant, attribute и packaging writes доступны только
      активной организации с capability `MARKETPLACE_OPERATOR`.
- [x] AI-роли привязаны к capability и повторно валидируются перед чтением,
      feedback, message и tool execution сохранённого диалога.
- [x] Первый diff-scan `9d749072-0c7c-4213-a2c7-4b1b6fa3e7cb` выявил legacy
      global-role bypass; finding `csf_9981c0e2b00e186ac389a713` закрыт до phase
      acceptance.
- [x] Финальный diff-scan `5d31ee89-1cc1-43dd-a3f6-70b1789ee0a2` проверил 17/17
      changed source items с complete coverage и завершился с `0 findings`.
- [x] `pnpm install --frozen-lockfile`, `pnpm audit --prod --audit-level high`,
      `pnpm typecheck` (12/12), `pnpm test` (API 124/124 и все workspace packages),
      `pnpm build` (8/8), `pnpm verify:platform-authority`,
      `pnpm verify:production-config`, `pnpm verify:security-storage`,
      `pnpm verify:security`, `pnpm verify:postgres`, `pnpm verify:runtime-split`,
      `pnpm verify:core-contract`, `pnpm verify:web` (17/17) и
      `git diff --check` проходят.

## 8. B4.5-R1B — integration SSRF remediation

- [x] `OutboundRequestGateway` централизует HTTPS/443, DNS/IP policy, запрет
      private/link-local/reserved сетей, DNS pinning и same-origin redirect
      revalidation для server-side integration requests.
- [x] Общий deadline, response limit, запрет compressed response и unsafe
      transport headers ограничивают resource use и request smuggling surface.
- [x] `CUSTOM_API` использует только gateway; private URL отклоняется до ответа,
      а низкоуровневые network details не сохраняются в job error.
- [x] `MOYSKLAD` закреплён за официальным `api.moysklad.ru`; tenant-controlled
      `configuration.baseUrl` больше не влияет на destination.
- [x] `pnpm verify:outbound-security` проходит 25/25 targeted tests и проверяет
      отсутствие прямого `fetch`/provider-host override в production adapters.
- [x] Финальный diff-scan `657c3363-632e-42c0-8d08-f09880a55745` проверил 9/9 source
      items, зафиксировал complete coverage и завершился с `0 findings`.
- [x] `pnpm install --frozen-lockfile`, production dependency audit,
      `pnpm typecheck` (12/12), `pnpm test` (API 136/136 и все workspace packages),
      `pnpm build` (8/8), production config, DB-backed security storage, live
      security, PostgreSQL, runtime split, core contract, platform authority,
      `pnpm verify:web` (17/17) и `git diff --check` проходят.

## 9. B4.5-R2A — organization enumeration remediation

- [x] `GET /organizations` принимает actor/tenant context и передаёт его в
      `OrganizationsService`; unscoped Prisma projection больше не является
      самостоятельной authorization boundary.
- [x] `OrganizationsService.list()` вызывает `PlatformAuthorityPolicy` до
      `findMany(include: { capabilities: true })`. Активный supplier/buyer с
      обычным `organization.view` получает `403`, а не список организаций или
      capability metadata.
- [x] Marketplace operator сохраняет полный список, необходимый для operator
      workbench; выдача capabilities разрешена только после active membership и
      `MARKETPLACE_OPERATOR` capability.
- [x] Добавлен unit regression
      `apps/api/src/modules/organizations/organizations.service.spec.ts`:
      tenant denial не вызывает Prisma, operator projection сохраняется.
- [x] `pnpm verify:platform-authority` выполняет API/PostgreSQL regression
      `tenant_denied_operator_allowed` и проверяет capability projection оператора.
- [x] После R2A прошли `pnpm typecheck` (12/12), `pnpm test` (API 138/138,
      schemas 38/38, api-client 7/7, Buyer 5/5, Supplier 1/1), `pnpm build` (8/8),
      dependency audit, production config, DB-backed security storage, live
      security, PostgreSQL, runtime split, core contract, platform authority,
      `pnpm verify:web` (17/17) и `git diff --check`.

## 10. B4.5-R2B — XLSX decompression exhaustion remediation

- [x] До передачи ExcelJS проверяется ZIP central directory: количество записей,
      размер каждой записи, суммарный распакованный объём и compression ratio.
- [x] Зафиксированы пределы `2,000` записей, `16 MiB` на запись, `64 MiB`
      суммарно и ratio `200`; ZIP64 sentinel и неконсистентная multi-disk
      metadata отклоняются.
- [x] Добавлены unit-regressions для обычного архива, per-entry/total limits,
      zip-bomb ratio и ZIP64; parser regression подтверждает отказ до ExcelJS
      при malicious metadata.
- [x] `pnpm --filter @marketplace/api typecheck`, API tests (`143/143`) и
      API build проходят.
- [x] После R2B прошли `pnpm typecheck` (12/12), `pnpm test` (API 143/143,
      schemas 38/38, api-client 7/7, Buyer 5/5, Supplier 1/1), `pnpm build`
      (8/8), dependency audit, production config, DB-backed security storage,
      live security, PostgreSQL, runtime split, core contract, platform
      authority, outbound security, `pnpm verify:web` (17/17) и
      `git diff --check`.

## 11. Следующая задача

**B4.5-R2C:** закрыть Medium delayed session revocation: проверять статус
отозванного `jti` до принятия JWT, добавить bounded cache/invalidation и
regression для logout/revoke. Затем отдельным change set закрывается
notification webhook SSRF; B4.3 начинается после всего R2 и повторного
security regression.
