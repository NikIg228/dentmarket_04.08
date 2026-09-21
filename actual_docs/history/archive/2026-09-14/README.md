# Архив завершённых этапов и прежних планов — 2026-09-14

Это история, не очередь исполнения и не новая сертификация готовности.
Baseline: 3d644963ed72f99a100e180db2d373bc5abeaef9.
Сохранены семь снимков документации до reconciliation; относительные
Markdown-ссылки перебазированы к прежним целям, текст результатов не переписан.
Нормализованы переводы строк и хвостовые пробелы Markdown; исходные байты
по-прежнему доступны в указанном immutable Git baseline.

Архив **не означает, что каждый пункт каждого снимка выполнен**. В смешанных
старых планах были открытые задачи и устаревшие «next task»; все они сохраняются
для аудита, а применимые остатки перенесены согласно таблице ниже.
Завершённые B-фазы удалены только из активной очереди, не из проекта.

Активные источники:
[Product](../../../product/DENTMARKET_PRODUCT_V2.md),
[Foundation](../../../backend/DENTMARKET_BACKEND_FOUNDATION_V2.md),
[Acceptance](../../../governance/PROJECT_ACCEPTANCE_MATRIX.md).

## Снимки

| Документ | Содержимое / зачем сохраняется |
| --- | --- |
| [Foundation до reconciliation](backend/DENTMARKET_BACKEND_FOUNDATION_V2.md) | Подробные выполненные B0–B4.5, local B4.6, цены, composition и старые next pointers |
| [Acceptance до reconciliation](governance/PROJECT_ACCEPTANCE_MATRIX.md) | Исторические evidence, catalog snapshot, Gate 0 и точечные обновления |
| [Product V2 до reconciliation](product/DENTMARKET_PRODUCT_V2.md) | Исходная последовательность восстановления; текущие продуктовые правила остаются в активном Product |
| [Backend audit 2026-09-08](backend/DENTMARKET_BACKEND_AUDIT_2026-09-08.md) | Срез кода, технический долг и прежняя приоритизация |
| [Project state 2026-09-08](governance/PROJECT_STATE_SNAPSHOT_2026-09-08.md) | Неизменённый срез среды/проверок, не нынешняя ветка или readiness |
| [B4.5 security audit](governance/SECURITY_AUDIT_B4_5_2026-08-19.md) | Findings/remediation и исторический dependency checkpoint |
| [R2E report](governance/SECURITY_R2E_2026-08-20.md) | Complete scan на 8f450ea, не на текущем HEAD; TAC не выдан |

## Реестр переноса

| Старый пункт / ограничение | Текущий адрес и решение |
| --- | --- |
| B0.1–B0.6, B1.1–B1.2, B2.1–B2.4, B3.1–B3.3 | Завершённые локальные slices → baseline Acceptance; регрессии сохраняются |
| B4.1–B4.5 и R1/R2/R3, CWE-319, monetary integrity | Исторические выполненные исправления → baseline; не запускать заново по старому указателю |
| B4.6 local single/multi-instance | Завершённый baseline → load runbook; новая цель только остаток POST-BE.2 |
| B4.6 managed Redis/длительный soak | Открыто → POST-BE.2; не превращено в X |
| B5.1–B5.3 | Открытая финальная frontend-приёмка; частичные slices сохранены как доказательства, не полный DoD |
| Agreement discrepancy / P0.1 | CORE-01 для внутренних контрактов; legal approval и удаление production gate только после EXT decision |
| Payment / off-platform / документы оплаты | CORE-02; live PSP отдельно EXT; billing платформы не смешивать с оплатой товара |
| Delivery closure/POD, локальный cancel/expiry/reorder | CORE-03; перевозчик и реальные provider refund только EXT |
| CSV завершён; XLSX/manual/quality/matching/media payload gaps | CORE-04; реальный supplier whitelist/права и SKU freshness — POST-BE/EXT |
| Registration, recovery, membership, permissions | CORE-05; live delivery/social provider — EXT |
| Correction queue, daily operator workflow, missing adapter | CORE-06 и POST-FULL; существующий защищённый replay не переписывать |
| Product metrics / search quality | CORE-07 и CORE-04; внешний analytics provider не добавлять |
| API contract gaps, lint, npm/pnpm, request budgets | CORE-08.1–04; выполненные parser bounds и HTTPS сохранены |
| Swagger exposure, production+pilot mismatch | CORE-08.5 + POST-BE configuration acceptance; не ослаблять guards |
| Большие services / концентрация сложности | Только scoped refactor внутри CORE use case с тестом; не отдельный массовый rewrite |
| Gate 0 runtime choice, Docker, fresh CI/branch protection, offline/cache | POST-BE.1; npm ci canonical, полностью offline build только при отдельной необходимости |
| Restore/PITR/S3 retention/alerts/observability rerun | POST-BE.3; managed provider evidence отдельно EXT |
| Partial release внешнего резерва | EXT supplier orchestration; локальная компенсация CORE-03 |
| PSP/ЭЦП/legal/1С/МойСклад/custom/email/SMS/provider receipts | EXT; все ограничения сохраняются, текущая core-итерация их не исполняет |
| 10 активных клиник, 20 заказов, повтор, один live канал | Успех реального пилота Product §17, не условие закрытия локальной разработки |
| Optional modules и расширенная демонстрация | DEMO-01; запрос перечня не включил runtime; собственная приёмка каждого блока |
| P2 API lifecycle, event compatibility, retention/PII, big migrations, worker budgets | Отложено после core/pilot foundation; перечислено в Foundation §5, не объявлено выполненным |
| Старые «следующие B4.3/B4.4/B4.6 с нуля» | Устаревшие указатели, не задачи; следующий активный ID — CORE-01.1 |

## Что не архивируется как «завершённое»

Действующие Product, Foundation, Acceptance, AGENTS, Workflow, UI standards,
ADR, schemas/API-client, эксплуатационные и integration runbooks остаются
активными источниками правил. Окончание имплементационной фазы не делает
инструкцию эксплуатации или архитектурное решение ненужными.

Оригинальные пути четырёх разовых отчётов сохранены как короткие указатели,
чтобы старые ссылки не потерялись. Старые audit counts, pnpm commands и
security results не используются как свежие факты. Архив не содержит новых
секретов, runtime output или customer data.
