# DentMarket KZ — матрица фактической готовности

Операционное дополнение24.09.2026 — ORGANIZATION-READY, **локальные проверки пройдены**:
анкета с юридическим адресом и адресом доставки, серверная готовность/допуск,
выбор кабинета и переходы реализованы локально на main4cd87a5 + dirty scope.
Typecheck12/12, API370 unit, regular browser42 и supplier-terms browser/JWT5 PASS.
Buyer order-profile timeout5s закрыт разрешённым isolated retry2/2; остальные
unit results REUSED_PASS по входам. PostgreSQL3, core-contract, runtime и
auth/authority PASS; review и отдельный CI fixture environment regression PASS.
Это локальная приёмка с сохранённой историей transient failure. Публикация/actual CI
проверяются отдельно и не подразумеваются локальными PASS.
Точные входы, история попыток, дополнительные gates и ожидаемое решение —
[PRIMARY-SESSION / ORGANIZATION-READY](task-state/PRIMARY-SESSION.md).
Это не приёмка всех CORE-01/05 и не production/юридическая готовность.

Операционное дополнение2026-09-21: [устранение трёх CI-блокеров после консолидации](task-state/MARKET-CI-REMEDIATION-2026-09-21.md).
Локальные dependency/outbound/PostgreSQL и release-equivalent gates проверены;
remote CI отмечается отдельно в checkpoint. Это не закрывает CORE/POST-BE/
POST-FULL и не означает готовность к production. Исторические срезы ниже сохранены.

Дата reconciliation: 2026-09-14; audit/remediation checkpoint 2026-09-15 — §9.
Проверенный Git baseline: 3d644963ed72f99a100e180db2d373bc5abeaef9,
ветка codex/frontend-pilot-composition. В рабочем дереве есть отдельные
незакоммиченные frontend/test/generated изменения; они не включены в эту сверку
как проверенная новая реализация.

## 1. Как читать статус

Требования — [Product V2](../product/DENTMARKET_PRODUCT_V2.md).
**Единственная активная очередь работ и чекбоксов** —
[Backend Foundation](../backend/DENTMARKET_BACKEND_FOUNDATION_V2.md).
Эта матрица хранит доказательства и разрывы, не конкурирующий backlog.

Статусы SPEC_ONLY, UI_MOCK, CODED, UNIT_VERIFIED, INTEGRATION_VERIFIED,
E2E_VERIFIED, LIVE_VERIFIED определены в Product V2 §14. В таблицах ниже
уровень относится только к указанной проверенной части и исторической revision.
Существование теста не означает его успешного запуска. Запись старого
evidence не означает свежий pass текущего checkout или production readiness.

Снимок прежней матрицы, завершённые чек-листы и старые аудиты —
[архив и реестр переноса](../history/archive/2026-09-14/README.md).
Архивные npm/pnpm команды и численные срезы не являются текущей инструкцией.

## 2. Baseline, который сохраняем

| Проверенная часть | Последнее зафиксированное evidence | Граница доказательства |
| --- | --- | --- |
| B0.1–B0.6 | Foundation archive: core contract, API/worker split, PostgreSQL concurrency/rollback/tenant, seed profiles, transactional outbox | Не переносится автоматически на новые CORE endpoints |
| B1.1–B1.2 | Flow A 2/2: reprice, один/несколько supplier orders, повтор checkout, DB reservations | Не полный жизненный цикл до получения и повторной закупки |
| B2.1–B2.3 | Flow B2 4/4: full/partial confirmation, dispatch, in-app notification, document pack | Delivery closure/POD и ручная оплата без PSP отдельно в CORE-02/03 |
| B2.4, документолог | 8db7e6b: archive flow 1/1 + B2 4/4; migrations/tenant graph/accounting/version/upload/download | Не квалифицированная ЭЦП, не бухгалтерия/1С и не production storage certification |
| B3.1–B3.3 | Flow B3 3/3, publication/rollback repeat 10/10: CSV review, operator publication, evidence-preserving rollback | Не полная XLSX/browser/quality приёмка реального каталога |
| B4.1–B4.4 | Observability integration, logical restore, защищённый DLQ replay, Redis rate limit/auth contract | Не managed PITR, HA failover, live alert или production daily drill |
| B4.5 security | Historical R2E на 8f450ea: 1055/1055, 0 reportable; последующий R3 на 2ae0951: HTTPS policy и regressions | Не новый security scan текущего HEAD; TAC не выдан, инфраструктура не принята |
| Monetary integrity | 0c561ca: exact minor-unit manual price override; schema/service + workspace/PG/core/pilot gates | Не приёмка новой manual payment функции |
| B4.6 local | b45a3df: isolated PG/10 buyers/10 suppliers/500 offers, 20 write flows, shared rate-limit state двух API | Production-остаток открыт в POST-BE.2 |
| Pilot module composition | 2af5b11 / ADR 009: pilot 36 modules / 224 routes, go_live 41 / 257 | Optional feature completeness и live providers не проверены |
| Frontend profile composition | b259b10 / ADR 010: typecheck 15/15, test tasks 14/14 (API 200), build 10/10, web 23/23 | Проверена граница pilot, не полный расширенный demo |
| Buyer/Supplier/Admin slices | 2bda059, c5401d3, 7e99694, 8c9d843 и ADR 010: feature routes/shells, core browser flows | B5.1–B5.3 финально не закрыты; manual accessibility и POST-FULL впереди |

Подробные старые результаты не удалены:
[Foundation snapshot](../history/archive/2026-09-14/backend/DENTMARKET_BACKEND_FOUNDATION_V2.md),
[Acceptance snapshot](../history/archive/2026-09-14/governance/PROJECT_ACCEPTANCE_MATRIX.md),
[ADR 010](../architecture/adr/010-frontend-deployment-profile.md),
[B4.6 runbook](../operations/b4-6-load-profile.md).

## 3. Незавершённое внутреннее ядро

Ни одна строка этой таблицы не получает новый verified статус в docs-only задаче.

| ID Foundation | Что действительно известно | Незакрытый результат |
| --- | --- | --- |
| CORE-01 | Владелец подтвердил обязательный договор площадка–поставщик до публикации; assertActive сохранён | Полнота versioned acceptance/ONE_TIME/FRAMEWORK contract и локальные tests; optional относится только к buyer–supplier framework |
| CORE-02 | Payment intent требует provider и merchant account, mock capture существует | Отдельный manual/off-platform claim/review/settlement без фиктивного PSP; пока техническое предложение |
| CORE-03 | Confirmation/dispatch проверены; logistics содержит delivery closure/POD code | Принятые API/PG сценарии получения, частичной доставки, отмены/expiry локального резерва, repeat purchase |
| CORE-04 | Local PASS25.09: CSV/XLSX preview/publication/rollback, manual API, search48/50, matching100/0 wrong, runtime freshness; [evidence](task-state/CORE-04-2026-09-25.md) | Push/CI ожидаются; demo-name duplicates9 групп, search2 misses, реальные прайсы/media rights не сертифицированы |
| CORE-05 | Auth/session/role/security regressions существуют | Принятый внутренний onboarding/recovery/membership lifecycle без live email/social providers; rights новых endpoints |
| CORE-06 | Outbox/DLQ/import review и shipment in-app работают в локальном baseline | Полный внутренний work-queue/correction path, уведомления новых transitions, явное поведение при отсутствующем adapter |
| CORE-07 | Operational metrics и search analytics существуют | Единая схема минимальных продуктовых событий/расчётов, retry-safe counts и demo/live separation |
| CORE-08 | 19 verified core operations в последнем contract-only evidence; npm выбран | Покрытие дописываемых core APIs, настоящий lint, оставшийся pnpm lock, request budgets и согласованная safety/profile policy |
| CORE-09 | Пока не выполнен | Приёмка всех согласованных внутренних backend outcomes на одной revision |

Не утверждается, что все перечисленные функции отсутствуют. Следующая задача
начинается с конкретного code path и existing regression, затем дописывает
только недостаток. Ограниченный proof-only slice допустим без rewrite.

## 4. Отложенная приёмка — открыта, не отменена

| ID | Зависимость | Необходимое evidence |
| --- | --- | --- |
| POST-BE.1 | CORE-09 | npm ci, clean migration/seed, clean release manifest, target runtime, Docker build и remote CI на принятой ветке; branch protection/PR policy |
| POST-BE.2 / B4.6 | CORE-09 + целевая среда | Длительная нагрузка и Redis failover; текущий 60-second local soak не подменяет этот proof |
| POST-BE.3 | CORE-09 | Readiness/observability rerun, protected storage и scanning, backup/restore, rollback; managed receipts отдельно от локального rehearsal |
| B5.1–B5.3 | Отдельные frontend-задачи | Buyer/Supplier/Admin completeness; manual keyboard/screen reader/forced colors/zoom; согласованная UI приёмка |
| POST-FULL | CORE-09 + готовый frontend | Полная закупка до получения/документов/повтора, operator exceptions и negative role cases; один принятый build/data manifest |
| DEMO-01 | Все пять блоков разрешены и локальная активация проверена 2026-09-14 (§7) | Полнота optional-сценариев, billing UI и единый операторский вход через gateway ещё не приняты; активация не равна live-provider acceptance |
| EXT | Новое разрешение на внешнюю фазу | PSP/ЭЦП/1С/supplier/carrier/email/SMS/provider и infrastructure receipts, legal sign-off, реальные org/data/support |

Для реального пилота остаются Product V2 §16–17, а не только технические тесты:
минимум 3 проверенных поставщика, подтверждённый ассортимент, согласованный SLA,
платёжный процесс и поддержка; успех измеряется реальными и повторными заказами.
Не переносить эти условия в «выполнено» ради окончания локального backend.

## 5. Исправленные противоречия документации

- B4.3/B4.4 и локальную B4.6 не назначать снова по старым security audit overrides.
- B5.1–B5.3 не закрывать автоматически по отдельным browser slices.
- Исторические 3 329 карточек и 10,3%/0,7% coverage относятся к старому
  импортированному snapshot, не к текущему измерению pilot dataset.
- Pilot fixture: 500 карточек и 500 offers не означают 500 buyable products;
  последний локальный contract evidence показывал 50 buyable products.
- Канонический package manager — npm@11.16.0 из package.json. pnpm-lock.yaml
  ещё tracked; его наличие — CORE-08.3, не повод вновь выбирать package manager.
- Config gate и health probe не доказывают capture/refund, подпись или delivery.
- Production+pilot не объявлен безопасно принятым: ADR 009 требует production
  go_live, а часть environment guards привязана к go_live. CORE-08.5 должен
  разрешить расхождение до любого production-hosted pilot/demo.
- Отложенная общая приёмка не переносит обязательные проверки каждой фазы.

## 6. Evidence предшествующей docs-only reconciliation

2026-09-14 выполнена только актуализация документации и статическая сверка
Git, contracts/контроллеров, source-of-truth и архивных результатов.
Runtime tests, security scan, deployment, seed и live integrations в том
docs-only change set не выполнялись; существующий код и flags не изменялись.
Последующая реализация DEMO-01 учитывается отдельно ниже.

Перед завершением docs change проверяются локальные Markdown links,
сохранность архивных snapshots, связь каждого прежнего незакрытого пункта с
активной/отложенной очередью, существование npm aliases и git diff --check.
Результат этой проверки не повышает функциональные статусы.

Фактическая статическая проверка 2026-09-14: 21 изменённый/новый Markdown-файл,
141 локальная ссылка без отсутствующих целей; 7 архивных текстов совпадают
с исходным HEAD после нормализации перевода строк/хвостовых пробелов и
перебазирования ссылок;
SHA-256 всех 11 существовавших изменённых/untracked app-файлов не изменились.
34 открытых backend-подпункта сохранены без новых X; это предложения и
недостающие evidence, не утверждение о 34 отсутствующих функциях.
Локальный проверочный script: .tmp/doc-reconciliation-2026-09-14/verify-docs.mjs
(ignored artifact, не новый runtime/tooling dependency).
Команды node .tmp/doc-reconciliation-2026-09-14/verify-docs.mjs и
git diff --check завершились успешно; runtime readiness не повышен.

Применены AGENTS.md, Development Workflow, Agency Backend Architect
(границы, транзакционные сценарии, минимальный modular monolith) и Git Workflow
Master (отдельный docs change set, сохранение dirty user changes и истории).

## 7. DEMO-01 — локальная активация пяти блоков, 2026-09-14

Решение владельца: договор площадка–поставщик обязателен до публикации;
AI, trust/reviews, promotions, billing и smart recommendations разрешены в
локальном расширенном контуре. Product V2 и ADR 011 актуализированы. Backend
agreement/permission gates не удалены; новых провайдеров и write API нет.

Change set: local launcher выбирает go_live для API и web; `dev:pilot` и явный
pilot сохраняют ограниченный вариант. `verify:local-profile` добавлен в CI.
Документационные исправления не закрывают CORE-01–09. Проверки относятся к
общему dirty checkout на baseline 3d64496, не к опубликованному release.

| Команда / проверка | Фактический результат |
| --- | --- |
| `npm run verify:local-profile` | 5/5: все пять features, согласованный API/web, pilot override, invalid/mismatch/production rejection, отсутствие секретов в public env |
| `npm run verify:frontend-profile` | 4/4 Next configs, default/pilot/go_live и отрицательные cases |
| `npm run typecheck` | 15/15; перед повтором Next штатно перегенерировал повреждённый ignored admin dev route type |
| `npm test -- --force` | 14/14 Turbo tasks без cache; API 200, schemas 64, api-client 12, Buyer 34, Supplier 21, Admin 21, Landing 3, UI 3, EDS 2, 1C 4 tests |
| `npm run build`, profile pilot + локальные public URLs | 10/10 tasks, четыре Next production builds; Buyer/Supplier/Admin bundle budgets passed |
| `node scripts/verify-runtime-split.mjs` после build | api/worker/all, entrypoint и production-all rejection passed |
| `node scripts/verify-pilot-composition.mjs` после build | pilot/default 36 modules / 224 routes; go_live 41 / 257; все пять optional groups присутствуют только в полном профиле |
| `npm run verify:production-config` | passed, включая HTTPS/TLS/auth/PSP/signature guards |
| `node scripts/verify-pilot-backend.mjs --contract-only` после build | 19 core operations, response/error validation, 50 buyable products / 500 offers; это не доказательство актуальности stock каждого offer |
| CI YAML parse / `node --check` launcher | passed; удалённый CI не запускался |
| `npm run verify:web` | 31/31 passed, 4.6 min; изолированная PostgreSQL DB с обновлёнными pilot fixtures; Flow A/B2/B3, documents, registration, pilot 1280/390 и существующие dropdown regressions |
| `npm run dev` без profile override | go_live: API compile без ошибок, health passed, четыре Next dev surfaces и gateway запущены; production go_live builds этим не доказаны |
| Optional API smoke в go_live | AI conversations, billing plans/entitlements, promotions, trust ratings/reviews: 200 с разрешённым actor и 401 anonymous; invalid recommendations request: 400 с buyer и 401 anonymous. Все пять групп есть в OpenAPI |
| Buyer/Supplier browser smoke в go_live | Buyer 1280/390: AI-панель, ответ разрешённого локального fallback, recommendations с 8 вариантами; Supplier 1280/390: меню promotions/trust, форма/empty state акций и demo-рейтинг. Console errors отсутствуют |
| Admin browser smoke в go_live | Не принят: через admin.localhost требуется обычный вход; на прямом порту общего launcher панель монтируется, но trust/audit получают 404 из-за относительного /api. Повторная проверка с прямым API URL не завершена: после перезапуска dev-сервера CUA блокирует операции со своей data-URL страницей ошибки. Авторизация не изменялась |

Первый web run на старой рабочей БД: 23 passed, 4 failed, 4 not run.
Причина подготовки Flow A/B2 и buyer comparison: у всех 500 pilot-demo
остатков истёк freshnessExpiresAt. Защита свежести сохранена. Дополнительно
выявлен дефект cleanup Flow B2 при неуспешном beforeAll: обращение к ещё не
созданному supplier. Он не исправлялся в этом scoped change set; оставшийся
пустой actor/org именно этого прогона удалён по проверенным ID и timestamp.

Попытка выделить test schema не прошла первую migration: pg_trgm operator class
в public не виден в выбранном schema search_path. Source migrations не менялись;
пустой sandbox удалён без CASCADE. Это не pass чистого migration upgrade-path.
Для повторного web gate запущен временный PostgreSQL 17 на 127.0.0.1:55439,
в отдельную dentmarket_demo_gate восстановлена локальная копия БД, затем только
в ней выполнен `npm run db:seed:pilot`: 10 клиник / 10 поставщиков / 500 offers.
Рабочий каталог public:5432 не reseeded; его устаревшие demo-остатки остаются
отдельной задачей подготовки данных. Test runtime не является production.

Дополнительный Playwright CLI smoke дважды потерял browser session при
run-code; это не засчитано как pass и не стало причиной менять приложение.
Проверки полного локального интерфейса продолжены через встроенный браузер
CUA. Наличие меню не подменяет проверки загрузки данных. Billing подтверждён
на API plans/entitlements; законченный billing-кабинет и реальные списания не
заявляются. Ответ AI получен без внешней модели и не доказывает live OpenAI.

Операторский `dev:admin` дошёл до health API и старта web; затем отдельно
запущены существующий compiled API (script `start` workspace @marketplace/api,
`node dist/src/main.js` из apps/api)
и Admin dev с `NEXT_PUBLIC_API_URL=http://127.0.0.1:4012/api`, оба go_live.
Это не заменяет отсутствующее browser evidence загрузки trust/audit. Следующий
точный остаток DEMO-01: повторить этот Admin smoke в исправной браузерной сессии;
единый gateway login не обходить и не считать готовым. До этого общий DEMO-01
browser gate не закрыт, хотя перечисленные автоматические команды зелёные.

Тестовые launcher/API/web процессы и временный PostgreSQL 55439 остановлены;
основной PostgreSQL 5432 не останавливался. Копия БД и результаты остаются
только в ignored .tmp/output, не в Git. Временная Buyer browser identity удалена,
viewport override сброшен; оставшаяся временная вкладка не отмечена на сохранение.

Финальная статическая сверка: 23 Markdown-файла / 146 локальных ссылок,
7 архивных snapshots и SHA-256 всех 11 исходных dirty/untracked app-файлов
сохранены; 34 backend-подпункта остаются открытыми. `git diff --check` — passed.
Commit/push в этом change set не выполнялись.

Не выполняются live-provider acceptance, remote CI/Docker release, новый
security scan и standalone PostgreSQL concurrency suite: доменные транзакции,
Prisma schema, внешние adapters и permissions этой активацией не изменяются.
POST-BE и POST-FULL остаются открытыми; настроено тихое ежедневное напоминание
после подтверждённых CORE-09 и frontend acceptance соответственно.

Практики: AGENTS/Development Workflow/UI standard; Agency Backend Architect
(единый состав и сохранение guards), Frontend Developer (существующие панели
и согласованные flags), Playwright skill (браузерное evidence). OpenAI Docs
использован для штатного напоминания; Taste Skill не нужен без visual redesign.

## 8. GOV-RULES — аудит и актуализация правил, 2026-09-14

Основание: явный запрос владельца ограничить повторные команды и реализацию
только согласованного функционала. Scope — документы/инструкции проекта;
не реализация CORE, DEMO Admin, UI redesign, интеграций или нового test runner.
Baseline: 3d64496, codex/frontend-pilot-composition, существующий dirty checkout.

Проверены root AGENTS, Workflow, два UI standards, Product/Foundation/Matrix,
индекс/README, operations/security guidance, профильные ADR и ссылки на runbooks.
Вложенные AGENTS/override, CLAUDE/Cursor инструкции не обнаружены; `.agents`
и `.codex` на момент аудита пусты. Global пользовательские rules, плагины и
внешняя библиотека skills не изменяются. package.json и CI просмотрены как
исполняемая карта gates, без изменения scripts, pipeline, зависимостей и кода.

| Риск прежних правил | Изменение |
| --- | --- |
| Неограниченное «исправить и повторить», перезапуски другим инструментом | AGENTS §7.1 / Workflow §4.3: 3 попытки суммарно, новая гипотеза, конечные budgets, stop без ложного pass |
| Повтор всех зелёных тестов после docs/нового чата; одинаковые API builds внутри aliases | Workflow §4.2: входы и artifact каждого gate, REUSED_PASS, проверяемая эквивалентность prerequisite шагов |
| README/стандарты выглядят как общий список запуска; UI critical E2E ошибочно optional | Единая risk-based матрица, docs-only проверки отдельно, critical UI browser gate обязателен |
| Старый UI-план вновь назначает уже сделанные controls/corrections/auth/shell | Исторические указатели отделены от активной очереди; сначала code/evidence reconciliation, затем только пробел |
| Backlog/skill трактуется как разрешение расширить задачу | Последний запрос + один outcome, явные out-of-scope и stop, без автоматической делегации/следующей фазы |
| Ошибка среды вызывает смену профилей/БД/кластера и риск рабочим данным | Preflight, disposable DB, один режим Next artifacts, отдельное разрешение расширить инфраструктуру |
| Workflow предписывает commit/push для любой реализации | Только при явном запросе/разрешении; dirty user changes защищены |
| Устарели путь Agency, «до B0.5», указания о скрытых функциях | Актуальный путь, отдельные seed profiles, Product §5.2/ADR 011 local go_live при сохранении pilot и обязательного договора |
| Шаблоны ролей требуют чужие команды/фиксированные циклы polish | Только применимые практики; внешний пример не расширяет scope и не заменяет проектные gates |

DoD этой задачи: статическая сверка ссылок/команд/норм, сохранность исходных
dirty non-Markdown файлов и архивов, `git diff --check`; без X у CORE/DEMO/B5.
Нормы не являются технической гарантией от зависания процесса: watchdog/CI
timeouts этой документационной задачей не внедрялись. Уже известный незакрытый
DEMO Admin smoke и другие функциональные ограничения остаются в прежнем статусе.

Применены AGENTS/Workflow и Agency Code Reviewer: единый review, приоритет
существенных рисков и отсутствие стилистического scope creep. Reality Checker
прочитан для сверки evidence claims; его Laravel-команды, тотальные screenshots
и фиксированное число redesign циклов признаны неприменимыми к этой docs-only
задаче и не запускались. OpenAI Docs использован для проверки области AGENTS:
[официальный порядок обнаружения инструкций](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance).
Один root AGENTS остаётся точкой входа, подробные нормы — в linked Workflow;
изменение глобальной конфигурации Codex и установка skills не требовались.

Проверки GOV-RULES:

- `node .tmp/doc-reconciliation-2026-09-14/verify-docs.mjs` — PASS:
  29 Markdown-файлов / 161 локальная ссылка в actual_docs, 7 архивных текстов
  и 11 исходных app-файлов сохранены, 34 backend-подпункта остаются открытыми.
- `node .tmp/governance-rules-2026-09-14/verify-policy.mjs` — PASS:
  15 статических assertions, ещё 7 ссылок root README/AGENTS; SHA-256 всех
  24 защищённых non-Markdown/архивных файлов совпадает с началом этой задачи.
  Root AGENTS — 20 919 UTF-8 bytes; настройки загрузки Codex не менялись.
- `git diff --check` — PASS. Скрипты проверки — ignored task artifacts,
  не новая dependency и не автоматическое runtime enforcement правил.
- TypeScript/unit/build/DB/browser/security/CI не запускались: менялись
  инструкции, не код/контракты/окружение. Предыдущие результаты не выдаются
  за новые проверки этой задачи. Commit/push не запрашивались и не выполнялись.

## 9. AUD-FIX — исправления аудита, 2026-09-15

Запрос владельца: разбить текущий аудит на технические документы и начать
исправления. Созданы три scoped briefs, связанные с очередью Foundation §8:
[доступ](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md),
[закупка/документы](../backend/AUDIT_PURCHASING_DOCUMENTS_REMEDIATION_2026-09-15.md),
[UX](../ui-ux/AUDIT_UX_POLISH_2026-09-15.md).
UI standards уточнены: сохраняем дизайн, старые концепции не acceptance criteria.
Это не закрывает CORE-01–09/B5/POST-BE/POST-FULL и не является новым полным аудитом.

Исходный аудит вне Git: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/`.
HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`, ветка
`codex/frontend-pilot-composition`, dirty audit fingerprint
`2a01a4b081cf7612c6239594ac8553e1a34498543dd4c69ebef8bcd3b5ac541e`.
Его фактические 30 API/data observations, 6 reprice assertions и 17 session
assertions — частичное покрытие разных наборов, не процент готовности.
Raw audit report/FAIL/артефакты сохраняются. Статус проверки отделён от исправления.

Текущий slice AUD-FIX-01: AUTH-LOG-01, real HTTP response Set-Cookie → Pino
JSON stream. Scope только shared redaction policy + regression. Auth/session
state, контроллеры, API/Prisma, UI, зависимости и БД не меняются.
До патча проверены прямой bootstrap caller, cookies login/refresh/logout,
реальные Pino req/res serializers; альтернативное представление — mixed-case
HTTP header на wire и request CSRF. Делегирование запрещено, поэтому
security-boundary/compatibility и candidate review выполняются отдельными
локальными проходами по fix-finding, не заявляются независимым внешним аудитом.

### AUD-FIX-01 — ACCEPTED в указанной границе

В shared Pino policy добавлены `req.headers["x-csrf-token"]` и
`res.headers["set-cookie"]`; cookie array скрывается целиком. Существующие
Authorization/Cookie/root secret masks сохранены. Новые пять regressions
используют настоящий loopback HTTP server + pino-http serializers/redaction,
только destination и LOG_LEVEL изолированы тестом. Это синтетические auth-like
HTTP responses, не новый полный login→DB→logout acceptance.

Проверены строка/массив cookies, mixed-case wire headers, выдача/ротация/очистка,
500-ответ, child log и automatic completion; credential values в проверяемых
JSON событиях отсутствуют. Wire cookies/attributes/status/body не изменены;
requestId, correlationId, method/path, responseTime, safe headers сохранены.
Response/request body по-прежнему не включается стандартным serializer.
Тест существующих root secrets/worker event прошёл. Логи не отключались.

Один post-patch review: прямые bootstrap/worker callers не изменены; Pino
res serializer берёт нормализованные Node `getHeaders()`, raw req/res ссылки
не enumerable. Маскирование применяется к обеим проверенным log paths,
включая error-status. Произвольные строковые сообщения/URL и другие log sinks
не объявлены очищенными этим патчем; production log exposure не проверено.

| Gate / команда | Попытки и результат |
| --- | --- |
| Pre-patch `npm exec --workspace=@marketplace/api -- vitest run src/platform/observability/structured-logger.spec.ts --maxWorkers=1 --minWorkers=1` | Один намеренный reproducer: 4 FAIL на немаскированном CSRF / 1 control PASS; 2.38s. Исходная Set-Cookie утечка также подтверждена audit §11. Это не итоговый gate |
| `npm run typecheck --workspace=@marketplace/api` | Попытка1 FAIL: новый тест обращался к `.default` CommonJS type Pino. Исправлен только тест на штатный named `.pino`; попытка2 PASS. Третья не требовалась |
| `npm exec --workspace=@marketplace/api -- vitest run src/platform/observability src/modules/identity/auth-sessions.service.spec.ts --maxWorkers=1 --minWorkers=1` | После изменения policy: PASS 10/10 в 5 файлах, 10.91s; новые logger tests 5/5 |
| `npm run typecheck` | PASS 15/15 Turbo tasks, 7.447s; API cache miss, остальные14 REUSED_PASS через Turbo |
| `npm test` | PASS 14/14 Turbo tasks, 23.05s; API cache miss:56файлов/205tests,22.06s; остальные13 cached. Не 14 отдельных E2E сценариев |
| `node .tmp/aud-fix-01-20260915/verify-docs.mjs` | PASS:8Markdown,119relative links включая anchors;720 исходных source files вне разрешённого change set неизменны |
| `git diff --check` | PASS; предупреждения LF/CRLF не являются whitespace errors |

Toolchain: Node24.18.0, фактический npm12.0.1 (packageManager по-прежнему
npm@11.16.0; install/lockfile/toolchain migration не выполнялись), Turbo2.10.12,
Vitest3.2.7. SHA-256 package-lock:
`3b68661abaf2dd88f677b48321b4d701e23f3b94dc41b33f461f9d23fd950919`.
Relevant source/test/doc hashes и результаты: ignored
`.tmp/aud-fix-01-20260915/integrity.json`, `gate-log.md`; это локальные evidence,
не remote CI. Source unchanged после test gates; последующая правка checkbox/docs
не требует повторного test/build. Финальный docs/diff check выполняется отдельно.

Не запускались DB/Prisma/seed, API/Next servers, browser, полный observability
DB drill, release/dependency/security scans: затронут только log sink, выбранная
HTTP regression не требует working/test DB. Локальные HTTP listeners тестов
закрыты в finally; чужие процессы не останавливались. Turbo warning об отсутствии
coverage output не меняет exit0, не исправлялся как unrelated config.

Практики: AGENTS/Workflow, Agency Evidence Collector (конкретное evidence,
раздельные проверка/исправление, без выдуманных screenshots/scores), Codex Security
fix-finding (boundary trace, compatibility control, отдельный локальный review).
Дополнительный `ai/agents/qa.md` из Agency-ссылки отсутствует после одного поиска;
использован прочитанный основной checklist и проектный Workflow. Taste/редизайн,
Playwright/PDF skills не применялись: в этом slice нет визуального изменения.

AUD-FIX-01 отмечен X; остальные AUD-FIX и CORE/B5/POST gates не закрыты.
Следующий отдельный slice — AUD-FIX-02, читаемый PDF. Commit/push не запрашивались
и не выполнялись; ветка/HEAD прежние. Пользовательские dirty изменения сохранены.

### AUD-FIX-02 — ACCEPTED: читаемый PDF, 2026-09-15

Исполнен [purchase/document brief §2](../backend/AUDIT_PURCHASING_DOCUMENTS_REMEDIATION_2026-09-15.md#2-aud-fix-02--читаемый-pdf-doc-04-p1).
Это следующий checkpoint после AUD-FIX-01 выше, не его повторный запуск.
Тот же HEAD/branch плюс dirty inputs; source/test/build config hashes в
`.tmp/aud-fix-02-20260915/integrity.json`. Node24.18.0/npm12.0.1,
package-lock SHA тот же, зависимости не устанавливались/не обновлялись.

Граница: renderer, его tests, локальный font asset/coverage/license и копирование
этих assets Nest-сборкой. Владелец отдельно разрешил сначала полный Roboto,
затем Noto Sans только для PDF. Roboto не импортирован: проверка обнаружила
отсутствие ₸. Из официального Google Fonts добавлен unmodified Noto Sans,
source revision `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`, TTF2,049,096bytes,
SHA-256 `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d`.
[Происхождение и лицензия](../../apps/api/src/modules/documents/fonts/README.md).
У лицензии нормализован один хвостовой пробел; hash проверки нормализует LF/CRLF,
формулировки/copyright не менялись. Production renderer не читает системные fonts
и не обращается в сеть. Статический cmap3094codepoints/64ranges привязан к exact TTF.

Неподдерживаемый символ в title/body теперь вызывает явную ошибку вместо
missing-glyph output; данные не транслитерируются и ₸ не заменяется на другую
валюту. Штатный `DocumentsService.renderAndFinalize` уже обрабатывает rejection
как FAILED до storage/finalize; этот доменный путь не переписывался и новый
DB write acceptance здесь не выполнялся. DOCX/схемы/permissions/web UI прежние.

| Gate / команда | Попытки / фактический результат |
| --- | --- |
| Font preflight/import | Три scoped попытки:1Roboto отклонён по отсутствию ₸;2Noto не прошёл локальный2MBcap; официальные metadata подтвердили2,049,096bytes, затем3PASS с3MBcap, exact размером и Git blob SHA по immutable source. Это не изменение runtime upload limits |
| `npm exec --workspace=@marketplace/api -- vitest run src/modules/documents/document-renderer.spec.ts --maxWorkers=1 --minWorkers=1` | Запуск1: ошибка нового helper (`pdf.destroy` в установленной PDF.js6); helper исправлен на loadingTask.destroy. Запуск2:3 genuine content FAIL/2controls PASS на старом renderer — NUL вместо цифр/Latin/KZT/Kazakh. Запуск3 после fix:8/8PASS,2.62s |
| `npm run typecheck --workspace=@marketplace/api` | PASS, первая попытка; финальный вариант license hash дополнительно покрыт общими gates ниже |
| `npm run build --workspace=@marketplace/api` | PASS, один запуск: prisma generate + nest build; это генерация клиента, не migration/seed или соединение с рабочей БД |
| `node .tmp/aud-fix-02-20260915/verify-built-pdf.mjs` | PASS: compiled renderer,4assets source=dist, cmap=3094codepoints;2PDF/3pages; весь ожидаемый текст и A4 margins, входные data snapshots неизменны |
| Poppler `pdftoppm -r 110 -png` для каждого из двух PDF + `view_image` | PASS, просмотрены все3PNG: номер/БИН/дата/суммы/₸/RU-KZ-Latin; длинный центрированный title и65строк на2pages без clipping/перекрытий. Нового дизайна не вводилось |
| `npm run typecheck` | PASS15/15tasks,12.983s; API fresh,14cached |
| `npm test` | PASS14/14tasks,15.532s; API fresh56files/211tests,14.01s, включая renderer8 и documents service8;13tasks cached. Это не E2E/production acceptance |
| `node .tmp/aud-fix-02-20260915/checkpoint.mjs` | PASS:723 предшествующих source files вне scope, включая AUD-FIX-01, сохранены; исходный audit PDF checksum прежний |
| Docs links / `git diff --check` | PASS после актуализации checkpoint; повтор runtime suites из-за docs не нужен |

Artifacts вне Git: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-02/`:
`invoice-multilingual.pdf` (1page,9805bytes, SHA-256
`c0948738983cc080a3f95a62ca7d669b5e74b32931122e38ffaa30b0578325b3`),
`invoice-multipage.pdf` (2pages,8612bytes, SHA-256
`0d593edc48f9d3e59cc7434b47536701a9f51d3c6b4a2d21cbe3b12b517058ae`),
3PNG, `evidence.json`, `REVIEW.md`. Это явно тестовые файлы, не счета к оплате.
Исходный дефектный audit-invoice.pdf не заменён; его checksum:
`35ecb8e5eaad275c45e4c9a47193368f3b2263db561f454edb4f045dcc38698b`.

Не запускались рабочее приложение/БД, миграции/seed, archive browser, full
PostgreSQL/security/release suites и новые integrations: ни данные, ни API,
ни tenant graph не менялись. Nest asset packaging доказан compiled smoke;
Docker image/remote CI production отдельно не строились. Ошибки browser session
предшествующего аудита не пытались обходить. Старые PDF/документные версии в
БД не перегенерированы, никакая legal signature/payment readiness не заявлена.

Применены AGENTS/Workflow, PDF-skill (text extraction + Poppler + visual pages)
и Agency Evidence Collector (разделение content/byte/API evidence, без ложного
PASS всего документолога). Marker PDF authoring выполнен один раз перед первой
генерацией, только synthetic fixtures. Отдельные агенты не создавались.

AUD-FIX-02 отмечен X. Следующий bounded slice AUD-FIX-03 — единый server logout
из buyer/supplier документолога; регистрация/resume и прочие audit fixes открыты.
Commit/push не запрашивались/не выполнялись, HEAD/branch не менялись.

### AUD-FIX-03.1 / UX-21 — ACCEPTED: server logout, 2026-09-15

Следующий checkpoint после AUD-FIX-02; принят **только logout slice**, не весь
AUD-FIX-03/CORE-05. [Решение и ограничения](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md#logout-slice--принятое-решение-и-приёмка-15092026).
HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`, branch
`codex/frontend-pilot-composition`, Node24.18.0/npm12.0.1; тот же package-lock SHA
`3b68661abaf2dd88f677b48321b4d701e23f3b94dc41b33f461f9d23fd950919`.
API/schema/БД модель и зависимости не менялись. Изменены api-client helper,
общий UI hook/AppShell и привязки buyer/supplier home/documents; добавлены tests.

Сначала подтверждается отзыв конкретной bearer-сессии сервером, затем выполняются
local cleanup/redirect и сообщение sibling tabs. Ошибки не замаскированы cleanup;
запрос ограничен10s, параллельные нажатия не создают повторный revoke. Есть
отдельное сообщение/повтор; сырой backend error не отображается. HTTP401 не
считается доказанным выходом (он может означать истёкший access при живом refresh).
UI-синхронизация действует в рамках origin/sessionId; не заявлена для всех origins.

| Gate / входы | Результат и попытки |
| --- | --- |
| Focused api-client logout + handoff | Первая попытка17/17PASS (15новых +2existing); финальный перенос helper в entrypoint покрыт общими tests ниже |
| `npm run typecheck` | Первая15/15PASS; после изменения export и добавления E2E повтор15/15PASS,26.925s,9cached. Это новый input, не docs-only rerun |
| `npm test` | Первая14/14PASS; после изменения export повтор14/14PASS,8.591s,10cached; api-client27/27fresh, buyer34/supplier21/admin21fresh. API211/211 и unchanged UI3 reused Turbo evidence |
| Buyer production build + `scripts/verify-buyer-bundle.mjs` | Попытка1: отсутствует next CLI shim в независимой dependency copy, до компиляции. Попытка2: webpack не разрешил `.js`→`.ts` export. Helper перенесён в существующий entrypoint, без изменения build config. Попытка3PASS; webpack25.6s, TS8.9s; bundle20files/1,121,546raw/338,688gzip, все прежние лимиты соблюдены |
| Supplier production build | Первая попытка прямым installed Next CLI PASS; webpack22.4s, TS4.9s. Набор команд эквивалентен package build; APIURL4112, login3103, frontend pilot |
| Scoped `verify:web` implementation: installed `@playwright/test/cli.js test --config playwright.logout.config.ts --max-failures=1` | Первая: locator alert захватил также Next route announcer. Вторая:3PASS, mobile pending locator не увидел кнопку закрытого drawer. Исправлены только тестовые локаторы/обычное открытие меню. Третья6/6PASS,5.8s; retries0, отдельные logs/artifacts каждой попытки |
| Последний E2E-only typecheck | PASS после test-only уточнений; runtime builds/unit suite не повторялись после изменения лишь browser assertions |
| Read-only session readback | На approved audit DB ровно2созданные в запуске сессии, обеREVOKED. Токены/пароли/cookies в evidence не сохранены |
| Preservation / source-copy parity |724 предшествующих source/assets вне scope unchanged;11изменяемых code/test/config files source=isolated checkout; main Git/lockfile/чужие dirty changes сохранены |
| Docs links / `git diff --check` | PASS после оформления; не повод для нового runtime rerun |

Команды сборки в изолированной копии выполнены прямым установленным Node/Next
из-за отсутствия `.bin` wrappers: `node node_modules/next/dist/bin/next build --webpack`
из owning app; у buyer затем `node scripts/verify-buyer-bundle.mjs` из root.
Не добавлялись зависимости/config или разрешающие flags. Web-gate — та же
Playwright реализация npm alias, с task-specific config и всеми prerequisites
этого logout flow; **не полный общий verify:web со всеми purchase/import suites**.
Они не назначались повторно для неизменённых транзакций. Next build и dev не
выполнялись одновременно в одном app directory.

Browser coverage: четыре явно UI-only mocked network/401/pending/retry/double-click
проверки buyer/supplier на1440×900/390×900; две real JWT проверки на локальном API:
штатный password login → handoff/exchange → documents → logout → sibling tab
cleanup → старый access401/refresh401/repeated revoke401. Начальный cookie logout
без CSRF даёт401. Live credentials только в памяти, никаких injected identity
headers/DB tokens. Login destination stubbed (не proof login-page acceptance),
API logout/handoff/revoke в двух real cases не подменяются. Desktop использует
keyboard Enter, mobile — touchscreen tap. Это Chromium viewport, не физическое
устройство и не screen-reader/full accessibility acceptance.

Просмотрены6PNG. Desktop pending показывает disabled logout; buyer pre-logout
ещё loading, supplier pre-logout показывает счётчики тестового архива. Два mobile
pending screenshots захватили backdrop во время раскрытия drawer, поэтому не
используются как proof окончательной геометрии открытого меню. Реальный mobile
logout доказан actionability/tap и API readback; полный visual sign-off всех
drawer states не заявлен. Никакие текущие стили/токены не менялись.

Evidence: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-03/`:
`integrity.json`, `snapshot.json`, build/web logs/results, `web-attempt3-artifacts/`,
`session-readback.json`. Helpers: `.tmp/aud-fix-03-20260915/`. Гипотеза смены
исполнителя browser — собственный worker lifecycle вместо detached CLI daemon
с двумя прежними Session closed; это не reset прежнего blocker budget. Новый
runner работал стабильно; три прогона различались исправленными test assertions.

Окружение: сохранённая independent dependency copy в audit/runtime/checkout,
approved PG17 `dentmarket_audit_20260914`, password JWT, API4112/buyer3101/supplier3102,
pilot, PROCESS_ROLE=api, queues/Redis/external sends off, отдельный storage.
Migrations/seed/рабочая БД не использовались. Созданы только2тестовые auth sessions
и2одноразовых handoff records, обе сессии отозваны API; orders/documents не менялись.
После проверки остановлены только owned API3652/buyer18460/supplier14528;
порты свободны, PostgreSQL6524/5432 сохранён. Файлы/DB/evidence не удалены.

Не выполнялись standalone PostgreSQL/platform-authority/rate-limit-auth suites,
полный security scan, релиз или интеграции: backend authorization/state machine
не менялись; actual selected JWT negative cases и existing unit evidence выше.
Это не общий security/production PASS. Роли Agency Frontend Developer/Evidence
Collector прочитаны и применены для общего компонента, сохранения UI и честного
разделения mocked/live evidence; Playwright skill использован для browser workflow,
project regression requirements — для test files. Другие агенты не запускались.

В Foundation отмечен X только AUD-FIX-03.1. Следующий отдельный slice — protected
registration resume, перед кодом предусмотрен его brief. Commit/push не
запрашивались и не выполнялись; branch/HEAD прежние.

### AUD-FIX-03.2 / UX-20 — CODED / BLOCKED, 2026-09-15

Последний запрос: начать protected resume и подтвердить учёт задач/ограничение
повторов. До кода добавлен [execution brief](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md#aud-fix-032--execution-brief-15092026).
HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`, branch
`codex/frontend-pilot-composition`, ранее грязное дерево сохранено.
Scope не включает AUD-FIX-03.3, UI redesign, включение AI в pilot или новый provider.

Добавлено в коде (не полная приёмка):

- Три public POST request/inspect/complete, shared schemas + api-client + OpenAPI;
  явный bounded token contract, без доверия actor/tenant из тела.
- Одноразовая ссылка на сохранённый email, hash-only proof и immutable target
  binding, TTL15min/не дольше заявки, IP/email throttling, no-store, fragment URL.
  Ненастроенная доставка возвращает503, без вывода resume token в console.
- Общая транзакция proof/account/штатного claim/role/acceptance/audit/outbox.
  Неправильный пароль существующего аккаунта не заменяется; lock/MFA/status
  сохраняются. Повтор завершения — receipt без новой session/организации.
  Для READ COMMITTED proof row блокируется до чтения состояния заявки.
- Landing `/register/resume`, ссылка из текущей регистрации, reload/error/retry,
  сведения заявки и пароль без persistent browser storage; normal login после
  завершения. UI и новые Playwright cases ещё НЕ ПРОВЕРЕНЫ браузером.

#### Ledger запусков и граница evidence

Artifacts: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-03.2/`.
`before.json` —1219 исходных file hashes, `final.json`/`integrity.json` — checkpoint.
Локальный runner `.tmp/aud-fix-03-2/run.mjs` сохраняет точные argv, cwd, durations
в `*-process.json`, `*-result.json`, `*.log`, без значений секретов.

| Gate / фактическая команда | Результат | Входы / предел доказательства |
| --- | --- | --- |
| `npm run build --workspace=@marketplace/schemas` | PASS | Новые shared contracts |
| `npm exec --workspace=@marketplace/api -- vitest run src/modules/identity/registration-resume.spec.ts` | PASS26/26, 11.96s | Первый код до окончательного порядка row lock; новое assertion порядка вызовов после review ещё не прогнано |
| `npm exec --workspace=@marketplace/schemas -- vitest run src/registration-resume.test.ts` | PASS6/6, 0.674s | Текущие неизменённые contracts |
| `npm exec --workspace=@marketplace/api-client -- vitest run src/registration-resume.test.ts` | PASS1/1, 0.527s | Текущие неизменённые client methods |
| `npm run typecheck` | PASS15/15 tasks, 4cached, 58.129s | До добавления E2E files и финального порядка resume lock; не итоговый TS gate новой ревизии |
| `npm run build --workspace=@marketplace/api` | PASS41.341s; затем PASS23.085s | Второй build обоснован изменением row-lock порядка после локального review; включает prisma generate, schema не менялась |
| `node scripts/verify-postgres-integration.mjs` | PASS45.109s | Prerequisites schemas/API выполнены; tenant, rollback, idempotency, scarce stock. Код purchase/claim этого gate не менялся после запуска; это не тест самого resume |
| `node scripts/verify-registration-resume.mjs` | PASS21.058s | Финальный API build; настоящий JWT/API/PostgreSQL, четыре новые независимые заявки, описанные ниже assertions |
| `node scripts/verify-platform-authority.mjs` | **FAIL12.187s, попытка1** | После общих schemas/API builds; ошибочное ожидание AI в pilot, сообщение ниже |
| `npm test`, финальный `npm run typecheck` | NOT_RUN на финальном checkpoint | Остановка на обязательном authority blocker; исходный focused pass не заменяет полный набор |
| `verify:rate-limit-auth` (unit + production auth contract) | NOT_RUN | Общий API prerequisite уже выполнен; оставшиеся шаги не выполнялись после stop |
| Landing production build, scoped `verify:web` | NOT_RUN | Независимая установленная копия обновлена; build/browser ещё не запущены. Наличие Playwright spec не означает PASS |
| `git diff --check`, local doc links, сохранность исходных файлов | См. `integrity.json` | Финальные read-only/file-integrity проверки checkpoint; не auth readiness |

Real resume suite: pending intent при userCount0; live OpenAPI; mismatch email,
БИН и capability401; два concurrent complete → один user/org/membership/audit/outbox;
consumed token → receipt; normal password login + bearer revoke; существующий
supplier account не меняет пароль, wrong password401; только SUPPLIER capability,
marketplace agreement не фабрикуется; истёкший proof401. Искусственная DB fault
на одном тестовом БИН вызывает500: user не остаётся, intentPENDING/proofREADY;
после снятия owned fault тот же proof завершает заявку. Это реальный rollback
при явно тестовом отказе, не имитация backend success в браузере.

Только согласованная `dentmarket_audit_20260914`, loopback mail receiver с
ephemeral ключом, JWT, отдельные files, очереди выключены. Новый код читает proof
из действительно принятого test email, не из БД. Test transport находится только
в harness, не в API, нет public endpoint получения tokens. Фикстуры namespace
`audit_resume_1789460041080_8632` сохранены для readback; исходная прерванная заявка
аудита и рабочая DB не менялись. Оба штатных gates выполняли свои migrate-deploy
(32 migrations, no pending) и idempotent `db:seed:test` только в audit DB; не
seed:pilot и не замена500товаров. Owned API/mail и временный rollback trigger
остановлены/сняты; cleanup authority и PostgreSQL завершился без сообщения об ошибке.

#### Один блокер, без автоповтора и расширения scope

`verify-platform-authority.mjs:321` задаёт `DEPLOYMENT_PROFILE: "pilot"`, но
`:748` ожидает POST `/ai/conversations`201. Фактически404. По
`deployment-profile.modules.ts:28` AiModule включается только в go_live;
этот runtime policy и сам проверочный скрипт не менялись данным slice.
Предшествующие assertions доступа/каталога выполнились, AI assertions — нет.
Это **не PASS authority/security**, не доказанная уязвимость resume и не основание
включать скрытый модуль в pilot или удалять assertion. Причина подтверждена
read-only исходниками; повтор с теми же входами не запускался. Попыток1/3;
лимит — максимум, не обязанность повторять известный сбой ещё дважды.

Следующий точный запрос, требующий решения владельца:
«Исправь только несовместимость профиля verify-platform-authority: сохрани
проверки tenant/platform и запрет AI в pilot; AI authority cases выполняй в
изолированном разрешённом go_live test runtime без внешних отправок. После PASS
продолжи приёмку AUD-FIX-03.2 с этого checkpoint: финальные unit/typecheck/test,
rate/auth и landing build/scoped web. Не начинай AUD-FIX-03.3 и другие задачи».

Чекбокс AUD-FIX-03.2 оставлен `[ ]`; ранее принятые `[x]` не сброшены. Production,
security gate, полный CORE-05 не закрыты. Применены прочитанные Agency Backend
Architect / Frontend Developer / Evidence Collector; Playwright инструкции
учтены при подготовке regression spec, но браузер в этом slice не запускался.
Никаких дополнительных агентов, commit/push/PR и новых интеграций.

### AUD-FIX-03.2 — разрешённое исправление authority, остановка на web, 2026-09-15

Владелец отдельно разрешил исправить несовместимость профиля в проверочном
скрипте и завершить приёмку. Предыдущий ledger выше — история, не текущая
причина блокировки. HEAD/branch прежние: `3d644963ed72f99a100e180db2d373bc5abeaef9`,
`codex/frontend-pilot-composition`; commit/push не выполнялись.

Минимальная коррекция `scripts/verify-platform-authority.mjs` и нового
`scripts/lib/platform-authority-runtime.mjs`: старые core/tenant assertions
остаются в pilot; supplier и operator AI requests обязаны вернуть404 без
записей conversation. Затем только owned API останавливается и запускается в
test/go_live для прежних положительных/отрицательных AI authority cases.
Старые assertions не удалены; локальный whitelist окружения не наследует
provider URLs/keys, Redis, Sentry, OTEL; queues/schedules выключены. Это не
переключение основного приложения и не включение AI в pilot. Unit helper3/3 PASS.

#### Ledger разрешённого продолжения

Артефакты в прежнем `remediation/AUD-FIX-03.2/`; argv/cwd/results/logs отдельных
запусков сохранены, исторические файлы не перезаписаны. Длительности ниже —
wall-clock runner, поэтому отличаются от внутреннего Turbo/Vitest времени.

| Команда / artifact | Результат | Основание и граница |
| --- | --- | --- |
| `node --test scripts/lib/platform-authority-runtime.test.mjs` | PASS3/3 | Pilot/go_live isolation, deny неизвестного профиля; application defaults не меняются |
| `node scripts/verify-platform-authority.mjs`; `authority-attempt2` | PASS19.319s, попытка2 из3 | Разрешённое исправление профиля; прежние общие schemas/API builds переиспользованы |
| `npm run typecheck`; `typecheck-final` | FAIL44.335s | Новая E2E fixture передавала windowsHide в Node ForkOptions; замена на spawn с IPC только в тесте |
| `npm test`; `tests-final` | PASS34.857s,14/14 tasks | API237 tests в57files, в том числе26resume и финальное assertion порядка row lock; прочие workspace tests PASS |
| `npm run typecheck`; `typecheck-final-attempt2` | PASS22.516s,15/15 tasks,13cached | Повтор после конкретной правки E2E spawn; application TS с тех пор не менялся |
| `node scripts/verify-production-auth-contract.mjs`; `rateConfig` | PASS3.264s | Valid production auth baseline + отрицательные config cases. Эквивалент verify:rate-limit-auth: API build reused, rate-limit4/API-envelope5 unit tests уже PASS внутри npm test; отдельно тот же Vitest не повторялся |
| Next CLI `build --webpack`, cwd isolated `apps/landing-web`; `buildLanding` | PASS85.900s | Production/pilot build с loopback API4112; только landing, API/другие web apps не пересобирались |
| Playwright CLI `test --config playwright.registration-resume.config.ts --max-failures=1`; `web` | FAIL64.380s, попытка1 | Fixture startup не сообщил ready за60s; сценарии не выполнены. Точная transient причина не доказана |
| Та же команда; `web-attempt2` | FAIL94.986s, попытка2 | Добавлены bounded readiness20s/status и безопасная IPC-диагностика. API/landing поднялись; exact getByLabel не учитывал required `*`, остановка до ввода email |
| Та же команда; `web-attempt3` | FAIL23.294s, попытка3 | Исправлены только селекторы; action timeout10s. Pending intent создан, keyboard submit/busy/условное подтверждение и реальное fixture-email получены. Same-page переход по fragment не открывает форму пароля |
| `npm run typecheck --workspace=@marketplace/e2e`; `typecheck-e2e-web-final` | PASS10.605s | После изменения только E2E selectors/IPC/config проверен затронутый пакет; root TS/unit и production build с неизменёнными application inputs не повторялись |

Ранее PASS `verify-postgres-integration.mjs` и live resume API suite сохранены
как scoped evidence неизменённых API/schema/compiled artifacts. Это НЕ означает
успех нового web flow. Изменения fixture после этих PASS касались только
ожидания readiness/диагностики старта; email transport и бизнес-assertions не
менялись. Backend, dependencies, lockfile, production rules и рабочая DB не
переписывались для получения зелёного результата.

#### Подтверждённый web blocker и пределы проверки

Предусловия: открыта `/register/resume` без fragment; создана своя активная
BUYER-заявка; через реальный запрос получена ссылка из loopback test receiver.
Переход на тот же path с `#token` является same-document navigation.
Ожидается inspect proof и форма нового пароля. Фактически DOM остаётся формой
запроса с сообщением «Запрос принят»; поле «Пароль аккаунта» отсутствует.
Source: `apps/landing-web/app/register/resume/page.tsx` читает hash внутри
`useEffect(..., [])`, без подписки hashchange. Это UI state lifecycle defect,
не отказ валидации токена, не основание ослабить auth и не новый backend rewrite.

Evidence: `web-attempt3-artifacts/registration-resume-real-B-68783-f-reload-and-sibling-replay/error-context.md`
с DOM snapshot и шагом отказа; рядом `BUYER-1440-resume-request.png` визуально
проверен, подтверждает только исходную форму1440×900. Фикстура попытки3:
`audit_resume_1789461874245_16364`; только синтетические данные audit DB.
Снимок не доказывает claim/commit. Настоящее завершение и DB readback браузером,
supplier390, две вкладки, reload, потеря ответа после commit, invalid-link и
mobile-validation cases остаются NOT_RUN: `--max-failures=1`, три оставшихся
теста не запускались. Physical mobile/tablet и full web suite не заявлены.

**STOP:** три web-попытки исчерпаны. AUD-FIX-03.2 остаётся `[ ]` / CODED/BLOCKED;
предыдущие `[x]` не сброшены. Общие security/production/CORE-05 не приняты.
Следующий точный запрос: «Исправь обработку hashchange в существующем resume UI,
с очисткой устаревшего состояния и защитой от late inspect response. Добавь
regression на ссылку в той же вкладке и заверши оставшуюся приёмку с этого
checkpoint; не подменяй переход принудительным reload и не начинай AUD-FIX-03.3».
Нужны новое явное решение и изменённая предпосылка; автоматического четвёртого
web запуска, нового агента, нового браузера ради сброса лимита нет.

Применены прочитанные практики Agency Backend Architect (границы/ownership),
Frontend Developer (state/accessibility), Evidence Collector (разделение
source/API/browser evidence), Playwright — фактический scoped Chromium runner
и просмотр screenshot. Taste/redesign/security plugin scan не применялись.

Финальный checkpoint: `final-web-blocked.json` / `integrity-web-blocked.json`
фиксируют hashes и сравнение с исходным dirty tree/изолированной копией;
старые `final.json` и `integrity.json` сохранены. Перед остановкой owned
API/mail/landing завершились, listeners3103/4112 отсутствуют. PostgreSQL,
основное приложение, рабочие данные и фоновые процессы пользователя не тронуты.

### AUD-FIX-03.2 — финальная scoped-приёмка после hash-navigation fix, 2026-09-15

**ACCEPTED в границе UX-20**, не полный CORE-05/security/production. Владелец
явно разрешил исправить смену fragment и закончить оставшуюся приёмку.
`hash-nav-before.json` подтвердил отсутствие изменений всех1235 файлов
предыдущего checkpoint; HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`, branch
`codex/frontend-pilot-composition`, dirty tree сохранён. Старые FAIL/BLOCKED
выше — история, а не причина нового rerun всех backend gates.

#### Что изменено

- `apps/landing-web/app/register/resume/resume-fragment.ts` наблюдает initial
  hash и hashchange; одинаковый token не сбрасывает форму, unmount снимает listener.
- `page.tsx` выделяет существующую форму в keyed component текущего token.
  При переходе к другому proof сбрасываются details/password/confirmation/busy/
  feedback/success. Старый inspect имеет cleanup и не подменяет новый контекст.
  Это локальная state lifecycle correction; API/Prisma/token rules не изменены.
- Unit4cases и расширенный существующий Playwright spec. Реальные emailed links
  открываются без принудительного reload для обхода дефекта. Дополнительный
  UI-only case моделирует медленный inspect и смену proof/очистку формы/receipt.
  Safe JSON readback сохраняется отдельным artifact, не только сообщением runner.

#### Итоговый ledger

Все свежие gates прошли с первой попытки после конкретного исправления,
разрешённого владельцем; прежние3web failures не удалены/не названы PASS.
Root commands используют корректный Turbo cache неизменённых inputs.
Artifacts: прежняя папка `remediation/AUD-FIX-03.2/`, новые `hash-nav-*` файлы.

| Команда / artifact | Результат | Граница |
| --- | --- | --- |
| `npm run typecheck`; `hash-nav-typecheck` | PASS13.208s,15/15tasks,13cached | Свежие landing/E2E; неизменённые пакеты REUSED_PASS |
| `npm test`; `hash-nav-tests` | PASS2.401s,14/14tasks,13cached | Свежие landing7/7, включая fragment4/4; API237 и остальные прежние workspace suites из корректного cache |
| Next CLI `build --webpack`, isolated landing; `hash-nav-build` | PASS33.710s | Production/pilot, loopback API4112; main dev checkout не запускался/не пересобирался |
| Playwright CLI `test --config playwright.registration-resume.config.ts --max-failures=1`; `hash-nav-web` | PASS5/5,23.050s runner | Scoped verify:web, Chromium desktop1440×900 и touch viewport390×844, retries0 |
| Ранее API/PG/authority/rate-auth gates | REUSED_PASS | Исходники/schema/lockfile/production rules/compiled API не менялись; evidence в предыдущих ledger. Новая UI правка не требует нового seed/API build/DB suite |
| Diff/docs/source-preservation | См. `integrity-hash-nav.json` | Проверка30files текущего change set, сохранности прочих исходников и совпадения с isolated copy; итоговые hashes в `final-hash-nav.json` |

Настоящие BUYER и SUPPLIER сценарии: та же pending заявка → conditional request
с busy/keyboard → реальное письмо в loopback receiver → same-tab inspect →
reload с пустым password → complete → серверное success/focus → повтор из
соседней вкладки. Для BUYER backend действительно фиксирует complete, после
чего ответ искусственно теряется; UI не выдаёт успех, сохраняет введённое,
reload получает receipt. Это transport simulation после настоящего commit,
не свидетельство реальной аварии backend. SUPPLIER использует существующий
password account. Local/sessionStorage в этих flow пусты; пароль туда не пишется.

Safe readback `BUYER-database-readback.json` и `SUPPLIER-database-readback.json`
в `hash-nav-web-artifacts/registration-resume-real-{B|S}-*/`:
каждый intentCount/userCount/organizationCount/membershipCount/auditCount/
outboxCount равен1, intent CLAIMED, email verified. Run namespace
`audit_resume_1789462507168_23712` сохранён только в согласованной audit DB.
Не создавались дубли, сессии этим resume не выдавались. Нормальный JWT login
и revoke доказаны ранее API suite; не заявляем новый полный browser login flow.

Остальные3cases: mobile inline validation и явно синтетический network failure;
настоящий API отказ invalid proof с безопасным requestId/retry/new-link;
явная UI-only подмена inspect/complete для проверки stale response и очистки
password/details/error/success при смене token. Синтетический case не считается
доказательством tenant isolation или backend rollback — это отдельные прежние gates.

Визуально просмотрены5уникальных screenshot: buyer-ready1440; supplier-ready390,
supplier-completed390; request-validation390; invalid-link390. Видимые controls,
ошибки и CTA читаемы, email переносится, focus успеха виден; текущий стиль сохранён.
Длинная форма прокручивается штатно. Это не физический mobile/tablet, не весь
viewport matrix и не полный UI/UX аудит. Все8снимков доступны рядом с результатами.

Owned API/mail/landing остановлены; listeners3103/4112 отсутствуют. Рабочая DB
`marketplace`, основной runtime и сторонние файлы не менялись; без migrations/
reseed/внешних отправок. Прочитаны и применены Agency Frontend Developer,
Evidence Collector и Playwright; недостающий внешний `ai/agents/qa.md` ранее
зафиксирован, project Workflow приоритетен. Без дополнительных агентов и commit/push.

**Учёт и остановка:** в Foundation только AUD-FIX-03.2 переведён в `[x]`;
ранние X сохранены, parent AUD-FIX-03 и AUD-FIX-03.3 остаются `[ ]`.
На DoD работа остановлена. Следующий отдельный запрос — AUD-FIX-03.3, если
владелец разрешит. Общая доставка verification/reset, операторский вход,
field-help rollout, CORE-05, POST-BE/POST-FULL и production не приняты этим fix.

### AUD-FIX-03.3 — CODED / BLOCKED: local mail / operator login, 2026-09-15

Последнее разрешение владельца: начать local delivery и штатный вход оператора;
объяснить, что письмо сохраняется локально, а не отправляется в интернет.
Branch `codex/frontend-pilot-composition`, HEAD
`3d644963ed72f99a100e180db2d373bc5abeaef9` + отдельный dirty baseline1237files.
Scope/инварианты/следующий шаг — [execution brief и checkpoint](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md#aud-fix-033--execution-brief-15092026).

Подготовлены общие contracts/client/OpenAPI, private JSON delivery без console
fallback, disabled-by-default local-only флаги, password operator endpoint с
проверкой active operator organization перед primary session; затем штатный MFA.
Landing показывает delivery mode; admin password form получает capability от
сервера и не сохраняет сессию до MFA. Production password/social policy не менялась.
Флаги НЕ активированы в основном запуске. Global JWT_REQUIRE_MFA применяется ко
всем ролям в отдельном operator fixture, не только к оператору; общее включение
его в демо с buyer/supplier требует учёта этого ограничения, не bypass.

Evidence: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-03.3/`;
runner `.tmp/aud-fix-03-3/run.mjs`; логи не содержат credentials/email links.

| Gate / точная команда | Исход / попытка | Evidence / ограничение |
| --- | --- | --- |
| `npm run build --workspace=@marketplace/schemas` | PASS1,3.396s | `schema-*` |
| `npm run typecheck` | PASS1,46.166s | `typecheck-*`;15tasks,5cached; до новых E2E specs и финальной типизации mock, не final revision certificate |
| `npm test` | FAIL1,5.125s Turbo | `tests*`; reused single Response body в новом API client test |
| `npm test` | FAIL2,11.645s wall | `tests-2-fresh-response*`; zero-arg mock tuple TS2493, исправлено только в test |
| `npm test` | FAIL3,27.134s wall | `tests-3-typed-fetch*`; buyer order-profile pilot timeout5000ms;10/14tasks completed,6cached |
| Новый local mail unit | PASS7/7 внутри попытки3 | private filename/mode, local no-fetch, prod/network deny, config missing, safe failures/provider contract |
| Новый local auth unit | PASS11/11 внутри попытки3 | operator org selection, tenant/inactive/unverified/lock/password/membership denial, reset generic ack + invalidation |
| Новый local config unit | PASS8/8 внутри попытки3 | opt-in/JWT/MFA/loopback/production validation |
| Schemas / API client | PASS72/72 и29/29 | включают2/1 новых local-auth tests; schema из корректного Turbo cache в попытке3 |
| Landing unit | PASS7/7 | в том числе существующие fragment regressions; не browser acceptance |
| Buyer unit | FAIL1/34,33PASS | pilot order-profile timeout, go_live casePASS2528ms; причина задержки не установлена |
| API suite / admin / supplier | INCOMPLETE / NOT_RUN | общий runner остановлен на buyer failure; отдельные pass не заменяют full suite |
| Финальный typecheck новых E2E/тестовой заглушки | NOT_RUN | остановка до нового запуска |
| API build / production config / real mail+MFA+PG / authority+rate-auth | NOT_RUN | обязательные gates не пропущены, приёмка остановлена |
| Landing/admin production builds + admin bundle / scoped Playwright | NOT_RUN | подготовлены test fixtures/specs; нет новых browser screenshots |

Один read-only просмотр buyer test после failure: timeout включает dynamic import
API client/BuyerOrders и server render. Test и purchase implementation этим slice
не менялись; shared API-client импорт изменился, поэтому ни flaky, ни отсутствие
regression пока не доказаны. Timeout/профиль/assertions не изменены. Четвёртого
запуска нет. Разрешённая следующая гипотеза — одиночный запуск без конкурентного
API suite для разделения нагрузки/импорта и прикладного assertion, только после
нового решения владельца. Не использовать смену runner для обхода лимита.

Использованы AGENTS/Workflow, UI standard, прочитанные Agency Backend Architect,
Frontend Developer, Evidence Collector: локальная граница, реальные auth guards,
разделение browser и DB evidence, no-success-before-server. Playwright practice
применена к подготовленным persistent regression specs по требованию проекта;
новый браузерный запуск фактически не выполнен. Нет дополнительных агентов.

Owned API/browser/DB fixtures этого slice не запускались; рабочая `marketplace`
не изменена, нет reseed/migration, provider sends, commit/push. Все прежние X
сохранены; AUD-FIX-03.3 и parent остаются открыты. Production/security/CORE-05
не приняты. Итоговые hashes и состав change set — `final.json` / `integrity.json`;
docs/diff проверяются отдельно без повторного запуска runtime suites.

### AUD-FIX-03.3 — разрешённое продолжение; browser startup BLOCKED, 2026-09-15

Это новый checkpoint, не перезапись предыдущих failures. Владелец явно разрешил
одну изолированную диагностику прежнего buyer timeout, затем оставшуюся приёмку
с bounded budget. До запуска все1248 hashes предыдущего final.json совпали;
branch/HEAD/lockfile прежние. Все evidence ниже в той же AUD-FIX-03.3 папке,
prefix cont-; result.json хранит wall duration, log — результаты runner.
Среда: audit DB dentmarket_audit_20260914, loopback, test/pilot JWT/MFA,
queues/external sends off, random test keys, независимый checkout/dependencies
для production Next artifacts. Main DB и основной runtime не переключались.

#### Изменения этого продолжения

- Никаких изменений buyer order-profile, его timeout или assertion. Разрешённый
  одиночный test2/2 PASS поддерживает гипотезу нагрузки, но не устанавливает
  причину прежнего timeout и не доказывает отсутствие flakiness.
- Admin после MFA больше не вызывает несуществующий GET /organizations/:id.
  Используется уже защищённый GET /organizations; helper проверяет конкретный
  activeOrganizationId и capability MARKETPLACE_OPERATOR. Две unit regressions
  отклоняют malformed/foreign/nonoperator context. Backend guard не ослаблен.
- New local fixture/spec доработаны по конкретным failures: startup-only
  diagnostics, CJS-compatible import compiled TOTP helper, реальный protected
  route, фактический amr=totp. Никаких повышений deadline или bypass MFA.
- В operations.md описаны локальные JSON-письма, их секретность/Windows ACL,
  выключенные по умолчанию flags и глобальная область JWT_REQUIRE_MFA.

#### Gate ledger продолжения

Длительности ниже — wall из result.json, если явно не указано другое.
Каждый prefix соответствует сохранённым command/cwd/PID/result/log.

| Команда / gate | Статус | Evidence / граница |
| --- | --- | --- |
| `npm exec --workspace=@marketplace/buyer-web -- vitest run app/features/purchasing/order-profile.test.tsx` | PASS2/2,9.541s wall;348ms tests | cont-isolated; единственная разрешённая isolated попытка |
| `npm exec -- turbo test --concurrency=1` | PASS14/14tasks,10cached,28.730s | cont-tests-serial; тот же full graph, API263/263, buyer34/34, admin21/21, supplier21/21, schemas72/72, client29/29, landing7/7 |
| `npm run typecheck` | PASS15/15tasks,10cached,19.383s | cont-typecheck; исходники до admin route fix |
| `npm run build --workspace=@marketplace/api` | PASS50.137s | cont-api-build; Prisma generate + compiled API; schemas build прежний PASS при unchanged inputs |
| `node scripts/verify-production-config.mjs` | PASS4.013s | cont-production-config; включает запрет обоих local flags в production |
| `node scripts/verify-local-auth.mjs`, попытка1 | FAIL20.731s, startup readiness | cont-local-api; до account operations, причина не установлена |
| Та же API-команда, попытка2 после startup diagnostics | FAIL8.511s, expected401/got404 | cont-local-api-2-diagnostics; API ready, выявлен отсутствующий organization detail route |
| Та же API-команда, попытка3 после использования existing route и проверки amr=totp | PASS15cases,15.985s | cont-local-api-3-existing-route; настоящее API/PG/mail/MFA, не mock |
| `node scripts/verify-platform-authority.mjs` | PASS26.445s | cont-authority; test seed только audit DB,32migrations/no pending; core pilot + отдельный owned test/go_live AI authority, без providers |
| `node scripts/verify-production-auth-contract.mjs` | PASS1.060s | cont-rate-config; production auth/rate bounds, MFA/Redis required, dev auth rejected |
| rate-limit-auth unit components | REUSED_PASS | API263 включает rate-limit-storage4/4 и envelope5/5; не дублирован aggregate wrapper с повторной API build |
| `node scripts/verify-registration-resume.mjs` | PASS10cases,21.111s | cont-resume-api; loopback mail receiver, реальные PostgreSQL proof/rollback/concurrency, не внешняя отправка |
| `npm exec -- turbo test --concurrency=1`, после admin fix | PASS14/14tasks,13cached,3.903s | cont-tests-admin-route; fresh admin23/23, неизменённые suites из корректного cache |
| `npm run typecheck`, после admin fix | PASS15/15tasks,13cached,16.278s | cont-typecheck-admin-route; новая реализация проверена; поздние E2E helper edits ещё не покрыты |
| Next CLI `build --webpack`, isolated landing | PASS43.255s | cont-landing-build; production build, pilot, API4112 |
| Next CLI `build --webpack`, isolated admin | PASS70.338s | cont-admin-build; одна команда, внутри Next один retry после socket hang up, затем успех; не скрыт как отсутствие сетевой ошибки |
| `node scripts/verify-admin-bundle.mjs` на isolated artifacts | PASS0.092s | cont-admin-bundle;16files,945472raw/286181gzip bytes; лимиты20/1050000/330000 |
| `npm run typecheck --workspace=@marketplace/e2e` | PASS11.252s | cont-e2e-typecheck; до CJS/IPC corrections, не сертификат последних helper edits |
| Playwright CLI `test --config playwright.local-auth.config.ts --max-failures=1`, попытка1 | FAIL2.190s до tests | cont-web; import.meta несовместим с CJS test loader |
| Тот же Playwright после CJS helper fix, попытка2 | FAIL22.146s, fixture startup | cont-web-2-cjs-loader; owned fixture exited1; пользовательские действия не начались |
| Тот же Playwright с private IPC startup diagnostics, попытка3 | FAIL21.522s, API4112 unreachable | cont-web-3-startup-diagnostics; readiness20s, диагностический stdout/stderr buffer пуст;1failed setup/2NOT_RUN,0UI assertions |
| Final E2E typecheck последних helper edits / resume scoped browser / visual review | NOT_RUN | остановка после третьего web failure; desktop/mobile/mail success/MFA screens не приняты |
| `git diff --check`, docs file links, source/lock preservation | См. cont-integrity.json | cont-final.json привязывает dirty inputs; история before/final/integrity предыдущего checkpoint сохранена |

Standalone real-auth runId audit_local_auth_1789465917257_10420 проверил:
настоящие verification/reset письма в private local JSON, sequential verification
replay deny, live OpenAPI, tenant deny до session creation, wrong password,
anonymous, primary без MFA, TOTP enrollment/elevation и повторный MFA challenge,
bad MFA, одинаковый forgot ack, reset replay/expiry, отзыв старых sessions,
валидность нового password. Это API evidence, не полный browser flow.
Secret-bearing synthetic JSON-письма удалены own fixture cleanup после отзыва
сессий; DB records сохранены. Удалённые одноразовые payload не нужны повторно;
новое письмо получают штатным повторным запросом, не восстановлением старого token.

Resume runId audit_resume_1789466023918_23624: actual pending без account,
foreign email/BIN/capability deny, concurrent single claim, consumed receipt,
normal API login/revoke, existing password not reset, supplier authority без
сфабрикованного marketplace agreement, expired proof, transaction rollback/retry.
Последний rollback был искусственно инициирован owned test trigger в audit DB;
trigger очищен. Это реальная обработка транзакционного сбоя, не реальный инцидент.

#### Блокер, оставшиеся проверки и безопасная остановка

Последний diagnostic: phase=startup-only, port4112, status=unreachable,
diagnostic empty. Не удалось установить, на чём задержался дочерний compiled API
в snapshot под Playwright; нет подтверждения ошибки UI, БД или security runtime.
Успешный standalone API gate выполнялся из основного source checkout в отдельном
runtime cwd; его PASS нельзя выдавать за успешный старт второго checkout.
Последующие local-auth tests не запускались; никаких новых browser screenshots
успешного сценария нет. Проверка touch viewport не выдаётся за физический телефон.

Лимит нового web gate исчерпан:3FAIL, четвёртого запуска нет. Owned cleanup
выполнен; после последней попытки listeners3100/3103/4112 отсутствовали.
Не запускались заново full purchase/PostgreSQL/core-contract, buyer/supplier
builds, полный web/security/release: их область не менялась, они не объявляются
свежими PASS. Производственная среда/EXT/CORE-05/POST-BE/POST-FULL не приняты.

Один следующий запрос: разрешить bounded-диагностику compiled API из audit
checkout вне Playwright с теми же DB/env/20s deadline и безопасной фиксацией
PID/exit/readiness, без account writes. Сначала объяснить отличие от успешного
standalone gate; затем только по новому основанию завершать remaining web,
visual/resume regression и E2E typecheck. Таймауты/assertions не ослаблять,
пройденные unchanged gates не повторять, AUD-FIX-04 не начинать.

AUD-FIX-03.3 остаётся CODED / BLOCKED, parent AUD-FIX-03 открыт; прежние X не
менялись. Commit/push нет. Применены прочитанные Agency Backend Architect,
Frontend Developer, Evidence Collector: tenant/MFA boundary, fail-closed feedback,
разделение runtime evidence и интерфейсной приёмки. Playwright skill применён
к persistent project regressions и фактическому runner; playwright-cli browser
session не использовалась. Нет дополнительных агентов/интеграций/редизайна.

#### Отдельно обнаружено: AUTH-ORG-LOOKUP-01

P1, SOURCE-CONFIRMED / browser NOT_RUN / исправление OPEN. Landing ordinary
password login → openWorkspace при отсутствующей capability вызывает
GET /organizations/:id; OrganizationsController имеет GET collection, но не
detail. Ошибка404 способна остановить handoff клиники/поставщика после успешного
пароля. Точные source paths и минимальная tenant-safe рекомендация —
[Access remediation, отдельный пробел](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md#отдельный-пробел-auth-org-lookup-01--вне-aud-fix-033).
В этом slice не исправлено и не воспроизведено через buyer/supplier UI; нельзя
подменять lookup на operator-only collection или автоматически расширять scope.

### AUD-FIX-03.3 — ACCEPTED после разрешённой диагностики, 2026-09-15

Новое решение владельца: продолжать необходимые задачи и устранять подтверждённые
блокеры плана. Preflight: все1248files cont-final.json unchanged, тот же HEAD/branch.
Дальнейшие source edits: только локатор reset password и дополнительные assert
active org/totp в local-auth E2E; runtime/API/web sources и lockfile не менялись.
Это не основание повторять ранее принятые root/API/config/build checks.

| Gate / команда | Результат | Evidence |
| --- | --- | --- |
| Isolated compiled API startup, diagnostic preload, вне Playwright | health200 за12.553s при прежних20s | startup-probe.json / next-startup-diagnosis; PID5420 stopped, API entrypoint hash matches main, без account requests |
| Playwright local-auth, первая попытка после preflight | FAIL на test selector, до reset submit | next-web-preflight; registration/mail/email verification/forgot прошли; getByLabel совпал с region и input |
| `npm run typecheck --workspace=@marketplace/e2e` после исправления locator | PASS9.692s | next-e2e-typecheck; включает прежние CJS/IPC fixes |
| Playwright `test --config playwright.local-auth.config.ts --max-failures=1` после locator fix | PASS3/3,18.9s runner,19.471s wall | next-web-labelled-input; retries0,1worker; desktop1440×900 / touch viewport390×844 |
| Playwright `test --config playwright.registration-resume.config.ts --max-failures=1` | PASS5/5,18.6s runner | next-resume-web; новый прогон изменённой delivery страницы, same-tab/reload/two-tabs и DB readback |
| Root test/typecheck, API build, config/auth/rate/authority, real auth/resume PostgreSQL, обе Next build и admin bundle | REUSED_PASS | предыдущий cont-* ledger; исходники/lock/профиль не менялись. Последние E2E inputs отдельно typechecked и реально исполнены |
| Visual review | PASS в объёме5снимков | next-web-labelled-input-artifacts: operator login/enrollment desktop, MFA error mobile, registration/reset success mobile |
| Diff, docs file links, preservation | next-integrity.json | next-final.json; история cont-* не перезаписана |

Startup probe зарегистрировал main require11.940s, bootstrap9.471s,
app.module8.266s, imports.module3.304s; интервалы вложены, складывать нельзя.
Синхронная загрузка модулей занимает основное время этого запуска. Это не
доказательство, что именно она объясняет все предыдущие таймауты: сравнимых
данных тех зависаний нет. Timeout не увеличивали, module composition не меняли.

Реальные browser outcomes: local-file registration → фактический verification
API → readback userCount1/verified → forgotten password → reset по доставленной
ссылке → старый пароль401/новый201. Operator: password → MFA enrollment → до
MFA sessionStorage пуст → elevated session active org/totp проверены → protected
GET /organizations200; mobile relogin challenge, wrong code deny, затем успех.
Tenant password не открывает operator MFA/session. Отдельная client-options503
имитация UI-only скрывает local form и не считается реальным backend outage.

Просмотренные5из5снимков показывают читаемые labels/CTA/feedback без обрезания
основного действия на выбранных viewport. MFA secret/recovery codes закрыты
маской; trace disabled, test afterEach убирает secret-bearing DOM перед
автоматическим error-context. Синтетические email в screenshots допустимы.
Оставшийся английский текст Invalid MFA code — копирайтинг AUD-FIX-08, не
blocker работы MFA. Не заявлены физические устройства, screen-reader acceptance,
полный admin dashboard, обычный buyer handoff или production readiness.

Resume web подтвердил обе роли: один intent/user/org/membership/audit/outbox;
BUYER искусственно теряет HTTP response после настоящего commit и восстанавливает
состояние без дублей. Остальные network/late-inspect simulations отмечены отдельно.
Owned processes остановлены, listeners3100/3103/4112 отсутствуют. Только audit DB;
local auth cleanup отозвал созданные sessions и удалил собственные JSON-письма,
тестовые DB rows оставлены. Main runtime, working DB, dependencies не менялись.

Foundation: AUD-FIX-03.3 [x]; parent AUD-FIX-03 открыт, добавлен отдельный
AUD-FIX-03.4 для AUTH-ORG-LOOKUP-01 как разрешённый владельцем блокер. К следующему
исправлению переход только после diff/docs/integrity PASS. Применены прочитанные
Agency Evidence Collector/Frontend Developer и Playwright practice для
разграничения доказательств и проверок интерфейса. Без агентов, commit/push.

### AUD-FIX-03.4 — CODED / BLOCKED: own workspace context, 2026-09-15

Scope разрешён как необходимый AUTH-ORG-LOOKUP-01 blocker: minimal read-only
GET /auth/workspace-context, shared schema/client/OpenAPI, active user/member/org
lookup, landing handoff consumer и regression. Tenant/actor берутся из штатного
JWT context; новые directory права не выдаются, handoff algorithm не меняется.
Branch codex/frontend-pilot-composition, HEAD3d644963ed72f99a100e180db2d373bc5abeaef9,
dirty inherited changes сохранены. Snapshot before.json1248files; итоговые inputs
и scope preservation — final.json / integrity.json, lockfile не менялся.

Evidence root: C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-03.4/.
Команды через ignored bounded runner .tmp/aud-fix-03-4/run.mjs; npm commands ниже
исполнялись установленным npm-cli через Node. Browser/build — независимый physical
checkout, test/pilot, API4112; только согласованная dentmarket_audit_20260914,
loopback, queues/external sends off. Рабочую demo DB не трогали.

| Gate / команда | Статус | Evidence / граница |
| --- | --- | --- |
| `npm run build --workspace=@marketplace/schemas` | PASS | schema; опубликован minimal response |
| `npm exec -- turbo test --concurrency=1` | PASS14/14; финально13cached | tests, tests-final-contract; новые schema2/API3/client1/landing8 regressions; API266, schemas74, client30, landing15 |
| `npm run typecheck` | PASS15/15; финально14cached | typecheck, typecheck-final-contract; application inputs приняты, поздние E2E edits требуют отдельной проверки |
| `npm run build --workspace=@marketplace/api` | PASS | api-build-protected-contract после protected OpenAPI metadata |
| Standalone `node scripts/verify-workspace-context.mjs` | PASS17сценариев, попытка3 | api-context-contract-envelope; actual JWT/PG, без подмены API |
| `next build --webpack`, landing/buyer/supplier | PASS3builds | landing-build, buyer-build, supplier-build; dev одновременно не запускался |
| Workspace Playwright, попытка1 | FAIL до UI | web-context: API readiness20s |
| Workspace Playwright, попытка2 | FAIL test instrumentation | web-context-bounded-setup: response body discarded after cross-origin navigation |
| Workspace Playwright, попытка3 | FAIL overall; 2PASS/1FAIL | web-context-observed-exchange: buyer2.9s/supplier1.3s; disabled-membership locator неоднозначен,16.4s runner |
| Operator Playwright после общей setup-правки | BLOCKED / не запущен | остановка после лимита; прежний03.3 pass не выдан за новый helper regression |
| Final `npm run typecheck --workspace=@marketplace/e2e` | BLOCKED / не запущен | последние75s IPC/exchange observer test edits ещё не typechecked |
| Docs links/diff/source preservation | integrity.json | отдельная read-only проверка, не runtime gate |

Standalone history: первая попытка API readiness20s FAIL. Разрешённое отдельное
наблюдение compiled API health200 за5.335s, без account requests; причина прежней
вариативности не доказана. Вторая попытка ошибочно требовала requestId на раннем
JWT middleware401. Исправлен только test под опубликованный errorResponseSchema:
requestId optional; при наличии header проверяется совпадение. App error/security
policy не менялась. Третья17PASS: обе роли/context, empty operator capabilities,
без directory permission, отсутствие записей при read, anonymous/foreign/spoof,
operator list/wrong capability deny, два one-time handoff, disabled member/org/user,
revoked session и фактический OpenAPI. Это не всё tenant lifecycle API.

По разрешению владельца на blockers setup ограничен одним60s budget для API+
выбранных web apps вместо отдельных20s на каждый; parent IPC75s внутри test90s.
HTTP1500ms, action10s/navigation20s, assertions и app security неизменны. Это
явная однократная test setup-правка, не доказанный performance fix. Общая fixture
теперь требует оставшегося operator regression; MFA policy не ослаблялась.

Два browser PASS доказывают нормальный пароль → own context → настоящий target
workspace → нужная sessionStorage org/capability → ровно +1session/+1consumed
handoff в DB; replay401, URL fragment очищен, старый detail API не вызывался.
Третий case не завершён: alert locator совпал с сообщением и Next announcer,
последующие no-redirect/no-handoff/DB assertions NOT_RUN. Это test blocker,
не доказательство дефекта блокировки аккаунта. После3FAIL четвёртого запуска нет.

Просмотрены3screenshots последней попытки. Buyer показывает каталог с permission
toast, supplier — permission error state: synthetic roles намеренно минимальны
для входа; полномочный dashboard/закупка этим gate не приняты. Masked error form
не содержит секретов; скриншот не заменяет невыполненные negative assertions.
Touch viewport390×844 не физический телефон. Traces выключены; test DOM очищен.
Owned cleanup завершён, listeners3100–3103/4112 отсутствуют; sessions отозваны,
собственные secret-bearing mails удалены, synthetic DB rows retained.

Чекбоксы03.4/parent03 остаются открыты, исторический03.3[X] сохранён.
Один следующий точный запрос — уточнить только negative alert locator и принять
этот case без повторения двух неизменённых положительных; затем operator regression
и E2E typecheck. Нужен новый разрешённый bounded checkpoint, не автоматический
четвёртый запуск. AUD-FIX-04, purchase/full Postgres/release/security/production
не запускались и не заявлены PASS. Применены прочитанные Agency Backend Architect,
Frontend Developer, Evidence Collector и Playwright practice: narrow contract,
tenant-safe feedback, реальные API/DB readbacks, разделение partial/blocked.
Новых агентов, внешних интеграций, redesign, commit/push нет.

### Пауза по запросу владельца — checkpoint 2026-09-15

Исполнение остановлено по явному запросу «останови выполнение задачи — зафиксируй
шаг выполнения». Это отменяет продолжение ранее разрешённой очереди до нового
запроса. Состояние работы PAUSED; техническая приёмка AUD-FIX-03.4 остаётся
CODED / BLOCKED, не PASS. AUD-FIX-03.3[x] сохранён,03.4/parent03 остаются[ ].

Точка остановки: apps/e2e/tests/workspace-context.spec.ts, negative test
`disabled membership never redirects or issues a handoff`, assertion
`expect(page.getByRole('alert')).toContainText(...)` (строка79 на checkpoint).
Последний запуск web-context-observed-exchange:2PASS/1FAIL, третья из3попыток.
Причина — два alert (authNotice и Next route announcer). Locator ещё не исправлен;
проверки отсутствия redirect/handoff и итоговый DB readback этого case не выполнены.

При будущем разрешённом возобновлении: проверить изменившиеся inputs, уточнить
только этот locator и выполнить negative case; два неизменённых положительных
browser PASS переиспользовать. Затем operator regression общей fixture и final
E2E typecheck. Root suites/builds/API не повторять без изменившихся inputs,
лимит попыток не обнулять автоматически. AUD-FIX-04 не начинать до принятия03.4.

Сохранённая версия: branch codex/frontend-pilot-composition,
HEAD3d644963ed72f99a100e180db2d373bc5abeaef9, незакоммиченные изменения сохранены.
Evidence: AUD-FIX-03.4/final.json (1255files) и integrity.json PASS, snapshot SHA256
47ef9f2ab02940b4960250c6f2a37d43a5af974ce69c1a257d96f2ae7761c61e в ранее указанной
внешней папке remediation. Это snapshot ДО данной docs-only отметки паузы;
исторические evidence не перезаписаны. Runtime код сейчас не изменялся.
Повторная read-only проверка: listeners3100/3101/3102/3103/4112 отсутствуют.
Не запускались тесты/сборки/БД, чужие процессы не останавливались; commit/push нет.
Использована уже прочитанная практика Evidence Collector: сохранить конкретный
checkpoint, partial evidence и незавершённые assertions без ложного закрытия.

### AUD-FIX-03.4 — разрешённое возобновление, 2026-09-15

Владелец явно возобновил выполнение с checkpoint. Preflight resume-before.json:
1255files, те же HEAD/branch/lockfile; с предыдущего final.json изменены только
Foundation/Matrix для записи паузы. Исходники runtime checkout совпадают с main
(generated next-env.d.ts не используется для source-сверки); API/schema и четыре
web BUILD_ID hashes зафиксированы. Порты3100–3103/4112 свободны.

Изменён только negative E2E case: alert с ожидаемым текстом вместо неоднозначного
всех alert; добавлено безопасное evidence после прежних assertions (path/counts,
без токенов/email/password) и screenshot самого сообщения. Два положительных
case и shared helpers не меняются. API/UI/права/таймауты прежние. Первые3FAIL
сохранены, новый запуск разрешён на конкретно изменённом test input, не из-за
нового чата. Выполняется только --grep negative, затем local-auth operator/shared
fixture regression и final E2E typecheck. По одному запуску remaining gate;
повторный сбой → checkpoint/остановка, без автоматической новой серии повторов.
Budget: suite45min,command20min,blocker15min; readiness60s общий, IPC75s/test90s,
UI assertion10s/navigation20s, retries0. Только одобренная audit DB и owned
processes/files; рабочую demo DB не изменять. Полные неизменённые root suites,
сборки, API17 и два positive UI PASS переиспользовать по проверенным inputs.
Практики: Agency Evidence Collector и Playwright persistent regression согласно
согласованной карточке; это не новый UI-аудит или изменение business scope.

### AUD-FIX-03.4 — ACCEPTED, remaining gates завершены 2026-09-15

Изменение относительно resume-before.json: только workspace-context.spec.ts
negative case и4актуальных документа; application code, fixtures, dependencies,
профили/лимиты не менялись. Два positive case в том же файле без изменений.
Evidence в ранее указанной папке AUD-FIX-03.4; resume-* не заменяют старые логи.

| Gate / фактическая команда | Результат | Evidence |
| --- | --- | --- |
| Playwright `test --config playwright.workspace-context.config.ts --grep "disabled membership never redirects or issues a handoff" --max-failures=1` | PASS1/1,56.0s runner,58.104s wall; case2.0s | resume-negative-alert; первая разрешённая targeted попытка после locator fix, retries0 |
| Playwright `test --config playwright.local-auth.config.ts --max-failures=1` | PASS3/3,15.4s runner,15.922s wall | resume-operator-regression; общий60s setup helper, штатные landing/admin production artifacts |
| `npm run typecheck --workspace=@marketplace/e2e` | PASS17.609s wall | resume-e2e-typecheck; включает75s IPC, exchange observation и final locator |
| Два normal buyer/supplier Playwright case | REUSED_PASS2/2 | web-context-observed-exchange; bodies/shared fixtures/app sources неизменны, тот же profile/artifacts |
| Root typecheck/test, API/schema build, real API/PG17 и landing/buyer/supplier builds | REUSED_PASS | прежние final-contract/API/build logs, hashes resume-before.json; test-only изменение не требует нового runtime build |
| Visual | проверены4новых снимка | negative membership alert; operator MFA enrollment1440×900 (secret masked), MFA error390×844, password reset success390×844 |
| Diff/docs/source preservation | resume-integrity.json | resume-final.json1255files; неизменные runtime artifacts и source inputs проверены отдельно |

Negative case теперь выполнил все прежние assertions: текст отказа в конкретном
alert, pathname/login, отсутствие handoff request, отсутствие прироста consumed
handoffs по реальной audit DB. Новый screenshot содержит только сообщение, без
ввода пользователя. Guard не отключался; никакого request mocking в этом case.

Operator regression: actual local-file verification/reset, old password401/new201;
password → MFA enrollment → session только послеTOTP → protected organizations200;
relogin challenge/wrong code deny/retry и tenant deny. Только client-options503
сценарий явно UI-only simulation; он не выдаётся за фактический backend outage.
Masked MFA screenshot не содержит secret/recovery codes, trace off. Invalid MFA
code на mobile — уже известный AUD-FIX-08 copy gap. Физические устройства,
screen readers, весь admin/buyer/supplier dashboard не приняты этим набором.

Workspace покрытие3/3:2REUSED_PASS +1fresh PASS, не полный повтор suite. Ранние
3FAIL и пауза остаются в истории; новый targeted запуск обусловлен явным решением
владельца и конкретным selector fix. После PASS нет повторных запусков. Root
сuites и build не запускались повторно: relevant application inputs не изменены.
Owned listeners3100–3103/4112 отсутствуют; fixture отозвала только свои sessions
и удалила свои secret-bearing mails, synthetic DB rows сохранены в audit DB.
Main demo runtime/DB, npm/dependencies/lockfile и посторонние dirty changes сохранены.

Foundation03.4[x] и parent03[x] в границе audit fixes; ранее принятые03.1–03.3
сохранены. CORE-05/общая security/production/POST-BE/POST-FULL не закрыты.
Следующий отдельный запрос — AUD-FIX-04: явная коррекция корзины. Не начат.
Branch codex/frontend-pilot-composition, HEAD3d644963ed72f99a100e180db2d373bc5abeaef9,
commit/push не запрашивались и не выполнялись. Применены прочитанные Agency
Evidence Collector и Playwright practice для narrow regression/reuse/checkpoint;
новые агенты, интеграции, redesign и новый параллельный план не создавались.

### AUD-FIX-04 — CODED / BLOCKED, checkpoint 15.09.2026

Разрешение владельца: начать явную коррекцию корзины и объяснить scope.
Brief — Purchasing/Documents remediation §3; единственный checkbox Foundation §8
остаётся [ ]. Branch codex/frontend-pilot-composition,
HEAD3d644963ed72f99a100e180db2d373bc5abeaef9. Входы before.json1255files;
итоговые source hashes — final.json, сохранность чужого change set — integrity.json.
Evidence root: C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-04/.
Lockfile3b68661abaf2dd88f677b48321b4d701e23f3b94dc41b33f461f9d23fd950919 неизменён.
Node24.18.0/npm11.16.0, Next16.2.11, Prisma6.19.3, Vitest3.2.7, Playwright1.61.1.
Профиль pilot; PostgreSQL dentmarket_audit_20260914@127.0.0.1:5432/public,
никаких действий в marketplace. Перед началом500products/500publishedOffers;
использован штатный test seed только этой разрешённой audit DB.

**Код:** PATCH/DELETE cart item с mandatory expectedVersion; quantity>0/≤1000000/
6decimals; owner/permission checks; atomic parent-version claim; explicit update
по прежней цене; repeat current-version no-op; unavailable delete; empty canCheckout=false.
Add/reprice/checkout сериализованы через ту же Cart; идемпотентный checkout сохраняет
same-key recovery при конкурентном конфликте. Buyer отправляет displayed version
при reprice/checkout, блокирует actions при draft/pending/stale validation. Draft
не теряется при409/сетевом сбое; после concurrent checkout остаётся локальным,
не перезаписывает исторический заказ. Дизайн/интеграции/права/Prisma schema не менялись.

| Gate / фактическая команда | Статус и attempts | Evidence |
| --- | --- | --- |
| Root tests: `npm exec -- turbo test --concurrency=1` (тот же набор npm test, по одному workspace) | Первый запуск PASS14/14,95.792s; schema86/API274/buyer47 и остальные workspace suites | tests |
| Root typecheck: `npm run typecheck` | PASS15/15,80.933s; после metadata/focus+E2E изменений PASS15/15,64.693s; финальные оставшиеся TS inputs — typecheck-checkpoint | typecheck, typecheck-final, typecheck-checkpoint |
| Schema/API prerequisites | Schema build выполнен root tests/typecheck, API build PASS80.462s; после display-metadata fix повторён только API build PASS40.190s | api-build, api-build-final |
| `node scripts/verify-postgres-integration.mjs` (verify:postgres после тех же schema/API prerequisites) | PASS5groups; final PASS19.994s после metadata assertion | postgres, postgres-final |
| `node scripts/verify-pilot-backend.mjs --contract-only` (verify:core-contract с выполненными prerequisites) | PASS; final10.184s,21selectedOperations,269inventory/65schemas; catalog50buyable/500offers | core-contract, core-contract-final |
| Root tests после metadata/focus changes | FAIL:273/274 API pass, один unchanged PDF test timeout5000ms; остальные завершённые10tasks успешны; suite остановлен, не выдаётся за green root run | tests-final34.102s |
| PDF blocker, один isolated retry: `npm run test --workspace=@marketplace/api -- src/modules/documents/document-renderer.spec.ts --maxWorkers=1` | PASS8/8,4.892s wall; проблемный case1.818s, timeout5000ms не менялся; считать flaky aggregate result, не «ошибок не было» | pdf-isolated; третья попытка в общей test-gate последовательности |
| `npm run test --workspace=@marketplace/buyer-web` | PASS47/47,5.220s; последующие изменения только hook draft retention и browser test, pure test/model inputs неизменны | buyer-tests-final; API273pass+isolatedPDF покрывают финальный API, остальные unchanged workspaces REUSED_PASS |
| Isolated Buyer `next build --webpack` | 1)PASS91.676s;2)PASS48.574s на промежуточных inputs;3)CANCELLED33.739s, не PASS | buyer-build, buyer-build-final, buyer-build-accepted (**имя не означает принятие**) |
| Scoped Playwright `test --config playwright.cart-correction.config.ts --max-failures=1` | BLOCKED0/3 accepted: beforeAll/API startup unreachable60s, fixture exited1; actions0ms,2NOT_RUN; retries0 | web66.402s; error-context не proof работы UI |
| Последний source JS parse/docs/diff/preservation | Финальные `node --check` cart fixture/PG script, `git diff --check`, ссылки и integrity | checkpoint; не заменяют browser gate |

PG реально проверил own/foreign PATCH+DELETE, invalid quantity, insufficient100
без clamp, stale edit/reprice/checkout, old-price retention→acceptance, no-op
metadata, unavailable last-line removal, repeat delete/audit count, empty validation,
edit-vs-checkout с ровно одним победителем и исторической quantity; прежние rollback,
same-key idempotency и scarce-stock contention также PASS. Fixtures убраны штатным
cleanup конкретных IDs, seed demo offers не менялись. Это не полный security scan.

**Почему browser не принят:** API fixture не стал ready за60s (startup diagnostics
пустые). Во время завершения старой последовательности исполнитель ошибочно запустил
новые copy/build, полагая, что web ещё не начался. Фактически старый launcher уже
перешёл к web. Пересечение делает browser/runtime evidence непригодным; нельзя
приписывать timeout дефекту бизнес-кода. Остановлено только дерево собственной третьей
Buyer build (PID из buyer-build-accepted-process.json); fixture завершила свои
процессы. Listeners3101/4112 после завершения отсутствуют. Новые buyer fixture
accounts/offers не создавались: beforeAll не дошёл до ready/createCase. Основной
dev runtime не останавливался. Частичный .next **не считается готовым artifact**.

Все три browser сценария сохранены в source: price/stock→explicit correction→
acceptance→real checkout; mobile invalid/help/Escape/focus/delete/empty; real409→
draft reconcile→**явно simulated lost HTTP response после настоящего commit**→
no-op retry→concurrent checkout. Последний сценарий и screenshots **NOT_RUN**,
никаких visual/mobile/keyboard PASS сейчас нет. Число3 — только этот bounded
набор, не процент покрытия всей платформы. Physical mobile/другие engines/общий
verify:web/production/security/release/POST-BE/POST-FULL не выполнялись.

**Stop и возобновление:** build attempts3, web attempt1; четвёртого автоматического
build не будет. .tmp/aud-fix-04/remaining.mjs отключён, его повторение запрещено.
Новый точный запрос: «Разрешаю один изолированный final Buyer build и scoped
AUD-FIX-04 browser acceptance с этого checkpoint; сначала проверить свободные
owned ports и source/artifact hashes, не повторять неизменённые root/API/PG/
core-contract gates, не повышать startup/test limits и не начинать AUD-FIX-05».
Сначала один зафиксированный runtime snapshot, затем законченный build, затем
runtime/browser; никаких copy/build во время запущенного runtime. Повторный
startup failure → bounded diagnostics и stop, без нового переписывания корзины.

Применены прочитанные Agency Backend Architect (границы/CAS/tenant), Frontend
Developer (общие компоненты/состояния) и Evidence Collector/Playwright practice
(версии, отдельные DB proofs, реальные сценарии vs simulation, честный BLOCKED).
Коммита/push/новых агентов/новых зависимостей нет. AUD-FIX-05 и production-приёмка
остаются открыты; пользовательские inherited tracked/untracked changes сохранены.

### AUD-FIX-04 — разрешённое возобновление, 16.09.2026

Пользователь ответил «продолжай выполнение задач» на предложение одного
изолированного final Buyer build и browser acceptance с checkpoint. Граница —
закончить AUD-FIX-04, не повторять принятый backend и не запускать AUD-FIX-05.
История3build attempts/1web startup failure не обнуляется и остаётся выше.

Preflight resume-before.json/resume-preflight.json: все1264source files,
HEAD/branch/lockfile неизменны относительно final.json;882compiled API/schema
artifacts main/runtime совпадают. Own listeners3101/4112 свободны, процессов
node с этим audit runtime в командной строке не обнаружено. Audit DB read-only
preflight подтвердил dentmarket_audit_20260914,500products/500publishedOffers;
рабочая marketplace не используется. Новых migrations/seed не требуется.

Execution: один snapshot → один отдельно законченный Buyer build → проверка
hashes artifact/source → один scoped Chromium suite, без параллельных build,
API suites и копирования файлов. .tmp/aud-fix-04/remaining.mjs не запускать.
Бюджет возобновления45min, command20min, blocker15min; startup60s/IPC75s,
test90s и retries0 сохраняются. Если startup снова не ready — записать
диагностику и остановиться без повторного запуска или изменения бизнес-кода.
Новая build разрешена явно; последующие попытки без нового основания запрещены.
Уже пройденные неизменённые typecheck/tests/API/core-contract/Postgres — REUSED_PASS
со ссылкой на прежние artifacts (включая честную историю flaky PDF timeout).

#### AUD-FIX-04 / UI-PORTAL-01 — выявленный блокер корзины

resume-buyer-build PASS49.976s. Hash check1135source/560build files подтвердил
snapshot; единственная ожидаемая generated-разница next-env.d.ts — production
route types вместо dev (исходный main файл не менялся). Проверочный helper
первоначально считал её source mismatch; это уточнение evidence, не изменение
сборки/приложения. Никаких одновременных build/runtime в этом возобновлении нет.

resume-web запустил API/Buyer и создал owned fixture, затем FAIL на штатном
click «Обновить корзину»: `[data-portal-node].mp-provider` перехватывает pointer
events; screenshot показывает закрывающий экран белый слой. Это реальный
UI-дефект, не startup failure. Чистый checkout/startup повторять уже не нужно.
Суммарно web attempt2 (1historical startup +1fresh UI failure), два следующих
case не выполнены. Fixture завершилась, свои offers retired, sessions revoked.

Причина подтверждена установленным Fluent source: Portal копирует root className,
позиционируется absolute/top0/left0/right0/zIndex1000000; общее `.mp-provider`
добавляло ему100dvh/background. Минимальный fix — исключить data-portal-node
из **единственного** правила геометрии страницы. Не менять theme/tokens,
pointer-events, бизнес-код, API или авторизацию; не применять force click.
Добавить CSS regression и live portal-layout assertion в существующий cart flow.
Из-за общего CSS проверить четыре web production builds последовательно,
UI unit/typecheck и тот же bounded browser suite. Это новое основание для
сборки после фактического изменения CSS, не повтор старого успешного build.
Общий45min budget/15min blocker и лимиты не повышаются; следующий web failure
будет третьим и остановит эту фазу. Другие AUD-FIX/CORE не начинать.

### AUD-FIX-04 — ACCEPTED после исправления UI-PORTAL-01, 16.09.2026

Граница не расширена: явная коррекция корзины и необходимое устранение
перекрывающего её Fluent portal. `packages/ui/src/styles.css` ограничивает
page geometry корневым provider, исключая `[data-portal-node]`; новый
`portal-layout.test.ts` защищает selector и запрещает маскировать дефект через
pointer-events:none. В существующий E2E добавлен actual idle-portal assertion;
force click/auth bypass/смена timeout не применялись.

Входы: тот же HEAD3d644963ed72f99a100e180db2d373bc5abeaef9,
branch codex/frontend-pilot-composition, прежние npm lock/toolchain. Main dirty
state сохранён. `portal-inputs.json` содержит1265source files; в runtime сверено
1136app/package/script файлов, четыре допустимых generated next-env differences
ограничены заменой dev route types на production. `portal-build-inputs.json`
фиксирует1820build files, кроме cache/trace. Все4build закончены **до** web,
runtime не изменялся во время приёмки; профильpilot, API4112/Buyer3101,
approvedDB dentmarket_audit_20260914. Unchanged882compiled API/schema files
сверены ранее `resume-preflight.json`; повтор backend не нужен.

| Gate / фактическая команда | Результат / время | Evidence в remediation/AUD-FIX-04 |
| --- | --- | --- |
| `npm run typecheck` после CSS/unit/E2E regression | PASS15/15,31.096s | resume-portal-typecheck |
| `npm exec -- turbo test --concurrency=1 --filter=@marketplace/ui --filter=@marketplace/buyer-web --filter=@marketplace/supplier-web --filter=@marketplace/admin-web --filter=@marketplace/landing-web` | PASS9/9tasks,110tests: UI4/Buyer47/Supplier21/Admin23/Landing15;20.322s | resume-portal-tests |
| Buyer `node node_modules/next/dist/bin/next build --webpack` в isolated app cwd | PASS63.365s; OrB4doI3MlkYVYnreJnMf | portal-buyer-build |
| Supplier тот же production build | PASS28.795s;2T4En3fIDtDKfXR5FTSMr | portal-supplier-build |
| Admin тот же production build | PASS30.964s;siO94NMRv2nhhP0ityC4W | portal-admin-build |
| Landing тот же production build | PASS30.119s;qM3KQiGl_4HH8XLYvplhZ | portal-landing-build |
| Scoped `node node_modules/@playwright/test/cli.js test --config playwright.cart-correction.config.ts --max-failures=1` в apps/e2e | PASS3/3,73.761s; третья общая browser попытка после startup и UI failure, retries0 | portal-web |
| Последняя E2E-only `npm run typecheck --workspace=@marketplace/e2e` | PASS; после окончательного idle-portal assertion, без нового root rerun | portal-e2e-typecheck |
| Read-only PostgreSQL after browser | PASS; actual persisted carts/orders/audit и cleanup | portal-db-readback.json, portal-readback |
| Visual review | PASS4screens для scope; desktop1440×900/mobile390×844, fullPage где нужно | portal-web-artifacts/**/*.png |
| `git diff --check`, docs links, source/artifact preservation, own listeners | PASS; итоговый snapshot и allowlist7paths | resume-final.json, resume-integrity.json |

**Что реально принято:**

1. Desktop: свой offer stock10→2 и price100000→150000; draft4→2 не записывается
   до Save. После Save DB qty2/price100000/total200000, один audit; checkout
   disabled. Отдельный акцепт меняет snapshot на150000, затем reload и настоящий
   checkout201 с историческими qty2/price150000. UI показывает diff остатка/цены.
2. Mobile390: помощь открывается Enter, Escape возвращает focus;0 остаётся
   invalid draft без записи, cancel возвращает4/focus. Unavailable строка
   удаляется только после явного подтверждения, cancel не удаляет. Последнее
   удаление даёт ACTIVE empty cart, один audit, focus на reload и CTA в каталог.
3. Реальный concurrent PATCH вызывает409 и сохраняет draft2; refresh показывает
   сохранённые3 без потери draft. Затем **искусственно потерян HTTP response
   после реального API commit**: UI не заявляет успех, сохраняет ввод; refresh/
   no-op retry оставляют два audit, не три. Concurrent checkout сохраняет qty2/
   price100000, последующая попытка draft5 даёт409; после refresh draft5 виден
   отдельно, история заказа не меняется. Это не тест настоящего backend outage.

Post-run readback16.09.2026:3syntheticusers,6из6sessions REVOKED,3offers INACTIVE
и marketplaceVisible=false,0remaining local mail files. Два checked-out cart
qty2 с ценами150000/100000, edits1/2; третья ACTIVE пустая, removals1.
Синтетические DB records сохранены для доказательств, production/main marketplace
не трогались. Запущены/завершены только собственные API/Buyer processes.

**Reuse и ограничения:** final PostgreSQL5groups/core-contract21operations,
schemas/client/API tests и compiled prerequisites — REUSED_PASS по предыдущему
ledger и hashes. Root aggregate `tests-final` имел flaky PDF timeout; isolated
8/8 PASS без изменения5000ms принят как union coverage, а не как новый чистый
aggregate run. UI-only source change не требует нового DB/security scan.
Полный общий `npm run verify:web` не запускался: принят именно scoped critical
flow из execution brief; нет заявления о полном web/regression coverage.
Другие engines, физический телефон, все tablet/desktop sizes, optional go_live
модули, CORE-03/08/09, release/security/production/POST-BE/POST-FULL — вне этой
приёмки. Четыре production builds профиляpilot не сертифицируют production.

Foundation: AUD-FIX-04[x], ранние01–03[x] сохранены; **осталось5из9 родительских
AUD-FIX блоков:05–09**. Это не5атомарных задач и не весь backlog проекта:
Foundation отдельно содержит30открытых numbered подпунктов CORE-01–08 и4условия
CORE-09, которые могут частично перекрываться с audit fixes. Не суммировать их
как независимые задачи и не закрывать целый CORE по одному принятому fix.

Применены AGENTS/Workflow/UI standard, прочитанные Agency Evidence Collector
(проверяемые статусы/снимки, не завышать readiness) и Frontend Developer
(минимальная общая CSS правка, keyboard/responsive regression); Playwright skill
использован для постоянных browser regressions на существующем runner. Taste/
редизайн, новые зависимости/интеграции/агенты не применялись. Коммита/push нет.
На DoD остановка; следующий отдельный этап AUD-FIX-05, пока NOT_STARTED.

### Разрешённая последовательность AUD-FIX-05–09 и backend review, 16.09.2026

Владелец явно разрешил05→06→07→08→09 с автоматическим переходом только после
полной зелёной приёмки этапа, затем отдельную комплексную проверку существующего
backend. CORE backlog не исполняется автоматически. Новые подтверждённые блокеры
разрешено исправлять минимально с regression; новые business decisions,
интеграции/dependencies/права или опасные data operations требуют остановки.
Без commit/push/PR, дополнительных агентов и внешних отправок. AUD-FIX-01–04
не открывать без конкретной регрессии. История выше сохраняется.

#### AUD-FIX-05 — execution brief / STARTED

Preflight `remediation/AUD-FIX-05/before.json`: HEAD3d64496, branch
codex/frontend-pilot-composition;1265files полностью совпали с accepted04
resume-final.json. npm lock неизменён, ports3101/3102/4112 свободны. Существующие
tracked/untracked изменения сохраняются. DB перед runtime проверить отдельно;
только dentmarket_audit_20260914, никаких reseed/clone основной marketplace.

Подтверждено source: `/catalog` независимо выбирает normalized minimum и первую
упаковку, подписывает цену только «от»; reset использует старый query и не
сбрасывает stock/sort; offset всегда0, Back/Forward не восстанавливает выдачу,
старый fetch способен перезаписать новый. SupplierOffers игнорирует существующие
saleUnit/baseUnitsPerSaleUnit при отсутствии отдельного packaging.

Scope: buyer catalog request/model/hook/card и price presentation продукта/
сравнения, supplier offer packaging view; существующие search/compare API без
изменения backend pricing/ranking/publication. Приоритет: один offer-источник
для цены упаковки, нормализованной цены, фасовки и supplier; точное строковое
представление minor units, отсутствие данных объясняется, не выдумывается.
Единый request snapshot для URL/query/category/stock/sort/offset, полный reset,
предыдущая/следующая страница, latest-request-wins, error/retry/empty/end.
Не менять root catalog search engine, CSV, договора, demo DB или дизайн.

DoD: pure regressions упаковки1/10/100, разные offers, missing fields/huge money;
request URL/reset/pagination; typecheck/root tests (serial workspace execution),
Buyer/Supplier production builds в isolated snapshot. Persistent Playwright:
real public API >24товаров, search/filter/reset/Back/Forward/end/reload,
price→detail consistency; labelled simulated network/error/race; supplier
own JWT/read API packaging, keyboard/desktop1440/mobile390. Backend contract/PG
gates только если соответствующий риск изменится; unchanged04 reused.
Gates45min suite,20min command,15min blocker; максимум3обоснованные попытки;
startup60s/IPC75s/test90s/retries0. Snapshot/build/runtime строго последовательно.
После каждого этапа — checkpoint и X только по факту. Красный обязательный
gate останавливает последовательность, а не запускает следующий AUD-FIX.

AUD-FIX-05 pre-build preservation: первая freeze-проверка обнаружила5параллельных
изменений в actual_docs/ui-ux/references/production-preview-2026-09-16:
DESIGN_SYSTEM.md, README.md, REFERENCE_ANALYSIS.md, STANDARD_AMENDMENT_PROPOSAL.md,
pages.js. Это не runtime-код и не действия текущего исполнителя. Сохранены и
отдельно fingerprinted в parallel-docs.json; не отменяют решение сохранять UI.
Повтор freeze обоснован точной классификацией этих5путей, не ослаблением проверки
неожиданных app/API изменений. Ранее пройденные typecheck15/15 и root tests14/14
не повторяются из-за новых reference docs. Новый E2E-only typecheck также PASS.

Вторая freeze-проверка обнаружила продолжающееся добавление reference assets
в том же preview-каталоге. Проверен consumer scope: apps/packages/scripts,
package.json и turbo.json не ссылаются на этот каталог; runtime snapshot его
не копирует. Поэтому весь **один известный параллельный reference-каталог**
fingerprint сохраняется отдельно от gate runtime inputs; не ждать окончания
чужой работы и не дополнять allowlist по каждому новому PNG/font. Это третья
попытка freeze с изменённой, проверенной предпосылкой; остальные неожиданные
пути по-прежнему останавливают проверку. Чужие reference files не изменялись.

AUD-FIX-05 web attempt1: setup FAIL, до browser actions не дошёл. Public catalog
вернул404; безопасная DB readback `public-context.json` доказала, что default
PUBLIC_CATALOG_ORGANIZATION_ID отсутствует, а штатная pilot buyer970000000001
есть и имеет BUYER capability. Это ошибка isolated fixture configuration,
не новый продуктовый запрет/дефект интерфейса. Как в verify-pilot-backend,
test harness получил opt-in publicCatalog и проверенный существующий buyer ID.
API/rights/БД/demo launcher не менялись; default других auth fixtures сохранён.
Regression — обязательный200/26результатов перед UI, плюс реальные browser
queries. Attempt2 обоснован этим изменением конфигурации; builds/TS/unit
не повторяются для двух MJS-only test harness правок. Перед запуском — syntax,
новый source snapshot, неизменность artifacts и free ports. First cleanup PASS:
26собственных offers retired,4sessions REVOKED,0mailfiles; рабочие данные не удалены.

AUD-FIX-05 web attempt2:5/6 PASS (public pagination/history/reset, product price
comparison/Escape/focus, mobile503retry, delayed-response race, supplier JWT
packaging); case6 FAIL element-not-found. DOM/source доказали ошибку precondition
теста: BuyerWorkspace применяет initial URL q только для гостя, а после JWT
тест ожидал автоматическую фильтрацию. Цена/фасовка в других cards читаемы;
искомый product00 находился за первым page24. Для приёмки изменённой presentation
case6 использует реальное textbox→Найти и дополнительно требует200 именно
authenticated marketplace/search. Assertions сумм/фасовки/DB не удалены.
Initial authenticated deep-link q отмечен как existing coverage observation;
root search engine не переписывается под новый тест. Attempt3 только case6,
неизменённые первые5 PASS переиспользуются; app artifacts неизменны. E2E TS
повторяется из-за изменённого spec. История failed aggregate сохранена,
не выдавать итог за чистый первый6/6run. Cleanup обоих runs PASS52offers retired,
8sessions REVOKED,0mailfiles; DB rows сохранены для evidence.

Перед attempt3 visual review выявил ещё ограничение evidence: screenshot
comparison снят во время opening fade (сквозной текст). Это пока не CSS defect.
Повторяется также case2 с ожиданием computed opacity1/opaque white surface и
animations disabled screenshot, чтобы отличить transition от реального дефекта.
В итоге attempt3 включает case2 visual +case6, остальные4не повторяются.
Последний E2E typecheck выполняется после обоих изменений spec; app builds не менялись.

#### AUD-FIX-05 — ACCEPTED / checkpoint16.09.2026

| Gate | Фактический результат / входы |
| --- | --- |
| DB preflight | PASS dentmarket_audit_20260914;504products/500published before phase; no reseed |
| `npm run typecheck` | PASS15/15; после финального pagination JSX оба production builds включили TS; финальный E2E `tsc --noEmit` PASS |
| `npm exec -- turbo test --concurrency=1` | PASS14/14; API274/274 fresh (PDF8/8 без timeout change),buyer65/supplier24 fresh;11cache tasks по неизменным keys |
| Buyer/Supplier `next build --webpack` | PASS2/2, sequential isolated checkout;943immutable build files, compiled API unchanged |
| Scoped Playwright catalog-polish | attempt1 setup404FAIL; attempt2 five PASS +case6FAIL wrong precondition; attempt3 grep case2/case6 PASS2/2;6distinct scenarios accepted, retries0 |
| Actual API / DB | Public26products,24+2pages; authenticated search200; price123450minor unchanged; final DB readback PASS |
| Cleanup |3owned runs:78offers INACTIVE/invisible,12sessions REVOKED,0mailfiles; retained synthetic rows, no primary DB writes |
| Visual |5final screenshots inspected: catalog reset1440, opaque comparison1440, labelled simulated503mobile390, supplier packaging1440, buyer price1280; old mid-animation screenshot superseded |
| Source/artifact preservation | before/inputs/fixture-inputs/case-inputs + final.json/integrity.json; inherited changes and separately fingerprinted parallel reference folder preserved |
| Diff/docs | `git diff --check` PASS; final local links/source/artifact consistency checked by finalize |

Changed source routes: catalog-request/model/hook, public /catalog, product
detail/comparison, root buyer price presentation, supplier packaging helper;
pure regressions26cases (16price/model+7request+3supplier). API/contracts/pricing/
ranking/rights/agreement/checkout не менялись. Test-only local-auth public catalog
context opt-in следует штатному pilot setup. Нет новых зависимостей/интеграций,
агентов/редизайна/commit/push. Применены Agency Frontend Developer/Evidence Collector
и Playwright: same-offer data, explicit states, persistent real-API browser proof;
no forced clicks/auth bypass. Prior core-contract/PG evidence unchanged reusable,
полный verify:web/CORE/production не заявлены. Next: AUD-FIX-06 по разрешённой
последовательности, только после финального integrity PASS текущего этапа.

#### AUD-FIX-05 — CORRECTION / REOPENED16.09.2026

При чтении build aliases для06 выявлен пропуск исполнителя: прямые next builds
не включили `verify-buyer-bundle.mjs`/`verify-supplier-bundle.mjs`. Read-only post
checks на тех же artifacts: supplier PASS17files/1,045,614raw/316,809gzip;
buyer FAIL22files/1,704,048raw>1,500,000 и460,001gzip>450,000. Поэтому предыдущий
ACCEPTED отозван, Foundation05 снова[ ],06ещё не начат (только чтение).
История/functional6cases PASS сохранены, итоговый complete DoD не заявляется.
План прямого blocker:≤15min диагностики графа chunks, минимальное разделение
загрузки только при доказанной причине; не менять budgets/dependencies/design.
Buyer bundle attempt1, repeat только после конкретного изменения; максимум3.
Новые source изменения потребуют affected TS/test/build/browser по риску.

Bundle hypothesis confirmed by chunk module inventory: root page eagerly imports
BuyerCart→cart-correction-model→CommonJS schemas/Zod; chunk931 alone460,430bytes.
Минимальный fix — existing BuyerCart boundary через next/dynamic с loading state;
schema validation не удаляется, переносится загрузка, новые зависимости не нужны.
Regression — unchanged bundle budget + scoped actual-JWT cart correction browser;
catalog smoke также на новой сборке. До build — root TS/test; Supplier build/bundle
unchanged reused. Это отдельный подтверждённый post-build blocker, прежние web
failures не сбрасываются и остаются в истории; обязательна проверка нового artifact.

#### AUD-FIX-05 — FINAL ACCEPTANCE after bundle fix16.09.2026

BuyerCart стал lazy на существующей feature boundary, loading state явный;
валидация/контракты/деньги/права не менялись. Buyer build + bundle attempt2 PASS:
21files/1,124,722raw/340,070gzip (до:1,704,048/460,001). Supplier unchanged bundle
PASS17files/1,045,614raw/316,809gzip. Root typecheck15/15 (13cache), root test14/14
(13cache, buyer65fresh) PASS; dependency lock/schema/API unchanged.

Новый artifact: Buyer build NpUsBeTtnKkoMWVOrM4Dp; Supplier7HBlJ5OZsOleIo5xYWWss
REUSED_PASS. Проверено949build files и882backend artifacts, runtime source snapshot
bundle-inputs. Scoped browser нового artifact: **catalog6/6 PASS**, **cart3/3 PASS**
(real correction/reprice acceptance/checkout, empty/unavailable/mobile, conflict/
lost-response recovery). Прежние3catalog attempts и первоначальный bundle FAIL
остаются в ledger; новый regression run вызван изменённым кодом загрузки.
Screenshots catalog5 из принятого pre-split display неизменны; после split два
cart screenshots desktop/mobile визуально проверены, остальные функциональные
browser assertions PASS. UI не редизайнился. Final cleanup readback5runs:
107owned offers retired,22sessions REVOKED,0mailfiles; records retained.

Final source/status/hash: bundle-final.json/bundle-integrity.json; прежний
final.json сохранён как superseded pre-bundle checkpoint, не финальная сертификация.
Все commands/process/timing logs в remediation/AUD-FIX-05. Next AUD-FIX-06;
CORE/POST-BE/POST-FULL/production не закрыты. Ошибка исполнителя с пропущенным
post-build gate устранена, не маскируется как успешный исходный запуск.

#### AUD-FIX-06 — STARTED / execution brief16.09.2026

Preflight06: HEAD3d64496/branch codex/frontend-pilot-composition,1389files;
accepted05 non-reference inputs unchanged. Parallel preview folder preserved,
no runtime consumers. Own ports3101/3102/4112 free. No commit/push/new agents.

Confirmed source: buyer hasPartialDecision/OrderDecisionDetails treat pending
acceptedQuantity0 as partial; confirmation panel resets draft on every open,
allows closing while submitting; preview multiplies Number money. Reachability
RISK-01: manual override accepts canonical20digit minor strings, order item
Decimal(20,0), quantity up to1e6;9007199254740993minor at quantity1 is valid.
Backend calculateLineTotal rounds each positive line HALF_UP to integer minor.
Existing confirm API has complete decisions, row lock/idempotent same result,
409on another decision and increments order.version; no request expectedVersion.
Do not invent a new API rule. UI must detect refreshed snapshot/version and
require explicit restart; actual concurrent decision409 keeps draft and no success.

Scope06: buyer decision classifier/details/tests; supplier panel plus pure
draft/preview helpers/tests; truthful rejection toast and stable row focus.
No payments/receipts, new permissions, schema/migration/API transaction changes.
Draft retained on close/reopen while component remains mounted; explain lifetime.
Submission locks fields/close/double clicks, thrown/rejected requests preserve
input; changed server snapshot blocks stale submit until explicit restart.
Money preview exact BigInt rational/line HALF_UP, no binary money arithmetic.

Gates: root typecheck/test, Buyer/Supplier production builds **including bundle
postchecks**, pure table states/full/partial/rejected/cancelled/huge/fraction money,
scoped real JWT/PG browser confirmation flow (full/partial/rejected, repeat,
conflict, draft reopen, Escape/focus/submitting, desktop1440/mobile390), actual
order/reserve/audit/outbox readback. Existing FlowB2 default uses dev identity and
main DB fallback, so cannot run unchanged; equivalent confirmation slice in
approved audit harness, no manual DB status substitution. API/PG suite only if
domain risk changes, otherwise accepted immutable backend evidence reused.
Runtime audit DB only; own synthetic accounts/offers/orders, external sends off,
separate files, retain rows/revoke sessions/retire only own offers. Budget45min
suite,20min command,15min blocker,max3justified attempts; startup60s/test90s;
snapshot→build→runtime sequential.06X only all applicable gates green, then07.

06 gate attempt1: root tests PASS14/14 (Buyer71/Supplier43 fresh; unchanged
packages cached). Typecheck FAIL: supplier tsconfig target disallows BigInt
literals, not BigInt API. Replace only new literals with BigInt constructors;
keep target/dependencies and exact arithmetic unchanged. Attempt2 checks these
changed inputs; owning supplier tests rerun, other unchanged test evidence reused.
06 web attempt1 FAIL before browser business actions: fixture used a nonexistent
GET /carts/:id (404). Product only exposes owner-scoped GET /buyers/:id/carts.
Fix test setup to use that existing contract and select its own cart. No API/UI
change. Own1offer retired,4sessions revoked,0local mail files. Attempt2 reuses
unchanged Buyer/Supplier builds and882backend artifacts, copies only fixture.

06 web attempt2 FAIL at focus after successful full confirmation: captured exact
huge preview, draft reopen/Escape and submitting guard passed; POST201 persisted.
Child-owned RAF can race its own removal after refresh. Move success focus to
surviving SupplierOrders effect after committed updated rows; keep same assertion.
Attempt3: only Supplier TS/tests/build+bundle invalidated; Buyer/backend reused.
Also observed existing order-table formatMoney rounds visible totals to whole
currency (huge case displayed360287970189640). Exact preview/storage are separate;
do not claim all order/document money surfaces exact. Record for09 reconciliation,
not a backend money corruption finding. Cleanup secondrun1offer/4sessions PASS.

#### AUD-FIX-06 — CODED / BLOCKED checkpoint16.09.2026

Final third browser run:3completePASS(full/partial/rejected),1FAIL(conflict
Escape/reopen),1NOT_RUN(simulated new snapshot). Three attempts exhausted;
no fourth automatic run, no07–09/backend final suite. Latest screenshot shows
the conflict dialog remains open after Escape; draft1.5/reason retained and
real409 response/error asserted. Root cause not yet proven: likely focus lost
when submit button becomes disabled, so Escape never reaches DialogSurface.
Next bounded diagnosis must capture activeElement/focus path and distinguish
product behavior from a premature test action; do not remove assertions or
increase timeouts. Success focus fix verified by all three completed cases.

Accepted technical evidence (folder remediation/AUD-FIX-06):
- typecheck-2 PASS15/15,12cached; tests PASS14/14, Buyer71/Supplier43 fresh.
- supplier-focus-typecheck and supplier-focus-tests43 PASS after focus change;
  unchanged root packages/Buyer evidence reused, no needless aggregate rerun.
- build-buyer PASS37.4s, buildId _qwsA_6YEx7wgj5TVI5Zh; bundle21files,
  1125178raw/340211gzip. focus-build-supplier PASS26.0s,
  buildId5pjzI5CBFCMcTSblHG_B9; bundle17files/1047182raw/317470gzip.
  Budgets unchanged. inputs→fixture-inputs→focus-inputs and
  focus-build-inputs record1149source files/949build files/882backend artifacts.
- web-3 full: accepted4, total36028797018963972minor, reserved4/available6;
  partial: accepted1.5,total18752,reserved1.5/available8.5;
  rejected: accepted0,total0,reserved0/available10. Each original quantity4,
  price unchanged, audit1/outbox1; identical real API repeat201/readback equal.
  Pending accepted0 does not show partial warning; buyer sees truthful outcomes.
- Visual inspection: full1440×900, partial390×844 and conflict failure screenshot.
  Mobile is viewport emulation, not a physical device. Restricted synthetic
  supplier role shows readiness Insufficient permissions banner outside scoped
  order actions; do not claim overall workspace readiness or change rights.
- web-3-cleanup PASS across3runs:6owned offers inactive/hidden,12sessions
  revoked,0local mail files; synthetic DB rows/reserves retained for evidence.

Final reconciliation still required: source/build integrity and diff check saved
in checkpoint-integrity.json; this certifies preservation only, not06acceptance.
No commit/push/PR, no agents/dependency/API/schema/production changes. Agency
frontend/evidence collector and backend architect practices applied to draft,
exact money and transaction/readback boundaries; Playwright regression exercised.
Foundation remains5/9closed. CORE, POST-BE/POST-FULL, live integrations and
security/production acceptance are unchanged and not claimed.

#### AUD-FIX-06 — разрешённый bounded resume16.09.2026

Новый запрос владельца: один изолированный diagnostic409 run, затем минимальный
fix установленной причины и один targeted acceptance conflict+snapshot run.
Не обнуляет3старые attempts. Повторный FAIL acceptance → checkpoint/stop.
Preflight resume: все1407source inputs/949build files/882backend artifacts
неизменны, HEAD3d64496/branchтотже; own ports3101/3102/4112free.
Диагностика без product edits: activeElement before/pending/after409,
Escape event path, mounted dialog/button and actual React submit-lock ref
(read-only test instrumentation); отдельно ожидание committed UI vs early action.
Один synthetic order через real JWT/checkout; audit DB only, own cleanup.
Budget: diagnostic90s +startup60s, весь resume45min, code gate20min.
Frontend/EvidenceCollector/Playwright прочитаны; внешний qa.md из Agency
отсутствует после одного поиска, fallback — project Workflow/UI standard.
Три принятых outcome cases не повторяем без влияния изменения на их поведение.

Resume setup: diagnostic TS rejected NodeList spread (DOM.Iterable absent).
Launcher incorrectly continued after red TS and grep anchored to title start
found0tests (Playwright matches full file+title). No app/fixture/diagnostic was
started. Record orchestration error; fix Array.from and exact unanchored title.
Require successful TS and collection before the one actual diagnostic run;
no product change or erased attempt history.

Resume execution16.09.2026 06:08UTC: one selected diagnostic (collection1/1),
E2E typecheck attempt2 PASS. API never ready:4112 unreachable, startup60s,
bounded stdout/stderr diagnostic empty; process exit1 after61.852s, test body0ms.
No activeElement/lock/Escape runtime observations obtained. Classified startup
BLOCKED, not a new supplier-order defect. No product fix or targeted final
acceptance performed; one permitted actual diagnostic launch consumed, no retry.
Read-only host observation after failure: free RAM1143552KiB of8074104KiB;
insufficient evidence to call memory the cause. Ports3101/3102/4112 not listening.
Owned startup run audit_local_auth_1789538902527_8508; account prepare not reached.
Next explicit request: one API-only startup diagnosis without Chromium/web,
capture owned PID/exit/CPU/RSS and bounded boot-stage output under existing60s,
no timeouts/guards/permissions/dependencies changed. Resume UI only after cause
is established and environment accepted. Preserve old3PASS and all FAIL history.
Final manifests/cleanup — resume-checkpoint-integrity.json and
resume-startup-cleanup-db.json; these prove preservation, not AUD06acceptance.

API-only diagnosis authorised by latest “продолжай”: one launch,60s unchanged,
no Chromium/web/accounts. Preflight1407sources/949web/882backend unchanged.
Temporary preload observes require stages, NestFactory.create/listen and Prisma
module init while calling original methods unchanged; IPC CPU/RSS plus external
owned PID sampler. Same auditEnvironment/JWT/profile/API dist/heap cap as before;
only diagnostic preload and omission of web/Chromium differ. No product edits,
new dependency, security bypass or external provider. DoD is startup evidence
and owned cleanup, not06acceptance. Stop after this one launch and report cause
or remaining uncertainty; backend architect practices applied to stage isolation.
API-only result16.09.2026: READY_DIAGNOSTIC_ONLY, /api/health/ready200 after7236ms.
Observed: preload entered0ms; NestFactory.create5784→6718ms; Prisma init6863→
6922ms. Require durations inclusive: instrumentation3161ms, bootstrap2613ms,
app.module1572ms (nested times not additive). Internal last RSS279199744bytes;
external sampler3observations, CPU0.406→1.328s, working set83→225MB. No evidence
of an OOM, exception or blocked DB in this run. This does not establish the
cause of prior timeout, nor rule out historical resource/I/O contention.
Diagnostic preload's export inspection produced two circular-module warnings
(NestFactory/PrismaService); these are probe side effects, not application bugs.
listen wrapper did not emit a stage, so listen completion is evidenced by actual
HTTP200, not inferred from absent logs. Queue disabled by original audit profile.
Owned pid16132 stopped; ports3101/3102/4112free. Run
audit_api_startup_1789539431865_17128 contains no test accounts/orders/mail writes.
Product code, protected settings, dependencies, DB data and timeouts unchanged.
DoD of this one API-only diagnosis achieved; no second launch or UI run.
Current06remains[ ]: next request is bounded409/Escape diagnostic (the former
test body never ran), then one targeted conflict+snapshot acceptance after
proven fix. Earlier3PASS reused only for unchanged behavior. Do not weaken
startup timeout or hide history by calling whole runtime healthy/accepted.
Evidence api-only-result.json/startup.log/process.json, api-only-preflight.json;
post-run preservation manifest api-only-checkpoint-integrity.json.

Post-run reconciliation found one main-checkout generated metadata drift:
apps/api/dist/tsconfig.tsbuildinfo modified11:16:45 local (outside this task).
All other881main backend artifacts and all882executed isolated runtime artifacts
remain exact baseline hashes. Two concurrent Turbo PIDs11844/8608 observed,
not stopped; ownership/cause of prior timeout not inferred from this snapshot.
Source/web preservation is independent of compiler cache drift. First strict
checkpoint check stopped at metadata mismatch; final report retains CHANGED
metadata explicitly, never reports all main882unchanged or reruns runtime.

#### AUD-FIX-06 — error-focus bounded resume ACCEPTED, 16.09.2026

Owner's latest approval: one new diagnostic UI launch, minimal proven fix and
one targeted conflict+snapshot acceptance. Prior3failures and startup history
above retained; no automatic rerun or timeout increase. Preflight first caught
Next generated dev/main versus production/runtime next-env type paths; exact
two differences inspected and recorded, then preflight PASS. All1407main inputs,
949web artifacts and882executed backend artifacts matched checkpoint. Existing
main API tsbuildinfo metadata drift unchanged and separately reported.

Actual diagnostic focus-resume-diagnostic:1/1 PASS, test body3.5s. Disabled submit
moved activeElement to BODY; after409/button enabled/two frames focus stayed BODY.
submitLock ref=false in current+alternate; Escape path BODY→HTML missed dialog.
Explicit close/reopen preserved draft; quantity.focus then Escape worked. This
establishes a focus-loss bug, not a stuck lock or an early test assertion. One
alternate state snapshot is not treated as committed truth. Actual DB confirmed
CONFIRMED,total50004,reserve4,audit1/outbox1. Prior API startup timeout cause remains
unknown; successful readiness is not claimed to have fixed that historical issue.

Minimal product delta only OrderConfirmationPanel: labelled focusable error group
and effect when open/error/not submitting. No shared dialog handler, rights,
guard, API, transaction, money or dependency changed. Regression assertions in
existing order-decisions.spec.ts cover automatic error focus, Escape/trigger,
reopen qty1.5 +reason, explicit close, no success toast, and real duplicate checks.

Fresh commands (all exit0; logs error-focus-* in evidence directory):

- npm run typecheck --workspace=@marketplace/supplier-web.
- npm run test --workspace=@marketplace/supplier-web:43/43 across8files.
- npm run typecheck --workspace=@marketplace/e2e.
- Isolated supplier Next build --webpack:37.842s, BUILD_ID RcfjV3VnmOiKOH1MISEiK.
- Existing verify-supplier-bundle.mjs:17JS,raw1,047,182/gzip317,468; original
  limits20/1,250,000/380,000 unchanged.
- Scoped verify:web equivalent: existing Playwright order-decisions config,
  --grep 'real conflicting|explicitly simulated', --max-failures=1,retries0;
  collection exactly2, one acceptance launch **2/2 PASS** in16.3s.

Real conflict result: first201→UI409; focus/error/Escape/trigger/reopen PASS;
quantity4/accepted4/price12501/total50004/version2 remained unchanged, reserves4,
available6, audit1/outbox1. UI draft1.5/reason retained, no false success.
Simulated new version: only GET response version+1; stale qty2 disabled until
explicit restart to4. DB remained AWAITING_CONFIRMATION/version1/accepted0,
total50004/reserve4/available6/audit0/outbox0. It is UI simulation, not proof of
a real backend version mutation or an expectedVersion contract addition.

Coverage is **5unique cases =3REUSED_PASS +2freshPASS**, not a clean new5/5run:
full/partial/rejected success cases reused from web-3 since new effect requires
submitError; successful requests clear it and never execute the error-focus
effect. Existing draft/model/success-focus/backend semantics unchanged. Buyer
71units/build/bundle and prior root/type/package/PG/core-contract evidence reuse
is bounded to their same inputs; no full backend or all-app build performed.
Future changes to those paths invalidate affected evidence, not the entire audit.

Screenshots actual-409-preserved-draft.png and simulated-new-snapshot-stale-draft.png
visually reviewed at1280×720; diagnostic1440×900 and prior partial390×844.
No physical-device claim. English409 API-copy remains visible: record once as
remaining message-clarity issue for AUD08/09, not a focus regression or a new
backend implementation task. Existing restricted-role readiness banner and
table rounding observation remain outside this accepted bounded fix.

Cleanup verified read-only: new diagnostic+acceptance3ownedoffers retired/hidden,
8sessions revoked,0remaining local mail. Cumulative06:5runs/9offers/20sessions,
all retired/revoked; synthetic DB history retained, no demo reseed/delete.
Files: error-focus-inputs.json SHA256
f115872a59d25683c8f1dc999383379f0347db8c75abb7de548c547e62ade443;
error-focus-build-inputs.json (949web/882executed backend hashes),
error-focus-final-cleanup-db.json and final error-focus-checkpoint-integrity.json.
Branch codex/frontend-pilot-composition, HEAD3d644963ed72f99a100e180db2d373bc5abeaef9
+ preserved dirty scope. No staging/commit/push/PR/agents. Agency frontend and
evidence-collector practices used for minimal error-state fix, truthful evidence
and targeted Playwright regression; current design and business rules preserved.

Foundation AUD06[x]; **6/9parent AUD-FIX closed**,07–09 not started. This is the
completion of the authorized bounded resume, not CORE09/POST-BE/POST-FULL or
security/production acceptance. Next queued task AUD-FIX-07 document archive;
no automatic whole-suite rerun or reimplementation of accepted01–06.

Final integrity attempt1 stopped on parallel preview ZIP drift:
actual_docs/ui-ux/references/production-preview-2026-09-16.zip (7,616,781bytes).
Read-only search found no apps/packages/scripts/package.json consumers; preserved
as external artifact with before/after hashes, not bundled with this task's six
changed source/doc files. Attempt2 separates this artifact explicitly. No test,
build or UI restart for a non-runtime preview change. This does not erase the
first integrity stop or classify external changes as this task's implementation.

#### AUD-FIX-07.1 — CODED / BLOCKED, 16.09.2026

Owner asked to start07. First bounded slice: DATA-01 +upload UX-16/17, not full
document archive rewrite. Existing code removed separators from a field labelled
minor units; now major-unit amount with explicit KZT explanation, exact BigInt
conversion/formatting, two fractional digits, Decimal(20,0) UI bound. No API/schema
business rule changed. File label/format/byte limit visible; empty/extension/size
validation, draft/file retention, local lock including FileReader, pending guard,
safe error copy and post-error focus. Unknown network result explicitly warns to
check archive first (no claim of server upload idempotency). Existing raw UUID
links/accounting/navigation/demo marking are outstanding07slices, not removed.

Source delta: packages/ui/src/document-archive.tsx +new document-upload-model.ts,
unit model tests; schema and API-client exact string transport tests. New
scripts/verify-document-upload.mjs and dedicated E2E config/spec prepare real
JWT/isolated-role actual upload403/409/DB readback cases, but **NOT RUN** yet.
No new dependency, API route, server implementation, DB migration or redesign.
Baseline before.json: HEAD3d644963ed72f99a100e180db2d373bc5abeaef9,
codex/frontend-pilot-composition,1408files; prior06 unchanged and accepted.
Upload snapshot upload-inputs.json:1415files and8changed/new source paths.

Typecheck ledger (same gate, total3attempts; no fourth):

1. `npm run typecheck` /upload-typecheck.log: FAIL58.352s,10/15Turbo tasks
   successful. Buyer main generated `.next/dev/types/routes.d.ts`/validator.ts
   contain broken trailing fragments; no product TypeScript error established.
   Main dev artifacts/process not repaired/stopped; source of corruption unknown.
2. `node .tmp/aud-fix-07/run.mjs isolatedTypecheck upload-typecheck-isolated-2`:
   root-equivalent explicit Node/tsc commands serial in existing audit copy,
   no copied .bin wrappers. Schemas/EDS/client build prerequisites PASS;
   schemas/client/EDS/UI/API/Buyer/Supplier/Admin typechecks PASS8/11.
   Landing FAIL TS2344: LayoutProps constraint `/` differs from LayoutRoutes
   `/`|`/register/resume`. E2E/one-c isolated checks not reached. No gate PASS.
3. `... remainingTypecheck upload-typecheck-isolated-3`: original8 checks
   reused without restart; installed `next typegen` in owned isolated Landing
   succeeded, then Landing tsc failed with same TS2344. No timeout/config limit
   increased. E2E/one-c not reached, no attempt4. Product source unchanged.

Read-only diagnosis after stop: isolated Landing tsconfig includes both
`.next/types/**/*.ts` and `.next/dev/types/**/*.ts`; stale dev route declaration
has only `/`, production declaration also `/register/resume`, both define global
LayoutProps. Typegen switched isolated next-env import to production but retained
the conflicting dev set. This is generated-input conflict evidence, not a defect
in registration-resume product code. No deletion/moving generated sets performed.

Required unit/schema/client suites, Buyer/Supplier new builds/bundles and all
new browser/DB write scenarios NOT_RUN because mandatory TS gate remains red.
No test accounts/documents/files created, no audit DB/main marketplace mutation.
No server launched. Isolated tsc emitted prerequisite dist/type metadata and
Landing typegen updated owned generated inputs only; prior runtime web builds
have not been rebuilt or claimed to include07.1. Do not reuse06build as07PASS.

Preservation/ports/diff/links evidence: checkpoint-integrity.json (not acceptance).
Foundation07 remains[ ], parent closed count6/9.08–09/backend review not started.
Next exact owner decision: one bounded repair of conflicting generated inputs in
audit copy only, keeping recoverable old artifacts; then remaining TS and07.1
acceptance. Preserve earlier partial PASS and all3attempts; no whole-audit rerun,
no editing main dev or suppressing TS diagnostics. Agency frontend/evidence and
backend boundary practices applied; Playwright skill read, regression code added,
browser itself not used this slice. No agents/commit/push/PR.

#### AUD-FIX-07.1 — ACCEPTED after owner-authorized continuation, 16.09.2026

The preceding BLOCKED record remains history, not current status. Owner approved
repair of conflicting generated types only in the isolated audit checkout and
continuation from checkpoint. Answer to money question: users enter/see major
units (KZT/тенге); `1,25 ₸` is transported/stored as string minor amount `125`.

Before:1415main files matched checkpoint-inputs.json; runtime source/config matched
apart from recorded generated next-env; audit ports free, branch/HEAD unchanged:
codex/frontend-pilot-composition /3d644963ed72f99a100e180db2d373bc5abeaef9 plus dirty
changes. Main Buyer malformed generated files were NOT touched. Isolated Landing
stale `.next/dev/types` was moved with exact resolved-path checks to recoverable
`remediation/AUD-FIX-07/generated-backup/landing-dev-types`, outside TS includes.
Installed Next typegen +remaining Landing/E2E/one-c typechecks passed; original
8workspace checks/prerequisites reused with hashes. No TS suppression/config edit,
main dev change, timeout increase or restart of01–06. All3earlier TSFAIL retained.

Command/evidence ledger, under remediation/AUD-FIX-07 (run wrapper in ignored
`.tmp/aud-fix-07/run.mjs`; explicit Node entrypoints because audit .bin absent):

| Gate | Command/action and evidence label | Result / reuse |
| --- | --- | --- |
| TS normalization | `remainingTypecheck upload-typecheck-owner-resume` | PASS;3remaining checks +8REUSED_PASS, same11workspace coverage as root typecheck |
| Unit suite | `isolatedTests upload-unit-isolated` | PASS594tests/115files in10workspaces; same `vitest run --passWithNoTests` scripts and ^build prerequisites as npm test, serialized |
| DB preflight | `dbPreflight upload-db-preflight` | identity dentmarket_audit_20260914,620products/500published offers; no reseed |
| Initial web artifacts | buildBuyer/buildSupplier +bundleBuyer/bundleSupplier, upload-*-build/bundle | PASS; fresh builds then used by attempts1–2, not final artifact |
| Web attempt1 | `web upload-web-1` | FAIL before upload: exact label locator omitted Fluent required `*`; UI visible;0docs/assets, own sessions/mail cleaned |
| Locator-only correction | optional-star anchored labels +failure ARIA artifact; `e2eTypecheck upload-e2e-ts-2` | PASS; source only E2E changed, no app rebuild/full unit rerun |
| Web attempt2 | `web upload-web-2` |3/3PASS14.9s, but visual review found native file feedback mismatch after reopen |
| File-feedback correction | ref restores only previously user-selected File to native input through DataTransfer; native files assertion added | Minimal upload UI fix; no filesystem path lookup or new browser permission |
| Final affected TS | `feedbackTypes upload-feedback-types` | UI/Buyer/Supplier/E2E PASS; unchanged7workspace checks REUSED_PASS |
| Final affected unit | `feedbackTests upload-feedback-tests` |146PASS (UI32,Buyer71,Supplier43); other448 unchanged PASS reused,594unique tests total, not a fresh full suite |
| Final builds | buildBuyer/upload-buyer-build-2, buildSupplier/upload-supplier-build-2 +corresponding bundle actions | PASS; Buyer TZBtqyZ5kGpggXGJb6Ble, Supplier dT8TMWU3NCYy94cHAP6rk |
| Final scoped verify:web equivalent | `web upload-web-3` → existing Playwright runner, document-upload config, max-failures1/retries0 |3/3PASS16.0s; full unrelated Playwright suite NOT_RUN |
| Cleanup/storage | `cleanup upload-web-3-cleanup upload-web-3` |0active sessions,0remaining mail, ports3101/3102/4112 free;2retained docs match physical hashes |

Final browser cases: Buyer1440×900 `1,25`→`125`→`1,25 ₸`; Supplier390×844
`90071992547409,93`→`9007199254740993`→`90 071 992 547 409,93 ₸` without Number
rounding. Actual POST201/download and DB readback; exactly1document/audit/outbox
per successful request. Labelled transport hold verifies pending fields/buttons,
Escape guard and single request; this is simulated latency, not real outage.
Fraction/invalid extension/oversize validation, retained native file/draft,
trigger focus, actual403 and missing payment-basis409 preserve inputs/no new docs.
Screenshots buyer-upload-draft, supplier-upload-draft, actual409-upload-error
visually reviewed; desktop/mobile here are Chromium viewports, not physical devices
or all-screen-size/WCAG certification. Successful PDF upload is NOT legal signing.
Live DOCX handling/new lookups/accounting/navigation/demo-state scenarios remain
outside accepted07.1 scope. File extension/unit tests do not certify production AV.

Final artifacts/source relationship: upload-web-3-build-inputs.json includes293
web files and882backend entries (881unchanged executed artifacts plus preexisting
typecheck metadata drift), checkpoint source hash plus explicit final UI/E2E
overrides. accepted-inputs.json and accepted-integrity.json retain final main
hashes, dirty status, lockfile/branch, links/diff checks and per-gate results.
No application server/business/API/schema/permission/dependency changes in this
continuation. Four source-of-truth docs updated; main dev artifacts preserved.
All3browser executions retained; attempt1 locator FAIL and visual correction are
not hidden as a first-run pass. No further runtime rerun for these docs changes.

Latest fixture audit_local_auth_1789549359225_26608 has3synthetic users/orgs and
2documents/files retained for evidence, sessions revoked and local mail removed by
owned harness. The previous two isolated runs retained their independent synthetic
fixtures (first0docs, second2docs); no demo reset, external messages/payments or
changes to working marketplace. No audit process remains; no agents/commit/push/PR.
Agency frontend/evidence practices applied to form consistency and screenshot +
API/DB proof; Playwright instructions applied to approved persistent regression.

Foundation07.1[x], **07parent still[ ];6/9parent AUD-FIX closed**. Next separate07
slice: human-readable related-record selection; accounting/detail/navigation/demo
marking remain open,08–09 not started. No security/production/CORE completion claim.

#### AUD-FIX-07.2 — historical CODED / BLOCKED checkpoint, 16.09.2026

Owner authorized next slice: human-readable order and base contract selection.
Bounded scope announced: existing buyer/supplier order endpoints and bounded
contract archive search, not new payment/refund lists or other07slices. Before
manifest1415files/HEAD/branch matched accepted07.1; runtime sources also matched.
Agency frontend/evidence practices reused, backend architect instruction read
for access-boundary review; no delegated agents. Current profile pilot/JWT/local
mock/no workers, approved audit DB only; no credentials in evidence.

CODED (NOT ACCEPTED): new document-relation-select.tsx and document-relations.ts
in packages/ui, option/search/race tests; Buyer/Supplier upload loader callbacks
and parent key by organization; separate selected order/contract draft fields.
Order remains optional; base required only for addendum. Selection labels use
number/counterparty/date/status, not UUID; ids still go to existing upload API.
Historical/draft contracts are not newly forbidden by UI and are not asserted
legally effective. Query limit100 shown honestly with refinement hint; no full
archive crawl. Payment/refund UUID fields remain explicitly out of this slice.
Schema/client regression files test existing bounded contract queries; no schema
implementation, API route, dependencies or DB migrations changed. Existing07.1
upload-error locator narrowed by accessible name to coexist with lookup alerts.

Static inspection of the existing `DocumentsService.assertReferences` final
union-party check suggested mixed-reference bypass. Before expensive TS/build/UI
gates, executed **one** targeted regression on unchanged API runtime:
`node .tmp/aud-fix-07-2/run.mjs graphProbe related-tenant-graph-1` → exit1, FAIL.
Wrapper only injects approved audit environment and runs
`scripts/verify-document-relations.mjs` from isolated checkout. No retry.

| Case | Actual result |
| --- | --- |
| Buyer reads foreign contract by archive URL |404, correctly denied |
| Buyer uploads addendum with foreign base only |400, correctly denied |
| Buyer uploads addendum with own order +same foreign base |201, incorrect acceptance; persisted foreign base link and foreign participant |

AUD-FIX-07.2-BLOCKER-01: combined party list lets membership in one referenced
record authorize another unrelated reference. Proof is persisted mixed graph,
not file-content disclosure or a production exploitation claim. Upload route
was exercised with a real issued JWT and normal guards, no impersonation headers,
no manual bypass of failed business operation. Probe used3new synthetic orgs/users,
one empty synthetic Cart/Checkout/SupplierOrder pair for reference testing (not
purchase-flow evidence), and2uploaded synthetic PDFs (foreign base +incorrectly
accepted addendum). Existing user/demo data unchanged; fixtures retained.

Evidence: relations/related-tenant-graph-1.json/log/process.json/result.json.
Run ID audit_local_auth_1789553774522_30420; scope-specific fixture shutdown
revoked sessions (0active) and removed local mail (0remaining). No app process
left running. No real payment/signature/external send or DB reseed. Minimal probe
script added to audit copy; candidate UI source NOT synchronized there yet.

**Stop on first confirmed dangerous defect.** Current TS/unit/build/browser gates
NOT_RUN, no full scan/whole-audit rerun, no weakening assertions/permissions.07.2[ ],
07parent[ ];6/9parent tasks still accepted historically,07.1 evidence preserved
for its exact revision, not asserted as fresh coverage of the new selectors.
Next precise owner decision: fix independent authorization of base agreement and
order references in shared generate/upload path, add own+own/own+foreign/foreign+own
PG/JWT regressions; preserve valid draft references and publication agreements.
Then resume07.2 gates from snapshot. No accounting/navigation/other phase yet.

#### AUD-FIX-07.2 — ACCEPTED after authorized remediation, 16.09.2026

Supersedes the blocked checkpoint above without deleting its evidence. Branch
`codex/frontend-pilot-composition`, HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9`;
dirty source identity: `remediation/AUD-FIX-07/relations/accepted-inputs.json` and
`accepted-integrity.json`. Only this slice and its confirmed blocker were authorized.
No commit/push, dependency/config/migration changes, redesign or external integration.

`DocumentsService.assertReferences` checks operational and base-contract parties
separately before merging. Owner membership in either cannot authorize the other.
`generate`/`upload` use it; `createVersion` also validates copied historical links.
Valid shared contracts, drafts/history, optional order, payment and marketplace
publication rules preserved. Existing malformed data is not migrated/removed, and
this is not certification of every other reference/read/security boundary.

| Gate | Command / evidence in `remediation/AUD-FIX-07/relations` | Result |
| --- | --- | --- |
| API types + focused units | `run.mjs backendTypes reference-types-1`, `backendUnit reference-unit-1` | PASS;22tests including14new boundary regressions |
| API build prerequisite | `backendBuild reference-api-build-1/-2` | Prisma generate PASS; first wrong Nest path FAIL; corrected verified workspace path build PASS, no dependency installation |
| Actual JWT / PostgreSQL reference matrix | `graphFix reference-jwt-postgres-1` → `scripts/verify-document-reference-isolation.mjs` |24/24 PASS; both roles, upload/generate, own+own/own+foreign/foreign+own/base-only/draft/version; negative400 no Document/audit/outbox writes; foreign archive404 |
| Full PostgreSQL gate | `postgres reference-full-postgres-1` → unchanged `scripts/verify-postgres-integration.mjs`, after schema/API prerequisites | PASS22.8s; all5existing scenarios;32migrations/pending0; test seed only approved audit DB; scoped suite cleanup PASS |
| TypeScript minimum | `isolatedTypecheck relations-all-types-1`, `remainingTypes relations-types-2`, `e2eTypecheck relations-e2e-types` | New client-test missing NodeNext `.js` failed once, fixed;6remaining+API fresh,4unchanged workspace reuse =11covered |
| npm test equivalent | `isolatedTests relations-units-1` |10workspace scripts serial,617tests/119files PASS; schema/eds/client/UI prerequisites satisfied |
| First UI acceptance | `web relations-web-1` | FAIL1/5 at ambiguous group/control locator;4NOT_RUN, not app authorization failure. Snapshot also exposed real long-option intrinsic overflow |
| Width correction delta | `feedbackTypes relations-width-types`, `feedbackTests relations-width-tests`; Buyer/Supplier builds/bundles `-2` |4types/153UI-web units PASS;464other units reused from same-turn617suite; no backend rerun |
| Final scoped verify:web | `web relations-web-2` → Playwright config `playwright.document-relations.config.ts` |5/5 PASS27.3s, retries0; two new relation flows and three existing upload regressions |
| Safety cleanup/readback | `webCleanup relations-web-2-cleanup relations-web-2` |2owned runs,7synthetic users,6docs/files including2base contracts; hashes match,0active sessions/0mail; ports3101/3102/4112 free |

All `run.mjs` commands above mean
`node .tmp/aud-fix-07-2/run.mjs <action> <label>`; full process commands and outcomes
are recorded in each `*-process.json`, `*-result.json`, log. Explicit installed
Node CLIs implement npm prerequisites (isolated copy lacks `.bin` wrappers); only
an isolated Prisma command shim was needed for the unchanged PG script's npm call.
No main generated types/dev process touched. Fresh tests used the audit runtime,
not the known malformed main dev-generated types from the earlier checkpoint.

UI proof: existing scoped GETs, contract search limit100, readable number/party/date/
status, selected IDs in actual request+DB; empty results, retained selections,
keyboard selection/Escape/focus and optional order. Real lookup403 does not block
unrelated permitted upload. Network abort explicitly simulated, then actual retry
passes; not an outage/backend resilience claim. Actual upload201/403/409 and exact
money (`125`, `9007199254740993`) retained. Four browser uploads each have exactly
one audit/outbox event. Desktop1440×900, supplier390×844 Chromium viewport (not
physical hardware). No horizontal form overflow;5final PNGs visually inspected.

Final build IDs: Buyer `tdhYE3I1Un7RY38y_G59S`, Supplier `S7EZgvNi_gIs9Z_ge1QQl`;
source/build hashes in `relations-web-2-inputs.json` (163/130web +851API artifacts).
Final source/runtime/preservation/diff/link checks recorded in accepted-integrity.
Practices: Codex Security Fix Finding independent boundary/compatibility tracing
and separate candidate-review pass, Agency Backend Architect/Frontend Developer/
Evidence Collector, Playwright and mandatory project workflow. No extra agents.

Foundation07.2[x]; parent07[ ], still6/9top-level AUD-FIX accepted. Payment/refund
lookup, navigation/detail/accounting errors, demo marking remain separate work;
08/09, full security audit, CORE/POST-BE/POST-FULL and production NOT_ACCEPTED.
At DoD stop; no automatic new phase or repeat of unchanged gates.
