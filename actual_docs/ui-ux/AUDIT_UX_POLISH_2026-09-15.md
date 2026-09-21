# Полировка текущего UX и недостающее покрытие закрытого пилота

Решение владельца: **сохраняем текущий визуальный дизайн**. Исправляем конкретные
тупики, неверные статусы, формы, навигацию и доступность. Quiet Editorial,
старые reference images и смена всей оболочки не являются критерием этой работы.
Fluent UI v9, текущие шрифты/tokens и существующие общие компоненты сохраняются.

Порядок/чекбоксы — [Foundation §8](../backend/DENTMARKET_BACKEND_FOUNDATION_V2.md#8-исправления-аудита-закрытого-пилота--2026-09-15).
API/auth и деньги не реализуются вторично здесь: [access brief](../backend/AUDIT_ACCESS_REMEDIATION_2026-09-15.md),
[purchase/document brief](../backend/AUDIT_PURCHASING_DOCUMENTS_REMEDIATION_2026-09-15.md).
Результаты — [Acceptance Matrix §9](../governance/PROJECT_ACCEPTANCE_MATRIX.md#9-aud-fix--исправления-аудита-2026-09-15).

## 1. AUD-FIX-08 — локальные UX-исправления (B5.1–B5.3)

| Finding / evidence | Scope и минимальный результат | Проверяемые состояния |
| --- | --- | --- |
| UX-05 P2: нет системной статичной «?» помощи, source + выбранные формы | `packages/ui` field help contract, затем регистрация/документы и реально инвентаризированные формы. Label видим; «что это и зачем» по hover/click/keyboard/touch, обязательные ограничения не только tooltip | Empty, required, invalid, disabled, submitting; Tab/Enter/Escape, возврат focus; не объявлять все 390 control usages проверенными |
| UX-07 P2: admin search только визуальный | `apps/admin-web/app/page.tsx`: подключить к существующему конкретному поиску либо убрать ложное интерактивное обещание | Enter, clear, no results, доступ; не внедрять новый глобальный поисковый движок |
| UX-08 P2: «Магазин работает» при401, undefined metrics, browser FAIL | Admin overview/`live-metrics.tsx`: проверять HTTP и shape; разделить справочный checklist и настоящий health; показать no-access/error/retry | Loading, empty, 401/403/500, network loss, success; не делать shell обходом operator auth |
| UX-11 P2: public navigation скрыта≤1180 без альтернативы | Существующий public header: доступная compact навигация в той же системе | Все разрешённые ссылки, active route, keyboard/touch, без скрытых Tab targets |
| UX-12 P2: catalog hero clipped360 | Локальные wrapping/spacing правила heading, без новой композиции | 360/390, увеличение текста и длинный заголовок |
| UX-13 P2: city popup выходит за экран360 | Существующий popup positioning/width; сохранить выбор и dismiss | Open/close, Escape, click outside, long list, focus, touch |
| UX-18 P2: supplier document page width1103 при1024 | Ограничить toolbar/table container; scroll локальный, CTA видимы | 768×1024, 1024×768, длинные данные/много колонок |
| UX-19 P2: privacy heading width482 на360/390 | Перенос длинного слова/размер заголовка; содержание правового текста не менять | 360/390, zoom, отсутствие page overflow |

UI-ошибки статусов заказа, draft, архива и logout принадлежат AUD-FIX-03/06/07;
здесь только shared/responsive и admin feedback. Выполнять отдельными
компонентными slices, не затрагивать все страницы одним массовым rewrite.

## 2. Проверки UX

Для каждого изменённого critical flow: TS минимум, regression, build только
затронутых web apps, `verify:web`, keyboard и mobile. Общая помощь/навигация
требует также отличающихся контекстов Buyer/Supplier/Admin/Public. Для landing
минимум Workflow public UI, плюс целевые визуальные/keyboard checks дефекта.

Матрица: роль → URL/раздел → компонент → действие → состояние → viewport →
PASS/FAIL/BLOCKED/NOT_RUN/N/A → artifact/version. У исправления отдельный статус.
Desktop1440×900 и1920×1080; tablet768×1024 и1024×768; mobile390×844 и360px.
Viewport emulation не называем физическим телефоном. Для локального heading
достаточно targeted размеров; широкие shell изменения требуют всей матрицы.

Проверять focus/Tab/Escape, повторное открытие, dirty form, pending и server
conflict, не только screenshot открытой страницы. Не повторять десятки снимков
одинакового примитива. Искусственные ошибки помечать simulation; snapshot не
доказывает запись в БД. Browser blocker/лимиты сохраняются из access brief.

## 3. AUD-FIX-09 — завершить недостающее доказательство, не переписывать ядро

Это отдельный checkpoint после соответствующих исправлений/CORE outcomes.
Ниже не утверждается отсутствие реализации: исходный полный аудит не закончен.

| Область | Что действительно доказано в аудите | Остаток и основной адрес |
| --- | --- | --- |
| Auth | 17 session assertions; выбранные guards | Registration/verification/reset, roles/invites/disable, org switch, MFA, UI expiry/logout: CORE-05 / AUD-FIX-03 |
| Каталог/импорт | Search/compare,50 live products/500 offers; source CSV/XLSX | Manual/XLSX весь путь, matching, упаковки/качество/rollback: CORE-04 |
| Покупка | Один supplier, reprice/accept/checkout/full confirm, snapshots/idempotency | Multi-supplier, partial, stock race, cancel/expiry/release, receipt/reorder: CORE-03 |
| Оплата | Отдельные документы/accounting, не подтверждённый платёж | Принять и проверить manual invoice→claim→operator decision: CORE-02; без PSP |
| Документы | List/detail/upload/download, selected foreign reads | Foreign upload/download/shipment graph, missing file, limits/versions/history; DOC-04 content отдельно |
| Оператор | Source queues/actions, API actor fixtures | Штатный UI login/MFA, решения/отказы, audit trail: CORE-05/06 |
| События/метрики | Source outbox/in-app/operational metrics | Реальные dedup/replay effects, cancels/partial/received/repeat/demo-data semantics: CORE-06/07 |

При обнаружении нового gap: зарегистрировать один раз у соответствующего CORE,
не расширять текущий fix автоматически. Полная цепочка от регистрации до
повтора с оператором — POST-FULL после backend/frontend; release/data/restore/load
на одной revision — POST-BE после CORE-09. Исправления UI не закрывают эти gates.

## 4. Дополнительные модули остаются видимыми в local go_live

| Модуль | Ограничение доказательств / что объяснить партнёрам |
| --- | --- |
| AI | В audit fixtures permission/entitlement403; прежний локальный fallback не равен live модели. Не скрывать 403 и не ослаблять права |
| Recommendations | Нет обязательного адреса/branch в fixture; актуальная полная калькуляция не принята |
| Trust | Видно «Недостаточно данных»; отзывы/модерация/апелляции и формула не проверены целиком |
| Promotions | Форма/empty state доступны; создание, расчёты и применение NOT_RUN |
| Billing | Schemas/API существуют; полноценный кабинет и платёжный цикл не приняты |

Доведение каждого optional-модуля до полного продукта не входит в эти fixes.
Pilot composition/production guards не менять ради демонстрации. Интеграции,
внешние платежи/подписи/отправки остаются EXT.

## 5. Граница выводов и хранения evidence

Аудит инвентаризировал18pages+2webhandlers,301HTTP declarations,149Prisma models,
119enums. Это не количество принятых endpoints или завершённых journeys.
107снимков:37 фактически просмотрены,70 только capture. Не считать их 107PASS.
30 API/data observations,6reprice assertions и17session assertions — разные
наборы, не единый процент готовности. Полные CI/security/release этим не доказаны.

Artifacts: `C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/`.
Новые проверки сохранять в отдельном датированном remediation evidence,
не затирая прежние FAIL/логи/PDF. Ни секреты, ни реальные customer data не
попадают в repo/отчёты. Демо с ведущим, самостоятельный закрытый пилот и
production оцениваются отдельно; отсутствие всех ошибок не обещается.
