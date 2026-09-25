# DentMarket KZ — фундамент backend V2

Статус: активная очередь незавершённых работ. Reconciliation: 2026-09-14;
очередь исправлений аудита добавлена 2026-09-15 (§8).
Кодовый baseline: 3d644963ed72f99a100e180db2d373bc5abeaef9,
ветка codex/frontend-pilot-composition. Reconciliation baseline был docs-only;
последующая активация DEMO-01 и её проверки учитываются отдельно в Acceptance Matrix.

## 1. Решение владельца и границы текущей итерации

Уточнение 21.09.2026: владелец утвердил компактный B2B-состав и правила
[Product V2 §22](../product/DENTMARKET_PRODUCT_V2.md#22-утверждённый-состав-b2b-и-правила-кабинетов--2026-09-21).
Фиксация — docs-only, реализация этих изменений не начата. Текущие флаги
DEMO-01 не определяют новую границу продукта; сопоставление с CORE ниже (§4.1).

По запросу владельца от 2026-09-14 сейчас завершаем **ядро и внутренние
backend-сценарии локально, без подключения внешних сервисов**.

- Сохраняем TypeScript, npm workspaces, NestJS modular monolith, PostgreSQL/Prisma,
  API/worker, общие Zod/OpenAPI/api-client контракты.
- Не подключаем PSP, 1С, НУЦ РК/ЭЦП gateway, СДЭК/других перевозчиков,
  МойСклад, внешние email/SMS и новые сервисы.
- Сохраняем уже существующие adapters и security guards; не удаляем их и не
  подменяем mock-успехом реальное подтверждение оплаты/подписи/доставки.
- Редизайн, инфраструктурный запуск и live acceptance не входят в backend-итерацию.
  Отдельно владелец разрешил DEMO-01: включение пяти существующих optional
  блоков в локальном launcher, без новых интеграций и без изменения CORE-09.
- Итоговый ручной/browser сценарий от регистрации до повторной закупки
  выполняется **после backend и frontend** (POST-FULL).
- Приёмка окружения, данных и release candidate выполняется **после backend**
  (POST-BE). Web acceptance внутри релиза требует также готового frontend.
- Unit, PostgreSQL, contract и затронутые regression gates выполняются
  **в каждой фазе сразу**. Отложена итоговая приёмка, не безопасность разработки.

Продуктовые требования: [Product V2](../product/DENTMARKET_PRODUCT_V2.md).
Правила выполнения: [Development Workflow](../governance/DEVELOPMENT_WORKFLOW.md).
Статусы и доказательства: [Acceptance Matrix](../governance/PROJECT_ACCEPTANCE_MATRIX.md).

## 2. Завершённый baseline — не очередь на переписывание

Подробные выполненные чек-листы B0.1–B0.6, B1.1–B1.2, B2.1–B2.4,
B3.1–B3.3, B4.1–B4.5, monetary integrity и pilot composition вынесены в
[архив](../history/archive/2026-09-14/README.md). Их проверенные инварианты
сохраняются regression-тестами, а не реализуются повторно.

B4.6 завершён **только в локальной части**. Его production-остаток не закрыт
и перенесён в POST-BE. B5.1–B5.3 имеют частичные/локальные доказательства,
но не объявлены полностью завершёнными и остаются в отложенной frontend-очереди.

Проверенный baseline включает cart reprice, точные денежные значения,
checkout/idempotency/локальные резервы, supplier confirmation, отгрузку,
документолог, CSV review/publication/rollback, outbox/DLQ, tenant isolation и
HTTPS policy. Архивная отметка не сертифицирует текущий dirty checkout.

## 3. Итоговая реализация ядра

Клиника и поставщик должны выполнять локальную закупку без обязательного
обращения к внешнему провайдеру:

1. Пользователь входит в свою организацию с минимальными правами.
2. Поставщик создаёт/импортирует предложения; публикация требует действующего
   договора с площадкой и прохождения остальных операторских gates.
3. Клиника сравнивает упаковки/цены/свежесть, принимает reprice и оформляет заказ.
4. Поставщик подтверждает количество; система согласованно меняет сумму и резерв.
5. Счёт, заявка на ручное подтверждение оплаты и решение оператора имеют разные
   состояния. Имитация оплаты маркируется отдельно.
6. Поставщик исполняет заказ; получение и частичная доставка фиксируются
   контролируемыми переходами, а не произвольным редактированием статуса.
7. Обе стороны видят разрешённые документы, версии, суммы и события.
8. Повторная закупка создаёт новую корзину с текущими условиями, не копирует
   старый резерв, платёж или подтверждение цены.
9. Оператор обрабатывает исключения через защищённые операции, без SQL-правок.
10. Метрики показывают внутренний результат, отдельно от demo/live evidence.

Это **целевой результат**, не заявление о полной реализации каждого пункта.
Очередь ниже содержит недостающие контракты, реализацию и доказательства.
Перед каждым подпунктом проверяем существующий путь; уже работающий код
сохраняем. Один подпункт с единым инвариантом — отдельный связный change set.

## 4. Активный backend backlog — только незавершённое

Это очередь outcomes, не автоматическое поручение исполнить весь файл.
Выбирается последний явно разрешённый подпункт/последовательность. До кода
требуется brief существующей реализации и конкретного пробела; работающий
baseline не переписывается ради нового task ID. DoD доменной фазы ниже относится
к изменению/приёмке её логики, а не к docs-only карточке решения. Пределы попыток,
проверки и условия reuse — Workflow §4; один и тот же gate не запускается
отдельно для каждого документа, в котором он упомянут.

### 4.1 Уточнение утверждённых требований — 2026-09-21

Это привязка одного принятого решения к существующей очереди, не второй backlog
и не поручение выполнить все CORE. Сначала проверяются существующие контракты
и конкретный пробел; принятые slices не переписываются и не теряют evidence.

| Требование Product §22 | Где учитывать при реализации | Достаточные дополнительные доказательства по риску |
| --- | --- | --- |
| Roadmap поставщика, обязательный договор, минимальная анкета клиники | CORE-01/05 | Tenant/permissions, отрицательные publication cases; upload не равен принятию договора |
| Остаток ERP, лимит площадки, режим цены, 60-секундное обновление корзины | CORE-03/04, B5; ADR 012 | Core contract, PostgreSQL для резервов/конкуренции/replay; UI reprice и согласие с новой версией |
| Мастер-карточки, запрет публичных дублей, модерация фото/характеристик, Excel/CSV | CORE-04 | Matching/variant/pack fixtures, import preview/publication, сохранность raw и истории |
| Общая сущность акции: параметризуемое N + M и скидка на товар; «3 + 1» — пример | CORE-03/04, B5 | Сначала контракт условий/скидки/подарочных строк/отмен/частичного исполнения; точные суммы, обязательный резерв всех товаров заказа, включая подарки, revalidation, idempotency, tenant; cases 1 + 1 / 2 + 1 / скидка, PostgreSQL и affected UI flow |
| Рабочий колокольчик, задачи, споры/апелляции, аудит | CORE-06 | Адресат/tenant, переходы/история, отсутствие маркетингового потока, replay без дубликатов; расширенный публичный trust не требуется |
| Продажи/закупки по сторонам, оборот, комиссии и задолженность | CORE-07 | Известные fixtures/period/timezone, один заказ один раз, отмены/возвраты, начислено отдельно от получено; расчёт комиссии только после определения её правил |
| Компактные кабинеты, вложенные настройки, документы, витрина/список акций | B5.1–B5.3 | UI стандарт, role/route inventory, affected verify:web; полный POST-FULL после готовности |

AI, smart recommendations, подписки и платная реклама отложены; базовая акция
не разрешает включить целиком optional promotions/billing/trust. Требуется
явно согласовать реализацию composition с Product, текущие runtime flags здесь
не меняются. Интеграции ERP/перевозчиков/Google Sheets остаются EXT.
Существующая схема платежа CORE-02 не считается утверждённой от выбора комиссии;
10% не является тарифом. Общие gates любой будущей TS-задачи — Workflow/AGENTS.
Здесь нет новых runtime PASS и закрытых чекбоксов.

### CORE-01 — договорный контракт и внутренний допуск

Уточнение 22.09.2026: владелец поручил реализацию общего версионного акцепта
поставщика и отдельного операторского допуска по Product §9.7 / ADR 013.
Пустые legal-страницы остаются DRAFT; ЭЦП и новый индивидуальный договор
исключены из подключения. История старых договоров сохраняется. Акцепт, проверки
организации/полномочий, новый статус допуска, publication/search/checkout gates
и download snapshot требуют фактических schema/API/PostgreSQL/browser проверок.
Текущий WIP и evidence — PRIMARY-SESSION; CORE-01 не объявлен закрытым.

Решение владельца 2026-09-14: действующий договор площадка–поставщик обязателен
до публикации; optional относится только к buyer–supplier framework agreement.
CommerceService assertActive marketplace agreement сохраняется и соответствует
Product V2. Открыта полнота versioned acceptance и доказательств допуска,
а не повторное обсуждение обязательности договора.

- [ ] CORE-01.1: согласовать task card/decision: версия оферты, actor,
  organization, время, основание заказа ONE_TIME/FRAMEWORK_AGREEMENT,
  повторный акцепт и поведение при истечении договора.
- [ ] CORE-01.2: сверить storage/API acceptance и реализовать только пробелы
  общего контракта; неизменяемая история, стороны и permissions.
- [ ] CORE-01.3: доказать локальные правила допуска и отказа: отсутствующий,
  неподписанный, истёкший/чужой договор блокирует публикацию; действующий допускает
  только при прохождении остальных gates. Использовать явно тестовые agreement
  fixtures; не обходить обязательный договор ни в demo, ни в production.
  Файл договора/галочка/fixture не становятся квалифицированной подписью.

Scope: [agreements](../../apps/api/src/modules/agreements/),
[buyer-supplier-agreements](../../apps/api/src/modules/buyer-supplier-agreements/),
[onboarding](../../apps/api/src/modules/onboarding/), commerce, documents, schemas.
DoD: unit + PostgreSQL negative tenant/replay/stale-version cases, core contract.
Stop: неизвестна сторона акцепта; предлагается без решения отключить legal gate.
Юридическое утверждение production-модели остаётся EXT, но не блокирует
разработку независимых частей ядра.

### CORE-02 — внутренний платёж по счёту без PSP

Исходное состояние: payment intent зависит от provider/merchant accounts;
mock capture существует. Отдельный принятый end-to-end manual/off-platform
settlement contract не подтверждён. Загрузка квитанции сама по себе не оплата.

- [ ] CORE-02.1: согласовать минимальную модель: invoice → payment claim →
  operator review → accepted/rejected; имена состояний здесь концептуальные,
  не новые утверждённые Prisma enums.
- [ ] CORE-02.2: protected API заявки и решения, сумма KZT в minor-unit string,
  ссылка на конкретный supplier order и подтверждение, actor/time/reason,
  optimistic version, idempotency и audit/outbox.
- [ ] CORE-02.3: при принятии атомарно согласовать payment/order/document
  snapshots; не требовать фиктивного merchant onboarding, не создавать
  PSP capture, платформенную комиссию или payout ради ручного платежа.
- [ ] CORE-02.4: negative cases: другой tenant, повторное решение, двойной
  учёт, неверная сумма/валюта, отменённый заказ, подмена документа.
  Для первой версии предлагается принимать только полную сумму одного
  supplier order; частичную/избыточную оплату явно отклонять до отдельного
  согласованного правила, а не молча помечать заказ оплаченным.

Scope: [payments](../../apps/api/src/modules/payments/), commerce, documents,
shared schemas/api-client. Расширять текущую модель только после проверки её
инвариантов; не создавать параллельный несогласованный ledger.
DoD: unit + HTTP/PostgreSQL на изолированных fixtures, core contract,
order/document regression. В proof явно указано manual/test, не bank verified.
Stop: paid статус появляется от upload или pending, чужого решения,
неподтверждённого mock/provider результата либо двойного запроса.

### CORE-03 — завершение заказа, локальные компенсации и повторная закупка

Исходное состояние: confirmation/dispatch проверены, logistics уже содержит
delivery transitions и proofOfDelivery. Наличие этого кода не доказывает весь
цикл. Отдельный принятый reorder API в просмотренном commerce controller не найден.

- [ ] CORE-03.1: delivery closure/partial delivery: permissions сторон,
  допустимые переходы, количества по строкам и нескольким отгрузкам,
  actor/evidence, согласованные order totals/statuses; повтор и stale conflict.
- [ ] CORE-03.2: отмена до оплаты и истечение локального резерва: единственное
  освобождение balance/lot, гонки с confirmation/payment/worker, причина и
  уведомление. Существующую компенсацию checkout не переписывать.
- [ ] CORE-03.3: определить разрешённое действие после оплаты/отгрузки:
  контролируемый запрос/операторское решение или явный отказ в неподдержанном
  состоянии; не заявлять реальный refund без подтверждения. Автоматические
  возвраты денег, перевозчик и большой claims-модуль не входят в итерацию.
- [ ] CORE-03.4: повтор заказа создаёт новую корзину с текущими offer/pack/price/
  stock, явным списком недоступных позиций и обязательным revalidation;
  исходные order/payment/reservation snapshots неизменны.

Scope: [commerce](../../apps/api/src/modules/commerce/),
[logistics](../../apps/api/src/modules/logistics/), inventory, documents.
DoD: state-machine unit tests, PostgreSQL concurrency/rollback/tenant,
core contract и существующие Flow B2 regressions при изменении критического UI flow.
Полный объединённый пользовательский прогон остаётся POST-FULL.

### CORE-04 — полнота локального каталога и файлового импорта

Local PASS25.09.2026; [evidence и ограничения](../governance/task-state/CORE-04-2026-09-25.md).
Публикация/CI отслеживаются отдельно; demo не означает live readiness.

CSV staging/review/publication/rollback уже baseline; новый parser не нужен
без доказанного недостатка. XLSX предусмотрен продуктом, но его полный путь
нельзя объявлять завершённым по наличию parser unit tests.

- [x] CORE-04.1: проверить manual offer create/update и XLSX через тот же
  preview → validation → matching → review → publication → rollback contract.
- [x] CORE-04.2: контрольные 50 поисковых запросов, 100–200 размеченных import
  строк; явно согласовать search/matching thresholds до отметки готовности.
- [x] CORE-04.3: проверить canonical/variant/pack/UOM/media/source/freshness
  contract для frontend; stale/blocked/no-offer честно недоступны к покупке.
- [x] CORE-04.4: внутренний quality report по набору 500 demo-карточек/500
  offers: counts, дубли, цена/остаток/единицы, происхождение изображений,
  различие 50 buyable products и полного fixture. Не считать demo data live.

Scope: catalog, offers, pricing, inventory, search, imports/moderation, schemas.
DoD: contract + PostgreSQL и существующий Flow B3; bounded malformed/large-file
tests и сохранение raw/rollback evidence. Не добавлять OCR/PDF product scope.
Реальный whitelist и согласование прав на supplier media — POST-BE/EXT.

### CORE-05 — внутренний жизненный цикл доступа

Auth/session/authority security regressions уже существуют; задача не
переписывает auth и не подключает социальный вход или внешнюю доставку email.

- [ ] CORE-05.1: локально подтвердить registration → verification → membership/
  organization selection → login/logout/revoke; истёкшие и повторные tokens,
  приглашения, смена роли и отключение участника.
- [ ] CORE-05.2: recovery/token flow проверять контролируемым test transport;
  не публиковать reset tokens и не превращать тестовый способ в production API.
- [ ] CORE-05.3: повторно проверить минимальные buyer/supplier/accountant/
  receiver/operator permissions для новых CORE endpoints, documents и audit;
  внутренние MFA enrollment/challenge/recovery ограничения также остаются core.

Scope: identity, onboarding, organizations, access-control, schemas.
DoD: unit + negative HTTP/PostgreSQL, platform authority, rate-limit/auth и
локальный verify:security gates;
production prohibition of development headers сохраняется.
Полный browser sign-off ролей — POST-FULL, live email/social providers — EXT.

### CORE-06 — операторские исключения и внутренние уведомления

Защищённый DLQ replay, import review и in-app shipment notification уже baseline.

- [ ] CORE-06.1: подтвердить work-queue/correction-queue: причина, приоритет,
  ресурс, разрешённое действие, история; закрытие проблемы идемпотентно.
- [ ] CORE-06.2: маршруты CORE-02/03 создают одно нужное in-app уведомление;
  read/unread и tenant access согласованы, нет повторных бизнес-эффектов.
- [ ] CORE-06.3: неподключённый внешний канал не блокирует локальную покупку
  и не создаёт бесконечную ошибочную очередь; missing adapter не считается
  доставленным внешним событием. Сохраняется явный trace результата.
- [ ] CORE-06.4: operator path для guarded rollback conflict и проблемного
  заказа без прямых SQL-правок; не добавлять произвольный admin bypass.
- [ ] CORE-06.5: внутренние диалоги по [Product §22.12](../product/DENTMARKET_PRODUCT_V2.md#2212-внутренние-диалоги-покупателя-и-поставщика--решение-владельца-22092026).
  Статус 22.09.2026: requirements approved; implementation not started.
  Проверить tenant/membership access, контекст конкретного supplier offer/order,
  отсутствие дублей при повторном открытии/отправке, персональное прочтение,
  resolve/reopen, доступ оператора через обращение. Сообщение не меняет
  коммерческие состояния. Запись не разрешает реализацию, дополнительные
  runtime-прогоны или смену очереди текущей задачи.

Scope: operations, moderation, notifications, outbox, shared contracts.
DoD: operator/non-operator unit + PostgreSQL, outbox/observability regressions,
идемпотентность и отсутствие секретов в очереди. Daily browser drill — POST-FULL.

### CORE-07 — минимальные метрики продукта

Есть operational metrics и search analytics, но единая принятая схема
продуктовых метрик ещё не доказана.

- [ ] CORE-07.1: определить события и server-side counts: создан/подтверждён/
  получен заказ, повторная закупка, отказ из-за stock/price, сроки подтверждения.
- [ ] CORE-07.2: отделить test/demo от реальных данных, исключить двойной учёт
  при retry/replay, закрепить timezone/window и read permissions.
- [ ] CORE-07.3: защищённая внутренняя сводка/API или воспроизводимый отчёт
  с проверкой расчётов. По решению 21.09 нужен раздел оператора «Аналитика»
  с продажами/закупками по организациям и переходом к заказам (Product §22.10).
  Внешняя аналитическая платформа не требуется; комиссия до решения её базы
  и момента начисления не имитируется готовыми числами.

Scope: audit/outbox/search analytics/operations и schemas; не вводить второй
broker или отдельный аналитический сервис.
DoD: deterministic unit + PostgreSQL aggregates на известных fixtures,
contract test, отсутствие PII/high-cardinality identifiers в metrics labels.

### CORE-08 — полнота core contracts и инженерные ограничения

- [ ] CORE-08.1: довести request/response/error/pagination/money/time/version
  contracts всех используемых CORE-01–07 endpoints, а не всех optional APIs.
- [ ] CORE-08.2: ввести настоящий lint/static analysis и проверить качество
  новых slices; текущий lint=tsc не считать отдельным доказательством.
- [ ] CORE-08.3: завершить npm-only housekeeping: проверить потребителей
  оставшегося pnpm-lock.yaml, затем отдельным change set убрать конкурирующий
  lock-контракт; не обновлять весь dependency graph ради документации.
- [ ] CORE-08.4: проверить route-scoped body/upload limits и memory budget
  локальных импортов. Уже имеющиеся CSV/XLSX/PDF bounds не переписывать;
  оптимизировать только воспроизведённый риск.
- [ ] CORE-08.5: согласовать и проверить server safety независимо от состава
  feature modules, включая Swagger exposure и production+pilot policy.
  Текущее расхождение ADR 009 и environment guard не закрыто этой документацией.

DoD: schema/API-client tests, core contract, relevant config/security regressions,
typecheck/test/build и lint. Architecture decision до cross-cutting изменения.
Разбиение больших services — только внутри конкретного use case с regression;
массовый refactor, API version migration и новый framework запрещены.

### CORE-09 — backend completion checkpoint

- [ ] Все CORE-01–08 имеют scoped accepted outcome или явное решение владельца
  об изменении требований; внешние approvals вынесены в EXT, не подменены pass.
- [ ] На одной backend revision проходят обязательные команды раздела 6,
  новые сценарии и все затронутые регрессии; сохранены результаты и ограничения.
- [ ] Нет известного незакрытого критического риска внутри принятого core scope.
- [ ] Acceptance Matrix обновлена фактическими evidence; backend готов к
  подключению/приёмке frontend, но не объявлен production/LIVE_VERIFIED.

## 5. Отложенные незавершённые очереди

| ID | Когда возвращаемся | Что остаётся |
| --- | --- | --- |
| POST-BE.1 | После CORE-09 | Clean reproducible checkout, npm ci, migration/seed на чистой БД, согласованный локальный/целевой runtime, проверка данных, Docker images/remote CI и rollback release |
| POST-BE.2 / B4.6 | После CORE-09 и выбора целевого окружения | Длительный staging soak, shared Redis failover, SQL/load thresholds на representative hardware; локальный baseline сохраняется |
| POST-BE.3 | После CORE-09; до реального запуска | Monitoring/alerts, storage scanning/access, backup/restore/PITR/retention, recovery drills, release manifest одной revision; внешний provider evidence только в EXT |
| B5.1–B5.3 | Отдельная frontend-очередь | Финальная приёмка Buyer/Supplier/Admin, route completeness, состояния, доступность; локальные уже проверенные feature slices не переписывать автоматически |
| POST-FULL | После CORE-09 и завершённого frontend | Регистрация → импорт/публикация → reprice → split order → full/partial confirmation → manual payment → receipt/closure → документы → повтор; operator exceptions и negative tenant cases; итоговый Playwright/manual sign-off |
| DEMO-01 | Локальная активация проверена 2026-09-14, evidence в Acceptance Matrix §7 | go_live включает все пять блоков, pilot/permissions сохранены. Полнота optional-сценариев, billing UI и единый операторский вход через gateway ещё не приняты; внешние providers не подключены |
| EXT | По отдельному разрешению, вне текущей реализации | PSP, НУЦ РК/ЭЦП/ЭДО, 1С/МойСклад/custom live supplier, перевозчики, email/SMS, legal approvals, реальные org/data, managed infrastructure receipts и live pilot |

POST-BE может готовиться до окончания frontend, но финальный release с web
не принимается без POST-FULL. Live production остаётся NO-GO до своих обязательных
gates; deferred не означает waived. Утверждённый локальный go_live — только
состав модулей DEMO-01, не обход production guards или признак LIVE_VERIFIED.

Детали: [свод скрытых функций](../product/DENTMARKET_OUT_OF_PILOT_FEATURES.md),
[load runbook](../operations/b4-6-load-profile.md),
[live readiness](../operations/live-provider-readiness.md).
После пилота остаются отдельно: широкий API lifecycle, advanced event
compatibility/retention, масштабные migrations и worker/provider performance
budgets. Эти ранее описанные P2-пункты не потеряны и не входят в CORE-09.

## 6. Проверки и правило завершения

Матрица каждой изменяемой фазы выбирается по [Workflow](../governance/DEVELOPMENT_WORKFLOW.md)
§4. Для TS сохраняются npm run typecheck; npm test; git diff --check;
для purchase contract — core-contract; для Prisma/checkout/tenant/rollback —
postgres; для полного purchase outcome — pilot-backend. Эти scripts могут
создавать fixtures/заказ: только в проверенной disposable test DB с cleanup.
Docs-only задача не запускает этот runtime набор и не повышает runtime статус.

По риску: npm run verify:runtime-split; npm run verify:outbox;
npm run verify:observability; npm run verify:platform-authority;
npm run verify:rate-limit-auth; npm run verify:production-config;
npm run verify:outbound-security; npm run verify:security-storage.
Prisma change дополнительно требует prisma validate и чистый upgrade-path.
Changed critical UI flow требует соответствующего Flow A/B2/B3 или verify:web,
даже если объединённая приёмка POST-FULL запланирована позже.

CORE-09 минимум: typecheck, test, build, настоящий lint, core-contract,
postgres, pilot-backend, runtime-split, outbox, observability, production-config,
rate-limit-auth, platform-authority, security, security-storage, outbound-security,
pilot-composition и production dependency audit. Конкретные новые тесты
регистрируются при реализации; несуществующие verify aliases не объявляются.

Красный обязательный gate → остановить фазу, классифицировать причину и
следовать bounded retry Workflow §4.3, не бесконечно «чинить и повторять»;
не переходить дальше и не ставить X. В завершённой карточке сохранять
commit/date/commands/results/limitations. Затем переносить её evidence в
историю; baseline регрессии остаются действующими.

## 7. Следующая точная задача

Текущий запрос 15.09.2026: разложить аудит на технические документы и начать
исправления. **AUD-FIX-01 и AUD-FIX-02 приняты** в своих границах; evidence в
Acceptance Matrix §9, auth state/БД/web UI в этих двух fixes не менялись.
**AUD-FIX-03.1 / UX-21 — единый серверный logout принят 15.09.2026**:
общий helper/hook, ошибки и повтор, две вкладки, настоящий JWT revoke/refresh deny.
**AUD-FIX-03.2: protected registration resume — ACCEPTED 15.09.2026**,
[execution brief](AUDIT_ACCESS_REMEDIATION_2026-09-15.md#3-aud-fix-03--восстановление-регистрации-и-единый-выход-p1-core-05).
Регистрация/resume и остальные подпункты выполняются последовательно,
не параллельно автоматически. После отдельного разрешения исправлен конкретный
web blocker: same-tab hash-navigation открывает нужную заявку, смена proof
сбрасывает прежнее состояние и не принимает late inspect response.
Typecheck/unit/landing build/scoped Playwright5/5 PASS; DB readback каждой роли
подтвердил один user/org/membership/audit/outbox. Неизменённые API/PG/authority/
rate-auth evidence переиспользованы. История трёх web failures не стёрта;
после разрешённого fix новый web запуск прошёл с первой попытки. Acceptance §9.
**AUD-FIX-03.3: локальная доставка и штатный операторский вход принят 15.09.2026**.
Standalone startup probe второго checkout прошёл с тем же20s deadline; затем
local-auth browser3/3, resume browser5/5, final E2E typecheck и visual5screens PASS.
Прежние root/API/DB/config/authority/build evidence переиспользованы без повторов.
Failed history сохранена, доказанная причина ранних startup timeouts не заявлена.
**AUD-FIX-03.4 / AUTH-ORG-LOOKUP-01 принят15.09.2026:** после явного возобновления
с checkpoint уточнён только negative E2E alert locator. Negative case PASS1/1,
operator/shared fixture regression PASS3/3, final E2E typecheck PASS. Own-context
API/schema/client, landing и runtime protections не менялись; API/DB17, root
test/typecheck, три production builds и два positive handoff PASS переиспользованы.
Общий AUD-FIX-03 принят в границе четырёх audit fixes, не весь CORE-05/security.
История трёх ранних failures, паузы и итоговые inputs — Acceptance Matrix §9.
**AUD-FIX-04: явная коррекция корзины принят16.09.2026.** Scoped browser3/3,
реальные API/DB readbacks и visual4screens подтвердили explicit edit/remove,
reprice acceptance, draft/conflict recovery, keyboard/mobile. UI-PORTAL-01
исправлен минимальным общим CSS guard;110frontend tests/typecheck и4web builds
PASS, неизменённые backend/PG/core-contract evidence REUSED_PASS.
**AUD-FIX-05 принят16.09.2026 после bundle remediation**: same-offer package/unit
prices, exact money, reset/URL/history/pagination/race/retry и supplier fallback.
Корзина загружается при открытии, её validation сохранена. Buyer bundle PASS:
1,124,722raw/340,070gzip; Supplier bundle PASS. Финальные typecheck15/15,test14/14,
scoped catalog6/6 и cart regression3/3 на новой Buyer сборке, API/DB readback,
visual и integrity PASS. История преждевременной приёмки/404/test-precondition
сохранена в Matrix, budgets не увеличивались. **AUD-FIX-06 принят16.09.2026**
после отдельно разрешённого bounded resume. Diagnostic доказал: disabled submit
уводил фокус в BODY, после409 submitLock уже false, Escape не достигал dialog.
Минимальный fix возвращает фокус к сообщению ошибки после завершения запроса;
success path, общие dialog/guards/API/деньги не менялись. Supplier TS/43tests,
E2E TS, isolated build/bundle PASS. Один targeted run conflict+snapshot2/2 PASS:
Escape/trigger/reopen, причина и quantity сохранены; новый snapshot требует
явного restart (помеченная UI simulation, real DB no-write readback).
5сценариев покрыты совокупно:3ранее принятых неизменённых outcomes +2fresh,
не новый aggregate5/5run. Audit/outbox не дублируются, исторические суммы и
резервы сохранены. Причина старого startup timeout не доказана; её не выдаём
за исправленную. История attempts/API-only diagnosis остаётся в Matrix.
Закрыто6из9 основных AUD-FIX. Внутри07(документолог) slice07.1 ACCEPTED16.09:
exact money/upload, восстановление native file/draft и feedback/focus проверены.
Разрешённый isolated generated-types repair, workspace TS,594unique unit tests
(146fresh после финальной UI-правки +448reuse), два build/bundle,3/3browser PASS.
Полный07 открыт: связи/lookup, navigation/detail/accounting errors, demo marking.
07.2 ACCEPTED16.09: readable selectors, independent base/order tenant validation
и guard копирования новой версии.24JWT/PG cases и полный verify:postgres PASS;
TS/617units/builds и final browser5/5 PASS. История blocker/probe сохранена в Matrix;
07.2[x],07parent[ ], payment lookup/navigation/accounting/demo marking ещё открыты.
08–09 не начаты. История предыдущих failures и evidence — Matrix §9.
История failures и ограничения приёмки — Acceptance Matrix §9.

После приоритетных audit fixes остаётся **CORE-01.1 — task card договорного допуска и локального режима без НУЦ РК**:
сверить существующие acceptance/agreements/commerce contracts, зафиксировать
наблюдаемые local outcomes и полноту акцепта с уже обязательным договором
площадка–поставщик. Не снимать agreement gates. Затем CORE-02.1 — принять контракт оплаты по
счёту без PSP. Это входные решения ядра, не новый аудит всего репозитория.

## 8. Исправления аудита закрытого пилота — 2026-09-15

Единственная очередь и чекбоксы remediation. Три linked briefs ниже содержат
поведение, scope и тесты, но не дублируют статусы. Evidence — Acceptance Matrix §9.
Приоритет — security/доступ и достоверность закупки, затем локальная полировка
текущего UI. Для исторической итерации 15.09 полный редизайн был отменён;
решение 21.09 о новом составе и направлении не пересертифицирует AUD evidence.
Существующие CORE/B5 не закрываются от создания документов или одного fix.

- [x] AUD-FIX-01: HTTP log redaction — AUTH-LOG-01, P1; CORE-08.
  Принят 15.09.2026: focused 10/10, API 205/205, typecheck/test/diff и docs gates;
  полные CORE-08/security/production gates этим не закрыты.
- [x] AUD-FIX-02: читаемый PDF — DOC-04, P1; документолог.
  Принят 15.09.2026: владелец согласовал Noto Sans только для PDF; renderer8/8,
  API211/211, typecheck/build, compiled PDF/визуально3страницы, docs/diff gates.
  Старые документы не перегенерированы; qualified signature/legal acceptance не заявлены.
- [x] AUD-FIX-03: единый logout, protected registration resume и локальная
  доставка/операторский вход — UX-20/21, audit:DEMO-01/03; CORE-05.
  Принят15.09.2026 после четырёх slices ниже; полный CORE-05/production не закрыт.
  - [x] AUD-FIX-03.1 / UX-21: server logout; typecheck/test, обе web-сборки,
    scoped Playwright6/6 (4UI-only +2JWT), readback2/2REVOKED, diff/docs gates.
    Cookies/CSRF/tenant guards сохранены; это отдельное evidence logout slice.
  - [x] AUD-FIX-03.2: защищённое продолжение регистрации — UX-20.
    ACCEPTED 15.09.2026: API/DB/authority/rate-auth evidence; финальные typecheck,
    unit (включая4fragment regressions), landing build, scoped Playwright5/5,
    readback2/2 без дублей, docs/diff/integrity. Смена proof изолирует UI state;
    существующие password/MFA/tenant/agreement ограничения сохранены. Не полный CORE-05.
  - [x] AUD-FIX-03.3: локальная доставка и штатный операторский вход — audit:DEMO-01/03.
    ACCEPTED15.09.2026: full serial test graph14/14, typecheck, API/PG/MFA15/15,
    config/authority/rate, resume API10/10, landing/admin build и admin bundle;
    local-auth web3/3, resume web5/5, final E2E typecheck и visual5screens PASS.
    Scope только local auth; main demo flags и production policy не включались.
  - [x] AUD-FIX-03.4: AUTH-ORG-LOOKUP-01 — восстановить штатный переход после
    password login клиники/поставщика через разрешённый organization context;
    не подменять его operator-only API. Разрешено15.09.2026 как блокер плана.
    ACCEPTED15.09.2026: negative UI1/1, operator regression3/3 и final E2E
    typecheck PASS после разрешённого locator fix. API/DB17, normal tenant UI2,
    root test/typecheck и3web builds REUSED_PASS. Diff/docs/integrity evidence;
    история неудач сохранена, закрытие не означает полную приёмку кабинетов.
- [x] AUD-FIX-04: явная коррекция корзины — UX-02, P1; CORE-03/08.
  ACCEPTED16.09.2026: PATCH/DELETE с expectedVersion, прежней ценой и CAS;
  явные edit/remove, recovery без потери draft, новый акцепт после коррекции.
  Scoped Playwright3/3 (desktop1440/mobile390, keyboard, real API/DB), visual4,
  typecheck15/15,110frontend tests,4production builds и docs/integrity PASS.
  Final PG5groups/core-contract21/backend units REUSED_PASS по hashes.
  Реальный UI-PORTAL-01 исправлен и покрыт regression; тестовая потеря HTTP-ответа
  явно simulated, commit настоящий. История failed attempts/flaky PDF сохранена.
  Это не полный CORE-03/08, общий verify:web или production/security acceptance.
- [x] AUD-FIX-05: package/unit price, reset и pagination — UX-01/03/04,
  согласованность demo packaging; CORE-04/B5.
  ACCEPTED16.09.2026 после исправления bundle blocker без повышения лимитов.
  Финальный catalog browser6/6 +cart regression3/3, Buyer/Supplier bundle PASS,
  typecheck15/15/test14/14, compiled artifacts и source hashes — bundle-integrity.
  HEAD3d64496 + immutable dirty input manifests/evidence
  AUD-FIX-05; точные price/packaging/offer labels, URL/reset/history/pagination,
  latest-request-wins/error retry. Typecheck15/15, root tests14/14 (API274,
  buyer65,supplier24),2production builds,6unique scoped browser cases и readbacks
  PASS; repeated test attempts не скрыты, итоговая сборка проверена заново. Основной UI
  сохранён; фикстуры только audit DB,107собственных offers retired/22sessions revoked.
  Начальный URL q после JWT в root catalog не сертифицирован; общий verify:web,
  CORE-04,POST-BE/POST-FULL и production остаются отдельными задачами.
- [x] AUD-FIX-06: pending/partial статусы, сохранность confirmation draft —
  UX-09/14; отдельно достижимость RISK-01; CORE-03/B5.
  ACCEPTED16.09.2026. Pending warning исправлен; draft close/reopen,
  submitting guard, точный BigInt preview и truthful rejection реализованы.
  Success focus перенесён в surviving order list после browser regression.
  Root typecheck15/15 и tests14/14 PASS; финальные Supplier TS/43tests/build/
  bundle PASS, неизменённые Buyer71tests/build/bundle REUSED_PASS.
  Browser full/partial/rejected REUSED_PASS: реальный readback,
  exact суммы/резервы, same-decision retry без audit/outbox дублей.
  После bounded diagnostic и error-focus fix один targeted run2/2 PASS:
  настоящий409, автоматический focus, Escape/trigger/reopen, quantity/reason;
  simulated new snapshot блокирует stale draft до explicit restart без DB writes.
  Итого5unique cases:3REUSED_PASS+2freshPASS, не новый полный5/5run.
  Evidence/checkpoint: Matrix §9 и remediation/AUD-FIX-06/checkpoint.md.
  Final Supplier TS/43tests/build/bundle +E2E TS PASS. Buyer/API/PG/core-contract
  inputs unchanged; reuse обоснован узким error-only effect. История3failures,
  startup timeout/API-only diagnosis сохранена; причина старого timeout unknown.
  Скриншоты и real readbacks проверены; own offers retired/sessions revoked,
  письма удалены; demo DB/чужие процессы/права не менялись. Production не принят.
- [ ] AUD-FIX-07: документные связи/сумма, ошибки, навигация/focus/file label,
  demo marking — UX-06/10/15/16/17, DATA-01, audit:DEMO-02; CORE-01/02/B5.
  - [x] AUD-FIX-07.1: суммы и форма загрузки — ACCEPTED16.09.2026. Ввод/показ
    в тенге (`1,25 ₸`), exact minor transport/storage (`125`), Decimal20 bound;
    file label/format/size, native file/draft retention, pending lock и error focus.
    Разрешённый repair только isolated generated types, TS equivalent PASS;
    594unique unit tests (146fresh +448reuse после final UI change), Buyer/Supplier
    production build/bundle PASS; последний real-JWT browser run3/3 PASS16.0s.
    Реальные201/403/409, две сохранённые суммы, file hash/download, по1audit/outbox;
    keyboard/focus и390px supplier viewport. История3TSFAIL, locator FAIL и
    visual correction native file feedback сохранена, не объявлена первым pass.
    Test DB только dentmarket_audit_20260914, own sessions revoked/mail cleaned;
    synthetic docs/files retained. Main dev/рабочая demo DB не менялись.
    Не повторять неизменённые gates07.1; evidence Matrix §9/accepted-inputs.
  - [x] AUD-FIX-07.2: выбор заказа/основного договора по номеру/контрагенту —
      ACCEPTED16.09.2026. Existing API, поиск/empty/error/403, обязательный договор
      только для допсоглашения, optional order и сохранение выбора/черновика.
      Исправлен BLOCKER-01: собственный заказ не разрешает чужой договор и наоборот;
      shared upload/generate validation применяется также к копированию новой версии.
      Допустимые draft/исторические ссылки и publication agreement gate сохранены.
      24real-JWT PostgreSQL cases PASS, полный verify:postgres PASS;11workspace
      typechecks с reuse неизменённых входов,617unique units (153fresh+464reuse
      после width fix), две production build/bundle PASS; browser attempt2 —5/5
      PASS27.3s, включая три затронутые07.1 regressions. Desktop1440×900/mobile390×844,
      keyboard/focus, actual201/403/409, DB/audit/outbox/file checksum readback.
      Длинные названия больше не расширяют форму;5final screenshots просмотрены.
      История initial probe FAIL, launcher/import/locator ошибок не удалена.
      Evidence Matrix §9 / relations/accepted-integrity.json. Main/demo неизменны;
      own sessions/mail cleaned, synthetic fixtures retained; no commit/push.
  Payment/refund lookup, navigation/detail/accounting errors, demo marking ещё
    не начаты;07parent безX.07.2 завершён, следующий slice отдельно согласовать.
- [ ] AUD-FIX-08: field help, честные admin states/search, responsive fixes —
  UX-05/07/08/11/12/13/18/19; B5.1–B5.3.
- [ ] AUD-FIX-09: недостающее targeted покрытие после исправлений; итоговые
  POST-BE/POST-FULL сохраняют отдельные prerequisites, не выдаются за PASS.

Спецификации:

- [Доступ, регистрация и log security](AUDIT_ACCESS_REMEDIATION_2026-09-15.md).
- [Закупка, каталог и документолог](AUDIT_PURCHASING_DOCUMENTS_REMEDIATION_2026-09-15.md).
- [Полировка UX и остаток покрытия](../ui-ux/AUDIT_UX_POLISH_2026-09-15.md).

Каждый compound пункт делится на минимальные slices в своём brief. X означает
выполнение всех применимых требований и gates пункта, не начало реализации.
NOT_RUN/BLOCKED исходного аудита не означает отсутствующий код и не разрешает
создать новую функцию. Audit:DEMO-01/02/03 — IDs аудита, не переопределение
основного DEMO-01 local full-feature состава. Внешние интеграции, redesign,
рабочая БД, зависимости и commit/push вне текущего разрешения.
