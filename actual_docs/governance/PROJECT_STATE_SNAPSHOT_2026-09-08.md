# DentMarket KZ — снимок состояния проекта на 2026-09-08

## 1. Назначение документа

Этот документ фиксирует воспроизводимое состояние репозитория перед коммитом,
содержащим сам снимок и backend-аудит. Он не заменяет Product V2, Backend
Foundation или Acceptance Matrix и не повышает исторические статусы без свежего
evidence.

## 2. Git и инструментальная база

| Параметр | Зафиксированное значение |
| --- | --- |
| Рабочий каталог | `C:\Users\user\Desktop\dentmarket-kz-main` |
| Ветка | `recovery/gate-0` |
| Исходный HEAD аудита | `8db7e6b09019c3e350cfb863a580eb7d0f33950b` |
| Upstream | `origin/recovery/gate-0` |
| Remote | `https://github.com/NikIg228/dentmarket_04.08.git` |
| Расхождение до текущего коммита | локальная ветка впереди remote на 33 коммита |
| Package manager | `npm@11.16.0` |
| Node.js | `v24.18.0` |

До проверки production build рабочее дерево содержало изменения только в
`apps/admin-web/next-env.d.ts` и `apps/landing-web/next-env.d.ts`: Next.js dev
переключил ссылку на `./.next/dev/types/routes.d.ts`. Свежий production build
восстановил канонический generated-вариант, после чего дерево стало чистым.
Эти файлы не являются продуктовым change set и не вошли в коммит.

Репозиторий всё ещё хранит одновременно `package-lock.json`, `pnpm-lock.yaml` и
`pnpm-workspace.yaml`. Исполняемые команды, CI и поле `packageManager` используют
`npm`; pnpm-артефакты и старые pnpm-команды в документации являются отдельным
долгом управления зависимостями.

## 3. Технический инвентарь backend

| Объект | Количество |
| --- | ---: |
| Workspace-пакеты в Turbo scope | 11 |
| Доменные модули API | 30 |
| TypeScript-файлы `apps/api/src` | 261 |
| API unit spec-файлы | 53 |
| Prisma models | 149 |
| Prisma enums | 119 |
| Prisma migrations | 32 |
| OpenAPI operations | 301 |
| OpenAPI component schemas | 48 |
| Машинно проверяемые core operations | 19 |
| Pilot catalog | 50 canonical products / 500 supplier offers |

Архитектура остаётся modular monolith: NestJS API, PostgreSQL/Prisma,
Redis-backed rate limiting и background jobs, transactional outbox, S3/Supabase
storage adapters, общие Zod-контракты и типизированный API client. HTTP API и
worker имеют отдельные entrypoints и runtime-role checks.

## 4. Свежие проверки этого аудита

| Команда / проверка | Результат |
| --- | --- |
| `npm run typecheck -- --force` | PASS — 15/15 задач, cache 0 |
| `npm test -- --force` | PASS — 14/14 задач, 327 тестов |
| `npm run lint -- --force` | PASS — 11/11 задач, cache 0; фактически это `tsc --noEmit`, а не ESLint |
| `npm run build -- --force` | PASS — 10/10 задач, cache 0; API и production builds web-приложений |
| `npm run verify:core-contract` | PASS — 301 operations, 48 schemas, 19 core operations, 50/500 pilot data |
| `npm run verify:runtime-split` | PASS — API/worker/all и production role guards |
| `npm run verify:production-config` | PASS для текущих assertions; HTTPS policy для всех secret-bearing URL отсутствует |
| `npm run verify:rate-limit-auth` | PASS — 9 targeted tests и production auth contract |
| `npm run verify:outbound-security` | PASS — 25 targeted tests; scope не охватывает все прямые provider `fetch` |
| `npm run verify:outbox` | PASS — 14/14 |
| `npm audit --omit=dev --audit-level=high` | PASS — 0 известных уязвимостей |
| `npm run verify:postgres` | PASS — 32 migrations, tenant isolation, rollback, idempotency и scarce-stock concurrency |
| `npm run verify:pilot-backend` | PASS — checkout, supplier order/reservation, confirmation и idempotency |
| `prisma validate` с явным локальным `DATABASE_URL` | PASS |
| `verify-security-storage.mjs` с явным локальным `DATABASE_URL` | PASS — encrypted columns есть, plaintext sensitive keys не найдены |
| Runtime security gate на отдельном API-порту | PASS — headers, request ID, rate-limit headers и MFA lifecycle |
| Observability unit/catalog | PASS — 4/4 теста, 7 alert rules, 14 synthetic vectors |
| Observability runtime integration | NOT VERIFIED — API не открыл test-порт до 60-секундного readiness timeout; startup log пуст |
| `docker compose config --quiet` | NOT RUN — Docker CLI отсутствует на машине |

Observability runtime failure не замаскирован как зелёный. На машине одновременно
работало много Node-процессов; отдельный ручной API startup также не открыл порт
до timeout. Чужие процессы не останавливались. Gate требуется повторить в чистом
runtime до release-решения.

## 5. Security checkpoint

Codex Security Standard scan `be32fbfe-a26c-4db7-834f-fcf406df8b00` выполнен
для `apps/api` на immutable revision
`8db7e6b09019c3e350cfb863a580eb7d0f33950b`.

- Coverage: 8/8 заявленных backend security surfaces.
- Validated findings: 1 medium, CWE-319.
- Finding: production-конфигурация принимает `http://` для ряда URL, по которым
  adapters отправляют bearer token, service-role key или чувствительное тело.
- Ограничения: не было independent delegated baseline, live provider traffic и
  dynamic penetration test.

Локальный сгенерированный отчёт:
`C:\Users\user\AppData\Local\Temp\codex-security-scans-OVRmeN\dentmarket-kz-main\8db7e6b09019c3e350cfb863a580eb7d0f33950b_20260908T083720Z_lg06nkea\report.md`.
Долговечное описание finding и remediation находится в backend-аудите рядом с
этим снимком.

## 6. Readiness на дату снимка

| Цель | Решение | Основание |
| --- | --- | --- |
| Локальная разработка | GO | install/build/unit/contract/PostgreSQL gates воспроизводимы |
| Controlled demo на pilot fixtures | GO с оговорками | основной procurement flow и 10/10/500 fixture подтверждены; использовать mock/manual providers |
| Ограниченный пилот без денежных и юридических обещаний | CONDITIONAL GO | локальный B4.6 baseline зелёный; нужны runtime-граница pilot и заранее зафиксированные manual fallbacks |
| Production go-live | NO-GO | CWE-319 закрыт; открыты production B4.6, live PSP/EDS/connectors/notifications и provider-managed infrastructure gates |

## 7. Неизменённые границы

- AI assistant, billing/tariffs, trust/reputation, promotions и advanced
  recommendations не становятся частью pilot только потому, что код модулей
  присутствует.
- Исторические `[x]` в Foundation/Acceptance Matrix не заменяют текущие gates.
- Реальные PSP, квалифицированная ЭЦП, ЭДО/ЭСФ/СНТ, 1С, email/SMS и production
  storage не объявляются `LIVE_VERIFIED`.
- Локальная часть B4.6 имеет `INTEGRATION_VERIFIED`; production B4.6 не закрыт
  без managed failover и длительного staging soak.
