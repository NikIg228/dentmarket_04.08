# PRIMARY-SESSION — Platforma.Market

Дата: 2026-09-21. Это карточка исполнения, не продуктовый backlog.

## CORE-01 supplier common terms — решение владельца 22.09.2026

- ACTIVE, writer primary 01a0c415-1c3c-73e3-a270-5ad591fa9ca7, generation2/idle.
  Canonical root, main@f051a66599834032a0f95a7495b6945ec6f1f811; входной dirty
  только этот checkpoint (сохранён итог attempt5). Новых агентов/worktrees нет.
- Последний запрос заменяет текущую продуктовую границу: общий договор продавца,
  тарифы/правила и отдельные документы о персональных данных; версионный акцепт
  в кабинете, затем отдельный операторский допуск. Новый индивидуальный договор
  и обязательная ЭЦП исключаются из подключения. История существующих договоров
  сохраняется; действующие ранее оформленные договоры не аннулируются миграцией.
- Кнопка «Ознакомлен» в конце, только после просмотра всех документов; явное
  подтверждение полномочий/принятия от имени организации. Пустые страницы —
  DRAFT, без выдуманных юридических текстов и без фиктивного акцепта.
- Scope: schemas/client/OpenAPI, additive Prisma migration, agreements/readiness/
  publication gate, supplier/admin UI и legal routes, Product/Foundation/ADR.
  Акцепт не равен допуску, регистрационная галочка не заменяет коммерческий акцепт.
  Immutable snapshots, authenticated actor/tenant, idempotence, audit/outbox,
  операторская проверка организации/полномочий, отклонение и приостановление.
- DoD: focused schema/API/UI regressions; prisma validate/generate + upgrade-path
  на проверенной disposable test DB; npm run typecheck, npm test, затронутые builds,
  verify:postgres, verify:core-contract, verify:web с keyboard/mobile smoke;
  review/diff/staged/secrets, разрешённый commit/push и actual CI.
  Commands20min, suite45min, blocker15min, максимум3 попытки нового gate.
  Рабочую/demo/public DB не изменять, новые кластеры/интеграции не создавать.
- Старая история CI attempt1–5 BLOCKED сохранена ниже, повтор не выполнен;
  карта экранов не запускается. Блокер legacy callback не чинить как скрытый scope.
- Практики прочитаны: Backend Architect (контракты/транзакции), Frontend Developer
  (доступный просмотр), Code Reviewer (tenant/версии), Git Workflow Master (diff).
- Candidate готов в schemas/client/OpenAPI, additive migration/table, новый
  SupplierTermsService/controller (snapshot/акцепт/оператор/download), два статуса
  и общий gate publication/commerce/search/moderation/readiness. API создания
  нового индивидуального договора возвращает410; история/старые действующие
  договоры сохраняются. Supplier panel подключён к /documents и root workspace;
  admin panel заменён проверкой допуска; /legal/[code] содержит пустые DRAFT.
  Browser coverage хранит просмотренные диапазоны, прыжок End не заменяет чтение.
- Checks: prisma generate PASS (после изменения composite unique — новый вход);
  prisma validate attempt1 FAIL missing DATABASE_URL; attempt2 static dummy URL
  PASS, без подключения. typecheck attempt1 FAIL только public legal page:
  ApiClient constructor требовал context; исправлено {}. Следующий run — attempt2.
  npm test attempt1: API327/328 PASS, новые terms10/10 PASS; единственный FAIL —
  прежний PDF renderer timeout5000ms под параллельной нагрузкой. Не менять test/
  assertions/timeout; один повтор с maxWorkers2 обоснован contention. Другие
  workspace suites прошли; подробности outputs/supplier-terms-20260922/tests-1.log.
- DB read-only preflight: attempt1 нет env/.env; после обнаруженного прежнего
  способа получения local config из scripts/dev-local.mjs attempt2 PASS:
  existing dentmarket_audit_20260914/public, pg_trgm=true, новая terms table ещё
  отсутствует. Credentials не выводились. Рабочая БД не читалась/не менялась.
  Upgrade/migration и runtime/browser ещё NOT_RUN; owned серверов нет.
- Дополнительное поручение владельца передано боковой задачей
  01a0c7c5-c484-7db2-bd73-4e4480980508: docs-only внутренние диалоги. Внесены
  Product §22.12 + §22.1/22.2, Foundation CORE-06.5 [ ], UI §2.2. Статус только
  requirements approved / implementation not started; запрет21.09 явно уточнён
  решением22.09. Docs links/согласованность/diff-check PASS, отправлен readback.
  Это не реализация сообщений, не новый runtime gate и не завершение CORE-01.
- Уточнение evidence22.09: typecheck attempt2 PASS15/15; tests attempt2 с
  maxWorkers2 PASS14/14 workspace tasks, API328/328. Добавлены ещё2 unit проверки
  точных цен только допущенных offers; итоговые typecheck attempt3 PASS15/15,
  tests attempt3 PASS14/14 tasks, API330/330 (66 files), maxWorkers2.
- Upgrade-path PASS: новая additive migration применена только к audit DB.
  verify:postgres attempt1 остановлен до runtime из-за EPERM DLL Prisma;
  preflight перенесён в отдельный завершающийся процесс, attempt2 PASS по полному
  результату PostgreSQL smoke (checkout/rollback/concurrency/tenant). Core contract
  PASS275 operations/71 schemas/21 core operations, reused build prerequisites.
  Runtime-split PASS для api/worker/all и forbidden-entrypoint/production guards.
  Supplier/admin builds PASS; generated next-env.d.ts возвращены к исходным.
- verify:web attempt1: JWT/PostgreSQL API + DRAFT + desktop + mobile PASS4/4;
  operator test FAIL: выбран скрытый mobile select. Исправлен только test locator
  на видимую desktop кнопку, scenario сделан независимым. Focused attempt2
  operator PASS (1/1), прежние4 PASS переиспользуются. Проверены screenshots
  desktop/mobile, клавиатура Enter, End не обходит покрытие, immutable download,
  самостоятельный допуск, tenant denial, idempotent audit/outbox. Owned процессы
  fixture остановлены, sessions revoked. Тестовые тексты только в отдельном harness.
- Дополнительный normal DRAFT onboarding smoke PASS: новая регистрация не даёт
  акцепт/допуск, старый generation API410, draft acceptance409, operator-only403.
  Воспроизводит новый процесс без legacy callback, не ослабляет guards ЭЦП.
- Evidence: outputs/supplier-terms-20260922/. HEAD прежний; commit/push NOT_RUN.
  Следующий шаг: итог gates/review и отдельные scoped commits/обычный push,
  затем фактический CI нового change set. Старый attempt5 не перезапускается.

## CI API + worker — один разрешённый цикл №5, 21.09.2026

- Явное «да» владельца передано Оркестратором 01a02859-08f3-7082-920d-49400f0fbb09:
  исправить только CI/test harness и выполнить один дополнительный runtime цикл.
  Это attempt5 общей истории, без сброса предыдущих четырёх и без шестого rerun.
- Fresh snapshot: canonical root, main@98c1888795ac810a4b5501abcef2e2a1ec5ef4dc;
  primary 01a0c415-1c3c-73e3-a270-5ad591fa9ca7, generation2/idle, один writer.
  Входной dirty только этот checkpoint; его история сохраняется.
- Read-only разбор завершён отдельно: API health из attempt4 подтвердил api/
  schedules=false/queueConsumer=false; worker в CI не запускался. POST
  notifications/process вызывает только processPending, не outbox projection.
  GET supplier025 вернул200, JSON content-length2; массив по коду означает пусто.
  Доставка пользователям этим не признана неисправной. Credential organizationId
  не соответствует projector /OrganizationId$/ — отдельное расхождение вне fix.
- Scope/DoD: штатные API + worker на том же disposable CI PostgreSQL/Redis;
  настоящий API /health/ready и worker runtime.ready после snapshot dependencies,
  liveness до/после smoke, cleanup обоих при любом результате. Существующий
  fail-closed isolated-service preflight и все прежние smoke сохраняются.
  Документный smoke ограниченно ожидает исходное nonempty + all SENT, при timeout
  выводит только безопасные ids/status/attempts; HTTP ошибки не маскируются.
- Budgets заранее: readiness60с, notification poll60с, extended step10мин,
  полный verify job45мин. Test adapters/local storage, без реальных provider env.
  Рабочая/demo/local public DB, business API, guards, зависимости, новые
  worktrees/задачи/интеграции не меняются. Scope CI → карта по-прежнему один.
- Gates до публикации: YAML/JS parse, сфокусированные проверки readiness/poll
  условий без API/DB, preservation старых smoke/preflight, diff/staged/secrets.
  Затем один reviewed commit/push и actual CI с API+worker/outbox→SENT/browser.
  FAIL/TIMEOUT → evidence/cleanup/stop; только полный PASS разрешает карту.
- Практики: Backend Architect (границы обработчиков), Code Reviewer (readiness,
  сохранность assertions/ошибок), Git Workflow Master (scoped publication).
  Все инструкции прочитаны; делегирования нет.
- Реализован candidate: CI стартует API + worker/test adapters, readiness helper
  подтверждает dependency snapshot/worker event и PIDs; каждый прежний smoke
  окружён liveness checks, EXIT/INT/TERM cleanup завершает оба PID за10с, затем
  forced cleanup при необходимости и оба лога. Preflight container/DB неизменён.
  Документный polling только GET, прежний POST/process и финальный assertion
  сохранены; timeout диагностирует IDs/status/attempts без payload/secrets.
- Gates PASS: node --test scripts/ci-verification.test.mjs 6/6 (94мс), три
  node --check, YAML parse, Git Bash -n, прежний порядок smoke/fixture preflight/
  финальный assertion сохранены. Source preservation attempt1 raw bytes FAIL
  на CRLF/LF неизменённых файлов; attempt2 normalized PASS. Runtime не запускался.
  Evidence: outputs/ci-screenmap-20260921/attempt5/static-gates.json.
  Product TS/API не менялись; полные suites локально NOT_RUN, выполняются в CI.
- Candidate f051a66599834032a0f95a7495b6945ec6f1f811 опубликован в main;
  remote SHA совпал. Staged6 paths/diff/secret-pattern review PASS.
  Attempt5: CI35613553621 и Security35613553648, start14:38:50 UTC,
  deadline15:23:50 UTC; завершены около14:51:24 UTC, budget не исчерпан.
- Итог attempt5: **BLOCKED / общий CI FAIL**. Новый runtime harness подтверждён:
  API + worker ready14:51:11 UTC, database/storage/queue checks и штатные роли;
  legacy isolated preflight/seed PASS, local runtime units6/6 и CI units6/6 PASS.
  verify:search-commerce PASS (505 projection, 3 offers/cities, checkout4 suppliers).
  verify:document-compliance PASS14:51:20 UTC: SIGNED/SUPERSEDED/PDF, compliance
  PASSED, relevant3/sent3. verify:security PASS (headers/rate limits/MFA).
- Следующий smoke verify:onboarding-agreement FAIL14:51:20 UTC: POST
  /documents/signatures/callback ожидал201, получил400, verification:
  "Signed callback requires gateway verification evidence". Fixture callback
  scripts/verify-onboarding-agreement.mjs:39 содержит certificate и вложенный
  evidence.verification, но не обязательный top-level verification. Контракт/
  guard не менялись и не обходились; исправление этого fixture не выполнено.
  verify:trust-geo NOT_RUN; Pilot browser verification SKIPPED после FAIL.
- Остальные предшествующие CI gates (typecheck/test/build, migrations/profiles,
  Prisma validate, runtime/core/config/auth/outbound/outbox) PASS; весь отдельный
  postgres-integration job PASS, Security workflow35613553648 PASS.
  Cleanup marker14:51:21 подтверждает остановку owned API + worker;
  Stop containers обоих CI jobs PASS. Активных операций нет, локальная БД не
  затрагивалась. Шестой цикл/restart не запускался, карта не изменена.
- Evidence: outputs/ci-screenmap-20260921/attempt5/{static-gates.json,
  final-result.json,runtime-excerpt.log}; readback штатным GitHub connector.
  Опубликованный fix исправил worker/notification этап, но полный DoD CI → карта
  не достигнут. Dirty только этот итоговый checkpoint, без evidence-only push.
- Один следующий шаг после отдельного решения: сопоставить callback fixture
  onboarding-agreement с текущим verification контрактом подписи, сохраняя
  обязательный guard; новый runtime цикл этим checkpoint не разрешён.

## Единственный дополнительный CI цикл — разрешён владельцем 21.09.2026

- Владелец ответил «да» на один дополнительный проверочный цикл в существующем
  изолированном PostgreSQL CI, где pg_trgm доступен. Решение передано
  Оркестратором01a02859-08f3-7082-920d-49400f0fbb09. Это attempt4 сверх трёх
  сохранённых неудач ниже, не сброс лимита и не ещё три попытки.
- Свежая сверка: canonical root, main@10c236ec1aaf71f09987321073ad18c094df79d0,
  primary01a0c415-1c3c-73e3-a270-5ad591fa9ca7, generation2/idle. Входной dirty
  только этот checkpoint; собственных API/seed процессов нет, один writer.
- Scope: минимальный CI bootstrap существующего prisma:seed:legacy перед
  неизменённым verify:search-commerce. PostgreSQL17-alpine — уже описанный
  job.services.postgres на GitHub-hosted ubuntu; DATABASE_URL указывает на
  localhost5432/marketplace/public. Service без bind mounts/production secrets;
  cleanup контейнеров выполняется штатным завершением этого hosted job.
- До любых fixture writes: CI/hosted identity, job container image/running/
  local-volume/port binding checks; Prisma read-only transaction подтверждает
  current_database/current_schema и реальный оператор pg_trgm. Ошибка preflight
  прекращает bootstrap. Никакой локальной public БД/новой DB/cluster/CREATEDB,
  extension modifications, бизнес-кода, assertions, guards или dependencies.
- Budget: весь verify job45мин, bootstrap5мин, extended HTTP suite10мин;
  один push-triggered цикл, без manual restart/re-run. Static preflight gates
  перед публикацией: YAML/embedded JS parse, fail-closed negative config probes,
  сохранность smoke source/остальных CI steps, diff/secrets/staged review.
- Экспериментальный кандидат не принят до runtime результата. PASS требует
  полного неизменённого search-commerce и общего обязательного CI, включая
  ранее skipped browser; только затем разрешена карта экранов. FAIL/TIMEOUT →
  cleanup/evidence/stop, пятой попытки без нового решения нет. Compact не
  прерывает этот scope. Практики прежние: Backend Architect, Code Reviewer,
  Git Workflow Master; инструкции уже прочитаны, агентов нет.
- Static gates PASS: YAML/embedded Node parse, 6/6 fail-closed config probes,
  все прежние CI commands/env и search-commerce source сохранены. Проверка
  истории checkpoint: attempt1 ошибочный endsWith comparator не учитывал
  добавленные промежуточные записи; attempt2 line-subsequence PASS, история
  не удалена. Это docs probe, не новый runtime cycle. Локальной DB access нет.
  Evidence: outputs/ci-screenmap-20260921/attempt4/static-gates.json.
- Кандидат опубликован: 98c1888795ac810a4b5501abcef2e2a1ec5ef4dc, main;
  origin/main readback SHA совпал. Scope/staged/secrets/diff checks PASS.
  Единственный attempt4: CI35609086298, Security35609086179, start13:59:00 UTC,
  deadline14:44:00 UTC; завершены примерно14:11:25 UTC, budget не исчерпан.
- Итог attempt4: **BLOCKED / общий CI FAIL**, следующую фазу не начинать.
  CI/container/read-only database/pg_trgm preflight и legacy seed PASS.
  Неизменённый `npm run verify:search-commerce` PASS: projection505,
  3 offers/3 cities, 8 freshness policies, override ACTIVE, checkout4 suppliers.
  Прежние buyer404 и schema-only pg_trgm препятствия на целевой CI БД сняты.
- Следующий неизменённый `npm run verify:document-compliance` FAIL14:11:22 UTC,
  scripts/verify-document-compliance.mjs:182: "Domain events were not delivered
  as durable notifications". После POST notifications/process проверка не нашла
  ожидаемый непустой набор со всеми status SENT; точная причина ещё не установлена.
  Не считать это доказанным дефектом business logic и не ослаблять assertion.
  Последующие verify:security/onboarding-agreement/trust-geo и Pilot browser
  verification не выполнены из-за остановки Extended API step.
- Typecheck/npm test/build, migrations/seed profiles/Prisma validate, runtime,
  profile/core-contract/config/auth/audit gates PASS. Отдельный postgres job
  (postgres/platform-authority/backup-restore) PASS. Security workflow PASS.
  API EXIT trap выполнен; Stop containers обоих CI jobs PASS. Локальных API,
  DB writes или процессов этого цикла не было. Пятой попытки/re-run нет.
- Evidence: outputs/ci-screenmap-20260921/attempt4/{static-gates.json,
  ci-current.json,final-jobs.json,runtime-excerpt.log}. Public API readback позже
  вернул403; финальные jobs/logs получены штатным GitHub connector, без запуска
  нового CI. Полный job outcome и cleanup подтверждены, PENDING операций нет.
- Карта экранов/продуктовый код не изменены. Кандидат setup опубликован,
  но весь DoD CI → карта не выполнен; автоматической передачи/архивации нет.
  Dirty после результата — только этот evidence checkpoint, без нового push.
- Один следующий шаг после нового решения владельца: read-only разобрать путь
  outbox → notifications и условия notifications/process в CI для точной причины
  document-compliance FAIL; отдельный runtime цикл этим checkpoint не разрешён.

## Предыдущий stop checkpoint — CI fixture setup BLOCKED

- Primary01a0c415-1c3c-73e3-a270-5ad591fa9ca7, generation2/idle; не передавать
  и не архивировать задачу: исходный DoD CI → карта ещё не выполнен.
  main @ 10c236ec1aaf71f09987321073ad18c094df79d0 = origin/main.
- Опубликованы governance a438ffe и seed fix10c236e. Hook22/22 PASS,
  JSON/19links/diff PASS; seed unit7/7 REUSED_PASS, real repeat-seed attempt2
  PASS20.945с, cleanup/public hashes PASS. Runtime hook trust UNVERIFIED.
- Remote CI35606360220 завершён FAIL404 buyer030 в verify:search-commerce.
  Prisma migrate/validate, seed/profiles, typecheck, npm test/build, outbound,
  outbox, observability, runtime/profile/core-contract/config/auth/audit gates
  PASS; postgres-integration (postgres/platform-authority/backup-restore) PASS.
  Security35606360252 PASS. Pilot browser verification SKIPPED после FAIL.
  Actual CI readback завершён; активных операций нет. Governance
  CI35605753924 завершён FAIL404 buyer030, PostgreSQL
  job PASS; Security35605753909 PASS. Повтор baseline не считается исправлением.
- Legacy fixture verification: исходный baseline FAIL404 buyer030; local
  changed-setup attempt2 FAIL startup30с; attempt3 FAIL после успешного
  startup28.424с/health200 — search GET500, PostgreSQL42883:
  оператор text % text не виден в Prisma search_path собственной схемы.
  Это локальная изоляция pg_trgm, не доказанный дефект приложения в public.
  Legacy seed сам PASS; полный search/commerce outcome НЕ доказан.
- Лимит3 исчерпан, дальнейшие попытки/изменения test setup остановлены по
  Workflow §4.3. Последний gate51.766с; собственный API PID12920 остановлен,
  схема ci_seed_1789998160518_17732 удалена, public row hashes совпали.
  Attempt2 также cleaned; собственных активных серверов/DB-runner больше нет.
- Evidence: outputs/ci-screenmap-20260921/legacy-fixture-attempt{2,3}/
  seed-repeat-result.json, api.log, legacy-fixtures.log, search-commerce.log;
  seed-commit-ci-final.json для завершённого remote run. Новых source/app/CI fixes для legacy нет:
  кандидат не опубликован при failed gate. Dirty — только этот checkpoint.
- Карта экранов не менялась; UI Standard/Agency UI Designer прочитаны только
  для подготовки. Ни новые DB/cluster/CREATEDB/extension changes, ни working/demo
  DB, live-интеграции, API guards, trust, auto-compaction не изменялись.
- Один следующий шаг после нового явного решения владельца по Workflow §4.3:
  проверить legacy-fixture bootstrap в public существующего disposable CI
  PostgreSQL service (вместо локальной схемы без видимости pg_trgm), сохранив
  исходные smoke assertions и все guards. Это изменённая предпосылка setup,
  не четвёртая автоматическая попытка и не новое разрешение DB/интеграций.

## Возобновление и правило полного DoD — 2026-09-21, generation 2

- Единственный primary/writer: 01a0c415-1c3c-73e3-a270-5ad591fa9ca7;
  каноническая папка, main @ 2b1671419bbead295672eee959d33145aaec1666.
- Явное разрешение владельца передано Оркестратором
  01a02859-08f3-7082-920d-49400f0fbb09: завершить уже прерванную передачу и
  продолжить сохранённый scope. READ-ONLY READY принят. Source
  01a0c36e-38a1-7942-957b-9e8620c01442 найден в native list_archived_threads
  самим преемником; остановка writer подтверждена Оркестратором, процессов
  seed/API/web по canonical path при свежей сверке нет. Семь ожидаемых WIP
  путей и пустой staging совпали. Тот же переход завершён: idle/null,
  generation=2 сохранена, source retired; новых задач/архиваций нет.
- Новый отдельно проверяемый governance scope: AGENTS, Workflow, SESSION_ROLLOVER,
  handoff/registry/checkpoint, continuity-hook/hooks.json/tests. Сжатие не
  прерывает работу: restore/continue до полного исходного DoD, без сужения
  задачи. Передача только после checks/review/публикации/фактического CI где
  требуются, завершения операций и comprehension; blocked/pending/unknown не PASS.
  После архива тот же переход может завершить pre-validated successor или
  уполномоченный оркестратор с evidence, не по одному флагу.
- Gates governance PASS, попытка 1: `node --test .codex/continuity-hook.test.cjs`
  22/22 (0.205с); Node JSON/local-links/consistency gate — 19 ссылок, registry
  generation2/idle, прежняя история checkpoint сохранена; `git diff --check` PASS.
  Evidence: outputs/governance-rollover-20260921/{hook-tests.log,gates.json}.
  Product WIP hashes сохранены для review; после этой evidence-only записи
  только scoped/staged review, без повторного unit suite. Budget 2мин/max3.
  Product suites
  для этих правок NOT_RUN: исходники продукта не изменяются. Runtime hook
  REQUIRES_REVIEW_AND_TRUST; trust и auto-compaction не меняются.
- Практики: OpenAI Docs (SessionStart semantics), Agency Git Workflow Master
  (отдельный commit и явный staging), Code Reviewer (guards/evidence).
  Прочитаны; агентов нет. После фиксации правил — короткий отчёт Оркестратору.
- Продуктовый WIP seed/helper/test/ci.yml сохраняется отдельно от governance
  staging. Исходная задача CI → карта НЕ завершена; repeat-seed attempt1 FAIL
  до seed, 18.9с/cleanup PASS; 7/7 unit и node check по checkpoint не повторять.
  Remote baseline failure1, max3/blocker, диагностика15мин/local gate5мин/CI45мин.
- Следующий шаг: закончить scoped governance gates/publication, затем read-only
  диагностика pg_trgm/search_path существующей test DB dentmarket_audit_20260914.
  Ни новые DB/cluster/CREATEDB/public extensions, ни working/demo DB не разрешены.
  Три аннотации и платёжные ограничения ниже сохраняются для итогового ответа.

### CI seed — диагностика и попытка 2

- Governance опубликован отдельно: a438ffea9aef45d4ec7ae7a18dbb8658021f2607,
  origin/main SHA совпал; Оркестратор уведомлён. CI35605753924 и
  Security35605753909 ещё in_progress, PASS не заявлен.
- Диагностика начата 13:28:39 UTC, budget15мин: read-only SQL подтвердил
  pg_trgm/public и gin_trgm_ops/public, оставшихся ci_seed схем нет.
  Prisma schema=ci_* задаёт search_path только ci_*; URL options его не меняет.
- Обоснование attempt2: тот же isolated-schema repeat-seed gate, подготовка
  всеми32 неизменёнными migration.sql через существующий PostgreSQL17 psql,
  --single-transaction/ON_ERROR_STOP и session search_path=own_schema,public.
  Public schema/extension заранее существуют; команды IF NOT EXISTS не меняют
  их. В migrations нет иных public-qualified targets, search_path overrides
  или database/extension mutations. Это подготовка seed fixtures, не PASS
  Prisma migrate deploy; этот реальный gate остаётся в CI на чистой БД.
- Seed/helper/test/CI diff не менялись; unit PASS сохраняется. Gate budget5мин,
  attempt2/max3; cleanup только своей новой схемы, public snapshot до/после.
  Новых БД/прав/extension changes нет. Evidence attempt1 не перезаписывается.
- Attempt2 PASS20.945с: 32 migration SQL, reference/operator/test, catalog,
  первый pilot seed и полный повтор четырёх profiles; 500 offer mappings
  совпали после намеренной смены earliest variant. Cleanup PASS, таблицы public
  test schema совпали по count/row hashes. Evidence:
  outputs/ci-screenmap-20260921/attempt2/seed-repeat-result.json + step logs;
  runner seed-repeat-attempt2.mjs. Первичный node --check runner выявил опечатку
  кавычек до DB-запуска, исправлена; это не новая DB attempt и не дефект продукта.
- Локальный slice готов к scoped публикации: seed/helper/test + одна строка CI
  и checkpoint/handoff. Product TS/API/contracts/migrations не менялись;
  typecheck/full suites не повторяются. Unit7/7/node checks REUSED_PASS по
  неизменённым исходникам, diff/staging проверяются перед commit.
- Следующий шаг: commit/push seed fix, фактический CI с Prisma deploy и repeat
  profiles; старый search-commerce fixture blocker остаётся открытым. Карта
  экранов только после завершения CI remediation, без ротации этой задачи.

### Ожидание CI исправленного seed

- Commit10c236ec1aaf71f09987321073ad18c094df79d0 опубликован в origin/main;
  readback SHA совпал, checkout после commit чист. CI35606360220 и
  Security35606360252 начаты 13:33:21 UTC, пока PENDING, budget45мин.
  Evidence outputs/ci-screenmap-20260921/seed-commit-ci.json. Успех общего CI
  не заявлен; переход к карте экранов не начат.
- Read-only подготовка следующего известного blocker: search-commerce,
  document-compliance и trust-geo используют legacy buyer030/offers150+ и
  упаковки/города. Текущие profiles этих fixtures не создают. Их источник —
  существующий apps/api/prisma/seed.ts / prisma:seed:legacy; одной смены ID
  недостаточно. Возможный fix только в test setup изолированного CI service,
  до расширенных smoke и после проверки profiles; решение ещё не применено.
- Следующий шаг: получить фактический CI результат seed/следующего blocker;
  unit/repeat-seed не повторять, продуктовый backlog не расширять.

### Известный legacy fixture blocker — ограниченная проверка setup

- Внутри того же CI remediation проверяется кандидат подготовки данных:
  существующий prisma:seed:legacy после штатных profiles, только в новой
  собственной схеме disposable test DB; неизменённый verify:search-commerce
  против собственного go_live API с test adapters/no background queues.
  Это не product feature, не изменение рабочих данных и не переход к карте.
- Исходный search-commerce remote baseline FAIL404 сохранён. Новый local
  changed-setup запуск — attempt2/max3, budget5мин, диагностика15мин. API/src
  и schemas/src совпали с записанным build baseline16af5ca; существующий dist
  используется без переписывания/build. Shell secrets не наследуются runtime.
- Legacy source прочитан: fixed buyers/offers/packaging/cities/mock documents;
  LOCAL_STORAGE_PATH задаётся внутри ignored outputs. Никаких live signatures/
  payments. Cleanup только своего PID/schema, public row hashes до/после.
- Следующий шаг: выполнить локальный search-commerce gate; сохранять любой
  следующий guard/contract FAIL, не ослаблять assertions ради CI.
- Local attempt2 FAIL52.09с: profiles/legacy seed PASS, но собственный API не
  ответил за ошибочно укороченный runner startup30с; API log пуст, HTTP сценарий
  не достигнут. API/schema cleanup PASS, public preserved. Evidence:
  outputs/ci-screenmap-20260921/legacy-fixture-attempt2/seed-repeat-result.json.
- Последний разрешённый attempt3 проверит именно запуск с уже существующим
  стандартным startup60с из verify-platform-authority и сохранит last HTTP
  error/status, info log и PID; общий gate budget5мин не повышается. Гипотеза:
  прежний сокращённый startup30с не покрывал загрузку локального go_live artifact.
  При третьем FAIL — BLOCKED и остановка, без смены инструмента/новых retries.

## История прерванной передачи — 2026-09-21, generation 1

- Source/primary: 01a0c36e-38a1-7942-957b-9e8620c01442; transition=preparing.
  Successor: 01a0c415-1c3c-73e3-a270-5ad591fa9ca7, только read-only comprehension.
- Read-only comprehension преемника получен и проверен: продукт, WIP, gates,
  counters, запреты и следующий шаг совпали. Теперь primary передан ему,
  generation=2 / awaiting_archive. Оба остаются без продуктовой записи до
  подтверждения архива source; source меняет только завершающие поля handoff.
  Продуктовая запись остановлена; собственных активных seed/API/web процессов нет.
- main @ 2b1671419bbead295672eee959d33145aaec1666. Собственный WIP:
  `.github/workflows/ci.yml`, `scripts/seed-pilot-demo-market.mjs`, новые
  `scripts/lib/pilot-variant-selection.mjs`, `scripts/pilot-variant-selection.test.mjs`,
  `.codex/project-session.json`, этот checkpoint и PROJECT_HANDOFF. Staging/commit/
  push текущей реализации ещё не выполнялись. Чужих правок не обнаружено.
- Реализовано: seed сохраняет уже назначенный вариант для предложений; при первом
  запуске выбирает стабильно по createdAt/id, отклоняет конфликтующие связи/единицу.
  Единица продажи выбирается по unique code=piece. CI запускает regression test.
- PASS (попытка 1): `node --test scripts/pilot-variant-selection.test.mjs` — 7/7;
  `node --check scripts/seed-pilot-demo-market.mjs` и helper — PASS. Эти исходники
  после проверки не менялись; не повторять из-за нового чата или handoff-docs.
- PostgreSQL repeat-seed gate, попытка 1: FAIL до запуска seed, миграция
  20260716153000_init_foundation / P3018 / PostgreSQL 42704: gin_trgm_ops не виден
  в новой схеме. Это test setup blocker, не доказательство ошибки исправленного seed.
  Evidence: ignored `outputs/ci-screenmap-20260921/seed-repeat-result.json`,
  `migrations.log`, runner `seed-repeat.mjs`. Длительность 18.9с; cleanup PASS:
  собственная схема ci_seed_1789995761424_9048 удалена. Рабочая БД не затронута.
- Следующий ОДИН шаг: read-only проверить расположение pg_trgm и search_path
  существующей test DB dentmarket_audit_20260914 и выбрать безопасный test setup
  в пределах Workflow §4.1. Не менять public extensions, не выдавать CREATEDB,
  не создавать новую БД/cluster без отдельного разрешения; не обходить failed gate.
  Максимум 3 попытки на blocker, 15мин диагностики; локальный runner budget 5мин.
  До подтверждённого setup новой попытки не было. Старые CI counters сохраняются.
- После устранения blocker: scoped review/gates → commit/push/actual CI;
  затем согласованная карта экранов. Нельзя выдать CI PASS, начать весь CORE backlog,
  live-интеграции, деплой, повторную организацию 78 референсов или редизайн приложения.
- Последние три аннотации пользователя ещё требуют итогового ответа: (1) карты
  личные/корпоративные и банковский перевод, без платы клинике; (2) около 10%,
  split и отдельный счёт поставщику — варианты, не утверждённые правила;
  (3) продолжить CI → карту, цель 26 сентября, интеграции отдельно. В ответе
  использовать :codex-annotation{index="1"}, :codex-annotation{index="2"},
  :codex-annotation{index="3"}. Не фиксировать пока неизвестную модель как принятую.
- Рекомендации для обсуждения с банком: отличать покупателя-организацию от
  держателя карты, факт оплаты от поступления/расщепления, банковскую комиссию от
  комиссии платформы; спросить про multi-supplier корзину, возвраты/частичные
  подтверждения. Обычный внутренний перевод не обязательно SWIFT. Проверенные
  официальные источники: https://nationalbank.kz/ru/page/payment-systems и
  https://halykbank.kz/kz/business/payment/epay (наличие продукта не подтверждает
  согласованные условия для нашей площадки). Рассрочка/кредит отложены до банка.
- Напоминания: ранее упоминалось paused dentmarket, но в локальном реестре найден
  только zeny-dentmarket-refresh (PAUSED), привязанный к Оркестратору
  01a02859-08f3-7082-920d-49400f0fbb09, его не менять. Native view dentmarket
  отрисовал карточку без возвращённых полей; существование/параметры и перенос
  этого напоминания не подтверждены. Ничего не включалось и не пересоздавалось.
  Hook остаётся REQUIRES_REVIEW_AND_TRUST, фактический runtime hook не доказан.

## Текущая последовательность — CI, затем карта экранов

- Владелец после подтверждённого аварийного восстановления: primary
  01a0c415-1c3c-73e3-a270-5ad591fa9ca7, один writer;
  main @ 2b1671419bbead295672eee959d33145aaec1666, старт clean = origin/main.
- Основание: владелец согласовал «завершить проверку CI, затем обновить карту
  экранов», попросил продолжать; целевой срок внутреннего backend/frontend —
  26.09.2026, внешние интеграции исключены. Production/deployment не объявлять
  готовыми по дедлайну; нужны их prerequisites и точная среда.
- Состояние: active / CI_SEED_REMEDIATION. CI35601261774 FAIL на Prepare
  deterministic pilot market, PostgreSQL job PASS; Security35601261739 PASS.
  Новый blocker: повторный pilot seed, SupplierOffer P2002 по id. До старого
  search-commerce fixture gate этот run не дошёл; он не объявляется исправленным.
- Диагноз: seed выбирает variants[0] с ORDER BY createdAt без tie-break;
  id предложения зависит от source product и supplier, natural key — от variant.
  При повторе выбор другого варианта вызывает collision. Сохранять имеющиеся
  связи pilot offers; для первого запуска — детерминированный выбор.
- Ближайший scope/DoD: минимальный seed fix + regression, повторный реальный
  seed/manifest на отдельной схеме существующей disposable DB
  dentmarket_audit_20260914, явный cleanup только своей схемы. Никакой записи
  в working/demo DB, смены бизнес-правил, dependencies или новых worktrees.
  Gates: node check/unit regression, PostgreSQL repeat-seed, diff; actual CI.
- Попытки: remote seed failure — baseline1; local changed-input attempt1 FAIL
  на миграции test setup, seed не достигнут (подробности выше). Бюджет local gate
  5мин, CI45мин, max3 на blocker. Начальный
  env probe не нашёл URL; read-only источник настроек найден в dev-local.mjs
  по существующему preflight, секреты не выводить. Временная схема удалена.
- После зелёных обязательных gates текущего slice — отдельный scoped commit/push,
  затем продолжить согласованную карту экранов; не запускать весь CORE backlog.
- Платёжное уточнение пользователя для последующей фиксации: личные/корпоративные
  карты через эквайринг и банковский перевод; клиника без платы на старте;
  около10% поставщика — гипотеза, split/отдельный счёт не утверждены. Рассрочка/
  кредит зависят от встречи с банком. Не выдавать эти варианты за готовый контракт.
- Практики: Backend Architect (idempotent data), Git Workflow Master (scope),
  UI Designer для следующей карты; инструкции прочитаны, агентов нет.
- Следующий продуктовый шаг: read-only диагностика test setup после governance gates.

## История — утверждение B2B-состава

## Текущий checkpoint — B2B-SCOPE-APPROVAL-2026-09-21

### Последнее уточнение — общая поддержка акций

- Владелец/папка прежние; main @ d7ba31446ba1a13c6d33380b5a6195206e0b02af,
  исходно clean = origin/main. Предыдущая фиксация уже опубликована, не повторять.
- Состояние: READY_FOR_PUBLICATION. Пользователь уточнил: «3 + 1» — пример; нужны разные
  акции (1 + 1, 2 + 1, скидка на товар и другие описанные механики), бронь обязательна.
- Scope/DoD: уточнить Product §22.7, соответствующую строку Foundation, handoff,
  lastAuthorization и этот checkpoint; резервировать товары оформляемого заказа,
  включая подарки. Никакой реализации promotions/API/БД или новых интеграций.
- Выполнено: N + M описано параметрами, скидка — отдельная механика общей акции;
  дополнительные механики требуют конкретных условий, 3 + 1 не зашивается в код.
- Gates: read-only Node docs gate PASS, попытка 1: 5 scoped paths, 38 локальных
  ссылок, JSON ownership и история сохранены; runtime не изменён, новых [x]
  и credential-pattern findings нет. git diff --check PASS. Бюджет 2 минуты,
  максимум 3 попытки. TS/build/DB/browser NOT_RUN: меняются только требования.
  После этой evidence-only записи — review/staged diff check, без rerun suites.
- Практики: Backend Architect (условия/резервы) и Git Workflow Master (scoped
  docs commit/push), инструкции прочитаны ранее; агентов/процессов нет.
- Следующий шаг: scoped staging, commit/push/readback и остановка.
  Итоговые SHA/CI — в финальном ответе, без отдельного evidence-only коммита.

### Предыдущая фиксация — опубликована в d7ba314

- Владелец: primary 01a0c36e-38a1-7942-957b-9e8620c01442, реестр idle;
  один writer в C:\Users\user\Desktop\dentmarket-kz-main, иных worktrees нет.
- Состояние: requirements recorded / READY_FOR_PUBLICATION; реализация не начата.
- Основание: после двух разборов референсов владелец подтвердил все итоговые
  решения: «согласен, утверждаю это всё, приступай, зафиксируй это».
  Отдельная аннотация подтверждает механику «3 + 1» и резерв подарочного товара.
- Outcome/DoD: сохранить согласованные кабинеты, уведомления, актуальность
  корзины, ERP/лимит/цену, мастер-каталог, импорт, акции, onboarding, споры,
  аудит/настройки, комиссию/аналитику в Product и связанных канонических docs;
  отделить отложенное/неизвестное и историю; links/consistency/diff PASS,
  scoped commit, обычный push origin/main и фактический CI readback.
- Старт: main @ 05c97f50c9c1e1be9154c100982502445c01dc3e = origin/main;
  исходно clean, чужого WIP нет. Последняя организация референсов опубликована
  этим commit; прежний результат ниже не выполнять повторно.
- Scope: Product V2, Foundation, out-of-pilot notice, ADR 004/012, два UI standards,
  preview README, handoff, эта карточка и lastAuthorization реестра.
  Приложение/API/БД/flags/HTML/PNG/generators не меняются. Live-интеграции,
  исправление прежнего CI, новый worktree/ветка/ребрендинг не входят.
- Выполнено: требования сохранены в Product §22; ADR 012 отделяет ERP stock,
  лимит площадки и источник цены; Foundation §4.1 связывает с существующими CORE;
  состав кабинетов — UI Standard §2.2, решение по референсам — Consolidation §21.
- Утверждено: обычные акции с подарком, операторские споры и аналитика; AI,
  рекомендации, подписки, платная реклама отложены. 60 секунд — начальный
  интервал активной корзины, не SLA ERP. Комиссия — модель, не утверждённые 10%.
- Неизвестное: база/момент/ставка комиссии, возвраты/расчёты с поставщиком;
  source SLA, конкретные live-подключения, точный спорный вариант макета каталога.
  Согласие с требованиями не отмечает старые 78 surfaces как visual PASS.
- Проверки: read-only Node docs gate PASS, попытка 1, main @ 05c97f50 + этот
  scoped diff: 11 путей, 100 локальных ссылок, 9 новых anchors; история checkpoint/
  Consolidation и принятые чекбоксы Foundation сохранены, ownership реестра не
  изменён; нет runtime/reference asset изменений и credential-pattern findings.
  git diff --check PASS. После этой evidence-only правки нужен только её review
  и итоговый staged diff check; общий docs gate повторно не запускается.
  Бюджет 2 минуты, максимум 3 попытки.
  Один apply_patch не совпал с прежним текстом UI header; после точного чтения
  применён корректно. Это не попытка runtime gate и не дефект приложения.
- TS/build/DB/browser suites NOT_RUN: код/данные/runtime не менялись.
  Старый CI verify:search-commerce blocker не исправляется, evidence не сбрасывается.
- Практики: прочитаны и применены Agency UI Designer (компоновка/контекстные
  действия), Backend Architect (источники/инварианты/проверки), Git Workflow
  Master (единый docs scope, явный staging, обычный push); агентов не запускали.
- Собственных серверов/БД/фоновых процессов нет. Следующий шаг: явный staging,
  commit/push/readback; остановиться после фиксации. Фактические commit, remote
  SHA и CI после отправки — в финальном ответе этой задачи; evidence-only commit
  ради записи собственного SHA не нужен. При resume сначала сверить Git/ответ:
  уже опубликованную фиксацию и неизменённые gates не повторять.

## История — организация и передача до утверждения требований

- Основная задача: 01a0c36e-38a1-7942-957b-9e8620c01442; .codex/project-session.json — реестр ID.
- Фаза: idle / REFERENCE_SET_APPROVAL_PENDING; COMPREHENSION_READY проверен, четыре
  прежние задачи архивированы нативными инструментами с подтверждением.
- Основной исполнитель проекта: 01a0c36e-38a1-7942-957b-9e8620c01442.
  Единственный writer текущих docs; Оркестратор завершил публикацию и освободил
  право записи. Активного продуктового writer нет; параллельная запись запрещена.
- Текущая задача: UI-REFERENCE-REVIEW-2026-09-21 — физически организовать 78
  HTML-референсов по понятным папкам, дать единый вход и чеклист для одного прохода.
  DoD: 78/78, одна категория на ID, сохранность оригиналов/старых ссылок,
  рабочие относительные assets, повторная генерация, scoped commit/push.
- Решение: redesign direction requested; reference set approval pending;
  implementation not started. Прежнее ограничение будущей работы полировкой снято.
- Разрешено новым поручением: generated review-набор и его генератор внутри
  production-preview-2026-09-16, связанная документация и эта карточка.
  Прежний запрет организации assets снят только для этого набора; оригиналы,
  старые точки входа и продуктовые файлы сохраняются. Диагностические PNG
  исключены из набора утверждения; все новые статусы ожидают решения владельца.
- Не разрешено этим поручением: новые функции, исправление старого CI, миграции
  БД, смена ветки, новый worktree, force-push или перенос всего старого backlog.
- Snapshot задачи: main @ 83a62ce89768294f14ce02451c25f68ac6f44181, исходно чисто,
  один worktree в канонической папке; чужого WIP при старте нет.
  Предыдущая инвентаризация опубликована в этом commit; её результаты ниже.
- Источники/выполненное/остаток: actual_docs/PROJECT_HANDOFF.md; подробные gates в профильных docs.
- Блокер продукта: общий CI verify:search-commerce FAIL; последняя реализация остановлена пользователем.
- Hooks: REQUIRES_REVIEW_AND_TRUST, фактическое срабатывание в приложении
  не подтверждено. Unit tests не заменяют trust/runtime.
- Собственные изменяющие процессы/БД этой организационной задачи: нет.
- Проверки адаптера: расширенный набор 16/16 PASS (включая незавершённую передачу,
  отключённую ротацию и защиту от повторного создания). Ссылки и JSON проверены.
- Non-owned file preservation: SHA-256 всех остальных исходных файлов совпал
  со снимком до организационных изменений; продуктовый код не менялся.
- Передача 21.09 завершена: создана одна задача в saved project/environment=local,
  проверены продукт, checkout, требования, история/остаток, ограничения и протокол.
- Старые task IDs перечислены в retiredThreadIds реестра, история не удалена.
- Выполнено: 78 IDs/78 rendered HTML/69 templates сверены с manifest; четыре
  originals совпали по SHA-256 с Desktop и source-manifest. Семь файлов preview
  совпали с final-manifest после CRLF→LF, byte hashes различаются. Это не новый
  runtime PASS. Происхождение/ограничения/пути — Consolidation Standard §20.
- Проверки предыдущей инвентаризации: inline Node read-only gate PASS, 34 локальные
  ссылки и исторические разделы двух UI standards сохранены; diff только четырёх
  разрешённых docs, untracked нет; git diff --check PASS. Финальная новая ссылка
  AppShell и итоговый diff проверяются перед staging. Runtime suites NOT_RUN:
  код, данные и поведение не менялись. Бюджет docs gate 2мин, max3 попытки.
- Выполнена организация: review/index.html — единый вход, review/CHECKLIST.md —
  один проход; 9 основных папок, 78 HTML с одной категорией на ID, 4 originals
  и 2 concepts отдельно. Диагностические PNG исключены; все статусы pending.
- Проверки организации PASS: node --check; organize-review.mjs generate/check;
  78/78, 3250 относительных links/assets и query IDs; 154 перехода prev/next;
  каждый ID в чеклисте ровно один раз. Повторная генерация не изменила все100
  generated files. SHA-256 всех127 исходных файлов preview совпал с baseline
  (исключены разрешённые README/checkpoint/tooling и новая review/).
- Browser file smoke: одна попытка BLOCKED политикой Browser Use для file://;
  обход/смена браузера/сервер не использованы. Это не дефект приложения и не
  browser PASS. Статическая проверка ссылок завершена отдельно.
- Приложение/БД/установки/старые browser gates NOT_RUN, продуктовый код не менялся.
  Бюджет gate2мин, max3 попытки. Собственных серверов/фоновых процессов нет.
- Публикация нового scope: scoped commit/push и CI readback после review;
  их фактический результат — в ответе этой основной задачи, без нового
  evidence-only коммита. Старый общий CI FAIL не объявляется исправленным.
- Практики: Agency UI Designer (reference provenance/компоненты/состояния),
  Git Workflow Master (один docs commit, явный staging, обычный push).
- Следующий шаг: после scoped публикации предъявить review/index.html владельцу
  для одного прохода и его решения по набору/варианту каталога.
  До утверждения не начинать UI/backend/CI implementation.
- Приостановленное напоминание dentmarket переназначено на новую основную задачу;
  расписание, prompt и статус PAUSED сохранены, мониторинг не включён.
- Исторические уточнения handoff: решение 15.09 — полировка без редизайна;
  платёж пилота не утверждён; поздние результаты CI см. explicit evidence,
  а не исторический pending в CI-карточке.
- Stop: разночтение Git/владения, ошибка handoff/comprehension или неизвестный
  результат создания задачи; не создавать дубликаты.
