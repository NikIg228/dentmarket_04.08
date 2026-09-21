# Исправления аудита: доступ, регистрация и безопасность логов

Основание: запрос владельца 15.09.2026 «разбей данный анализ на тех документы,
приступаем к исправлению». Это спецификация исправлений, не новый продуктовый ТЗ.
Очередь и единственные чекбоксы — [Foundation §8](DENTMARKET_BACKEND_FOUNDATION_V2.md#8-исправления-аудита-закрытого-пилота--2026-09-15).
Доказательства исполнения — [Acceptance Matrix §9](../governance/PROJECT_ACCEPTANCE_MATRIX.md#9-aud-fix--исправления-аудита-2026-09-15).

## 1. Основание и ограничения

Аудит: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/AUDIT_REPORT.md`,
разделы 3, 10, 11; там же `COVERAGE_MATRIX.md` и `technical/`.
Исходная версия: HEAD `3d644963ed72f99a100e180db2d373bc5abeaef9` плюс
dirty snapshot SHA-256 `2a01a4b081cf7612c6239594ac8553e1a34498543dd4c69ebef8bcd3b5ac541e`.
Это локальные evidence, не общедоступные CI artifacts. Исторические отчёты не
переписываем в PASS после исправления: новый результат регистрируем отдельно.

Аудит не завершён целиком. PASS, FAIL, BLOCKED, NOT_RUN описывают проверку;
OPEN, CODED, ACCEPTED — исправление. P1/P2 здесь продуктовый приоритет,
не CVSS и не заключение о production attack chain.
Старое обозначение `DEMO-01` в аудите означает проблему письма; ниже оно имеет
префикс `audit:`, чтобы не путать с задачей активации пяти модулей в Foundation.

Сохраняем current UI, JWT/cookie/CSRF, tenant isolation и обязательный договор
поставщика с площадкой. Не подключаем providers, не меняем рабочую БД, не
подставляем DB tokens, не создаём универсальный dev bypass и не запускаем агентов.

## 2. AUD-FIX-01 — безопасные HTTP-логи (P1; CORE-08)

**Finding AUTH-LOG-01:** локальный runtime сохранил четыре cookie-bearing
response header поля при login/refresh/logout. Аудиторский лог очищен после
отзыва двух созданных сессий; очистка не исправила logger. Внешняя утечка не доказана.
Evidence: `technical/auth-evidence-privacy.json`, `AUDIT_REPORT.md §11`.

### Граница изменения

- [structured-logger.ts](../../apps/api/src/platform/observability/structured-logger.ts):
  общая redaction policy Pino; регрессия рядом в `structured-logger.spec.ts`.
- Прямой путь: `AuthSessionsController.setCookies` / `logout` → Express response
  → `httpLoggerMiddleware` из bootstrap → Pino response serializer → JSON stream.
- Альтернативный путь: `x-csrf-token` входящего запроса refresh/logout. Node
  нормализует HTTP header names; проверяем смешанный регистр на wire.
- Не менять auth controllers, сессии, DTO, storage, зависимости, уровни
  логирования или состав operational events. Логи статуса/ошибки не отключать.

### Инвариант и сценарии

1. `Authorization`, request `Cookie`, `x-csrf-token` и response `Set-Cookie`
   не содержат исходных значений в сериализованном HTTP-логе.
2. Скрывается целый `Set-Cookie`, как строка, так и массив нескольких cookies;
   тестируются выдача, ротация и очистка, обычный и ошибочный ответ.
3. Клиент получает исходные заголовки/cookies и status без изменений;
   requestId, route/method, duration, безопасные headers остаются в логе.
4. Request/response bodies по-прежнему не включаются стандартным HTTP logger.
   Это не универсальная очистка произвольного текста, URL или вручную
   сериализованных сообщений; такие sinks не объявляются сертифицированными.

### DoD / execution brief

Сначала воспроизвести на настоящих Pino + pino-http + локальном HTTP server
с синтетическими cookies, затем исправить policy и повторить тот же regression.
Подмена только log destination в тесте; serializers/redaction настоящие.
DB, migrations, seed, внешние отправки и основной runtime не требуются.

Обязательные gates: owning-package typecheck; focused regression и соседние
observability/auth unit tests; `npm run typecheck`; `npm test`; `git diff --check`;
проверка Markdown links и сохранности исходных dirty files. Полные observability
DB drills, PostgreSQL, browser и release не нужны: не меняются auth state,
транзакции, UI или composition. Не добавлять alias ради одного теста.

До редактирования и после focused tests — отдельные локальные проходы проверки
security boundary/совместимости (без делегирования). Stop: потеря полезного
event, изменение wire cookies, оставшийся секрет в проверяемом sink, красный
обязательный gate. Лимиты Workflow: максимум 3 попытки, 20 минут на gate,
15 минут на диагностику; без повторов неизменившихся входов.

## 3. AUD-FIX-03 — восстановление регистрации и единый выход (P1; CORE-05)

Выполнять отдельными последовательными slices, не одной переписью auth.

| Finding / доказанность | Минимальное изменение | Приёмка |
| --- | --- | --- |
| UX-21: source FAIL — buyer/supplier `/documents` удаляют только sessionStorage; API logout/revoke проверены отдельно, UI NOT_RUN | Общий logout через штатный server revoke/cookie-CSRF flow; использовать во всех затронутых кнопках. Не выдавать локальную очистку за подтверждённый выход | Успех, 401/ошибка сети, другая вкладка, повтор, сохранение server protection; после успеха старые access/refresh отвергаются |
| UX-20: source + persisted/API FAIL — после потери form state pending intent даёт 409, аккаунта ещё нет | Защищённое продолжение той же заявки после штатного доказательства владения; сохранить идемпотентность, понятное продолжение после reload/network failure | Одна заявка/организация/учётная запись; expired/consumed token, другой email/БИН/tenant, duplicate submit. Пароль не хранить в localStorage; не извлекать token/key из БД |
| audit:DEMO-01: conditional source finding, end-to-end BLOCKED — console transport при UI «письмо отправлено» | Честный UX локальной доставки и контролируемый test transport для verification/recovery в изолированной среде; не публичная выдача tokens | Пользователь понимает ограничение; локально можно штатно завершить verification/reset; production не открывает тестовый путь |
| audit:DEMO-03: BLOCKED — admin form предлагает ненастроенный social login | Перед реализацией зафиксировать допустимый локальный вход на уже имеющемся auth-механизме, сохранив operator authority/MFA | Обычный вход оператора и отказ tenant-admin/anonymous; development shell не доказательство авторизации |

Точные маршруты: `apps/landing-web/app/register/page.tsx`,
`apps/api/src/modules/onboarding/onboarding.service.ts`,
`apps/api/src/modules/identity/auth-sessions.controller.ts`,
`apps/api/src/modules/identity/auth-sessions.service.ts`, buyer/supplier
`app/documents/page.tsx`, текущие login/logout helpers и общий api-client.
Новый public contract начинается с `packages/schemas`; действующие guards
не ослаблять. Способ resume и локального operator входа — обязательный brief
до кода, не заранее выбранный небезопасный workaround.

Gates: TS минимум, auth regression; при изменении state/tenant/token lifecycle
`verify:postgres`, `verify:platform-authority`, `verify:rate-limit-auth` по границе;
при core API — contract gate. Изменённый critical UI: build затронутых приложений,
`verify:web`, keyboard/mobile и две вкладки. Не суммировать повторные prerequisite builds.
Тесты с записью — только в согласованной disposable БД с отдельными files/queues/transports.

Browser blocker аудита: два `Session closed`; перед следующей попыткой нужна
конкретная новая гипотеза среды, не новый браузер ради обнуления счётчика.
Если proof недоступен, исправление остаётся CODED/BLOCKED, не ACCEPTED.

### Logout slice — принятое решение и приёмка 15.09.2026

Выполнен только UX-21 / AUD-FIX-03.1. Resume/доставка/операторский вход не менялись.
Общий `revokeWorkspaceSession` в api-client вызывает существующий
`POST /auth/sessions/:sessionId/revoke` с Bearer из штатного handoff. Identity
headers и cookies не отправляются: сервер сам проверяет пользователя/владение.
Этот путь не требует CSRF, поскольку не использует ambient cookie authority;
проверка CSRF у cookie `/auth/logout`/refresh сохранена и подтверждена отдельно.
Нельзя заменить его на безусловный `/auth/logout`: без refresh-cookie тот может
вернуть ok, не отозвав bearer-сессию; cookie также может принадлежать другому входу.

Успех требует `id === currentSessionId` и `status === REVOKED`. После подтверждения
очищается только соответствующий sessionStorage и выполняется replace на штатный
landing login. Неподтверждённый результат, HTTP401/403/404/429/500, timeout/network
не приводят к локальному «успеху»: есть безопасное сообщение и повтор. Автоматического
повтора отзыва нет; одновременные нажатия блокируются. Один hook используется на
основных buyer/supplier страницах и в обоих архивах; AppShell показывает busy/error.

BroadcastChannel уведомляет вкладки того же origin и той же sessionId. Он не
является авторизацией; backend отвергает отозванные access/refresh независимо
от вкладки. Отложенный ответ не очищает другую сессию, уже записанную в storage.
Cross-origin мгновенная очистка интерфейса, выход со всех устройств, обновление
истёкшего access и новые cookie endpoints не входят в этот slice. Оставшийся
HttpOnly refresh-cookie после bearer revoke недействителен; это не обещание
физической очистки cookie с другого origin/path. Никакие guards не ослаблены.

Gates и точные команды/попытки: [Acceptance Matrix §9](../governance/PROJECT_ACCEPTANCE_MATRIX.md#9-aud-fix--исправления-аудита-2026-09-15).
Принят scoped web-gate (полный сценарий logout, не весь несвязанный web backlog):
production builds buyer/supplier, 4 UI-only сценария с явной имитацией ошибок,
2 настоящих JWT/DB сценария с sibling tab и отказом старых tokens, desktop1440
и touch390. Изолированная ранее согласованная dentmarket_audit_20260914; без
миграций/seed/изменения orders/documents. Read-only readback:2 созданные сессии
REVOKED; owned runtime остановлен. Общий CORE-05 и production не приняты.

### AUD-FIX-03.2 — execution brief, 15.09.2026

Разрешён только UX-20: после утраты страницы продолжить **ту же активную**
RegistrationIntent. Email/БИН/роль сами по себе не подтверждают владение.
До кода выбран следующий минимальный путь:

1. Public POST request принимает email/БИН/BUYER|SUPPLIER и всегда возвращает
   одинаковое условное подтверждение. Только совпадающая pending/unexpired
   заявка получает ссылку на её сохранённый email. Rate limit по IP и email,
   одинаковое минимальное время ответа; существующий email HTTP adapter с
   bounded timeout и запретом redirects. Ненастроенная доставка — явный 503
   для всех адресов, без console token fallback и без нового provider.
2. Ссылка содержит случайный 48-byte token во fragment, не query. В БД только
   SHA-256, срок до 15 минут и не дольше исходной заявки, immutable binding к
   id/email/БИН/capability. Как у существующего session-handoff, используется
   IdempotencyRecord с отдельными scopes; Prisma migration не требуется.
   Inspect — read-only POST после доказательства владения, GET не потребляет token.
3. Complete связывает одноразовый proof, аккаунт и штатный onboarding claim
   одной транзакцией. Пароль нового аккаунта задаётся заново, в браузере не
   сохраняется. Существующий аккаунт требует его текущий пароль; credential
   reset, обход блокировки/MFA и автоматическая выдача session запрещены.
   После завершения — обычный login. Повтор того же proof возвращает только
   receipt о завершении, не создаёт новую организацию/сессию и не меняет пароль.
4. Истёкшая/чужая заявка, несовпадающие данные, invalid proof не продолжаются.
   Прежние согласия, набор owner permissions, platform authority и обязательный
   supplier marketplace agreement сохраняются. При rollback нет частичного
   аккаунта/claim/consumed proof. Обычная регистрация и social flow не переписываются.
5. UI: ссылка из действующей формы, запрос письма, проверка ссылки, сведения
   исходной заявки, пароль, серверный успех/ошибка/повтор. Дизайн сохраняется.
   Условное сообщение не обещает фактическую доставку; AUD-FIX-03.3 остаётся открыт.

Файлы: shared schemas/client/OpenAPI; отдельные registration-resume controller/
service; общий существующий password codec без смены алгоритма; минимальное
добавление transaction context в OnboardingService.claim; landing register/resume;
unit/contract и scoped Playwright/API regressions. Это не общий auth rewrite.

Gates: focused auth/schema/client regressions; npm run typecheck; npm test;
одна schemas/API build для verify:postgres, verify:platform-authority и
verify:rate-limit-auth (включая его config assertions); production build landing;
scoped verify:web с реальным JWT/API/PostgreSQL, reload/two tabs, mobile/keyboard,
invalid/expired/mismatch/duplicate/rollback proof; git diff --check и ссылки.
Purchase contract не меняется, verify:core-contract не добавляется автоматически.
Среда: только dentmarket_audit_20260914, изолированный checkout/storage, queues off,
loopback test mail receiver в процессе теста, без внешней отправки и DB token extraction.
Не reseed/не менять основную demo DB. Test fixtures имеют отдельный namespace.

Перед первым изменением сохранены HEAD/dirty hashes в AUD-FIX-03.2/before.json.
Лимиты: gate 20 минут, suite 45 минут, blocker diagnostics 15 минут, максимум
3 попытки с новым основанием. При обязательном FAIL/BLOCKED оставить чекбокс
открытым, сохранить checkpoint и остановиться; следующая задача не разрешена.
Практики: Agency Backend Architect (атомарность и ownership), Frontend Developer
(состояния/доступность), Evidence Collector и Playwright (подтверждённые сценарии).
Принципы recovery tokens сверены с [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html);
это аналогия для безопасного resume, не изменение продуктовых правил регистрации.

Исторический checkpoint до отдельного разрешения: **CODED / BLOCKED**, не ACCEPTED. Новые resume API/DB сценарии прошли,
но обязательный authority gate остановлен на несовместимости своего pilot-профиля
и ожидания AI201. Исправление этого существующего скрипта отдельно не разрешено;
не ослаблять runtime profile или assert. Попытка1, без повторов. Точный ledger,
непроверенные части и следующий запрос — Acceptance Matrix §9.
В этой итерации аккаунты с активным MFA, блокировкой, неактивным статусом или
без password credential не завершаются через resume: штатный вход/оператор,
без обхода ограничений. Это ограничение, а не полный CORE-05.
Старые verification/reset механизмы и их доставка не переписаны — AUD-FIX-03.3 открыт.

Продолжение разрешено владельцем 15.09.2026: исправить только несовместимость
профиля проверочного скрипта и завершить эту приёмку. В authority gate сохраняются
все существующие core/tenant assertions под pilot; добавляется явный AI404 для
поставщика и оператора без side effects. Только затем owned API перезапускается
в изолированном test/go_live для прежних AI authority assertions. Production
validation, application composition и pilot policy не меняются. Runtime test
не наследует external provider endpoints/keys, queues/schedules выключены.
На gate остаётся общий лимит: следующая попытка2 из3, не новый счётчик.
После PASS — ранее NOT_RUN final typecheck/test, rate/auth, landing build и
scoped Playwright. Prerequisite schemas/API builds и purchase/resume DB PASS
переиспользуются только при неизменности их исходников/artifacts. Любой новый
дефект исправляется только в этой границе с указанной причиной повтора.

Исторический checkpoint после первого разрешённого продолжения, 15.09.2026:
**CODED / BLOCKED на web**, не на authority. Профиль проверочного скрипта
исправлен и принят его gate (попытка2); application composition/production rules
не менялись. Финальные typecheck/unit/rate-auth и production landing build PASS.
Три web-попытки: startup timeout; несовместимый exact-label селектор обязательного
Fluent поля; после коррекции теста — настоящий пробел UI hash-navigation.
Полученное через loopback email подтверждение не открывает completion form в
той же вкладке: страница читает fragment только при mount и не слушает hashchange.
DOM evidence содержит прежнюю форму запроса; бизнес-завершение браузером не доказано.
Предел попыток исчерпан, следующий slice и четвёртый запуск не начаты.

Следующий точный запрос: разрешить в этом же AUD-FIX-03.2 обработку смены
fragment с очисткой устаревших details/password/feedback и защитой от позднего
ответа прежнего inspect; сохранить одноразовость/права/контракты. Затем regression
на same-tab link/reload и оставшуюся scoped-приёмку. Не маскировать дефект
принудительным reload в тесте. Новое основание — конкретный UI fix, не новый чат.
Все команды, reuse и ограничения — Acceptance Matrix §9; ранее закрытые X сохранены.

Владелец явно разрешил продолжение с изменённой предпосылкой — точечным fix
hash-navigation (15.09.2026). До кода повторно сверены hashes checkpoint:
`hash-nav-before.json`; прежние три web failures остаются историей.
Решение: наблюдать начальный fragment и hashchange, а форму изолировать React
key текущего token. Смена proof сбрасывает все details/password/feedback/busy;
cleanup прежнего inspect игнорирует late response. Никаких новых API/DB правил.
Regression: initial/hash/remove/duplicate/cleanup в unit, настоящий same-tab
emailed link в web, явная UI-only имитация delayed inspect и смены proof.
Gates: root typecheck/test (корректный cache неизменённых пакетов), production
build только landing, оставшийся scoped Playwright, docs/diff/integrity.
Неизменённые API/PG/authority/rate evidence переиспользуются. Среда прежняя
изолированная, без reseed. Новый разрешённый budget: максимум3 попытки на gate
с новой причиной, 20min/gate,45min/suite,15min/blocker; stop на исчерпании или
несвязанном дефекте. Не начинать AUD-FIX-03.3, не commit/push.

Итог этого разрешённого продолжения: **AUD-FIX-03.2 ACCEPTED 15.09.2026**.
`observeResumeToken` подписывается на hashchange и начальный fragment;
`ResumeRegistrationForm` keyed по token изолирует details/password/feedback и
pending callbacks. Существующий inspect cleanup игнорирует поздний ответ.
Дизайн/контракты/сервер/бизнес-правила не менялись этим fix.
Новые fragment unit4/4, root typecheck/test, landing build и scoped web5/5 PASS
с первой попытки после нового решения. Web: настоящий BUYER/SUPPLIER flow,
email proof, same-tab link, reload, sibling replay, buyer lost-response после
реального commit и отдельный readback без дублей. UI-only tests явно отделяют
network/delayed-inspect simulation от настоящих API/БД доказательств.
Уже пройденные неизменённые security/PG/API gates переиспользованы; полный
verification/reset email transport и operator login остаются AUD-FIX-03.3.
Единственный X и итоговый ledger — Foundation §8 / Acceptance Matrix §9.

### AUD-FIX-03.3 — execution brief, 15.09.2026

Владелец разрешил локальную доставку verification/reset и штатный вход оператора.
Письмо — настоящий email payload со штатной одноразовой ссылкой, сохранённый
локально вместо внешней отправки. Нет public mail/token API, DB token extraction,
SMTP/internet provider, выдачи прав/обхода MFA или переинициализации рабочей DB.
Явные флаги AUTH_LOCAL_MAIL_ENABLED и LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED:
по умолчанию false, только loopback development/test; production запрещает оба.
Второй флаг дополнительно требует JWT и обязательного MFA. Production social
operator flow сохраняется; парольный вариант не является production решением.

Mail transport пишет JSON в API cwd `.tmp/auth-mail` (вне object storage/public,
gitignored, имена random UUID, без адреса/token в имени); права файла600/папки700
на POSIX, на Windows доступ определяется ACL учётной записи ОС. На общем ПК
не включать режим для настоящих пользователей. Все тесты используют synthetic
email в согласованной audit DB. Ненастроенный transport возвращает503, не
console-success. Forgot не раскрывает существование email при delivery failure.
Public client-options раскрывает только режим/доступность локального входа;
ответы регистрации/forgot содержат delivery mode, но не содержимое письма/путь.

Operator: отдельный locally gated endpoint использует существующую password
проверку/lockout, активного user и active operator membership до выдачи primary
session. Затем существующий MFA enrollment/challenge/elevation. UI не сохраняет
session до MFA/проверки operator capability; tenant-admin и anonymous отказ.
Shared schemas/client/OpenAPI до реализации. Prisma schema/алгоритмы токенов,
обычный social/login/handoff и уже принятый resume не переписывать.

Gates: root typecheck/test; shared schema/API build один раз; auth/mail/config
regressions; production-config; scoped real API/PG mail+operator/MFA gate;
authority/rate-auth по затронутым границам; production builds landing/admin;
scoped Playwright desktop/mobile и отрицательные cases; docs/diff/integrity.
Покупка/checkout не меняются: отдельный purchase PG rerun не нужен при unchanged
evidence, auth PostgreSQL подтверждается собственным real suite. Shared contracts
не меняют purchase API. Изолированная DB dentmarket_audit_20260914 и установленный
snapshot checkout; собственные процессы/файлы/очереди, без main dev/reseed.
20min/gate,45min/suite,15min/blocker, максимум3 попытки с новой причиной;
при красном обязательном gate не закрывать X и не начинать AUD-FIX-04.

### AUD-FIX-03.3 — checkpoint CODED / BLOCKED, 15.09.2026

Подготовлены shared local-auth schemas/client/OpenAPI, локальный file delivery
для verification/reset/resume, явные production/loopback/JWT/MFA config guards,
local-operator endpoint и парольная форма перед существующим MFA. Landing
отличает локальное сохранение от provider delivery. Не настроенный transport
больше не печатает одноразовые ссылки в console и не имитирует успешную доставку.
Никакого нового SMTP-пакета/провайдера, изменений схемы БД или выдачи operator
прав при регистрации. Наличие файлов реализации **не означает приёмку**.

Важное ограничение выбранной конфигурации: `JWT_REQUIRE_MFA=true` действует
на **весь API**, а не только на local-operator endpoint. Поэтому operator fixture
изолирован; эти параметры не включены автоматически в основной запуск.
Нельзя обещать, что обычный buyer/supplier password handoff в таком профиле
пройдёт без MFA. Его общий UX не переписывается этой задачей. Для проверки
почты отдельно достаточно mail flag; operator flag требует полного JWT/MFA.
Будущий runbook должен явно сохранить это разделение, а не ослабить middleware.

Реально выполнено: schemas build PASS3.396s; root typecheck PASS46.166s на
реализации до добавления E2E specs/последней типизации тестовой заглушки.
`npm test`: попытка1 FAIL (заглушка переиспользовала Response); попытка2 FAIL
(исправленная заглушка имела zero-argument signature); обе причины исправлены
только в новом клиентском тесте. Попытка3 FAIL27.134s: неизменённый
`apps/buyer-web/app/features/purchasing/order-profile.test.tsx`, pilot case,
timeout5000ms. Причина таймаута НЕ доказана; объявлять flaky или regression
автоматически нельзя. Новые mail7/auth11/config8/schema2/client1 tests прошли;
API suite не завершился целиком, root test красный. Полный ledger — Matrix §9.

По AGENTS/Workflow автоматические попытки исчерпаны. Никакой четвёртой команды,
увеличения timeout, удаления assertion или перехода в другой runner. API build,
production-config, real DB/mail/MFA, authority/rate-auth, production landing/admin
builds и scoped Playwright NOT_RUN. Снимков/проверенных файлов писем пока нет.
Новые `scripts/lib/local-auth-fixture.mjs`, `scripts/verify-local-auth.mjs` и
`apps/e2e/tests/local-auth.spec.ts` только подготовлены, не сертифицированы;
нужен финальный typecheck новых specs после разрешения продолжить.

Файлы evidence: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-03.3/`.
`before.json`, gate logs/process/result JSON сохраняют revision/argv/cwd/duration;
ignored runner `.tmp/aud-fix-03-3/run.mjs`. Основная DB/процессы не менялись,
новый live fixture не запускался, snapshot runtime не обновлялся. Commit/push нет.
Следующий точный запрос: «Разрешаю отдельно диагностировать timeout buyer
order-profile test одним изолированным запуском без изменения timeout/assertions,
затем завершить только AUD-FIX-03.3 с этого checkpoint по новому bounded budget.
Не переписывать покупку, не начинать AUD-FIX-04 и не повторять неизменённые passes».

### AUD-FIX-03.3 — разрешённое продолжение с checkpoint, 15.09.2026

Владелец разрешил один изолированный запуск buyer order-profile без изменения
таймаутов/assertions и затем оставшуюся приёмку. Preflight1248files совпал с
`AUD-FIX-03.3/final.json`; HEAD/lockfile прежние. Гипотеза: конкуренция API suite
и dynamic imports/render в buyer test. Команда: `npm exec --workspace=@marketplace/buyer-web -- vitest run app/features/purchasing/order-profile.test.tsx`.
При PASS — полный тот же Turbo test graph с `--concurrency=1`, без изменения
самих suites/tests/timeouts; корректные cache passes переиспользуются. Это
явно разрешённое продолжение, не четвёртый скрытый retry прежнего запуска.
Далее final typecheck новых specs, API build, production-config, real auth/DB,
authority/rate-auth, landing/admin builds и scoped web/resume regression.
Никаких purchase refactors, новых интеграций, main DB changes или AUD-FIX-04.
Изолированная диагностика:1запуск/2min; остальное максимум3обоснованные попытки
на gate,20min/command,45min/suite,15min/blocker. При повторном изолированном
timeout остановка без изменения лимитов. Prefix evidence `cont-*`, история сохранена.

### AUD-FIX-03.3 — новый checkpoint: browser startup BLOCKED, 15.09.2026

Разрешённая изолированная диагностика прошла2/2 (348ms сами tests); это не
доказывает причину прежнего timeout, но прежний assertion теперь выполнен.
Тот же полный Turbo test graph с concurrency1 прошёл14/14; typecheck15/15 PASS.
После обнаружения неверного GET /organizations/:id в admin MFA completion
использован существующий operator-protected GET /organizations. Pure helper
проверяет active organization и MARKETPLACE_OPERATOR, не наличие произвольной
чужой operator org в ответе. Добавлены2regressions; admin23/23, root test graph
и typecheck повторены только из-за этого изменения, остальные passes из cache.

Настоящие local-file verification/reset + operator password/MFA/API/PG15cases
PASS; authority, production auth/rate config, production environment и resume
API10cases PASS. Landing/admin production builds в isolated checkout PASS;
admin bundle в бюджете. Runbook локальных писем добавлен в operations.md:
JSON содержит секретную ссылку, не публикуется; global MFA не включён в main API.
Test fixture отозвал свои сессии и удалил только собственные secret-bearing
JSON-письма; synthetic DB rows оставлены в согласованной audit DB.

Браузерная приёмка не выполнена. Попытка1: Playwright CJS не принимает import.meta
в новом test helper, исправлен только способ загрузки compiled TOTP utility.
Попытка2: owned fixture exited1 до первого теста. Попытка3 добавила bounded
startup-only diagnostic через private IPC: API4112 unreachable после20s,
stderr/stdout диагностического буфера пусты. Все3FAIL до UI actions; два остальных
теста NOT_RUN. Нет доказательства ошибки UI или истинной причины задержки.
Timeout/retry/assertions приложения не менялись, четвёртого запуска нет.

Оставшиеся проверки: scoped local-auth browser3cases; visual desktop/mobile;
resume browser regression на изменённой странице доставки; final typecheck E2E
после последних CJS/IPC helper edits. Пройденные root/API/config/build checks
не повторять без изменения входов. Production/CORE-05/security не приняты.
Итоговые inputs/сохранность: cont-final.json и cont-integrity.json; подробные
команды, failed history и reuse — Acceptance Matrix §9. AUD-FIX-03.3 и parent
остаются открыты; AUD-FIX-04 не начат, commit/push нет.

**Один следующий запрос:** разрешить отдельную bounded-диагностику запуска
compiled API из audit checkout вне Playwright, с теми же DB/env/20s deadline,
записав PID/exit/readiness без токенов и account operations. Сначала установить
конкретное отличие от прошедшего standalone API gate; только после нового
основания возвращаться к оставшейся browser-приёмке. Не повышать лимиты,
не повторять пройденные suites и не чинить обычный tenant handoff в этом scope.

### Разрешение на необходимую диагностику и блокеры, 15.09.2026

Последний запрос владельца разрешает продолжение необходимых задач и исправление
вновь найденных блокеров согласованного плана. Сначала завершаем AUD-FIX-03.3;
это не разрешение на redesign, внешние интеграции, production или commit/push.
Проверка1248hashes cont-final.json PASS, чужих изменений с checkpoint не найдено.
Один startup probe compiled API из audit checkout вне Playwright, с прежним
test/pilot JWT/MFA/DB и20s deadline, прошёл: health200 за12.553s. Preloader
собирал только времена загрузки модулей/PID, без env/токенов/account operations.
Основная синхронная загрузка entrypoint11.940s: bootstrap9.471s,
app.module8.266s, imports.module3.304s. Вложенные времена не суммируются.
Это подтверждает возможность старта второго checkout, но не доказывает причину
прежнего timeout. Не оптимизируем XLSX/telemetry modules ради этого auth slice.

Новое основание для remaining browser gate: отдельный preflight прошёл на том
же artifact/профиле/DB, с изолированной диагностикой до старта browser worker.
Максимум3обоснованные попытки remaining web; исходные failures сохранены,
deadline/assertions не повышать. Suite45min, command20min, blocker15min.
При изменениях только test helpers — final E2E typecheck; остальные passes
переиспользовать по hashes. Если UI/API blocker подтверждён, исправить минимально,
добавить regression и выполнить именно затронутые gates до продолжения.
Не начинать следующую фазу при незакрытом обязательном gate.

### AUD-FIX-03.3 — ACCEPTED в своей границе, 15.09.2026

Remaining web прошёл со второй попытки после разрешённого startup preflight.
Первая дошла до настоящей mobile registration/verification/forgot, затем упала
на неоднозначном test label «Новый пароль»: region и input имеют одинаковое имя.
Исправлен только locator (label ∩ input), не страница/timeout/assertion.
Вторая: local-auth3/3 PASS18.9s runner. Final E2E typecheck PASS9.692s wall,
resume browser5/5 PASS18.6s runner; прежние root test/typecheck, real API/DB,
config/authority/rate-auth и web builds переиспользованы при неизменённых inputs.
Секреты MFA скрыты на снимках, Playwright traces выключены; реальные ссылки
получены из owned local mail, не из БД. Вручную просмотрены5screenshots:
desktop login/enrollment, mobile MFA error, registration и reset success.
Контролы читаемы и доступны; «Invalid MFA code» остаётся copy-polish AUD-FIX-08,
не обходом защиты и не blocker этого local-auth slice. Проверки физического
телефона/assistive technology и всего admin dashboard не заявлены.

Три ранних browser startup failures и первая selector failure сохранены.
Это не flaky-pass внутри runner: retries0, коррекция selector явно учтена.
Owned processes остановлены, listeners3100/3103/4112 отсутствуют; test mails
удалены собственной fixture после отзыва sessions. Working demo DB не менялась.
Final evidence next-final.json / next-integrity.json и Acceptance Matrix §9.
Все обязательные gates именно AUD-FIX-03.3 пройдены; X в Foundation §8.
Parent AUD-FIX-03 остаётся открыт из-за отдельно выявленного AUTH-ORG-LOOKUP-01.

### Отдельный пробел AUTH-ORG-LOOKUP-01 — вне AUD-FIX-03.3

Ниже исходное состояние при обнаружении; реализация и текущая приёмка03.4 — далее.

P1, SOURCE-CONFIRMED / UI NOT_RUN / OPEN. Обычный password login landing
возвращает session без capability; openWorkspace в
apps/landing-web/app/auth-client.ts обращается к GET /organizations/:id.
В OrganizationsController этого route нет; существующий collection route
предназначен оператору, не обычному buyer/supplier. Переход в кабинет при
таком session может завершиться404, даже если проверка пароля прошла.

Нужен отдельный tenant-safe контракт получения собственного organization context
либо использование уже существующего разрешённого контекста с regression на
обе роли/чужой tenant. Нельзя механически переносить operator collection lookup
в обычный вход или ослаблять authority. Здесь только фиксация; не исправлено,
браузерное воспроизведение buyer/supplier и полный CORE-05 не заявлены.

### AUD-FIX-03.4 — execution brief: workspace context, 15.09.2026

Основание: разрешение владельца устранять блокеры плана; AUD-FIX-03.3 принят.
Проблема AUTH-ORG-LOOKUP-01: отсутствует own-organization read contract, а
существующий GET /organizations является platform-wide operator API. Не расширяем
его доступ. Добавляем GET /auth/workspace-context без route/body organizationId:
минимальный ответ organizationId, organizationDisplayName, capabilities BUYER/
SUPPLIER. Actor/tenant получает штатный JWT/session middleware; service повторно
проверяет active user, membership и organization. Anonymous401, недоступное
членство/организация403; response no-store. Нет записи, audit/outbox или migration.

Shared schemas/OpenAPI/client до server/UI. Landing получает context вместо
отсутствующего detail route и проверяет совпадение active organization; затем
существующий одноразовый handoff. Никаких JWT в URL, fallback на operator list,
новых прав, social/MFA policy изменений или изменения алгоритма handoff.
Existing demo/verification session capability не является способом обойти
server handoff guard. Сохраняем предпочтительный кабинет и прежний fallback
на доступный тип организации. Организации без BUYER/SUPPLIER — понятный отказ.

Scope: workspace-context schema/test, auth service/controller/regression,
OpenAPI/client/test, landing auth-client/test; owned fixtures/E2E для двух ролей.
Gates: schema/API build один раз; root typecheck и тот же serial full test graph;
real JWT/PostgreSQL context+handoff, inactive/foreign/revoked cases; production
landing build и браузерный переход обеих ролей. Target workspace artifacts
используются только при совпадении inputs/profile/API URL, иначе build затронутых
workspace приложений. Diff/docs/integrity перед X. Production config и purchase
граф не меняются, прошлые passes переиспользуются; общая production приёмка нет.
Среда: только audit DB, loopback, queues/external sends off, own files/processes;
JWT_REQUIRE_MFA=false для ordinary tenant fixture, operator fixture не ослаблять.
Новые тестовые accounts в собственном namespace, working demo DB не менять.
Budget:45min suite,20min command,15min blocker, максимум3обоснованные попытки.

Новый блокер фикстуры в AUD-FIX-03.4: первый API gate и первый browser gate
не достигали readiness за20s после смены артефактов. Отдельное наблюдение compiled
API (без account operations) завершилось health200 за5.335s; точная причина
вариативности не установлена. Real API gate затем прошёл17scenarios. Это не
регрессия auth assertion и не доказательство performance SLA.
По текущему разрешению владельца на исправление блокеров меняется только setup:
один общий budget60s для API и всех выбранных web apps вместо отдельных20s
на каждый процесс. Parent IPC75s оставляет время на сообщение/cleanup в пределах
test90s. HTTP1500ms, UI action10s/navigation20s, assertions и application policy
не меняются. Это однократное решение, без увеличения бюджета после каждой ошибки.
Следующая browser попытка2из3; историю не обнулять. Изменение общего helper
потребует scoped operator browser regression и final E2E typecheck.

### AUD-FIX-03.4 — CODED / BLOCKED, checkpoint 15.09.2026

Реализован minimal own-context контракт/schema/client/OpenAPI и серверная проверка
active actor/member/organization; landing больше не использует отсутствующий
GET /organizations/:id. Operator collection закрыт для обычных ролей. Handoff
алгоритм и ограничения не переписаны. Добавлены unit и real API/PG regressions.
Root test graph14/14 и typecheck15/15 PASS на application inputs; standalone
JWT/PG17scenarios PASS. Production landing/buyer/supplier builds в независимом
checkout PASS. Это не общий security gate и не готовность всех страниц кабинета.

Browser history: попытка1 FAIL на API readiness20s до UI; после единственной
bounded setup-правки попытка2 FAIL на чтении уже освобождённого Chromium response
после cross-origin navigation. Test стал наблюдать фактический запрос exchange
принимающего кабинета без подмены/задержки перехода. Попытка3: real BUYER desktop
1440×900 и SUPPLIER touch viewport390×844 PASS: password → context → handoff →
реальное приложение → sessionStorage нужной организации, DB +1session/+1consumed
handoff, повторный exchange401, fragment удалён, старый route не запрашивается.

Третий negative case в попытке3 FAIL: getByRole('alert') совпал с authNotice и
служебным __next-route-announcer__. Сообщение «У аккаунта нет активной организации»
было показано, но asserts отсутствия redirect/handoff и финальный DB readback после
этого locator НЕ выполнены. Не считать case PASS по наличию сообщения; standalone
API denial PASS не заменяет незавершённый browser case. Лимит3попыток исчерпан,
четвёртого запуска и исправления locator после остановки нет.

Просмотрены3снимка последней попытки: видно достижение обоих кабинетов, форма
входа с masked fields. Buyer toast и supplier data error показывают Insufficient
permissions: fixtures имеют только минимальные права для проверки входа, не весь
закупочный/поставщицкий набор. Это ограничение evidence, не утверждение готовности
dashboard и не основание выдавать дополнительные права продуктовым пользователям.
Негативный screenshot обрезает нижнюю часть сообщения; причина locator FAIL
подтверждена runner log. Полная UI/UX/физические устройства не проверялись.

Остались BLOCKED: завершение negative browser case; regression03.3 operator flow
после изменения общего setup helper; final E2E typecheck последних test edits.
Исторический03.3 ACCEPTED сохранён, но не сертифицирует эти новые helper inputs.
Независимые уже зелёные app/unit/build/API checks не повторять без изменения inputs.
Evidence — AUD-FIX-03.4/before.json, final.json, integrity.json, gate logs и
Acceptance Matrix §9. Main demo DB/config/dependencies не менялись; owned listeners
3100/3101/3102/3103/4112 отсутствуют, собственные sessions/mail очищены fixture,
synthetic rows остаются только в audit DB. Commit/push нет; parent03/03.4 открыты.

**Один следующий запрос:** «Разрешаю точечно уточнить alert locator в negative
workspace-context test и выполнить только этот case с checkpoint (два неизменённых
buyer/supplier PASS переиспользовать), затем operator regression общего fixture
и final E2E typecheck. Таймауты/assertions не ослаблять, root suites/builds не
повторять без изменённых inputs; AUD-FIX-04 не начинать до приёмки03.4».

### AUD-FIX-03.4 — ACCEPTED после возобновления, 15.09.2026

Владелец возобновил работу с сохранённой точки. Preflight1255files подтвердил
неизменность application/test inputs кроме двух docs с отметкой паузы. Изменён
только negative E2E case: alert с ожидаемым текстом, безопасный readback attachment
и screenshot самого сообщения. Guards/таймауты/API/UI и два positive case прежние.
Первый разрешённый targeted --grep запуск PASS1/1: сообщение показано, остаётся
/login, handoff request отсутствует, consumed handoff count не изменился.
Operator/shared fixture regression3/3 PASS; final E2E typecheck PASS. Прежние
два positive UI PASS и application/root/API/build evidence переиспользованы.
Итого workspace coverage3/3 =2REUSED_PASS +1fresh PASS; это не новый полный rerun.

Новые evidence: AUD-FIX-03.4/resume-negative-alert*, resume-operator-regression*,
resume-e2e-typecheck*, resume-before.json, resume-final.json, resume-integrity.json.
Точные команды/длительности/ограничения — Acceptance Matrix §9. История failures
и паузы сохранена; четвертой автоматической попытки полного suite не было.
Просмотрены новый alert и3operator/reset screenshots; ошибка Invalid MFA code
остаётся ранее зафиксированным копирайтингом AUD-FIX-08, не blocker этого slice.
Основное приложение/демобаза не менялись; owned runtime очищен, внешних отправок
нет. AUD-FIX-03.4 и parent03 приняты только как audit fixes; весь CORE-05,
production auth/external mail и общий security gate не приняты. AUD-FIX-04 не начат.

## 4. Что не переписывать

17/17 session assertions текущего аудита доказали выбранные login, refresh/CSRF,
handoff/replay, foreign/self revoke и logout сценарии. Это не весь CORE-05,
но основание сохранять работающие механизмы, а не внедрять другую систему входа.
Полный email delivery, registration verification, invitations/roles/MFA и
production readiness этими результатами не закрыты.
