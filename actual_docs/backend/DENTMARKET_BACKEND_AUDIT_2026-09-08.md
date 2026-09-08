# DentMarket KZ — полный backend-аудит и технический roadmap

**Дата:** 2026-09-08
**Revision исходного кода:** `8db7e6b09019c3e350cfb863a580eb7d0f33950b`
**Scope:** `apps/api`, Prisma schema/migrations, общие schemas/API client,
backend verification scripts, CI и operations/source-of-truth документы.

## 1. Краткий вывод

Backend не является прототипом на 10–20%: в репозитории реализован крупный
modular monolith с реальными доменными моделями, миграциями, транзакциями,
tenant isolation, typed contracts и автоматизированными PostgreSQL-сценариями.
Переписывать его с нуля нецелесообразно. Правильная стратегия — сузить runtime
до подтверждённого pilot scope, закрыть конкретные риски и только затем
подключать реальные внешние сервисы.

Текущая оценка:

| Область | Оценка | Комментарий |
| --- | ---: | --- |
| Доменный procurement core | 85% | Cart/reprice/checkout/split orders/reservations/supplier flow доказаны локально |
| Catalog/import operations | 80% | CSV и operator workflow сильные; live feed и нагрузка не доказаны |
| Документы и бухгалтерский архив | 80% | Buyer/Supplier archive реализован; legal/EDS/EDO live gates открыты |
| Security controls | 85% | Сильные auth/tenant/webhook/outbox controls; validated CWE-319 закрыт B4.5-R3 и зелёными gates |
| Operations/readiness | 60% | Локальные gates есть; B4.6 и managed infrastructure evidence отсутствуют |
| Внешние интеграции | 35% | Provider-independent foundation есть; `LIVE_VERIFIED` коннекторов нет |
| Production readiness целиком | 55% | Controlled demo возможен, production go-live пока нельзя заявлять |

Проценты — инженерная оценка готовности к целевому использованию, а не сумма
строк кода или закрытых чекбоксов.

## 2. Архитектура и качество фундамента

### Что построено правильно

- NestJS modular monolith соответствует ADR 001 и текущему масштабу продукта.
- PostgreSQL/Prisma выступает единым источником транзакционной истины.
- Общие Zod schemas и `@marketplace/api-client` задают границу frontend/backend.
- Денежные значения в core flow хранятся в minor units и передаются строками
  там, где возможен выход за безопасный диапазон JavaScript `number`.
- Checkout, inventory reservation, supplier confirmation, payment settlement,
  rollback и replay используют транзакции, idempotency и optimistic/conflict
  semantics.
- Transactional outbox разделяет фиксацию бизнес-события и внешний side effect.
- API и worker имеют отдельные entrypoints; production запрещает совмещённую
  process role.
- Tenant/resource checks присутствуют до чувствительных операций. Документы
  связаны не только с переданным `ownerOrganizationId`, но и с shipment →
  supplier order → buyer/supplier graph.

### Технические показатели

- 30 доменных модулей, 261 TypeScript-файл и 53 API spec-файла.
- 149 Prisma models, 119 enums и 32 последовательные migration.
- 301 OpenAPI operation и 48 component schemas.
- Наибольшая концентрация сложности находится в `imports.service.ts`,
  `commerce.service.ts`, `integration-execution.service.ts`,
  `documents.service.ts` и `search.service.ts`.
- В `apps/api` не обнаружены TODO/FIXME/HACK, backup/copy-файлы или применённые
  migration, отредактированные как черновики.

## 3. Реализованные backend-логики

### Identity, organizations и authorization

- [x] Организации клиник/поставщиков, memberships, роли и permissions.
- [x] Invitations, registration/onboarding intents, email verification и
  session lifecycle.
- [x] JWT issuer/audience/algorithm checks, `jti` → active `AuthSession`, MFA и
  production fail-closed auth contract.
- [x] Tenant context, resource ownership, supplier access и platform-authority
  policy для операторских действий.
- [x] Redis-backed multi-scope rate limiting с production fail-closed behavior
  и стабильным `429` contract.

### Catalog, offers, pricing и inventory

- [x] Canonical product/variant model, категории, атрибуты, единицы и упаковки.
- [x] Supplier offers, base/contract/tier prices, warehouses, lots и balances.
- [x] Freshness policy, manual override lifecycle, availability и search
  projection.
- [x] Pilot seed: 10 клиник, 10 поставщиков, 50 canonical products и 500 offers.
- [x] Public search, filters, comparison of offers и buyer-visible publication
  gate.
- [x] Stock reservation/release, scarce-stock concurrency и lot/recall flows.

### Cart, reprice и checkout

- [x] Cart item хранит pricing/availability snapshot при добавлении.
- [x] Revalidation возвращает старую/новую цену, сумму, остаток и причину
  недоступности.
- [x] Существенный diff требует явного принятия; без него checkout возвращает
  conflict.
- [x] Checkout повторно проверяет цену/остаток, создаёт reservations и делит
  buyer order на supplier orders.
- [x] Idempotency key, Serializable transaction и rollback защищают от
  повторного заказа и частичной фиксации.
- [x] Approval policies и audit/outbox effects встроены в state-changing flow.

### Supplier order и logistics

- [x] Полное и частичное подтверждение supplier order.
- [x] Контроль stale version, tenant isolation и атомарные переходы статуса.
- [x] Shipment creation, dispatch/status/tracking lifecycle.
- [x] Buyer получает идемпотентное in-app уведомление и видит shipment state.

### Payments

- [x] Payment intent, allocations по поставщикам, authorization, capture, void,
  refund, payout/reconciliation и ledger модели.
- [x] Mock adapter и provider-independent external HTTP adapter.
- [x] HMAC/timestamp validation и idempotent processing payment webhooks.
- [x] Core monetary calculations используют `BigInt`/Prisma Decimal или string
  contract на критических границах.
- [ ] Реальный PSP sandbox/live cycle не подтверждён; Product V2 допускает
  manual/off-platform payment для первого пилота.

### Документолог Buyer/Supplier

- [x] Генерация счёта до оплаты и полного комплекта документов после отгрузки.
- [x] Единый архив с отдельными Buyer/Supplier routes, summary, search,
  filters, cursor pagination и detail.
- [x] Категории, lifecycle/accounting status, документная дата, сумма/валюта,
  версии, parties, signatures и audit trail.
- [x] Tenant graph связывает owner с buyer/supplier order parties, shipment,
  checkout, payment и refund.
- [x] Quarantine upload для PDF/DOCX до 10 МБ, checksum, MIME/signature checks,
  controlled download и immutable versions.
- [x] Signature adapter foundation, callback HMAC/replay protection и
  organization/signer binding.
- [ ] Квалифицированная ЭЦП НУЦ РК, legal validation шаблонов, внешний ЭДО,
  ЭСФ/СНТ, 1С и production object storage не имеют live evidence.

### Imports, moderation и integrations

- [x] CSV upload → quarantine → validation → exact/matching candidates → draft.
- [x] Operator review/publication делает карточку видимой Buyer только после
  явного решения.
- [x] Guarded compensating rollback сохраняет raw rows, checksum и evidence.
- [x] Custom API и МойСклад adapters, encrypted integration configuration,
  mapping/reconciliation и job lifecycle.
- [x] 1C Agent protocol foundation и connector-readiness registry.
- [x] Signed webhooks с timestamp/replay, 1 МБ body limit и per-IP throttling.
- [ ] Ни один внешний connector пока не имеет статуса `LIVE_VERIFIED`.

### Background processing, audit и operations

- [x] Transactional outbox: claim/lease, retry/backoff, dead letter, protected
  list/replay, dedicated permissions и replay idempotency.
- [x] Structured logs, request ID, Prometheus metrics, low-cardinality labels,
  7 versioned alert rules и Sentry/OpenTelemetry adapters.
- [x] Backup/restore rehearsal scripts, schema/content verification и health
  checks существуют и исторически проходили локально.
- [x] Local/S3/Supabase storage adapters, encryption-key checks и quarantine.
- [x] Dependency audit на текущем lockfile возвращает 0 известных production
  vulnerabilities.
- [ ] Свежий observability runtime integration не получил readiness в текущем
  загруженном desktop runtime; unit/catalog часть зелёная, rerun обязателен.

### Код вне подтверждённого pilot scope

Billing, promotions, AI assistant, owners analytics, trust-commerce и advanced
support уже имеют модели/routes/services. Наличие кода не делает их частью
Product V2 pilot и не означает production acceptance. Сейчас все эти модули
загружаются общим `AppModule`, поэтому граница продукта шире на уровне runtime,
чем на уровне source-of-truth.

## 4. Критические места и технический долг

### P0 — закрыть до production go-live

#### P0.1. Fail-closed HTTPS для secret-bearing outbound URL

**Статус B4.5-R3:** [x] CWE-319 закрыт 2026-09-08.

Codex Security scan `be32fbfe-a26c-4db7-834f-fcf406df8b00` подтвердил CWE-319
medium/high-confidence. `environment.ts` использует общий `z.string().url()`
для `PAYMENT_GATEWAY_URL`, `SIGNATURE_GATEWAY_URL`, `EMAIL_PROVIDER_URL`,
`SMS_PROVIDER_URL`, `OPENAI_BASE_URL` и `SUPABASE_URL`; такой validator принимает
`http://`. Несколько adapters затем напрямую отправляют bearer/service-role
credentials через `fetch`.

Реализовано:

1. Общая production policy требует `https:` для 10 secret-bearing URL.
2. ADR 008 запрещает internal cleartext/mTLS exception без отдельного решения.
3. Instrumentation вызывает environment validation до Sentry/OTLP startup.
4. `verify:production-config` и static outbound gate покрывают каждый такой
   endpoint и его configuration consumer.
5. Production/config/outbound/runtime/auth gates и независимый security review
   прошли; development/test localhost HTTP сохранён.

Дальнейшая унификация privileged provider adapters в typed clients с отдельными
host allowlists и response-size budgets остаётся hardening-задачей, но не
является открытым CWE-319 transport finding.

#### P0.2. B4.6 — измеримый нагрузочный профиль catalog и checkout

В репозитории есть простые search/health/handoff scripts, но нет доказательства
полного B4.6: authenticated catalog/compare/cart validation/checkout, реальные
PostgreSQL query plans, конкурентные reservations, multi-instance Redis и
долговременный soak не измерены.

Минимальный DoD:

- профиль данных и нагрузки зафиксирован отдельно от pilot seed;
- thresholds для error rate, p50/p95/p99 и saturation;
- read profile: search → product → compare;
- write profile: cart → revalidate/accept → checkout с повторными idempotency
  requests и конкуренцией за малый остаток;
- `EXPLAIN (ANALYZE, BUFFERS)`/`pg_stat_statements` для горячих запросов;
- отдельный Redis test для rate limit/queue при нескольких API instances;
- отчёт с hardware/runtime/config, raw results и stop criteria.

#### P0.3. Внешние и эксплуатационные gates

До production нужны реальные PSP capture/refund/webhook, квалифицированная ЭЦП
и legal sign-off, один supplier connector, email/SMS, managed PostgreSQL PITR,
Redis HA, object-storage versioning/retention, DNS/TLS, external monitoring и
timed restore drill. Сейчас это foundation или локальный evidence, не live.

### P1 — закрыть до расширения пилота

#### P1.1. Реальная runtime-граница pilot

`DEPLOYMENT_PROFILE=pilot` почти не меняет composition приложения: `AppModule`
поднимает все 30 доменных модулей, включая AI, billing, promotions и trust.
Нужен явный module/feature composition, чтобы неподтверждённый функционал нельзя
было случайно экспонировать, запускать по scheduler или включить одним seed flag.

#### P1.2. Точность manual price override

`createDataOverrideSchema` принимает `value.amountMinor` как произвольный
JavaScript integer без `Number.MAX_SAFE_INTEGER`, после чего
`data-freshness.service.ts` выполняет `Number(value.amountMinor)`. Значение выше
`2^53-1` может потерять точность до записи в Decimal(20,0). Это не основной
checkout price contract, но нарушает общий monetary invariant.

Нужно заменить поле на decimal string либо safe integer, добавить boundary
regressions и сохранить API-client/OpenAPI совместимость.

#### P1.3. Концентрация сложности

Крупнейшие services имеют примерно 850–1 370 строк и смешивают orchestration,
validation, persistence mapping и side effects. Не требуется переписывание или
микросервисы. Нужна поэтапная декомпозиция по use case/application services,
pure policies и repositories/adapters с contract/regression tests.

#### P1.4. Неполная машинная проверка API-контрактов

OpenAPI содержит 301 operation, но строгий core gate охватывает 19 операций;
успешная response schema указана не для всех routes. Расширять покрытие следует
по доменным slices: auth → catalog → commerce → supplier/logistics → documents →
operations, сохраняя единый error envelope.

#### P1.5. Парсеры и HTTP resource limits

- Global JSON limit `32mb` выбран из-за base64 upload и слишком широк для
  большинства routes; нужен route-scoped multipart/streaming upload.
- CSV имеет file/row/column caps, но использует sync parser; XLSX/PDF также
  требуют memory profiling на предельных входах.
- Несколько provider adapters читают `json()`/`text()` без общего предела
  response body; central outbound layer должен ограничить bytes до parsing.

#### P1.6. Tooling и source-of-truth drift

- `lint` во всех workspace фактически запускает TypeScript compiler, поэтому
  отдельного ESLint/security lint слоя нет.
- Одновременно tracked `package-lock.json` и `pnpm-lock.yaml`; канонический
  выбор уже сделан в пользу npm, но pnpm-файлы ещё не удалены.
- Foundation/Acceptance Matrix содержат много исторических `pnpm` команд.
  Историю можно сохранить, но активные инструкции должны использовать npm.

#### P1.7. Production surface hardening

Swagger UI сейчас регистрируется без production guard. Нужно либо отключить
`/docs` в production, либо закрыть отдельной operator/network policy. Заодно
добавить automated assertion, что production surface соответствует решению.

### P2 — системное усиление после pilot foundation

- Версионирование event payload contracts и compatibility tests для outbox.
- Data retention/deletion policy для документов, импортов, audit и PII.
- SLO dashboards, alert routing, synthetic transactions и incident drills.
- Query/index budget и автоматический regression threshold после B4.6.
- Расширение migration smoke на большие объёмы и rollback/forward-only runbook.
- Отдельный performance/security budget для background worker и providers.

## 5. Моё видение проекта в текущем состоянии

Проект уже прошёл точку, где переписывание с нуля даёт выгоду: сильная часть
системы находится именно в накопленных бизнес-инвариантах, tenant checks,
транзакциях, миграциях и regression gates. Главная проблема сейчас не в выборе
Next.js, NestJS или npm — этот стек подходит для 100 клиник и 30 поставщиков с
большим запасом при нормальной PostgreSQL/Redis конфигурации. Проблема в том,
что кодовая поверхность выросла быстрее подтверждённого product scope. Я бы не
добавлял новые крупные функции до закрытия transport policy, B4.6 и реального
pilot runtime profile; затем подключил бы по одному живому PSP/EDS/connector
с полным evidence. Усиливать следует наблюдаемость, границы модулей, точные
контракты и эксплуатацию, сохраняя modular monolith. Микросервисы или полный
rewrite сейчас увеличат риск и отбросят проект назад.

## 6. Рекомендуемый порядок реализации

### Этап 1 — security и monetary integrity

1. Закрыть CWE-319 общим HTTPS validator и расширенным outbound coverage gate.
2. Исправить manual price override на string/safe integer contract.
3. Прогнать `typecheck`, full test, core contract, production config, outbound
   security, PostgreSQL и security runtime gates.

**Stop criteria:** любой красный security/core/PostgreSQL gate; отсутствие
явного решения по mTLS exception.

### Этап 2 — B4.6

1. Зафиксировать dataset, workload, thresholds и окружение.
2. Измерить catalog/compare/cart/checkout и concurrent stock.
3. Оптимизировать только доказанные hotspots.
4. Повторить профиль и сохранить raw evidence.

**Stop criteria:** ошибки данных, нарушенная idempotency/tenant isolation,
необъяснимые p95/p99 или saturation.

### Этап 3 — pilot runtime boundary

1. Сформировать явный composition для pilot и go-live.
2. Отключить out-of-scope controllers, schedulers и features по умолчанию.
3. Добавить route/module inventory assertion для каждого profile.

### Этап 4 — contracts и maintainability

1. Расширять OpenAPI response validation по одному доменному slice.
2. Декомпозировать только горячие большие services без изменения поведения.
3. Добавить реальный lint/static analysis.
4. Завершить переход на npm одним отдельным verified change set.

### Этап 5 — live pilot evidence

1. Один реальный supplier connector; остальные поставщики используют file flow.
2. Выбранный PSP или явно утверждённый off-platform payment process.
3. Реальный EDS/legal/document path либо утверждённый manual fallback.
4. Live email/notification и production storage.
5. Provider-managed backup/restore, monitoring и incident rehearsal.

## 7. Обязательные gates для следующего backend change set

```powershell
npm run typecheck
npm test
npm run build
npm run verify:core-contract
npm run verify:postgres
npm run verify:runtime-split
npm run verify:production-config
npm run verify:outbound-security
npm run verify:rate-limit-auth
npm run verify:outbox
npm run verify:pilot-backend
npm audit --omit=dev --audit-level=high
git diff --check
```

Для security-remediation дополнительно требуется повторный scoped Codex
Security scan/diff scan. Для release нужен зелёный observability runtime rerun;
для infrastructure change — валидный `docker compose config` в окружении с
установленным Docker CLI.

## 8. Применённые практики

- Backend Architect — проверка modular boundaries, транзакций, contracts и
  целесообразности modular monolith.
- Database Optimizer — оценка Prisma model, migrations, query/load evidence и
  требований к B4.6.
- AppSec Engineer и Codex Security Standard Scan — auth, tenant isolation,
  uploads, webhooks, outbound secrets и production configuration.
- API Tester — contract, PostgreSQL, runtime и negative-path gates.
- Code Reviewer и Reality Checker — разделение coded/local-verified/live и
  запрет завышения readiness.
- Git Workflow Master — сохранение исходного clean state, один связный docs
  change set, staged diff review и push без reset/force.

Taste Skill, UI Designer и UX Architect не применялись: интерфейс и landing не
входили в backend-аудит, а код UI не изменялся.
