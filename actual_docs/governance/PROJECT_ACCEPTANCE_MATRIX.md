# DentMarket KZ — матрица фактической готовности проекта

**Дата базового среза:** 2026-08-19
**Последнее точечное обновление:** 2026-09-03, UI-миграция через commits `a24c734`, `f35367a`, `e25cd97`, `1715b39`, `c5401d3` и текущий Admin UI closeout slice
**Продуктовый источник требований:** [`DENTMARKET_PRODUCT_V2.md`](../product/DENTMARKET_PRODUCT_V2.md)
**Назначение:** отделить написанное ТЗ, демонстрационный UI и существующий код от реально проверенной и готовой к пилоту функции.

Старые строки ниже не становятся актуальными автоматически из-за новой даты. Если строка не ссылается на `f8ace20` или более свежий явно указанный evidence, её статус остаётся историческим и требует повторной проверки перед pilot/release решением.

## Точечный acceptance update — `f8ace20`

| Область | Уровень | Фактическое доказательство 2026-09-02 | Что не доказано |
| --- | --- | --- | --- |
| Desktop ЭЦП / NCALayer foundation | `UNIT_VERIFIED` | Detached CMS client, immutable checksum, server verification boundary, certificate BIN → signer organization binding, callback HMAC/replay protection, tenant/signer guards; EDS client 2/2, Supplier signing 3/3, targeted API 8/8 | Реальный NCA trust chain/CRL/OCSP в целевой среде, внешний verification gateway, квалифицированная подпись реальным сертификатом и browser E2E |
| Mobile/remote ЭЦП foundation | `UNIT_VERIFIED` | Remote flow требует `signingUrl` и не падает обратно в desktop NCALayer; recoverable UI states покрыты unit-тестами | Выбранный mobile/EDO provider, callback/return journey на staging и реальном устройстве |
| 1С Agent protocol foundation | `UNIT_VERIFIED` | Pull-only HTTPS Agent, typed job result contracts, local validation/redaction, permanent/retryable classification, atomic completion lease; Agent 4/4, schemas integration contracts 6/6, targeted API integration tests 6/6 | Подписанный installer, реальный adapter выбранной конфигурации 1С, staging infobase, offline/retry/upgrade drill и end-to-end exchange |
| Shared contract/build | `INTEGRATION_VERIFIED` | `npm run typecheck` — 15/15 Turbo tasks; Supplier production build; `npm run verify:core-contract` — 296 operations, 19 verified core operations, response/error validation passed | Полный web E2E ЭЦП/1С и production infrastructure |

Ограничение evidence: общий API test run завершился 185/186; единственный незелёный тест — существующий PDF parser scenario, превысивший timeout 15 секунд. Все затронутые ЭЦП/1С API-тесты прошли отдельно. Поэтому `f8ace20` не повышает статус полного repository test suite и не даёт `E2E_VERIFIED` или `LIVE_VERIFIED` интеграциям.

## 1. Главный вывод

Текущий проект нельзя считать готовым маркетплейсом, но его также нельзя считать пустым прототипом.

В репозитории уже есть значительный backend-контур, Prisma-схема, миграции, четыре web-приложения, статический снимок каталога и автоматизированные тесты отдельных правил. На текущей машине доказаны чистая установка, последовательная production-сборка, применение всех миграций к новой PostgreSQL, основной и pilot seed, запуск API и публичный поиск. Сквозная покупка, живые цены, остатки и работа реальных поставщиков пока не подтверждены.

Поэтому принятое направление остаётся гибридным:

1. сохранить backend, Prisma-схему и текущий стек;
2. сначала восстановить инженерную воспроизводимость;
3. закрыть P0-противоречия каталога и договорной модели;
4. затем собирать Buyer V2 поверх проверенных API-контрактов;
5. допускать функцию в пилот только после сквозной проверки на реальных данных.

### Оперативное обновление Gate 0 и каталога

- Установлен native PostgreSQL 17, служба `postgresql-x64-17` запускается автоматически.
- К пустой базе `marketplace` успешно применены 28 миграций и основной seed.
- Активный Buyer fallback сокращён с 3 329 до 500 детерминированно отобранных карточек; полный snapshot сохранён в `data/archive/`.
- Pilot seed создаёт 10 демо-клиник, 10 демо-поставщиков, 50 товаров с предложениями и 500 опубликованных demo-офферов.
- Operator seed содержит dedicated `operations.outbox.view` и
  `operations.outbox.replay` permissions; `pnpm verify:seed-profiles` подтверждает
  86 reference permissions и повторяемость reference/operator/test/pilot profiles.
- Smoke API вернул `health=ok`, 50 доступных товаров и 500 предложений.
- В активной media-папке осталось 429 используемых файлов; 2 458 неиспользуемых файлов удалены из рабочей версии.
- `pnpm typecheck`, `pnpm test` и последовательный `pnpm build` проходят. Параллельный запуск четырёх Next.js build на машине с 8 ГБ памяти признан нестабильным, поэтому root build ограничен `--concurrency=1`.

Это технический pilot fixture. Он не подтверждает реальность цен, остатков, договоров или права публикации изображений.

## 2. Шкала готовности

| Статус                 | Что он означает                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `SPEC_ONLY`            | Функция описана в документах, но работающий код не найден.                            |
| `UI_MOCK`              | Есть экран или демонстрационные данные, но нет доказанного рабочего backend-процесса. |
| `CODED`                | Код, API и/или таблицы существуют, но актуальная проверка выполнения не пройдена.     |
| `UNIT_VERIFIED`        | Ключевые правила прошли unit-тесты в чистом окружении.                                |
| `INTEGRATION_VERIFIED` | API работает с реальной тестовой PostgreSQL, миграциями и зависимостями.              |
| `E2E_VERIFIED`         | Пользовательский сценарий пройден браузером от начала до конца.                       |
| `LIVE_VERIFIED`        | Сценарий подтверждён с реальным поставщиком/клиникой и актуальными внешними данными.  |
| `BLOCKED`              | Проверка или эксплуатация сейчас невозможна из-за конкретного блокера.                |

Статусы не присваиваются по наличию файла или названию теста. Тест, который существует в репозитории, но не был успешно запущен в восстановленном окружении, является только доказательством намерения и остаётся на уровне `CODED`.

## 3. Текущая инженерная база

| Область                   | Фактический статус     | Доказательство                                                                                                                                                                                                 | Критический разрыв                                                                                        | Решение                                                                                                 |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| История изменений и откат | `INTEGRATION_VERIFIED` | Remote `NikIg228/dentmarket_04.08`, ветка `recovery/gate-0`; изменения публикуются отдельными conventional commits                                                                                             | Branch protection/PR gate ещё не подтверждены                                                             | Настроить protected main и обязательный CI через PR                                                     |
| Node.js и pnpm            | `INTEGRATION_VERIFIED` | Node `24.18.0`, pnpm `11.9.0`; `pnpm install --frozen-lockfile` успешно восстановил все 10 workspace-проектов                                                                                                  | Offline-store не содержал четыре записи, поэтому полностью автономная установка пока не доказана          | Использовать frozen lockfile; отдельно подготовить CI/cache, если нужен offline build                   |
| Локальная инфраструктура  | `BLOCKED`              | `compose.yaml` описывает PostgreSQL, Redis, MinIO и ClamAV                                                                                                                                                     | Команда `docker` на текущей машине отсутствует                                                            | Установить Docker Desktop либо явно утвердить локальный режим без Docker                                |
| PostgreSQL-схема          | `INTEGRATION_VERIFIED` | 31 миграция применена через `prisma migrate deploy`; `prisma validate` и `pnpm verify:postgres` прошли 2026-08-19                                                                                              | Fresh CI run для новой миграции ожидает push/PR; Docker локально отсутствует                              | Сохранять migration deploy и PostgreSQL gate обязательными                                              |
| Backend API               | `E2E_VERIFIED`         | B0.1–B0.6, Flow A, B2.1–B2.3 и B3.1–B3.3 проходят; B4.1–B4.4, dependency remediation, B4.5-R1, R2A–R2E проверены; R2E reviewed 1055/1055 files with 0 findings; shared Redis rate-limit/auth contract green | Внешний alert/dashboard, Redis HA и production infrastructure ещё не имеют `LIVE_VERIFIED` | Следующая задача B4.6 — нагрузочный профиль каталога и checkout |
| Backup/restore            | `INTEGRATION_VERIFIED` | `pnpm verify:backup-restore`: 149 таблиц с content hash, 2 object files, 31 migration и API health/readiness; source неизменен, target удалён                                                                  | Managed WAL/PITR, S3 versioning/retention и restore production snapshot не имеют `LIVE_VERIFIED`          | Выполнить provider-level timed drill перед go-live; локальный gate сохранять в CI                       |
| Observability и alerts    | `INTEGRATION_VERIFIED` | `pnpm verify:observability`: 4/4 unit, 7 rules/14 synthetic vectors, metrics auth `401/200`, PostgreSQL outbox/checkout/import gauges; production config запрещает endpoint без token                          | Нет evidence внешнего monitoring deployment, notification route и live synthetic alert                    | При deployment подключить versioned PromQL rules и сохранить live evidence                              |
| Dependency security       | `INTEGRATION_VERIFIED` | B4.5: production audit изменён с 15 high/6 moderate на `No known vulnerabilities found`; Next 16.2.11, Sharp 0.35.3, PostCSS 8.5.26 и pdfjs-dist 6.2.108 прошли build, PDF/import, PostgreSQL и web regression | Registry state меняется; production network и runtime exposure отдельных advisories не измерялись         | Сохранять `pnpm audit --prod --audit-level high` в CI и обновлять lockfile только с compatibility gates |
| Application security      | `E2E_VERIFIED`         | Dependency finding и все source findings закрыты; R2A–R2E regressions, B4.4 rate-limit/auth regressions, полный gate stack и complete-coverage scan `64b65075-d7f3-4c23-b6e2-1535e6067b80` зелёные | TAC не выдан и production infrastructure evidence ещё не имеют `LIVE_VERIFIED` | Сохранить R2E и B4.4 gates в CI; перейти к B4.6 |
| Transactional outbox      | `E2E_VERIFIED`         | ADR 005, status/lease/retry/DLQ; B4.3 protected list/replay, dedicated permissions, Serializable idempotency и audit trail; `pnpm verify:outbox` включает replay regressions | Production dashboard не развёрнут; live operator drill не проведён | Сохранять B4.1 metrics и B4.4 shared rate-limit guard; следующий hardening — B4.6 |
| Автоматические тесты      | `E2E_VERIFIED`         | Актуальный `npm test`: 14/14 Turbo-задач; API 189, schemas 45, api-client 7, Buyer 14, Supplier 9, shared UI 3, Admin 14 и Landing 3 unit-теста проходят; исторические `verify:rate-limit-auth`, `verify:outbox`, `verify:pilot-backend`, `verify:outbound-security`, `verify:web` зелёные | Полный `verify:web` не повторён после текущей UI-миграции; component coverage рабочих панелей остаётся ограниченным | Добавлять regression test на каждый мигрируемый workflow и повторить `verify:web` в полном окружении |
| Typecheck и build         | `UNIT_VERIFIED`        | `pnpm typecheck`: 12/12 задач; `pnpm build`: 8/8 задач, API и четыре web-приложения собраны на Next 16.2.11                                                                                                    | Cold sequential build занял около 10 минут; Next предупреждает о deprecated middleware convention         | Сделать merge-gate и отдельно оптимизировать Buyer bundle/build                                         |
| Настоящий lint            | `SPEC_ONLY`            | `lint` во фронтендах и API фактически запускает только `tsc --noEmit`                                                                                                                                          | Нет ESLint/Biome-проверок качества и опасных паттернов                                                    | После стабилизации подключить ESLint или Biome отдельной задачей                                        |

## 4. Откуда берутся карточки товаров

### 4.1 В архиве уже есть локальный каталог

Карточки не хранятся только в Supabase. В архиве присутствует статический снимок:

- `apps/buyer-web/app/data/public-catalog-fallback.json` — 3 329 карточек, 3 504 варианта и 3 291 предложение;
- `apps/buyer-web/app/data/public-catalog-media.json` — манифест 1 671 изображения;
- `apps/buyer-web/public/catalog/products/` — 2 895 локальных PNG/WebP-файлов общим объёмом около 250 МБ;
- `data/imports/*.csv` — исходные выгрузки и результаты обхода сайтов поставщиков/производителей.

Снимок `public-catalog-fallback.json` был сгенерирован 2026-07-22 скриптом `scripts/build-public-catalog-fallback.mjs` из одиннадцати CSV-источников:

- Allfordent;
- AMD Group;
- Denti.kz;
- KazDentService;
- Medstom;
- Nordstom;
- Stomir;
- публичные sitemap-источники;
- отдельная подборка официальных моделей производителей.

Скрипт нормализует название, бренд, производителя, категорию, единицу измерения, варианты, источник описания, цену и признак наличия. Это импортированный и частично автоматически нормализованный контент, а не подтверждённый мастер-каталог.

### 4.2 Как Buyer выбирает источник

`apps/buyer-web/app/page.tsx` сначала загружает локальный JSON в bundle. Затем браузер пытается получить актуальный каталог по `GET /api/catalog/search` через `NEXT_PUBLIC_API_URL`. Если API не отвечает за 3,5 секунды или возвращает ошибку, интерфейс продолжает работать на локальном fallback.

Отдельная страница товара `apps/buyer-web/app/products/[id]/page.tsx` сейчас всегда ищет товар именно в локальном JSON. То есть её метаданные и SEO-контент не зависят от доступности Supabase, но также не становятся автоматически актуальными после изменения записи только в БД.

### 4.3 Роль Supabase

В проекте Supabase — не отдельная CMS. Документ
`../integrations/supabase.md` описывает временный production-проект Supabase
PostgreSQL. Приложение подключается к нему обычной строкой `DATABASE_URL` через
Prisma.

В размещённой БД должны храниться рабочие сущности:

- канонические товары и варианты;
- предложения поставщиков;
- цены и остатки;
- склады и способы доставки;
- пользователи, организации и права;
- корзины, заказы, платежи и документы;
- статусы импорта, модерации и интеграций.

Для закрытых файлов Supabase Storage поддерживается как один из драйверов, но локальный `compose.yaml` по умолчанию использует MinIO/S3-совместимое хранилище. Публичные изображения текущего fallback физически уже лежат в архиве.

### 4.4 Что будет работать без Supabase

Без production-секретов и внешней БД можно показать:

- публичный список товаров;
- локальный поиск и фильтрацию;
- статические страницы карточек;
- локальные изображения, которые есть в манифесте;
- демонстрационные предложения, цены и наличие из snapshot.

Без запущенного API и PostgreSQL нельзя честно считать рабочими:

- регистрацию и авторизацию;
- кабинет поставщика и сохранение импортов;
- публикацию и обновление предложений;
- актуальные цену и остаток;
- корзину и checkout с сохранением;
- реальные заказы и их статусы;
- документы, уведомления, платежи и интеграции.

## 5. Качество текущего локального каталога

Проверка `node scripts/report-public-catalog-quality.mjs` успешно выполнена на текущем архиве.

| Показатель             |                                     Факт | Вывод для пилота                                                          |
| ---------------------- | ---------------------------------------: | ------------------------------------------------------------------------- |
| Карточки               |                                    3 329 | Объём есть, но сам по себе не означает готовность                         |
| Карточки с брендом     |                               241 / 7,2% | Слишком низкое покрытие для качественного сравнения                       |
| Карточки с ценой       |                              344 / 10,3% | Большая часть каталога некоммерческая                                     |
| Карточки в наличии     |                                24 / 0,7% | Нельзя запускать покупку на всём снимке                                   |
| Несколько продавцов    |                                 2 / 0,1% | Основная ценность маркетплейса — сравнение — почти не реализована данными |
| Локальные media-записи |                                    1 671 | Изображения есть примерно для половины карточек                           |
| Широкие категории      | 2 338 карточек в двух крупнейших группах | Категоризация требует очистки перед Buyer V2                              |

Отдельно в файле зафиксирован карантин Denti.kz: одно название «ножницы Iris Delicate» повторилось в 5 399 строках разных URL. Эти строки не должны автоматически считаться корректными товарами.

Дополнительный media-риск: большая часть изображений помечена как `SOURCE_UNVERIFIED`, а защита скачивания описана как `frontend-friction-only`. До публичного запуска нужно подтвердить права использования и происхождение изображений.

**Решение:** не переносить все 3 329 карточек в пилот как готовые. Сформировать отдельный whitelist из 500–1 000 проверенных SKU с подтверждёнными названием, категорией, вариантом, упаковкой, ценой, остатком, поставщиком и правами на изображение.

## 6. Матрица функций первого пилота

| Функция                             | Текущий уровень | Что уже найдено                                                                                                                                                                                                                                                       | Чего не хватает до следующего уровня                                                        | Решение                                                                                       |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Регистрация клиники                 | `CODED`         | Auth/onboarding API, Prisma-модели и web-форма                                                                                                                                                                                                                        | Чистая БД, отправка/проверка email, integration-тест и браузерный сценарий                  | Сохранять и довести после Gate 0                                                              |
| Регистрация поставщика              | `CODED`         | Onboarding API, supplier progress, форма и E2E-сценарий в репозитории                                                                                                                                                                                                 | E2E не запущен; требуется подтвердить договорную модель V2                                  | Сохранять, убрать лишний договорный gate после legal review                                   |
| Вход, сессии, tenant isolation      | `CODED`         | JWT/session/handoff, guards, MFA и security unit-тесты присутствуют                                                                                                                                                                                                   | Тесты не запущены; нет интеграционного доказательства между организациями                   | P0: проверить до работы с заказами                                                            |
| Публичный каталог                   | `E2E_VERIFIED`  | `/catalog/search` и локальный fallback; `verify:web` открывает каталог и реальную pilot-карточку                                                                                                                                                                      | Низкое качество части коммерческих данных; внешний feed не подключён                        | Использовать pilot seed как временный truth до supplier import Flow B                         |
| Карточка товара                     | `E2E_VERIFIED`  | Next route читает live compare API для pilot UUID и сохраняет snapshot fallback; document 4xx запрещён E2E                                                                                                                                                            | В live-ответе пока нет богатого описания и media                                            | Расширять core product contract только под подтверждённые pilot-поля                          |
| Поиск и фильтры                     | `CODED`         | Public/auth search API, локальный поиск, словарь стоматологических терминов                                                                                                                                                                                           | Нет подтверждённой точности на whitelist пилота и E2E                                       | Создать набор из 50 реальных запросов клиник и quality gate                                   |
| Сравнение предложений               | `E2E_VERIFIED`  | Flow A сравнивает 10 pilot-офферов одного товара и различает 8 доступных/2 недоступных                                                                                                                                                                                | Нужен quality gate на более широкой выборке                                                 | Сохранить Browser Flow A и добавить набор контрольных SKU                                     |
| Импорт CSV                          | `E2E_VERIFIED`  | B3.1 проводит UTF-8 CSV через upload/quarantine/parser и matching; B3.2 доказывает review/publication; B3.3 — guarded compensating rollback с сохранением raw/evidence; PostgreSQL и Playwright проверяют tenant isolation, stale version, idempotency и zero residue | XLSX/PDF и live connector не подтверждены                                                   | Не расширять статус на неподтверждённые форматы; перейти к эксплуатационным gates             |
| Нормализация и сопоставление SKU    | `CODED`         | Matching engine, aliases и catalog build scripts                                                                                                                                                                                                                      | Нет измеренного precision/recall на реальной выборке                                        | Разметить контрольные 100–200 строк и установить порог auto-match                             |
| Создание предложения                | `E2E_VERIFIED`  | B3.2 материализует из import row product/variant/packaging, DRAFT offer, price и inventory; B3.3 безопасно скрывает и архивирует batch-owned effect; B4.1 наблюдает import rollback                                                                                   | Live supplier update cadence и connector SLA не доказаны                                    | Сохранять Flow B3/B4.1; восстановимость подтверждена общим B4.2 gate                          |
| Gate публикации                     | `E2E_VERIFIED`  | B3.2 проверяет supplier/product/variant, packaging, KZT price freshness, stock, agreement и compliance; stale version — 409, повтор идемпотентен                                                                                                                      | Product V2 предлагает убрать обязательный annual agreement, но legal review ещё не завершён | До legal review сохранить текущий gate; изменение договорной модели вынести отдельно          |
| Цена и упаковка                     | `CODED`         | Price resolver, packaging API, правила количества                                                                                                                                                                                                                     | Только 10,3% fallback-карточек имеют цену                                                   | Для пилота принимать только подтверждённую цену и дату обновления                             |
| Остаток и свежесть                  | `CODED`         | Inventory balances, freshness policies, reservations                                                                                                                                                                                                                  | Только 0,7% fallback-карточек доступны; нет live connector                                  | Запретить «в наличии» без timestamp и политики устаревания                                    |
| Корзина                             | `E2E_VERIFIED`  | Построчный reprice и Flow A browser gate защищают checkout                                                                                                                                                                                                            | Mobile остаётся частью общего Buyer V2 QA                                                   | Сохранять `verify:postgres` и `verify:flow-a`                                                 |
| Checkout и разбиение по поставщикам | `E2E_VERIFIED`  | Flow A создаёт заказы одному и двум поставщикам; DB проверяет checkout/orders/reservations                                                                                                                                                                            | Production payment остаётся отдельным этапом                                                | Сохранять Flow A при реализации B4                                                            |
| Подтверждение заказа поставщиком    | `E2E_VERIFIED`  | `verify:flow-b2` 4/4: full/partial confirmation, shipment и order document pack, tenant 403, stale 409, totals, audit/outbox и Buyer visibility                                                                                                                       | Partial release внешнего резерва ждёт connector orchestration                               | Сохранять Flow B2 при реализации B4                                                           |
| Доставка и статусы                  | `E2E_VERIFIED`  | Supplier создаёт shipment и проходит DRAFT→DISPATCHED; Buyer видит status/carrier/tracking; PostgreSQL подтверждает order status, audit и outbox                                                                                                                      | Реальный перевозчик, delivery closure и proof of delivery не проверены                      | В пилоте оставить ручной статус; закрытие доставки доказать отдельно                          |
| Документы по заказу                 | `E2E_VERIFIED`  | Supplier формирует из persisted order/shipment snapshot спецификацию, счёт и накладную; Buyer видит и скачивает PDF/DOCX; PostgreSQL проверяет checksum, immutable evidence, audit/outbox и идемпотентность                                                           | Квалифицированная ЭЦП, налоговый ЭСФ и production storage не проверены                      | Сохранять локальный комплект как pilot baseline; внешние провайдеры вынести в отдельные gates |
| ЭЦП договора DentMarket             | `UNIT_VERIFIED` | `f8ace20`: NCALayer/remote foundation, server verification boundary, BIN/checksum binding, HMAC/replay protection и Supplier recoverable states прошли targeted tests                                                                                                  | Нет реального gateway, NCA trust/revocation verification и browser E2E с реальным сертификатом | Не повышать выше foundation до отдельного staging/live gate                                   |
| Платёж                              | `CODED`         | Payment domain и mock/external adapters существуют                                                                                                                                                                                                                    | Реальный PSP не подтверждён; продукт V2 допускает оплату вне платформы                      | Для пилота зафиксировать manual/off-platform, не блокировать запуск PSP                       |
| Уведомления                         | `E2E_VERIFIED`  | ADR 005 доставляет ShipmentStatusChanged; Buyer видит идемпотентное in-app уведомление с order/shipment/tracking                                                                                                                                                      | Нет live email/SMS и проверки внешнего провайдера                                           | In-app оставить pilot baseline; email проверить отдельным production gate                     |
| Операторская модерация              | `E2E_VERIFIED`  | B3.2 Admin queue проводит import candidate через решение, публикацию и Buyer visibility; 390 px, confirmation и error states проверены браузером                                                                                                                      | Общая correction queue и ежедневная P0/P1 work queue ещё не доказаны                        | Сохранить import journey; остальные operator journeys проверять отдельно                      |
| Buyer V2 UX                         | `UNIT_VERIFIED` | `2bda059` разделяет catalog → product → cart/reprice → checkout → orders на feature-компоненты, использует общие `Dm*`-примитивы и покрывает purchasing view-model unit-тестами; Buyer typecheck/build и browser visual QA пройдены                                                                      | Полный `verify:web` с реальным API и pilot-данными ещё не выполнен                           | Прогнать сквозной Buyer critical journey в полном окружении перед pilot sign-off              |
| Supplier UX                         | `UNIT_VERIFIED` | Supplier workspace разделён на dashboard/offers/inventory/orders/integrations/compliance/documents; Manrope и общие `Dm*`-контролы применены; 9/9 тестов, typecheck/build и production-browser QA на 390/768/1024/1280 px пройдены с детерминированным API stub                     | Нет полного `verify:web` с реальным API/БД и pilot-данными                                   | Прогнать supplier onboarding → offer/inventory → order confirmation → shipment/documents в полном окружении |
| Admin UX                            | `UNIT_VERIFIED` | Shared shell и рабочие operator surfaces используют общий `Dm*`-контракт; supplier-data IA находится в «Загрузка товаров», order blockers и ЭЦП — в «Заказы и договоры», журнал критических действий — в «Контроль и доверие». Каталог разделён на canonical cards/variants, а «Настройки» показывают только профиль пилота и не содержат operator-side cart, supplier confirmation, mock capture, refund или payout mutations; backend commerce-контур не удалён. Admin login и resource lists переведены на shared controls/states и semantic tokens; route-level native controls и hardcoded colors в `apps/admin-web/app` отсутствуют. Admin 18/18 и `packages/ui` 3/3 tests, typecheck/build и production-browser QA на 390/768/1024/1280 px пройдены с детерминированным API stub; partial API responses, mobile drawer focus/`Escape`, feedback и empty states проверены | Полный `verify:web` с реальным API/БД и pilot-данными, live Google/Apple→MFA, screen reader, forced colors и фактический zoom 200/400% ещё не закрыты | Поднять полное окружение и пройти реальный operator daily workflow и accessibility matrix |
| Реальная интеграция поставщика      | `CODED`         | Есть mock, custom API и MySklad adapter-код; `f8ace20` добавляет unit-verified protocol foundation 1С Agent                                                                                                                                                            | Нет ни одного подтверждённого `LIVE_VERIFIED` коннектора; для 1С нет реального adapter/installer/staging infobase | Цель пилота — один живой коннектор, остальные через файл                                      |
| Метрики пилота                      | `SPEC_ONLY`     | KPI определены в Product V2; есть search analytics-код                                                                                                                                                                                                                | Нет единой событийной схемы и dashboard пилота                                              | Определить события до запуска Buyer V2                                                        |

## 7. Три обязательных сквозных сценария

До редизайна должны быть доказаны в восстановленном окружении:

### Flow A — клиника покупает товар

Статус core purchase slice: **`E2E_VERIFIED`** (`pnpm verify:flow-a`, 2/2).
Регистрация/production auth остаётся самостоятельным acceptance-сценарием;
подтверждение заказа отдельно доказано gate B2.1.

1. Клиника регистрируется и входит.
2. Находит SKU из пилотного whitelist.
3. Видит актуальное предложение, упаковку, цену и остаток.
4. Добавляет товар в корзину.
5. Оформляет заказ.
6. В БД создаются checkout и supplier order.
7. Buyer и Supplier видят один и тот же заказ.

### Flow B — поставщик публикует предложение

Статус core catalog slice Flow B: **`E2E_VERIFIED`** (`pnpm verify:flow-b3`, 3/3;
B3.2 и B3.3 repeat 10/10 каждый). Регистрация и production onboarding поставщика остаются
отдельным acceptance-сценарием.

1. Поставщик регистрируется и проходит обязательный onboarding.
2. Загружает небольшой CSV.
3. Система сопоставляет строки с каноническими SKU.
4. Ошибочные строки уходят на исправление.
5. Поставщик подтверждает цену, упаковку и остаток.
6. После единого publication gate предложение появляется в Buyer search.

### Flow C — поставщик исполняет заказ

Статус полного Flow C: **`E2E_VERIFIED`** (`pnpm verify:flow-b2`, 4/4).
Confirmation, shipment и минимальный document pack доказаны через
production-сборки Supplier/Buyer, PostgreSQL и Playwright; пункт P0.5 закрыт.

1. Поставщик получает новый supplier order.
2. Подтверждает или отклоняет позиции.
3. Обновляет статус отгрузки.
4. Клиника видит изменения.
5. Система формирует минимальный комплект документов.

Core slices трёх сценариев имеют статус `E2E_VERIFIED`. AI, sponsored offers,
сложный trust score, billing enforcement и расширенная автоматизация всё равно
остаются вне пилота по Product V2 до явного решения владельца продукта.

## 8. Gate 0 — ближайший технический этап

Gate 0 считается закрытым только при одновременном выполнении всех пунктов:

- [x] В каталоге есть Git-репозиторий и baseline-коммит исходного ZIP (`8646bf6`).
- [x] Рабочая ветка `recovery/gate-0` создана без ошибок; baseline был чистым перед проверками.
- [x] Выполнена установка зависимостей по `pnpm-lock.yaml` командой `pnpm install --frozen-lockfile`.
- [ ] Выбран и задокументирован способ запуска PostgreSQL/Redis/storage/ClamAV.
- [x] Все 30 Prisma migrations применяются к пустой PostgreSQL.
- [x] Основной seed и pilot seed завершаются; созданы reference-данные, 10 клиник, 10 поставщиков, 500 pilot-карточек и 500 demo-офферов.
- [x] API стартует, `/api/health` возвращает `ok`, `/api/catalog/search?inStock=true` возвращает 50 товаров и 500 предложений.
- [x] `pnpm typecheck` проходит: 12/12 Turbo-задач.
- [x] `pnpm test` проходит: 11/11 Turbo-задач; отдельный `verify:postgres` проходит на локальной PostgreSQL без Docker/Testcontainers.
- [x] `pnpm build` проходит: 8/8 Turbo-задач, включая API и четыре web-приложения.
- [x] `pnpm verify:web` открывает landing, Buyer, Supplier и Admin и проходит 17/17 browser-сценариев без критических ошибок.
- [x] В `SECURITY_AUDIT_B4_5_2026-08-19.md` зафиксированы известные source findings и coverage-ограничения, а не скрыты как успешная проверка.

## 9. P0 после Gate 0

| Приоритет | Задача                               | Критерий приёмки                                                              |
| --------: | ------------------------------------ | ----------------------------------------------------------------------------- |
|      P0.1 | Утвердить договорную модель V2       | Одно правило в ТЗ, API, seed, landing и кабинетах; нет противоречащих gate    |
|      P0.2 | Создать pilot catalog whitelist      | 500–1 000 SKU с подтверждёнными обязательными полями и происхождением media   |
|      P0.3 | Доказать Flow B                      | CSV поставщика создаёт опубликованное предложение, видимое Buyer              |
|      P0.4 | [x] Доказать Flow A                  | Реальный сохранённый заказ создаётся из Buyer через API                       |
|      P0.5 | [x] Доказать Flow C                  | Supplier подтверждает заказ, Buyer видит статус и документ                    |
|      P0.6 | Зафиксировать API-контракты Buyer V2 | Search, product, compare, cart и order имеют схемы, tests и стабильные ошибки |

## 10. Workflow для всех следующих задач Codex

Каждая задача должна охватывать один пользовательский сценарий и завершаться проверяемым пакетом доказательств.

Обязательный шаблон задачи:

1. **Цель пользователя:** одно конкретное действие.
2. **Scope:** точные приложения, endpoints и таблицы.
3. **Non-goals:** что в этой задаче запрещено менять.
4. **Acceptance criteria:** наблюдаемый результат, а не «код добавлен».
5. **Pre-check:** текущая ветка, diff, relevant tests и миграции.
6. **Implementation:** минимальный законченный slice.
7. **Verification:** typecheck, unit/integration и browser-сценарий по риску.
8. **Отчёт:** изменённые файлы, команды, результаты и известные ограничения.

Функция повышает уровень в этой матрице только после появления соответствующего доказательства. Документ, mock-данные, незапущенный тест или визуально существующая кнопка не повышают статус автоматически.

## 11. Следующее действие

R2E завершён на commit `8f450ea`: complete-coverage scan
`64b65075-d7f3-4c23-b6e2-1535e6067b80` закрыл `1055/1055` файлов и сообщил
`0` reportable findings.

- [x] R2E Standard scan завершён и canonical report проиндексирован.
- [x] Пять residual paths (payment, pending finalization, signature, PDF,
      inventory) закрыты кодом и targeted regression tests.
- [x] Workspace, PostgreSQL, runtime, contract, outbound, storage, dependency
      и browser gates прошли.
- [x] B4.3 — dead-letter operations и защищённый replay: operator list/replay,
      dedicated permissions, payload-preserving transactional reset,
      idempotency и audit trail подтверждены targeted regressions.
- [x] B4.4 — rate limiting и production auth runbook: Redis-backed throttler,
      fail-closed production behavior, stable 429/Retry-After и auth contract
      подтверждены targeted/full gates.
- [ ] B4.6 — нагрузочный профиль каталога и checkout — следующая
      реализационная задача.

## Current security gate override (2026-08-20)

See `actual_docs/governance/SECURITY_R2E_2026-08-20.md` for the canonical
complete-coverage result at commit `8f450ea` (scan
`64b65075-d7f3-4c23-b6e2-1535e6067b80`). The five payment, signature, PDF,
and inventory residuals from the prior scan were remediated, all affected
regressions and workspace gates passed, and the new scan reviewed `1055/1055`
tracked files with `0` reportable findings. Application security is now
`E2E_VERIFIED`; B4.5-R2E, B4.3 and B4.4 are closed, and B4.6 is next.
