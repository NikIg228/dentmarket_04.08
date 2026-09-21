# Deployment profiles

## Назначение

`DEPLOYMENT_PROFILE` управляет реальным NestJS module graph, а не seed-данными
или декоративным feature flag. Без переменной приложение запускается в
fail-safe профиле `pilot`, кроме явного локального launcher, описанного ниже.

## Локальная расширенная демонстрация (ADR 011)

По решению владельца `npm run dev` / `dev:local` и отдельные `dev:buyer`,
`dev:supplier`, `dev:admin`, `dev:landing` по умолчанию передают `go_live`
одновременно API и Next.js. Все пять optional блоков доступны в пределах
существующих прав и реализации. Новые провайдеры и реальные списания не подключаются.

Для ограниченного набора используйте `npm run dev:pilot` либо явный process env
`DEPLOYMENT_PROFILE=pilot`. Launcher задаёт окружение до старта дочерних
процессов; `.env` дочернего API не переопределяет уже переданный профиль.
При конфликтующем `NEXT_PUBLIC_DEPLOYMENT_PROFILE` запуск прекращается, а не
продолжается с разными flags. При `NODE_ENV=production` launcher запрещён.
Остановите предыдущий launcher перед переключением. Прямой запуск API,
CI, Docker и production builds по-прежнему требуют явного выбора профиля.

Regression: `npm run verify:local-profile` и `npm run verify:frontend-profile`.
Документ: [ADR 011](../architecture/adr/011-local-full-feature-demonstration.md).

Особенность текущего локального Admin: `admin.localhost:3080` требует обычную
авторизацию; existing dev identity разрешена только на `localhost`/`127.0.0.1`.
Для изолированной операторской проверки используйте отдельный `dev:admin`
(предварительно остановив общий launcher) и `http://127.0.0.1:3000`.
В режиме `dev all` относительный `/api` обслуживает gateway; открытие прямого
порта Admin из этого режима даёт 404 на API. Не добавлять auth bypass для
поддомена ради smoke. Единый демонстрационный вход оператора через gateway
остаётся отдельным локальным onboarding/config outcome, а не закрытым gate.

Отдельный перечень скрытых функций, различия по ролям и условия включения:
[свод внепилотных функций](../product/DENTMARKET_OUT_OF_PILOT_FEATURES.md).

| Профиль   | Назначение                            | Runtime surface                                                                                                   |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pilot`   | Controlled demo/pilot                 | Procurement core, catalog, cart, checkout, supplier orders, logistics, documents, notifications, geo и operations |
| `go_live` | Явно утверждённый расширенный runtime | Всё из pilot плюс promotions, billing, AI, trust/reviews и smart recommendations                                  |

В production `DEPLOYMENT_PROFILE=go_live` задаётся только после прохождения
production configuration и provider gates. Сам профиль не превращает mock или
локальный adapter в `LIVE_VERIFIED` интеграцию.

## Машинная проверка

Это набор профильных процедур, не команда запускать все режимы при каждой
задаче. План gates и bounded retry берутся из Workflow §4. Перед E2E проверить
совпадение build/runtime profile, API URL, способ входа и freshness test fixtures.
Успешные build/config results не повторяются без изменения соответствующих
входов; незавершённый go_live Admin smoke остаётся отдельным открытым evidence.

### Frontend build profile (ADR 010)

Buyer, Supplier, Admin и Landing используют тот же `DEPLOYMENT_PROFILE` во
время Next.js сборки. Общий schema contract формирует только публичный
`NEXT_PUBLIC_DEPLOYMENT_PROFILE`; остальные server env не публикуются.
Самостоятельно задавать публичный флаг не требуется. Конфликт двух значений
или неизвестный профиль останавливает конфигурацию. Turbo cache key учитывает
профиль, поэтому артефакт `go_live` не переиспользуется для `pilot`.

```powershell
$env:DEPLOYMENT_PROFILE = 'pilot'
$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4012/api'
$env:NEXT_PUBLIC_BUYER_APP_URL = 'http://127.0.0.1:3001'
$env:NEXT_PUBLIC_SUPPLIER_APP_URL = 'http://127.0.0.1:3002'
npm run build
npm run verify:frontend-profile
npm run verify:web
```

Для расширенного контура явно задайте `go_live` **перед сборкой**, затем
запускайте API и web с тем же профилем. После смены профиля нужно пересобрать и
перезапустить web; runtime env не переписывает уже скачанный JavaScript.
`verify:web` проверяет pilot-сборки; `verify:frontend-profile` проверяет
default/pilot/go_live и отрицательные конфигурации всех четырёх Next configs.
Локальные публичные URL также задаются **до сборки**: иначе Landing может
сохранить свой исторический внешний fallback, и локальная регистрация не
пройдёт CSP. Пример выше предназначен только для локального browser gate;
для deployment используются адреса выбранного окружения.

Docker build принимает `--build-arg DEPLOYMENT_PROFILE=pilot|go_live`; default
равен `pilot`. Release workflow требует repository variable `DEPLOYMENT_PROFILE`
и передаёт её всем image targets. Значение должно совпадать с runtime API
configuration и одним immutable release tag для всех сервисов.

В pilot отсутствуют AI, акции, рейтинги/отзывы и smart recommendations в меню,
карточке и заказах; Admin сохраняет журнал аудита. Procurement budgets, support,
geo/address и документы сохраняются. Общий API client также блокирует optional
read/write/download **до сети**. Это защита от ошибочной композиции UI, а
серверные permissions и module graph остаются обязательными.

### Backend module inventory

```powershell
npm run verify:pilot-composition
```

Gate строит OpenAPI inventory для явных `pilot`/`go_live` и для отсутствующей
переменной. Он требует:

- [x] безопасный default равен `pilot`;
- [x] pilot не импортирует `PromotionsModule`, `BillingModule`, `AiModule`,
      `TrustCommerceModule` и `SmartRecommendationsModule`;
- [x] pilot не публикует `/promotions`, `/billing`, `/ai`, `/trust` и
      `/recommendations`;
- [x] pilot сохраняет `/geo/addresses`, `/marketplace/search`, cart и checkout;
- [x] go_live содержит все перечисленные optional modules/routes.

## Stop criteria

- forbidden module или route появился в pilot;
- отсутствующая переменная включает `go_live` в shared contract/прямом API
  launch (явно утверждённый локальный launcher — исключение ADR 011);
- pilot потерял обязательный procurement route;
- go_live потерял явно поддерживаемую optional surface;
- production окружение полагается на неявный profile default.
