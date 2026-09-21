# Актуальная документация DentMarket KZ

`actual_docs` — единая папка проектной документации. Корневые `README.md` и
`AGENTS.md` остаются вне неё намеренно: первый является входной страницей
репозитория, второй должен автоматически обнаруживаться агентами и
разработчиками.

## Порядок источников правды

1. [Product V2](product/DENTMARKET_PRODUCT_V2.md) — целевой продукт, границы
   пилота и бизнес-правила.
2. [Backend Foundation V2](backend/DENTMARKET_BACKEND_FOUNDATION_V2.md) —
   техническая последовательность работ и backend Definition of Done.
3. [ADR](architecture/adr/) — принятые архитектурные решения.
4. Исполняемые schemas, OpenAPI и API client в коде.
5. [Acceptance matrix](governance/PROJECT_ACCEPTANCE_MATRIX.md) — статус и
   доказательства. Историческая запись без проверяемых входов не подтверждает
   текущий checkout; повторное использование PASS регулирует Workflow §4.2.

Для любой задачи дополнительно обязательны корневой
[AGENTS.md](../AGENTS.md) и
[Development Workflow](governance/DEVELOPMENT_WORKFLOW.md). Для интерфейса
также обязателен [UI/UX Standard](ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md).

Workflow — канонические правила scope, выбора gates, лимита попыток, preflight,
reuse и остановки. Runbooks — инструкции для выбранной процедуры, не повод
выполнять весь каталог команд. Исторический UI-план не назначает повторный rewrite.
Аудит/изменение документации не запускает автоматически следующую backend-фазу.

## Текущая очередь — 2026-09-15

Сейчас завершаем **внутреннее backend-ядро без новых внешних интеграций**.
Единственный рабочий чек-лист — Foundation: CORE-01–09 и уточняющая очередь
AUD-FIX (§8). AUD-FIX-01 (безопасные HTTP-логи) и AUD-FIX-02 (читаемый PDF)
приняты; AUD-FIX-03.1 (общий серверный logout) также принят в своей границе.
AUD-FIX-03.2 (protected registration resume) принят 15.09.2026 в своей границе:
same-tab ссылка/смена token исправлены, scoped Playwright5/5 и отдельный DB readback
клиники/поставщика прошли. Typecheck/unit/landing build PASS; неизменённые
API/PG/authority/rate-auth evidence переиспользованы. История прежних блокеров,
разрешение на продолжение и итоговый ledger сохранены в Acceptance Matrix §9.
AUD-FIX-03.3 (локальная доставка и штатный операторский вход) принят в своей
границе: local-auth browser3/3, resume browser5/5, E2E typecheck и визуальная
проверка5снимков PASS; прежние root/API/DB/config/build evidence переиспользованы.
История timeout/selector failures и отдельный startup probe сохранены в Matrix §9.
AUD-FIX-03.4 / AUTH-ORG-LOOKUP-01 принят15.09.2026: own-context API вместо
отсутствующего organization detail lookup, без доступа к operator directory.
После разрешённого уточнения alert locator negative UI case PASS1/1; operator
regression PASS3/3, final E2E typecheck PASS. Прежние два положительных перехода,
root test/typecheck, API/DB17 и три web builds переиспользованы при неизменных inputs.
AUD-FIX-03 и его четыре подпункта завершены в границе audit remediation; весь
CORE-05 и production этим не приняты. История failures/паузы/reuse — Matrix §9.
AUD-FIX-04 принят16.09.2026: явные edit/remove, атомарная версия, отдельный акцепт
цены и сохранение draft при конфликте. В приёмке найден и исправлен UI-PORTAL-01:
общий Fluent portal больше не перекрывает экран. Typecheck,110frontend tests,
четыре production builds и scoped Chromium3/3 с реальными API/DB PASS;
неизменённые PG/core-contract и backend unit evidence переиспользованы.
История startup/orchestration failures и flaky PDF test сохранена в Matrix §9.
AUD-FIX-05 принят16.09.2026 после bundle fix: package/unit цены, reset/pagination/
history/race/retry, supplier packaging; root TS/tests,2builds и оба bundle budgets
PASS. Последняя сборка проверена catalog6/6 +cart3/3, actual API/DB и visual.
Корзина загружается при открытии, validation сохранена; budgets не повышались.
История404/precondition failures и отозванной ранней приёмки сохранена в Matrix.
Закрыты6из9 родительских AUD-FIX; остаются07–09. AUD-FIX-06 принят16.09.2026:
truthful pending/full/partial/rejected, exact preview, сохранность draft и
явный restart устаревшей версии. Bounded diagnostic доказал потерю фокуса на
BODY после disabled submit/409; локальное восстановление фокуса к ошибке
исправило Escape. Supplier TS/43tests/build/bundle и E2E TS PASS; targeted
conflict+snapshot2/2 PASS. Все5сценариев покрыты как3REUSED_PASS+2freshPASS,
не новый полный5/5run. Реальные API/DB readbacks без audit/outbox дублей;
новый snapshot явно симулирован только в UI и не изменяет БД.
История3ранних failures/startup timeout и API-only diagnosis сохранена в Matrix.
Причина старого startup timeout не доказана; guards/лимиты не менялись.
Текущий этап — AUD-FIX-07 (документолог). Slice07.1 ACCEPTED16.09: суммы
отображаются в тенге, API хранит точные minor units; форма сохраняет поля и
реальный выбранный файл при close/reopen, блокирует повторный submit, объясняет
403/409. После разрешения владельца конфликт generated types устранён только
в audit-копии с восстановимым backup; эквивалентный workspace typecheck PASS.
594unique unit tests: после последней UI-правки146fresh +448REUSED_PASS;
два актуальных production build/bundle и финальные3/3browser cases PASS16.0s.
История3TSFAIL и первого browser locator FAIL сохранена в Matrix §9.
В Foundation07.1[x], родитель07[ ]: связи/lookup, navigation/detail/accounting
errors и demo marking ещё открыты. Main dev/рабочая демобаза не менялись;
это не production-приёмка. Повторять07.1 без изменения входов не требуется.
Slice07.2 (заказ/основной договор без ручного UUID) принят16.09.2026: исправлен
подтверждённый mixed-tenant blocker upload/generate и копирования новой версии;
24JWT/PG regressions и полный verify:postgres PASS, TS/617units/builds PASS,
финальный browser5/5 PASS. Выбор/поиск/empty/error/403/draft, desktop/mobile и
точные сохранённые связи проверены. История исходного FAIL сохранена. Foundation
07.2[x],07parent[ ]; платежные lookup, navigation/accounting/demo marking ещё
открыты. Evidence — Purchasing/Documents brief и Matrix §9; production не принят.
После принятия06–09 разрешена
комплексная проверка существующего backend, не автоматическая реализация CORE.
Единственный чек-лист — Foundation §8.
Полный редизайн не входит в эту итерацию. Приёмка окружения/данных/release — POST-BE после backend;
объединённая закупка до получения и повтора — POST-FULL после backend и frontend.
Проверки каждой изменяемой фазы выполняются сразу, не откладываются.

PSP, 1С, НУЦ РК, перевозчики и остальные live-провайдеры — очередь EXT,
не текущая реализация. Расширенный показ — DEMO-01: владелец разрешил все пять
блоков; локальный `npm run dev` использует go_live, `dev:pilot` — ограниченный
профиль. Активация не закрывает полноту optional сценариев или B5.1–B5.3.

Завершённые B-фазы и датированные audit/status отчёты сохранены в
[архиве с реестром переноса](history/archive/2026-09-14/README.md).
Смешанные исторические документы могут содержать незакрытые пункты: их
активный адрес указан в реестре, архивирование не означает выполнение.

## Карта разделов

### `product/` — продукт и границы пилота

- [Product V2](product/DENTMARKET_PRODUCT_V2.md)
- [Скрытые функции и расширенная демонстрация](product/DENTMARKET_OUT_OF_PILOT_FEATURES.md)

### `backend/` — backend foundation

- [Backend Foundation V2](backend/DENTMARKET_BACKEND_FOUNDATION_V2.md)
- [Исправления аудита: доступ и безопасность логов](backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md)
- [Исправления аудита: закупка и документолог](backend/AUDIT_PURCHASING_DOCUMENTS_REMEDIATION_2026-09-15.md)

### `governance/` — правила разработки и доказательства

- [Development Workflow](governance/DEVELOPMENT_WORKFLOW.md)
- [Project Acceptance Matrix](governance/PROJECT_ACCEPTANCE_MATRIX.md)

### `ui-ux/` — единый стандарт интерфейсов

- [UI/UX Implementation Standard](ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md)
- [UI/UX Consolidation Standard](ui-ux/DENTMARKET_UI_UX_CONSOLIDATION_STANDARD.md)
- [Полировка текущего UX по аудиту](ui-ux/AUDIT_UX_POLISH_2026-09-15.md)

### `architecture/` — система и ADR

- [Архитектура платформы](architecture/architecture.md)
- [ER-диаграмма](architecture/er.mmd)
- [ADR 001: modular monolith](architecture/adr/001-modular-monolith.md)
- [ADR 002: hybrid catalog](architecture/adr/002-hybrid-catalog.md)
- [ADR 003: access model](architecture/adr/003-access-model.md)
- [ADR 004: provider-independent integrations](architecture/adr/004-provider-independent-integrations.md)
- [ADR 005: transactional outbox delivery](architecture/adr/005-transactional-outbox-delivery.md)
- [ADR 006: platform authority policy](architecture/adr/006-platform-authority-policy.md)
- [ADR 007: outbound request gateway](architecture/adr/007-outbound-request-gateway.md)
- [ADR 008: production outbound transport policy](architecture/adr/008-production-outbound-transport-policy.md)
- [ADR 009: deployment profile composition](architecture/adr/009-deployment-profile-composition.md)
- [ADR 010: frontend deployment profile](architecture/adr/010-frontend-deployment-profile.md)

### `product-cards/` — карточки товаров и каталог

- [Pilot catalog](product-cards/pilot-catalog.md)
- [Аудит и целевой стандарт изображений](product-cards/CATALOG_MEDIA_PIPELINE_AUDIT.md)

### `integrations/` — подключения поставщиков и runbooks

- [Connector readiness](integrations/connector-readiness.md)
- [ЭЦП НУЦ РК и 1С — техническая спецификация](integrations/eds-and-1c-integration-technical-spec.md)
- [Supabase](integrations/supabase.md)
- [Manual supplier](integrations/runbooks/manual-supplier.md)
- [File import](integrations/runbooks/file-import.md)
- [МойСклад](integrations/runbooks/moysklad.md)
- [1С Agent](integrations/runbooks/one-c-agent.md)
- [Custom API](integrations/runbooks/custom-api.md)
- [External adapters](integrations/runbooks/external-adapters.md)

### `operations/` — эксплуатация и production

- [Operations](operations/operations.md)
- [Deployment profiles](operations/deployment-profiles.md)
- [Live provider and infrastructure readiness](operations/live-provider-readiness.md)
- [Production deployment](operations/production-deployment.md)
- [Production go-live checklist](operations/production-go-live-checklist.md)
- [SLA и incident response](operations/sla-incident-response.md)
- [Production auth runbook](operations/production-auth-runbook.md)
- [Observability runbook](operations/observability-runbook.md)
- [Backup/restore runbook](operations/backup-restore-runbook.md)

### `security/` — безопасность

- [Security](security/security.md)

### `supplier-flows/` — отдельные сценарии поставщика

- [PDF supplier cycle](supplier-flows/pdf-supplier-cycle.md)

### `applications/` — локальные приложения

- [Buyer Web](applications/buyer-web.md)
- [Supplier Web](applications/supplier-web.md)

### `history/` — исторические материалы

- [Архив завершённых этапов и прежних планов — 2026-09-14](history/archive/2026-09-14/README.md)
- [Backend audit 2026-09-08](history/archive/2026-09-14/backend/DENTMARKET_BACKEND_AUDIT_2026-09-08.md)
- [Project state 2026-09-08](history/archive/2026-09-14/governance/PROJECT_STATE_SNAPSHOT_2026-09-08.md)
- [R2E checkpoint на 8f450ea](history/archive/2026-09-14/governance/SECURITY_R2E_2026-08-20.md)
- [B4.5 security/dependency checkpoint](history/archive/2026-09-14/governance/SECURITY_AUDIT_B4_5_2026-08-19.md)
- [Verification log](history/verification.md)
- [Legacy traceability matrix](history/traceability.md)
- [ТЗ v4 implementation status](history/v4-implementation-status.md)
- [Trust, Geo и AI](history/trust-geo-ai.md)
- [Commercial readiness gap](history/commercial-readiness-gap.md)

Файлы из `history/` сохраняются для аудита решений, но не расширяют Product V2
и не являются текущим backlog или доказательством готовности.
