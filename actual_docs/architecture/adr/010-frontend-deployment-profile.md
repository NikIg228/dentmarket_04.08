# ADR 010: frontend deployment profile

## Статус

Принято и локально проверено 2026-09-13. Production deployment не заявлен.

Дополнение 2026-09-14: локальный launcher из [ADR 011](011-local-full-feature-demonstration.md)
явно передаёт go_live; отсутствие профиля в shared config по-прежнему означает
pilot. Закрытый task card ниже — evidence исторического slice, не задание
повторить его. Выбор и reuse gates — Workflow §4.

## Решение

Все четыре Next.js приложения получают публичный профиль при сборке из
`DEPLOYMENT_PROFILE` через общий контракт `packages/schemas`. Отсутствующее
значение выбирает `pilot`; неизвестное значение или конфликт с явно заданным
`NEXT_PUBLIC_DEPLOYMENT_PROFILE` останавливает конфигурацию. Самостоятельный
публичный флаг не может включить `go_live` при отсутствующем backend-профиле.
Turbo включает оба значения в cache key. Смена профиля требует новой сборки
web и согласованного профиля API; изменение env после сборки не переключает UI.

Общий inventory закрывает AI, trust/reviews, promotions, billing и smart
recommendations. Pilot UI не монтирует эти панели и не загружает их данные.
`MarketplaceApiClient` дополнительно отвергает такие запросы до `fetch`;
backend module graph из ADR 009 остаётся границей авторизации и доступности.
Geo/address, procurement budgets, support, documents и core commerce сохраняются.

## Task card: Frontend Pilot Composition Gate

Пользователи: клиника, поставщик и оператор. Given pilot/default build, when
пользователь открывает каталог, карточку, заказы и меню кабинета, then optional
действий и запросов нет, core flow работает. Given explicit go_live build,
then optional UI и запросы доступны с прежними server permissions. Нет изменений
БД, write API, денежных правил или внешних интеграций.

- [x] Общий профиль, inventory и проверка конфликтующей build configuration.
- [x] Buyer/Supplier/Admin скрывают optional UI; четыре web configs согласованы.
- [x] API client блокирует optional GET/write/download до сети в pilot.
- [x] Regression tests: default/pilot/go_live, mismatch, core routes и requests.
- [x] Playwright: все роли, карточка/сравнение, меню, desktop/390px, сеть.
- [x] `npm run typecheck`, `npm test`, четыре production build.
- [x] `npm run verify:pilot-composition`, `npm run verify:core-contract`,
      `npm run verify:runtime-split`, `npm run verify:production-config`.
- [x] `npm run verify:web`, `git diff --check`, review и обновлённый evidence.

При красном gate фаза не закрывается. Скриншоты/trace хранятся в
`output/playwright/` или существующем Playwright output, без production data.

## Практики и границы проверки

Прочитаны и применены AGENTS.md, Development Workflow и UI/UX Implementation
Standard. Agency Backend Architect использован для единого schema contract и
границы модулей; Frontend Developer — для fail-safe композиции без новой
design system; Code Reviewer — для минимального diff, конфигурации и сохранения
core routes; Reality Checker и Playwright skill — для реального browser/network
evidence на 1280/390 px. Новых агентов, интеграций или visual redesign нет.

CI разделяет расширенные API regressions (`go_live`) и browser gate (`pilot`).
API первого шага завершается до запуска второго; Playwright сверяет не только
profile в четырёх build manifests, но и фактический OpenAPI работающего API,
поэтому повторное использование `go_live` server не может дать ложный pilot pass.

Docker CLI в локальном окружении отсутствует: YAML и shell steps проверяются
статически, но image build/deployment не заявляется проверенным. Проверки
`go_live` в этой задаче охватывают config, request regression и backend inventory,
а не live providers или полноценный browser-прогон расширенного продукта.

## Локальное evidence — 2026-09-13

Исходный clean HEAD: `4bd8c14ac5fc9d98d9857753c62d808698a39b32`.
Проверки относятся к change set этого ADR; commit определяется по истории файла.
Среда: Windows, Node 24.18.0, npm, локальный PostgreSQL, Chromium.

| Фактически выполненная команда | Результат |
| --- | --- |
| `npm run typecheck` | 15/15 Turbo tasks |
| `npm test` | 14/14 Turbo tasks; API 200, schemas 64, api-client 12, Buyer 26, Supplier 21, Admin 21, Landing 3, UI 3, EDS 2, 1C 4 tests |
| `npm run build` с явными локальными public URLs и `DEPLOYMENT_PROFILE=pilot` | 10/10 tasks; все четыре Next production builds |
| `npm run verify:frontend-profile` | 4/4 Next configs, по 8 положительных/отрицательных env cases |
| `node scripts/verify-pilot-composition.mjs` после workspace build | default/pilot: 36 modules, 224 routes; go_live: 41 modules, 257 routes |
| `node scripts/verify-pilot-backend.mjs --contract-only` после workspace build | 19 core operations, response/error validation; 50 buyable products, 500 offers |
| `node scripts/verify-runtime-split.mjs` после workspace build | api/worker/all и entrypoint/config rejection checks passed |
| `node scripts/verify-production-config.mjs` после workspace build | production safety/HTTPS/TLS/credentials policy passed |
| `npm run verify:web` | 23/23, включая 6 новых pilot composition cases; 0 optional requests и 0 API 4xx/5xx в новых cases |
| YAML parse / Git Bash `-n` | compose и оба workflow валидны; 30 shell steps syntax passed |
| `git diff --check` | passed |

Backend gates выше вызваны напрямую из тех же scripts, что npm aliases, после
успешного общего build — без повторения одинаковой сборки API в каждом alias.
Bundle budgets: Buyer 20 JS / 1 118 567 raw / 337 569 gzip bytes;
Supplier 17 / 1 042 110 / 315 670; Admin 16 / 943 283 / 283 656 — все в лимитах.

Первый web run был 22/23: Landing без `NEXT_PUBLIC_API_URL` сохранил внешний
fallback, и CSP заблокировал регистрацию. Повторная сборка с локальными URLs и
полный повторный run дали 23/23; auth-код и CSP ради теста не ослаблялись.
Просмотрены browser screenshots в `output/playwright/pilot-composition/`.
Базовое сравнение предложений по цене/наличию/документам сохраняется и не
обращается к smart recommendations API.

Не повторялись standalone PostgreSQL/load/security scan или live-provider gates:
модель БД, checkout-транзакции, permissions и внешние интеграции не менялись.
Покупка, supplier confirmation, shipment, documents и import проверены полным
Playwright suite на реальном локальном API/PostgreSQL. B4.6 production и
`LIVE_VERIFIED` остаются открытыми.
