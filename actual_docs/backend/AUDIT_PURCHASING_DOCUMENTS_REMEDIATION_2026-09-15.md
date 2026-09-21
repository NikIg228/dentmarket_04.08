# Исправления аудита: закупка, каталог и документолог

Основание: аудит 14–15.09.2026 и разрешение владельца начать исправления.
Очередь/чекбоксы — [Foundation §8](DENTMARKET_BACKEND_FOUNDATION_V2.md#8-исправления-аудита-закрытого-пилота--2026-09-15),
evidence — [Acceptance Matrix §9](../governance/PROJECT_ACCEPTANCE_MATRIX.md#9-aud-fix--исправления-аудита-2026-09-15).
Версия и правила доказательств — [access brief §1](AUDIT_ACCESS_REMEDIATION_2026-09-15.md#1-основание-и-ограничения).
Исходные дефекты остаются в `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/AUDIT_REPORT.md`.

## 1. Сохраняемый baseline

Один supplier: реальные reprice diff → акцепт → checkout → полное подтверждение;
неизменяемая историческая цена, отсутствие молчаливой коррекции количества,
same-key checkout без дубля. Архив: список/detail/upload/download/accounting
и выбранные cross-party reads. Эти частичные PASS не закрывают полный жизненный
цикл. Ни квитанция, ни accounting REVIEWED не означают «оплачено».
Договор площадка–поставщик обязателен до публикации; buyer–supplier agreement
не подменяет его. Не добавлять интеграции, ЭСФ/СНТ, новый ledger или редизайн.

## 2. AUD-FIX-02 — читаемый PDF (DOC-04, P1)

**Доказательство:** настоящий скачанный счёт имеет byte-integrity PASS, но
нечитабельные номер, БИН и сумму. `technical/pdf-font-readback.json`,
`screenshots/supplier-invoice-pdf-render.png`. Причина — единственный
`roboto-cyrillic-400-normal.woff` без glyphs латиницы, цифр и ₸.

Scope: [DocumentRendererService](../../apps/api/src/modules/documents/document-renderer.service.ts)
и regression рядом. Подобрать полноценный совместимый embedded font либо
корректный fallback; сначала проверить уже установленные assets и лицензию.
Новая dependency/внешняя загрузка не входит автоматически. DOCX не менять.
Существующие версии документов не перезаписывать; исправляется новая генерация.

Given русско-/казахско-/латинский текст, `SO-...`, БИН, даты, 0–9, сумма с
разделителями/₸ и длинный заголовок, When генерируется PDF, Then все значения
читаются, извлекаются без потерь и не выходят за A4 margins; длинный документ
корректно переносится. Отдельно пустой/многострочный template и DOCX control.

DoD: TS минимум; реальная генерация + автоматический glyph/text regression,
PDF render и визуальная проверка всех тестовых страниц; API build и ближайшие
document unit tests. API/tenant контракт не меняется — PG/security scan не
заменяет content check и не нужен без соответствующего изменения.
Stop: замена отсутствующих glyphs без явной ошибки, обрезание денег/реквизитов,
изменение старого документа или красный gate. Это не юридическая сертификация PDF.

### Принятое решение и результат, 15.09.2026

Владелец сначала разрешил полный Roboto, затем **Noto Sans только для PDF**:
у проверенного актуального полного Roboto и установленных поднаборов нет ₸.
Noto Sans взят из официального Google Fonts на immutable revision, лицензия OFL
сохранена. [Font provenance/правила обновления](../../apps/api/src/modules/documents/fonts/README.md).
Font asset, coverage и license включаются Nest в `dist/src/modules/documents/fonts`;
runtime не скачивает шрифты, не требует системной установки и новых npm dependencies.

Renderer сохраняет A4/margins/центрированный заголовок/обычный текст. Русский,
казахский, латиница, цифры, даты, БИН и ₸ проверены извлечением и визуально.
Coverage exact font cmap защищает от молчаливой потери других символов:
неподдерживаемый codepoint вызывает явную ошибку до создания PDF; существующий
`renderAndFinalize` переводит неуспешную генерацию в FAILED. Это не all-Unicode
поддержка и не новое ограничение на допустимые поля организации.
DOCX branch и денежные значения не изменены. Существующие PDF/версии не
перезаписывались; обычная генерация новой версии остаётся штатным отдельным действием.

DoD принят: renderer8/8, API build + наличие assets в dist, typecheck15/15,
test tasks14/14 (API211/211), compiled generation двух PDF, extraction/bounds,
просмотр3/3страниц и docs/diff. Подробные attempts/ограничения — Acceptance Matrix §9.
Полные archive browser/tenant/production gates этим не закрыты.

## 3. AUD-FIX-04 — исправление корзины (UX-02, P1; CORE-03/08)

Исходный finding: source и UI подтверждали отсутствие edit/remove при рабочем
reprice guard. **Исправление принято16.09.2026** в описанной ниже границе;
execution brief и прежний BLOCKED checkpoint сохранены как история.

Scope: `packages/schemas`, commerce controller/service, api-client,
`apps/buyer-web/app/features/purchasing/buyer-cart.tsx` и purchasing helpers.
До кода сверить существующий add/upsert contract: переиспользовать его там,
где он действительно обеспечивает нужные semantics, не дублировать API.

Требования: явные уменьшение/изменение количества и удаление строки,
проверка владельца корзины и актуальной версии, конфликты без потери ввода;
после изменения revalidation/reprice acceptance. Количество не менять молча,
не разрешать checkout по старому акцепту, не трогать исторический заказ/резерв.
Определить поведение пустой корзины и повторной операции до реализации.

DoD: Zod/client/HTTP tests, own/foreign cart, unavailable offer, insufficient
stock, stale version, повтор удаления/update, concurrent checkout;
`verify:core-contract`, `verify:postgres`, TS минимум, Buyer build,
`verify:web` и keyboard/mobile. Test DB только изолированная.

### AUD-FIX-04 — execution brief, 15.09.2026

Разрешён владельцем после03.4. Existing add/upsert требует доступного остатка,
сразу заменяет pricing snapshot и не принимает expectedVersion: его нельзя
использовать для явной правки с сохранением reprice diff. Добавляем PATCH/DELETE
/carts/:cartId/items/:itemId с обязательным expectedVersion; PATCH quantity>0,
до1000000 и6знаков дробной части. Оба ответа — существующий CartResponse.
PATCH меняет только явно заданное количество/итог по прежней цене, не принимает
новые условия предложения; unavailable/minimum/increment проверяются штатной
validation после записи. DELETE доступен и для unavailable offer. Ноль не удаляет
строку молча. Пустая ACTIVE корзина остаётся, validation.canCheckout=false.

Версия проверяется атомарно до изменения. Та же версия после уже выполненной
операции →409; same quantity или уже отсутствующая строка при текущей версии →
200 без повторного audit/version increment. Ошибка не меняет данные. При checkout
строки/резервы/исторический заказ не редактируются. Необходимый общий инвариант:
add/reprice/edit/delete/checkout сериализуются через CAS родительской Cart;
checkout создаёт связь под тем же lock, последующие edits запрещены. Checkout и
reprice принимают optional expectedVersion для legacy compatibility; buyer UI
передаёт показанную версию, CAS защищает и legacy requests от конкурентной правки.
Новые права, migration, внешние интеграции, каталог и payment lifecycle вне scope.

UI: отдельный purchasing helper для draft/pending/error; явные Сохранить/Удалить,
подтверждение удаления, помощь у поля количества, нет autosave/автокоррекции.
При conflict draft сохраняется; пользователь отдельно загружает актуальную
корзину перед повторным применением. Checkout/accept заблокированы при draft,
write/pending, устаревшей/отсутствующей validation; успех записи отделён от ошибки
последующей проверки. Дизайн и навигация сохраняются.

Gates: schema+API build, owning unit regressions и root test/typecheck; existing
core-contract/PostgreSQL с prerequisites переиспользуемыми от одной сборки;
buyer production build в отдельном checkout; scoped Playwright real JWT/DB
desktop/mobile + явно помеченные UI-only network cases; docs/diff/preservation.
Только dentmarket_audit_20260914, изолированные files/queues, no external sends,
без demo reseed. Existing PG gate test seed разрешён только на этой audit DB.
Before snapshot — remediation/AUD-FIX-04/before.json. Suite45min,command20min,
blocker15min; максимум3обоснованные попытки, одинаковый сбой без основания — stop.
После DoD остановиться, AUD-FIX-05 не начинать; commit/push не разрешены.

### Checkpoint AUD-FIX-04, 15.09.2026 — CODED / BLOCKED

Реализованы оба контракта, OpenAPI/client, controller и transactional CAS:
владелец проверяется до загрузки содержимого; edit сохраняет принятую цену,
delete доступен для unavailable; current-version no-op не меняет audit/version
и сохраняет display metadata. Add/reprice/checkout используют тот же parent lock.
Пустая корзина не checkout-ready. Проверка старой версии обязательна для новых
операций; buyer передаёт её также при reprice/checkout.

UI helper: draft/save/cancel, delete confirmation, validation рядом с quantity,
помощь hover/click/keyboard, async feedback, явный reload/reconcile. После
конкурентного checkout локальный draft остаётся видимым, не меняет историю заказа.
Keyboard focus после save/delete реализован, но **browser evidence ещё нет**.
Полный редизайн, migration, зависимости, каталог и исторические заказы не менялись.

Серверные gates зелёные; browser до действий не дошёл: fixture API4112 не стал
ready за60s. Также исполнитель ошибочно запустил новую snapshot/build, пока
предыдущая цепочка уже перешла к web; остановлена только собственная новая build.
Сбой orchestration не считается дефектом приложения и не является PASS.
Три Buyer build attempts: две PASS на промежуточных UI inputs, третья прервана;
четвёртый автоматический запуск запрещён. Подробности/reuse — Acceptance Matrix §9.

Для возобновления нужно отдельное явное решение на один изолированный финальный
Buyer build и bounded browser acceptance после read-only проверки отсутствия
своих listeners. Нельзя запускать .tmp/aud-fix-04/remaining.mjs повторно: pipeline
отключён на checkpoint. Сначала финализировать immutable runtime snapshot;
во время build/test не копировать в него API dist/source и не запускать другую
сборку. Если API вновь не ready, сохранить startup diagnostics и остановиться,
не повышая60s/75s лимиты и не меняя бизнес-код без причины. Root/API/PG/contract
gates не повторять при неизменных входах. AUD-FIX-05 не начинать.

### Результат AUD-FIX-04, 16.09.2026 — ACCEPTED

После явного возобновления и проверки1264неизменённых source files выполнена
изолированная сборка. Browser обнаружил реальный UI-PORTAL-01: Fluent копирует
root className на portal, и `.mp-provider` задавал пустому host высоту100dvh.
Теперь page geometry применяется только к `.mp-provider:not([data-portal-node])`;
не отключены pointer events, focus или проверки данных. CSS regression и live
assertion нулевой высоты idle portal добавлены; общий дизайн сохранён.

Финальные typecheck15/15,110frontend unit tests и четыре последовательных
production builds PASS. Scoped Chromium3/3 подтвердил: stock10→2/price100000→
150000, draft4→2 без autosave, старую сохранённую цену до отдельного акцепта,
reload и настоящий checkout; mobile390 invalid/cancel/help/Escape/focus,
удаление unavailable последней строки; реальный409 и сохранение draft, reload,
**симуляцию потерянного ответа после настоящего API commit**, no-op retry без
двойного audit, concurrent checkout без изменения исторического заказа.

DB readback: два исторических заказа qty2 с ценами150000/100000 minor units;
пустая ACTIVE корзина, один removal; edits1/2 без дублей. Cleanup:6из6sessions
REVOKED,3owned offers INACTIVE/не видны, локальные письма удалены; synthetic
DB records сохранены для readback. Основная demo DB не менялась. Четыре снимка
визуально проверены; это viewport emulation, не физические устройства.

PG/core-contract, schemas/client/API units и builds переиспользованы после hash
проверки неизменных входов; aggregate PDF timeout и успешный isolated retry
не скрыты. Итоговый ledger/артефакты — Acceptance Matrix §9. Широкий verify:web,
полный CORE, POST-BE/POST-FULL/security/production не приняты. На DoD остановка;
AUD-FIX-05 не начат. Повторять принятые проверки только при изменении их входов.

## 4. AUD-FIX-05 — каталог и прозрачность цены (CORE-04)

| Finding / исходный proof | Минимальное поведение | Регрессии |
| --- | --- | --- |
| UX-01 P1: source + synthetic pure probe, не доказана неверная сумма checkout | Раздельные «за упаковку» / «за единицу», quantity/UOM и предложение-источник согласованы; не смешивать минимумы разных offers | 1/10/100 единиц, разные фасовки/поставщики, отсутствующая packaging, точные minor-unit строки |
| UX-03 P2: reset callback использует старый query; старый browser repro есть, новый probe timeout не PASS | Единый reset q/category/inStock/pagination в UI, URL и запросе | Непустой запрос + категория + stock, empty recovery, Back/Forward |
| UX-04 P2: PAGE_SIZE 24/offset 0, нет next | UI существующей server pagination с сохранёнными фильтрами, loading/error и понятным концом списка | >24 товаров, смена фильтра, конец выдачи, повтор/быстрые запросы |
| Несогласованные demo packaging labels (наблюдение, не новый publication guard) | «Опубликовано» и инструкция «уточнить упаковку перед публикацией» не должны противоречить данным | Нет упаковки/черновик/опубликовано; contract/fixture quality отдельно от UX |

Scope: buyer catalog page/view-model/card, существующие search/compare schemas
и API; supplier offer/readiness presentation. Не менять ранжирование, цены
или бизнес-допуск без конкретной причины. CSV не переписывать.
DoD каждого slice: TS минимум + точный regression, соответствующие builds и
`verify:web` для critical purchasing UI; при изменении backend contract —
contract/PG по риску, не автоматически для подписи цены.

## 5. AUD-FIX-06 — правдивые статусы и сохранение решений (CORE-03)

Checkpoint16.09.2026: AUD-FIX-05 принят после минимального lazy-cart bundle fix.
Buyer/Supplier bundle budgets PASS без повышения; финальный catalog6/6 и cart3/3
на новой сборке, root TS/tests, readback и visual PASS. История ранней
отозванной приёмки сохранена в Matrix. Далее06→09, затем backend review.
Полный evidence ledger
в Acceptance Matrix §9, source/build manifests и screenshots — remediation/AUD-FIX-05.
Приняты package/unit/offer consistency, reset/pagination/history/race/retry и
supplier sale-unit fallback.6unique browser cases доказаны совокупно5PASS+2PASS
(один visual повтор), не чистым aggregate6/6. Typecheck/test/build/readback PASS;
initial root q после JWT отдельно не принимается. Продолжение06→09 разрешено.

- UX-14 P1: новый AWAITING_CONFIRMATION заказ с accepted=0 ошибочно выглядит
  частично изменённым. Scope: buyer `orders-view-model.ts`,
  `order-decision-details.tsx`. Только состоявшееся решение даёт warning;
  pending, full, partial, rejected/cancelled различаются. Не переписывать backend
  accepted quantities ради UI. Есть настоящий UI/API proof.
- UX-09 P2: supplier `order-confirmation-panel.tsx` теряет draft при закрытии
  и повторном открытии (1→0→Escape→1). Сохранить draft либо явно подтвердить
  discard; отдельно submitting, server conflict и новая версия заказа.
  Escape/focus ранее PASS, его не сломать новым guard.
- RISK-01 conditional: Number в preview, loss of precision на synthetic
  значениях выше safe integer. Сначала проверить достижимые schema bounds;
  не называть это новой ошибкой backend manual override. Использовать точное
  форматирование, если риск достижим; иначе N/A с доказательством bounds.

DoD: state/table tests с pending/full/partial/rejected; сохранность draft и
серверных snapshots; TS минимум, builds затронутых кабинетов, Flow B2 / `verify:web`,
keyboard/mobile. Изменение supplier transaction требует PG; UI warning само по
себе — нет. Не дописывать manual payment/receipt под видом исправления текста.

### Результат AUD-FIX-06, 16.09.2026 — ACCEPTED

Pending больше не выглядит частичным решением; full/partial/rejected различимы.
Draft сохраняется при close/reopen и409; stale snapshot требует explicit restart.
Exact BigInt preview закрывает достижимый RISK-01 (20-digit schema bound),
не меняя backend arithmetic. Success focus принадлежит surviving order list;
error focus после409 восстанавливается в labelled error group после окончания
submitting. Последнее основано на реальном диагностическом event/ref trace,
а не предположении о submitLock: lock=false, activeElement=BODY, Escape вне dialog.

Supplier TS/43unit tests/E2E TS/build/bundle PASS. После отдельного разрешения
ровно один targeted browser acceptance: conflict+new snapshot2/2 PASS. Три
неизменённых outcomes full/partial/rejected REUSED_PASS с прежней приёмки;
совокупно5unique cases, не новый полный5/5run. Conflict реальный201→409,
snapshot-version помечен как UI simulation; real DB проверена в обоих случаях.
No duplicate audit/outbox, quantity/reason/history/reserve invariants подтверждены.
Текущие UI screenshots1280×720; прежний partial390×844 переиспользован.
Это Chromium viewport emulation, не физические устройства. Общий дизайн сохранён.

Matrix §9 и remediation/AUD-FIX-06/error-focus-* содержат evidence/reuse/cleanup.
История failures/startup timeout и его недоказанной причины сохранена.
Отдельные UX-долги (английская API-copy409, table rounding) не объявлены закрытыми;
локальная error-focus приёмка не означает полную UX/CORE/production готовность.
Следующий07 пока не начат; чекбокс и очередь только в Foundation §8.

## 6. AUD-FIX-07 — понятный и устойчивый документолог (CORE-01/02/08)

Scope: `packages/ui/src/document-archive.tsx`, buyer/supplier
`app/documents/page.tsx`, существующие document API/client и readiness view.

| Finding | Требуемое поведение / DoD сценария |
| --- | --- |
| UX-06 P2, source + UI | Разрешённые связи выбирать по номеру/контрагенту, а не требовать знание UUID. Сначала доступный query API; нет прав/объектов объясняется, draft остаётся допустимым по правилам |
| DATA-01 P2, pure probe | Не превращать `1,25` в `125` удалением разделителей. Явно выбрать ₸ input с exact conversion или строгий целочисленный minor input; schema/client tests дроби, separator, huge value. Ошибочное сохранение/оплата не объявлены доказанными |
| UX-10 P2, source; реальный 409/403 NOT_RUN | Catch accounting rejection, conflict/permission/retry, сохранить причину, успех только после сервера |
| UX-15 P2, buyer browser/supplier source | Переход из `/documents` в выбранный раздел сохраняет target, а не всегда `/` без контекста; direct URL/Back/reload |
| UX-16 P2, browser | После открытия/сохранения/закрытия focus в корректном dialog/trigger; Escape и explicit close согласованы; сохранённые данные не теряются |
| UX-17 P2, DOM | File input имеет программный label, форматы/размер видимы, keyboard и invalid/oversize/error состояния. Client reject не считается backend MIME validation |
| audit:DEMO-02 P1, source + UI | Явно пометить demo/notLegallyBinding документы и тестовое основание, не выдавать «Подписан» за реальную ЭЦП. Обязательность marketplace agreement сохраняется |

Выполнять отдельными slices: money/selection, navigation/dialog/errors,
demo marking. Gates: TS минимум, UI regression, Buyer/Supplier builds,
`verify:web`, клавиатура/mobile; новые tenant lookup/relationship API —
schema/client/HTTP + PostgreSQL negative cases. Архив, версии и download
не удалять. Accounting review не становится платежом или подписью.

## 7. Безопасная среда и остановка

### Execution slice AUD-FIX-07.2 — заказ и основной договор, ACCEPTED16.09.2026

Разрешён владельцем после принятого07.1. Граница: заменить ручные UUID заказа
и основного договора при upload в Buyer/Supplier. Используются существующие
`listBuyerOrders`/`listSupplierOrders` и `listDocumentArchive(category=CONTRACT)`;
Контракт HTTP/permissions/формат upload references сохранены. По дополнительному
разрешению владельца исправлена описанная ниже server tenant validation.
Поиск/выбор по номеру, контрагенту и дате; статус объясняет запись, не доказывает
юридическую силу. Заказ необязателен, основной договор обязателен только для
CONTRACT_ADDENDUM. Не запрещать исторический/draft договор новым UI-правилом.
Платёж/возврат, navigation/accounting/demo маркировка остаются вне07.2.

Order search использует существующий список без pagination; UI ограничивает
выдачу100результатами и предлагает уточнить поиск. Contract server search:
limit100, q<=120; при nextCursor показывать честное ограничение, не обходить
весь архив автоматически. Stale response не подменяет новые результаты;
выбранная связь сохраняется при поиске/закрытии/ошибке, id берётся только из
выбранной записи. Нет доступа/сбой/нет результатов различимы; разрешённый
upload без необязательного заказа не блокируется отказом списка. Окончательное
разрешение связей остаётся на сервере. Никаких новых API/интеграций/БД-схем.

DoD: pure option/filter/race regressions, schema/client existing-request tests;
затронутые TS и units (остальные reuse по accepted-inputs07.1), Buyer/Supplier
build/bundle, scoped Playwright real-JWT desktop/mobile: order+contract selection,
optional empty order, required contract, search empty/error/403, retained choice,
actual upload/readback/foreign-tenant rejection. После разрешённой правки tenant
implementation обязателен также полный verify:postgres; negative JWT/DB readbacks
обязательны. 07.1 tests переиспользовать только для неизменённых входов; форму
upload затрагиваем, поэтому соответствующие3browser cases повторить вместе.
Среда только audit DB; own synthetic fixtures/files/no external sends, no reseed.
Baseline remediation/AUD-FIX-07/relations/before.json:1415unchanged files,
HEAD3d644963ed72f99a100e180db2d373bc5abeaef9. Время:20min/command,45min/suite,
15min/blocker,3обоснованные попытки/gate; при stop не начинать другие slices.

Checkpoint16.09.2026: UI selectors/model и pure schema/client regression tests
написаны; существующий07.1 E2E locator ошибки upload уточнён по accessible name,
чтобы не смешивать его с отдельной ошибкой lookup. UI/TS/unit/build/browser
новой07.2 revision **NOT_RUN**: до дорогих gates один targeted actual-JWT API
probe выявил backend blocker. UI исходники ещё не скопированы в audit runtime;
туда добавлен только диагностический script, API artifact прежний неизменённый.

**AUD-FIX-07.2-BLOCKER-01 — подтверждённая некорректная межорганизационная связь.**
В `DocumentsService.assertReferences` участники всех оснований объединяются,
затем проверяется присутствие owner хотя бы в общем списке, а не независимый
доступ к каждому основанию. На3синтетических организациях в audit DB:

- direct read чужого договора →404;
- upload допсоглашения только с чужим основным договором →400;
- тот же foreign base +свой supplierOrderId →201 и сохранённый Document с
  baseAgreementDocumentId чужой организации и её участником в новом документе.

Доказано сохранение запрещённой связи, не заявляется чтение содержимого чужого
файла или production exploit. Пустой synthetic order создан именно как fixture
связи, не как доказательство checkout. Никаких existing demo records не меняли.
Скрипт `scripts/verify-document-relations.mjs`, evidence
`remediation/AUD-FIX-07/relations/related-tenant-graph-1.json/log/result.json`.
Один запуск, FAIL; нет повторов того же сбоя. Собственные auth sessions revoked,
mail files cleaned, synthetic records/files retained. История07.1 не стирается;
07.2 не принят, production/security приёмка открыта.

Следующий точный запрос: отдельно исправить независимую проверку права owner
на основной договор в сочетании с заказом в общем generate/upload reference
path; добавить PostgreSQL/JWT regressions own+own/own+foreign/foreign+own,
не запрещая допустимые draft references и не снимая marketplace agreement gate.
Затем продолжить07.2 с этого checkpoint: TS/units, builds и targeted UI proof.
Не начинать навигацию/accounting/платёжные lookup или другие AUD-FIX до этого.

#### Итог разрешённого продолжения07.2 — 16.09.2026

Предыдущий BLOCKED checkpoint выше сохранён как история. Владелец разрешил
точечную server remediation и завершение07.2. `DocumentsService.assertReferences`
сначала проверяет owner в операционном графе, отдельно в основном договоре,
и только затем объединяет участников. Собственный договор не разрешает чужой
заказ; свой заказ не разрешает чужой договор. Тот же guard вызван в createVersion,
чтобы не копировать legacy mixed references. Отдельные контракты/миграции не нужны;
optional order, draft/history, подписи/платежи и marketplace publication не менялись.
Это не утверждение, что исторические ошибочные записи очищены или все другие
операционные графы прошли новый security audit.

Добавлены14server unit regressions; actual JWT+PG suite
`scripts/verify-document-reference-isolation.mjs` (24cases, обе роли, upload/generate,
foreign-alone/own+foreign/foreign+own/own+own/base-only/draft/version). Negative
операции400 не создали Document/audit/outbox; foreign archive404. Positive201
проверены в БД, участники только ожидаемых организаций. Invalid legacy fixture
создан явно для regression, не для обхода бизнес-процесса. Existing
`verify-postgres-integration.mjs` тоже PASS: tenant/rollback/idempotency/scarce stock/
cart correction. Его штатные test seed/migrations только в согласованной audit DB;
32migrations, pending0; основной каталог не пересоздавался.

TS: isolated explicit Node/tsc equivalents + неизменённые four-workspace reuse;
первый новый client test import без `.js` исправлен по существующему NodeNext
precedent, оставшиеся types PASS. API build attempt1: Prisma generate PASS,
неверный путь Nest CLI; attempt2 с verified apps/api/node_modules PASS. Это tooling
ошибка, не дефект приложения.617unit tests/119files/10workspaces PASS. Первый UI
run остановился на неоднозначном getByLabel(group/control), исправлен locator
на combobox. Снимок выявил intrinsic width длинного option; исправлен только
новый selector (minmax/minWidth), добавлена overflow regression. После этого
153UI/Buyer/Supplier units и4types PASS;464unchanged units переиспользованы.
Полный suite/backend после UI-only correction не запускались повторно.

Финальные Buyer/Supplier production build + bundle budgets PASS; browser attempt2
`playwright.document-relations.config.ts`5/5 PASS27.3s: два новых flow и три07.1.
Real JWT/API/DB: выбор по номеру/контрагенту, обязательность договора, optional
order, server search empty, сохранение выбора, retry, actual lookup403 без запрета
optional upload, фактические upload201/403/409. Network failure только явно
симулирован через route.abort — не доказательство реального backend outage.
Проверены keyboard/Escape/focus и Chromium viewport1440×900/390×844, не физические
устройства или полный WCAG. Горизонтальный overflow отсутствует,5снимков просмотрены.
Сохранено ровно по1audit/outbox на4успешных browser uploads;6fixture documents
в сумме с2основными договорами, physical hashes совпали.7synthetic users,
0active sessions/0local mail; owned ports3101/3102/4112 свободны, записи/files retained.

Все commands/results/manifests и ограничения:
`C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-07/relations/`:
`remediation-plan.md`, `remediation-result.md`, `accepted-inputs.json`,
`accepted-integrity.json`, `relations-web-2-inputs.json`, `relations-web-2-cleanup.json`.
Применены Codex Security Fix Finding (boundary tracing + отдельный review проход без
агентов), Agency Backend Architect/Frontend Developer/Evidence Collector, Playwright
и project Workflow/UI standard. Scope закрыт;07parent/navigation/accounting/payment
lookup/demo marking и production остаются открыты. Commit/push не выполнялись.

### Execution slice AUD-FIX-07.1, 16.09.2026 — ACCEPTED; история ниже

Первый самостоятельный участок07: деньги и устойчивая форма загрузки,
DATA-01 + upload portion UX-16/17. Существующий label «тиыны» и удаление всех
разделителей заменяются явным вводом основных денежных единиц (KZT — тенге),
точным string/BigInt conversion, максимум2fraction digits и20minor digits по
Document Decimal(20,0). Без изменения денег в API/schema/БД. Archive display
также exact, без raw minor fallback для больших значений.

Сохраняем выбранный файл/поля до ухода со страницы; local submit lock включает
FileReader, поля/закрытие отключены до результата, success только после onUpload.
Safe403/409/network feedback, focus/error/Escape/trigger; label и видимые пределы
PDF/DOCX/10,000,000bytes. Client validation не заменяет server MIME/quarantine.
Upload timeout не считается proof no-write; copy требует сначала сверить архив.

Gates: root typecheck; npm test (serial Turbo equivalent), включая UI money/file
units и schema/client upload transport regressions; isolated Buyer/Supplier
production builds и существующие bundle budgets; scoped Playwright document
upload config (real JWT/API/audit DB) desktop/mobile, actual upload/readback,
403/409 и labelled pending transport hold, no concurrent submit, retained draft.
Unchanged API/PG/core-contract artifact evidence reuse; нет нового lookup/API,
migration, publication/payment/signature changes. Suite45min, command20min,
startup60s/test90s, blocker15min; максимум3обоснованные попытки по Workflow.
Baseline remediation/AUD-FIX-07/before.json, branch/HEAD от принятого06.

Scope07.1 не закрывает07 целиком: связи/lookup, navigation/detail/accounting
errors и demo marking остаются очередными slices. Чекбокс только Foundation.
После green07.1 сохранить evidence; не повторять те же неизменённые gates.
Практики Agency frontend/evidence collector, backend architect для границ
контракта; Playwright persistent regression по согласованной task card.

Checkpoint: implementation +unit/schema/client/browser tests написаны. Gate1
root typecheck FAIL на malformed main Buyer `.next/dev/types/routes.d.ts` и
validator.ts (лишние обрывки после завершённых блоков). Эти файлы вручную не
менялись; причина их повреждения не установлена. Fallback attempt2 — тот же
workspace tsc/prerequisites, explicit installed Node/tsc в audit-копии (нет .bin
wrappers), serial.8из11workspace checks PASS; Landing FAIL: LayoutProps ожидает
только `/`, production LayoutRoutes содержит также `/register/resume`.
Attempt3 — штатный isolated `next typegen`, затем только оставшиеся checks;
та же Landing ошибка. Read-only сверка доказала два включённых generated
набора: `.next/dev/types/routes.d.ts` с `/`, `.next/types/routes.d.ts` с
`/` и `/register/resume`; tsconfig включает оба, typegen не удалил старый набор.

Три попытки исчерпаны, остановка. Общая typecheck приёмка не получена;
unit suites, новые production builds, browser/DB writes/download NOT_RUN.
API/платёжные/договорные guards не менялись. Новый fixture только написан,
не запускался; аккаунтов/документов в БД этим slice ещё не создано.
Следующий точный запрос — отдельная bounded нормализация generated artifacts
только isolated runtime (сохранить старые для восстановления), затем оставшийся
TS gate и07.1 acceptance. Main dev/конфиги не трогать, не запускать весь аудит.
Это не повод переписывать `/register/resume` или ослаблять TypeScript checks.

Продолжение разрешено владельцем16.09.2026 после этого checkpoint. Проверены
1415main source/doc files: без изменений; runtime source/config совпадают,
кроме ранее записанных generated next-env. Все audit ports свободны. Старый
isolated Landing `.next/dev/types` перенесён восстановимо в
`remediation/AUD-FIX-07/generated-backup/landing-dev-types`, вне TS include.
Main `.next`, dev-процессы и source/config не менялись. Один разрешённый
resumed `next typegen` +3remaining typechecks PASS;8unchanged PASS переиспользованы.
История первых3FAIL сохраняется. Следующие gates07.1: те же10workspace test
scripts serial с прежними3build+UI noEmit prerequisites, два isolated web build
с bundle budgets, scoped real-JWT upload E2E. Разрешение не открывает07.2–09.
Суммы показываются пользователю в основных единицах: `1,25 ₸`, не `125 тиын`;
minor units используются только в API/хранилище. Финальный статус до runtime
приёмки остаётся CODED, не ACCEPTED.

Execution ledger continuation:10workspace suites594tests/115files PASS; Buyer
и Supplier production build/bundle PASS. Browser attempt1 остановился до upload:
Fluent required label включает `*`, exact getByLabel не находил поле. Изменены
только bounded label locators (optional star), E2E TS PASS; attempt2:3/3real
JWT/API/browser cases PASS14.9s, including actual201/403/409/readbacks/download.
Visual review выявил отдельно противоречивое native «No file chosen» после
close/reopen: React File сохранялся, но unmounted native input терял FileList.
Минимальное исправление ref восстанавливает только ранее выбранный File из
памяти через DataTransfer; нет доступа к новым файлам/путям пользователя.
Regression проверяет native files[0].name после reopen. Повторяются только
затронутые UI/Buyer/Supplier/E2E types,146UI/web tests, два web build/bundle и
последний scoped browser attempt3. Остальные448tests и backend artifact reuse;
неизменённый594suite не запускать снова. Первый browser FAIL не удаляется.

Итог07.1: final types/UI146tests PASS, Buyer/Supplier повторные build/bundle PASS;
финальный browser attempt3 —3/3PASS16.0s. Восстановленный native FileList проверен
в обоих кабинетах. Реальные PDF upload201, permission403 и missing paid basis409;
draft/focus/Escape/pending сохраняются. Суммы `125` и `9007199254740993` в БД
показаны как `1,25 ₸` и `90 071 992 547 409,93 ₸`; по1audit/outbox на документ,
download и физический checksum совпадают. Desktop1440×900/supplier390×844
Chromium viewport, не физический телефон и не полный accessibility audit.
Три финальных screenshots просмотрены. PDF live проверен, DOCX extension/size
через units; отдельный end-to-end DOCX и все остальные07сценарии здесь не приняты.
Сохранены source/build manifests и все попытки в remediation/AUD-FIX-07.
Последний fixture:3synthetic users/orgs,2docs/files retained,0active sessions,
0mail files; own audit ports свободны. Ранее созданные audit fixtures не удалялись.
07.1[x] только Foundation §8; полный07[ ], остальные роли/интеграции/production
не закрыты. Следующий участок07 — document relationship selection, не новый
общий аудит. Commit/push/PR не выполнялись.

Для write-tests ранее согласована только `dentmarket_audit_20260914` в
локальном PG5432. До новой фазы проверить назначение/данные и изменения inputs;
не считать её пустой и не reseed автоматически. Рабочую `marketplace` не трогать.
Audit copy содержит старую source revision: проверить/синхронизировать только
нужные файлы перед новым runtime evidence, не засчитывать старый build за новый.
Изолировать files/queues/outbound, поднимать только нужные приложения.
Новый destructive setup требует точного согласования. Красный gate → stop,
не следующая задача; правила попыток и reuse — Workflow §4.
