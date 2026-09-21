# PRIMARY-SESSION — Platforma.Market

Дата: 2026-09-21. Это карточка исполнения, не продуктовый backlog.

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
