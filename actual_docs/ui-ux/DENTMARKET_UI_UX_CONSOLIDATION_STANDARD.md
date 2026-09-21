# DentMarket KZ: UI/UX Consolidation Standard

**Дата аудита:** 21.08.2026
**Статус:** Audit complete, implementation not certified
**Текущая итерация, 15.09.2026:** сохранить существующий дизайн; конкретная
полировка по [UX audit brief](AUDIT_UX_POLISH_2026-09-15.md), без полного редизайна.
**Исторический выбор, 14.09.2026:** B — Quiet Editorial (§19), общий скрывающийся
header без sidebar (§19.3). Референсы не критерий приёмки текущих исправлений.
**Область:** buyer/clinic, supplier, admin, public Marketplace и auth-поверхности

**Правило применения, 2026-09-14:** разделы 3–4 — наблюдения аудита 21.08,
раздел 10 — исходная последовательность, разделы 13–18 — последующие checkpoints;
раздел 19 — направление B, верхняя навигация без sidebar и пять desktop-референсов от 14.09.
Они не назначают уже выполненные slices заново. Нормативное качество задаёт
[UI/UX Implementation Standard](UI_UX_IMPLEMENTATION_STANDARD.md), актуальную
очередь — Foundation/Acceptance Matrix, пределы работы и gates —
[Development Workflow](../governance/DEVELOPMENT_WORKFLOW.md).
Этот файл не является вторым автоматическим backlog редизайна.

## 1. Решение в одном абзаце

DentMarket должен выглядеть как один B2B marketplace для ежедневной закупки стоматологических материалов, а не как несколько приложений с разными визуальными системами. Рекомендуемая концепция: **Modern procurement / calibrated emerald**. Основа кабинетов остается на Fluent UI v9 и `packages/ui`; выразительность добавляется не декоративными эффектами, а насыщенным изумрудным акцентом, ясной иерархией, умеренно характерной типографикой, качественными состояниями и единым ритмом. Публичные страницы могут иметь более выразительную композицию, но не должны создавать вторую систему компонентов.

Вывод исходного аудита: проблема не сводилась к цвету. Его предложения сначала
сверяются с уже реализованными shared primitives и checkpoints; изменяется
только согласованный недостаток конкретного экрана, без повторного построения основы.

## 2. Граница и источники правды

Аудит проведен по исходному коду и поднятому локальному окружению:

- `apps/buyer-web` — клиника, публичный каталог и Marketplace.
- `apps/supplier-web` — кабинет поставщика, товары, предложения, исправления карточек.
- `apps/admin-web` — операторские очереди и служебные workflows.
- `apps/landing-web` — login/register/reset и публичная оболочка.
- `packages/ui` — общие Fluent UI v9-примитивы.
- `packages/api-client` и `packages/schemas` — граница frontend/backend.
- `actual_docs/product/DENTMARKET_PRODUCT_V2.md`.
- `actual_docs/backend/DENTMARKET_BACKEND_FOUNDATION_V2.md`.
- `actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md`.
- `actual_docs/governance/DEVELOPMENT_WORKFLOW.md`.

Живые evidence-артефакты текущего состояния находятся в `output/playwright/`:

- `audit-login.png` — auth split-screen.
- `audit-supplier-overview.png` — shell и навигация поставщика.
- `audit-supplier-corrections.png` — форма «Исправления карточек».
- `audit-catalog.png` и `audit-catalog-mobile.png` — public catalog.
- `audit-admin.png` — admin-поверхность.

Внешние практики применены в ограниченном и проверяемом виде:

| Роль/практика | Что использовано |
| --- | --- |
| UI Designer | design-system-first, tokens, states, responsive и handoff-подход |
| UX Architect | foundation-first архитектура, семантические токены и компонентные контракты |
| Brand Guardian | единая бренд-иерархия, контраст и запрет случайных палитр |
| UX Researcher | daily-use B2B сценарий, задачи клиники/поставщика/оператора, evidence вместо вкусовщины |
| Frontend Developer | Fluent v9, feature-компоненты, accessibility, тестируемый перенос |
| Code Reviewer | границы change set, maintainability, contract-preserving redesign |
| Accessibility Auditor | WCAG 2.2 AA, keyboard/focus, zoom, reduced motion и forced colors |
| i18n Engineer | внешние строки, расширение текста, логические CSS-свойства и locale-ready UI |
| Technical Writer | docs-as-code, component contracts и Definition of Done |
| Evidence Collector / Reality Checker | screenshots, desktop/mobile smoke, console/runtime evidence, статус NEEDS WORK |
| Taste Skill | brief-first и anti-generic только для public/landing арт-дирекции, не для кабинетов |
| Backend Architect | сохранение маршрутов, API-контрактов, ошибок и семантики данных |

## 3. Текущий вердикт

**Вердикт: NEEDS WORK.** Текущая версия пригодна как рабочий прототип и уже имеет полезный базовый emerald-направление, но не готова считаться единым UI/UX.

Сильнейшая текущая поверхность — public catalog: насыщенный emerald hero, понятный поиск, фильтры и карточки товара. При этом первый экран слишком сильно занят hero, а карточки уходят ниже fold. Кабинеты имеют рабочую Fluent-основу, но форму и таблицу визуально разделяют разные уровни качества. Admin остается отдельной navy/blue системой. Auth использует собственную forest/Avenir/Georgia-систему и особенно наглядно показывает расхождение: крупный serif-блок слева соседствует с простыми native-полями справа.

Главная UX-проблема: пользователь видит не «один DentMarket с разными ролями», а «несколько разных продуктов». Главная UI-проблема: одинаковые сущности на разных маршрутах реализованы разными контролами и CSS.

## 4. Детальная матрица расхождений

Приоритеты:

- **P0** — исправить в фундаменте до массового редизайна.
- **P1** — исправить в первом проходе миграции кабинетов.
- **P2** — улучшить после стабилизации системы.

| ID | Приоритет | Наблюдение и доказательство | Риск | Решение |
| --- | --- | --- | --- | --- |
| UI-001 | P0 | Поля в login и форме product corrections выглядят как простые прямоугольные native-контролы. В supplier form есть Fluent `Input/Select/Textarea`, но локальный CSS делает их визуально плоскими и несвязанными с остальным экраном. | Низкое доверие, слабая affordance, ошибки заметны поздно. | Ввести единый `DmField` и набор контролов на базе Fluent, затем переписать форму corrections целиком. |
| UI-002 | P0 | Buyer/supplier используют emerald Fluent shell, admin — navy sidebar, blue actions и pale-blue active state, landing — отдельные forest/amber/black стили. | Смена роли ощущается как переход на другой продукт. | Одна бренд-палитра и один shell-контракт; public может иметь отдельную композицию, но общие semantic tokens. |
| UI-003 | P0 | В route CSS много hardcoded цветов, borders и radii: `admin-web/app/page.module.css`, `landing-web/app/styles.css`, `supplier product-corrections-panel.module.css`, legacy buyer CSS. | Любая корректировка оттенка требует ручного поиска и снова создает расхождения. | Канонические primitive и semantic tokens в `packages/ui`; route CSS не содержит случайных brand literals. |
| UI-004 | P0 | `Inter` используется в кабинетах, `Avenir Next` в landing, `Georgia/Times New Roman` в auth headline. Нет общего type scale и ролей шрифта. | Непредсказуемая иерархия, ощущение разных брендов, слабая читабельность кириллицы. | Выбрать один UI-шрифт с Cyrillic/Latin; mono только для SKU/GTIN/order IDs; serif не использовать в кабинетах. |
| UI-005 | P0 | Нет зарегистрированного component registry. Одни и те же Button, Field, Select, Table, Dialog, Menu и feedback states написаны в разных приложениях. | Исправление одной проблемы не распространяется на остальные экраны. | Создать публичные UI-контракты и правила использования; новые route controls запрещены без wrapper или обоснованного исключения. |
| UI-006 | P0 | Shared `LoadingState/EmptyState/ErrorState` существуют, но не являются обязательными на каждой async-поверхности. | Blank screens, неясно, идет ли запрос, потеря контекста при ошибке. | Для каждого async блока задать loading, empty, error, success/action, stale/conflict и permission states. |
| UI-007 | P0 | Shared `AppShell` используется не всеми продуктами; admin имеет отдельную оболочку, public header живет отдельно. | Разная навигационная логика, плотность и поведение responsive. | Унифицировать shell behavior и navigation semantics, не смешивая role-specific пункты меню. |
| UI-008 | P0 | Крупные монолитные route-файлы: buyer `page.tsx` около 3475 строк, CSS около 2067; supplier `page.tsx` около 1539. | Нельзя безопасно менять один блок без побочных эффектов; стили дублируются. | Переносить feature-блоками в компоненты, hooks и pure utilities; не наращивать route-файлы. |
| UI-009 | P0 | Native controls особенно многочисленны в admin: десятки `<input>/<select>` в commerce/foundation/supplier workflows. В buyer catalog есть native checkbox/select. | Несогласованный focus, validation, keyboard и визуальный стиль. | Обернуть контролы в Fluent-based primitives; native оставить только для контролируемого file input и явно разрешенных low-level случаев. |
| UI-010 | P0 | Accessibility не закрыта одним smoke-тестом: нужно проверить keyboard, focus, screen reader semantics, 200/400% zoom, reduced motion и forced colors. | Пользователь может потерять управление формой или не понять состояние. | Ввести accessibility acceptance gates на component и critical-flow уровнях. |
| UI-011 | P1 | Admin визуально использует отдельный синий action language и не подключает `MarketplaceProvider` из `packages/ui`. | Невозможно говорить о едином продукте. | Перевести admin на shared provider/theme и поэтапно заменить local palette. |
| UI-012 | P1 | Login содержит отключенные Google/Apple блоки, а browser evidence показывает CSP inline-script/unsafe-eval dev warnings и favicon 404. | Пустые или нерабочие действия снижают доверие; console noise скрывает реальные ошибки. | Явно помечать недоступность с причиной либо скрывать до готовности; устранить favicon/CSP/dev-only шум и проверить production behavior. |
| UI-013 | P1 | На отдельных screenshots есть почти пустая поверхность с floating menu и без понятного loading/content state. | Пользователь не понимает: нет данных, запрос завис, route сломан или нет прав. | Для каждого route state добавить skeleton/empty/error/permission; blank page без объяснения запрещена. |
| UI-014 | P1 | Catalog visually stronger, но hero отодвигает товары ниже первого экрана; часть demo product names выглядит поврежденной или неполной. | Снижается скорость закупки; UI пытается компенсировать проблему качества данных. | Сократить hero и отдельно исправить seed/locale/content pipeline; не маскировать поврежденные названия CSS. |
| UI-015 | P1 | В форме и таблице недостаточно заметна иерархия действия: заголовок, поля, primary submit и вторичные действия конкурируют с whitespace. | Дольше сканирование и выше вероятность неверного действия. | Один primary CTA на участок, secondary actions в overflow, ясные group labels и summary ошибок. |
| UI-016 | P1 | Мобильные smoke для catalog и supplier overview показали отсутствие horizontal overflow на 390 px, но полная матрица кабинетов еще не закрыта. | Другие route могут ломаться на реальном viewport. | Проверить 390/768/1024/1280 для каждой critical surface, таблицы переводить в cards или controlled scroll. |
| UI-017 | P2 | На некоторых экранах повторяются uppercase eyebrow labels и декоративные рамки. | Визуальный ритм становится монотонным, а не выразительным. | Использовать eyebrow только для контекста; акцент строить через hierarchy, color and action, а не через все caps. |
| UI-018 | P2 | Нет formal design QA: token lint, screenshot baseline, component showcase и route acceptance matrix. | Возврат расхождений после каждого feature change. | Добавить visual regression и checklist в Definition of Done. |

## 5. Предлагаемое визуальное направление

### 5.1 Рекомендация: Modern procurement / calibrated emerald

Это основной вариант. Он сохраняет уже утвержденный пользователем более насыщенный зеленый, но не превращает интерфейс в зеленую заливку.

- насыщенный emerald используется для primary CTA, active navigation, selected filters, links и важных action states;
- светлые emerald surfaces используются для selected/active состояний, а не как общий фон каждой карточки;
- нейтральные поверхности остаются светлыми и теплыми, чтобы длинная ежедневная работа не утомляла;
- warning, danger, info и success имеют собственные semantic colors и не подменяются зеленым;
- скругления умеренные: интерфейс современный, но не «игрушечный»;
- акцентность создается контрастом действия и поверхности, а не большим количеством декоративных блоков.

### 5.2 Типографика

**Рекомендуемый UI-шрифт: Manrope.** Он заметнее стандартного Arial/Segoe UI, хорошо подходит для кириллицы и Latin, остается спокойным в таблицах и формах. Рекомендуемые веса: 400 для body, 500 для labels, 600 для controls и headings, 700 только для сильного emphasis.

**Технический шрифт: Roboto Mono.** Только для SKU, GTIN, order IDs, batch numbers, технических значений и табличных чисел, когда моноширинность реально помогает сравнению.

Не рекомендуется использовать Georgia/Times New Roman в кабинетах: это усиливает ощущение отдельного editorial-продукта и конфликтует с ежедневной procurement-задачей. Для landing допускается ограниченный display treatment, но не второй язык форм и кнопок.

| Вариант | Сильная сторона | Ограничение | Решение |
| --- | --- | --- | --- |
| Manrope + Roboto Mono | Баланс характера, кириллицы и ежедневной читаемости | Нужно проверить реальные веса и рендеринг в Windows | **Рекомендуется** |
| IBM Plex Sans + IBM Plex Mono | Технический, надежный, хорошо подходит operator/admin | Чуть более сухой и строгий | Альтернатива для преимущественно операционного продукта |
| Onest + Roboto Mono | Более мягкий и современный внешний вид | Нужно особенно контролировать плотность и округлость | Альтернатива для public-heavy сценария |

Правило выбора: новый шрифт сначала проверяется на кириллице, числах, длинных названиях товаров и таблицах при 100/200% zoom. Нельзя смешивать три UI-family ради «интересности».

## 6. Канонические токены

Ниже — proposal для реализации в `packages/ui`. Перед фиксацией значений в коде требуется contrast check для всех text/control combinations. Названия semantic tokens должны использоваться в route CSS вместо hex-значений.

### 6.1 Color tokens

```css
:root {
  --dm-brand-500: #009f67;
  --dm-brand-600: #007a59;
  --dm-brand-700: #00664b;
  --dm-brand-800: #00543e;
  --dm-brand-100: #ddf8eb;
  --dm-brand-200: #b9efd5;

  --dm-neutral-0: #ffffff;
  --dm-neutral-25: #fbfcfb;
  --dm-neutral-50: #f6f8f7;
  --dm-neutral-100: #eef3f0;
  --dm-neutral-200: #d7e1dc;
  --dm-neutral-500: #71807a;
  --dm-neutral-700: #4f5e58;
  --dm-neutral-900: #17201e;

  --dm-success-700: #237a4a;
  --dm-success-100: #eef8f2;
  --dm-warning-700: #9a5a13;
  --dm-warning-100: #fff5e8;
  --dm-danger-700: #a33b35;
  --dm-danger-100: #fff0ee;
  --dm-info-700: #245e8a;
  --dm-info-100: #edf5ff;

  --dm-bg-page: var(--dm-neutral-50);
  --dm-bg-surface: var(--dm-neutral-0);
  --dm-bg-subtle: var(--dm-neutral-100);
  --dm-text-primary: var(--dm-neutral-900);
  --dm-text-secondary: var(--dm-neutral-700);
  --dm-text-muted: var(--dm-neutral-500);
  --dm-border-default: var(--dm-neutral-200);
  --dm-focus-ring: var(--dm-brand-500);
}
```

Правила использования:

1. `brand-600` — default primary action; `brand-700` — hover; `brand-800` — pressed.
2. `brand-100/200` — active/selected surfaces, не фон всей страницы.
3. Semantic colors используются по смыслу, а не как дополнительные декоративные акценты.
4. Нельзя использовать brand color для текста на brand surface без contrast check.
5. Dark theme не должен автоматически заменяться generic `webDarkTheme`: ему нужна отдельная проверка brand/semantic контрастов.

### 6.2 Typography tokens

```css
:root {
  --dm-font-ui: "Manrope", "Segoe UI", sans-serif;
  --dm-font-mono: "Roboto Mono", Consolas, monospace;

  --dm-text-xs: 0.75rem;
  --dm-text-sm: 0.8125rem;
  --dm-text-md: 0.875rem;
  --dm-text-lg: 1rem;
  --dm-text-xl: 1.125rem;
  --dm-text-2xl: 1.25rem;
  --dm-text-3xl: 1.5rem;
  --dm-text-4xl: 1.875rem;
  --dm-text-display: 2.375rem;
}
```

UI defaults: 14px body/control text, 13px helper/meta, 16px prominent form text, 18-24px section headings, 30-38px page heading. Public hero may reach 48-72px only when it does not delay the primary procurement action. Base line-height 1.45-1.6; controls use a compact line-height only when the hit area remains at least 44px.

### 6.3 Layout, shape, focus and motion

```css
:root {
  --dm-space-1: 0.25rem;
  --dm-space-2: 0.5rem;
  --dm-space-3: 0.75rem;
  --dm-space-4: 1rem;
  --dm-space-5: 1.25rem;
  --dm-space-6: 1.5rem;
  --dm-space-8: 2rem;
  --dm-space-10: 2.5rem;
  --dm-space-12: 3rem;
  --dm-space-16: 4rem;

  --dm-radius-field: 6px;
  --dm-radius-button: 8px;
  --dm-radius-card: 12px;
  --dm-radius-section: 14px;
  --dm-radius-dialog: 16px;
  --dm-radius-pill: 999px;

  --dm-control-compact: 36px;
  --dm-control-default: 44px;
  --dm-control-prominent: 48px;
  --dm-focus-width: 2px;
  --dm-motion-fast: 120ms;
  --dm-motion-standard: 180ms;
  --dm-motion-slow: 240ms;
}
```

- Base spacing is 4px; use 4/8/12/16/20/24/32/40/48/64px.
- Default input and button target is 44px; compact controls are allowed only in dense tables with a separate mobile strategy.
- Focus must be visible independently of color and not removed by custom CSS.
- Use `min-height: 100dvh` for full-height shells; do not rely only on `100vh`.
- Motion is limited to feedback and hierarchy. Every transition has `prefers-reduced-motion` fallback.
- Tables use a readable minimum width; at 390px they become cards or intentional horizontal scroll, never clipped content.

## 7. Component registry and contracts

Все новые компоненты должны быть экспортированы из `packages/ui` либо быть feature-specific внутри приложения. Дублирование разрешено только если поведение действительно доменное.

| Component | Contract and states | Accessibility requirements |
| --- | --- | --- |
| `DmButton` | primary, secondary, subtle, destructive, loading, disabled, icon-only | native button semantics, accessible name, loading text/state, 44px target |
| `DmField` | label, required, hint, error, success, disabled, readOnly | label is not placeholder, `aria-describedby`, `aria-invalid`, error near field |
| `DmInput` / `DmTextarea` | text, email, URL, numeric, long text, invalid, submitting | preserved value after recoverable error, visible focus, correct input mode |
| `DmSelect` / `DmCombobox` | closed, open, loading options, empty options, invalid, disabled | keyboard navigation, active option, escape, label and result count |
| `DmCheckbox` / `DmRadio` / `DmSwitch` | selected, mixed, disabled, invalid | group label, keyboard, no color-only state |
| `DmSearchField` | idle, typing, loading, results, no results, clear | explicit search label, clear action name, debounce does not hide state |
| `DmFilterBar` | applied filters, reset, mobile drawer, loading | active filter count, focus return, URL/query state preserved |
| `DmCard` / `DmSection` | default, interactive, selected, disabled, loading | heading hierarchy, no click-only div, selected state textually available |
| `DmDataTable` | loading, empty, error, sortable, selected, pagination, conflict | table semantics, keyboard actions, responsive strategy and row context |
| `DmStatusTag` | success, warning, danger, info, neutral, pending | status includes text; color is supplementary |
| `DmDialog` / `DmDrawer` | open, close, submit, validation, server error | focus trap, labelled title, escape, restore focus, no data loss |
| `DmMenu` / `DmPopover` | open, close, keyboard active item, outside click | menu semantics, arrow keys, escape, correct anchor placement |
| `DmToast` / `DmAlert` | success, info, warning, error, action, dismiss | live region chosen by urgency, actionable error, no secrets |
| `DmLoadingState` | skeleton/progress with stable layout | `aria-busy`, useful label for screen reader |
| `DmEmptyState` | reason, next action, filtered-empty variant | explains why and what to do next |
| `DmErrorState` | retry, support/requestId, recoverable vs blocking | `role=alert`, safe backend error envelope |
| `DmConflictState` | old/new diff, choose/refresh/retry | change is explicit; never silently overwrite |
| `DmFileUpload` | idle, drag, selected, uploading, success, validation/error | keyboard file picker, file type/size, progress and retry |
| `DmProductCard` | image fallback, stock, price, supplier, quantity, add state | price/unit/availability are textually clear; action feedback |
| `DmAppShell` | nav, mobile nav, org switcher, theme, sign out | landmarks, active route, mobile focus and scroll lock |
| `DmPublicHeader` | desktop, mobile menu, search, auth state, city | responsive nav, preserved query, focus return |

Запрещенные паттерны:

- placeholder вместо label;
- native `<select>` или `<input>` в route без обоснованного wrapper;
- кликабельная карточка без keyboard semantics;
- disabled CTA без объяснения причины;
- ошибки только цветом или только техническим сообщением;
- modal, который закрывается с потерей введенных данных;
- случайные `border-radius`, `box-shadow`, hex colors в feature CSS.

## 8. UX-паттерны по типам страниц

### 8.1 Auth

Auth должен быть спокойным входом в рабочий продукт. Одна типографическая система, короткий brand statement, понятный выбор роли и одна основная форма. Google/Apple показываются только если реально доступны; иначе это неактивное обещание. Ошибка входа появляется у формы, сохраняет email и предлагает следующий шаг.

### 8.2 Public Marketplace и catalog

Первый viewport должен быстро приводить к поиску и товарам. Hero остается выразительным, но не должен вытеснять каталог. Search, category, stock и sorting синхронизируются с URL/query state. Карточка товара показывает минимум: изображение/placeholder, название, единицу, цену или причину отсутствия, поставщика/доступность и понятное действие.

### 8.3 Clinic workspace

Приоритет: поиск, сравнение, корзина, заказы, reprice/conflict feedback. На экране не должно быть декоративной стены карточек; summary metrics служат решению. При изменении цены/остатка перед checkout UI обязан показать diff старого и нового значения.

### 8.4 Supplier workspace

Приоритет: заказы, предложения, остатки, загрузка товаров и corrections. Плотные таблицы допускаются, но поля, фильтры, статусы и action feedback должны быть из того же registry. Для corrections пользователь всегда видит выбранный товар, поле исправления, текущее действие, результат отправки и статус рассмотрения.

### 8.5 Admin workspace

Admin может быть плотнее и операционнее, но не должен менять brand language. Его отличие — permission-aware workflows, очереди и audit context, а не navy palette или другая button grammar. Для каждой очереди обязательны loading, empty, error, retry, permission и action success/conflict states.

### 8.6 Dialog, drawer и destructive action

Dialog используется для короткого решения; drawer — для контекста и редактирования, которое должно оставаться рядом со списком. Нельзя прятать единственный способ исправить ошибку в overflow. Destructive action имеет явный consequence text, а server conflict не маскируется локальным success.

## 9. Backend compatibility и границы редизайна

Этот этап — visual/interaction redesign, а не изменение доменной модели. При соблюдении границ конфликтов с backend не должно быть:

- сохраняются существующие URL и role semantics;
- сохраняются field names, API payloads, response/error envelope и query parameters;
- `packages/schemas` и `packages/api-client` остаются источником typed contract;
- supplier corrections продолжают использовать `GET /moderation/product-corrections` и `POST /moderation/product-corrections`;
- catalog продолжает использовать typed `/catalog/search`;
- серверная validation, permission, tenant context, idempotency и conflict semantics не переносятся в CSS/UI;
- UI обязан честно отображать backend error `code/requestId/path/details`, не раскрывая внутренние секреты.

Не меняется без отдельного product/backend решения: migration, seed semantics, endpoint meaning, business statuses, calculation of money, tenant boundaries, order lifecycle и acceptance rules.

## 10. Исходный план миграции — не автоматическая очередь

Пункты ниже сохраняют контекст решений. Перед выбором шага проверить §13–18,
текущий код и Acceptance Matrix; выполненные шаги не повторять. Непринятая
общая accessibility matrix не отменяет уже работающие отдельные компоненты.

### Phase 0: foundation and documentation

1. Утвердить вариант Manrope + Roboto Mono и проверить Cyrillic/contrast.
2. Перенести palette, typography, spacing, radius, focus and motion tokens в `packages/ui`.
3. Описать component registry и запретить новые route-level raw controls.
4. Снять baseline screenshots и console/runtime issues.

### Phase 1: shared controls

1. `DmField`, `DmInput`, `DmTextarea`, `DmSelect`, `DmCombobox`.
2. `DmButton`, `DmStatusTag`, `DmAlert`, `DmToast`.
3. `DmDialog`, `DmDrawer`, `DmMenu`, `DmFilterBar`.
4. `DmDataTable`, `DmLoadingState`, `DmEmptyState`, `DmErrorState`, `DmConflictState`.
5. Unit tests for states, keyboard and accessible names.

### Phase 2: first bounded rewrite

Первым bounded slice была миграция `supplier-web` «Исправления карточек» на
shared primitives; реализация зафиксирована в §13. Не переписывать её повторно
по этому исходному плану: новая задача допускает только подтверждённый пробел.

### Phase 3: auth and public entry

Переписать login/register/reset на общий field/button/feedback contract. Сохранить маршруты и роль. Для landing использовать выразительную композицию только там, где она помогает входу, а не создавать второй набор controls.

### Phase 4: shells and role surfaces

1. Перевести admin на shared provider and semantic tokens.
2. Синхронизировать buyer/supplier/admin sidebar, topbar, org switcher, mobile nav и theme behavior.
3. Сохранить role-specific navigation labels и permission boundaries.

### Phase 5: feature migration

1. Buyer catalog и clinic dashboard.
2. Supplier offers, inventory, import and documents.
3. Admin queues and operational forms.
4. Выносить блоки из больших route-файлов в feature components без framework migration.

### Phase 6: accessibility, content and responsive QA

Проверить keyboard-only flow, focus order, labels, errors, 390/768/1024/1280, 200/400% zoom, reduced motion, forced colors, screen reader landmarks, corrupted product content, missing images and console errors.

### Phase 7: visual regression and release gate

Зафиксировать baseline/after screenshots для login, catalog, clinic, supplier overview, corrections, admin queue и mobile variants. Принять работу только после прохождения acceptance matrix, а не после визуального просмотра одной страницы.

## 11. Acceptance matrix

### Design system

- [ ] Все кабинеты используют `MarketplaceProvider` и Fluent UI v9.
- [ ] Brand, semantic, typography, spacing, radius, focus and motion tokens находятся в одном источнике.
- [ ] В route CSS нет незарегистрированных brand hex/radius/shadow.
- [ ] Одинаковые компоненты выглядят и ведут себя одинаково на buyer/supplier/admin.

### UX and accessibility

- [ ] У каждого async блока есть loading/empty/error/success и применимые stale/conflict/permission состояния.
- [ ] Все поля имеют видимый label, hint/error рядом и сохраняют ввод после recoverable error.
- [ ] Основные flows проходят keyboard-only и имеют видимый focus.
- [ ] Проверены 390px без случайного overflow, 768px, desktop и zoom 200/400%.
- [ ] Проверены reduced motion и forced colors.
- [ ] Статус понятен без цвета; disabled действие объясняет причину.

### Contract and runtime

- [ ] URL, API payloads, schemas, api-client, permissions и business semantics не изменились без отдельной задачи.
- [ ] Catalog, corrections, orders и checkout сохраняют backend error/conflict semantics.
- [ ] В браузерной console нет необъясненных ошибок; favicon и production CSP закрыты.
- [ ] Поврежденные demo-данные не скрываются за косметикой и заведены отдельным content/data issue.

### Required verification

Применяется матрица Workflow §4: TS минимум, build затронутых приложений и
обязательный browser/keyboard/mobile gate изменённого critical flow. Все четыре
сборки и общая visual matrix нужны для общего профиля/системных изменений или
финальной UI-приёмки, не для правки одного текста. Подготовка API/DB нужна до
browser gate, не для статической docs-only проверки. Timeout не является pass.
Результаты на неизменённых входах переиспользуются по Workflow §4.2.

## 12. Что делать сейчас

Не начинать заново `DmField`/`DmButton`/`DmSelect`, corrections, auth или shell
по старому указателю. Выбрать один явно разрешённый незакрытый outcome из
Foundation/Acceptance Matrix, сверить его с checkpoints ниже и текущим кодом.
Если реализации достаточно, выполнить только недостающее evidence; если нет —
минимальное исправление с regression. После его DoD остановиться.

После первого bounded-slice текущая версия все еще считается промежуточной: emerald-направление подтверждено как хорошая база, но buyer/admin/auth поверхности еще не мигрированы.

## 13. Implementation checkpoint: supplier corrections

Первый implementation slice выполнен в `packages/ui` и `apps/supplier-web`:

- добавлены shared wrappers `DmField`, `DmInput`, `DmTextarea`, `DmSelect`, `DmButton`;
- обновлены control tokens, focus ring, 44px control height, radius и active/pressed states;
- форма «Исправления карточек» переведена на семантический `<form>` с keyboard submit;
- обязательные поля, hints, disabled submit и safe success/error feedback вынесены в единый UX-паттерн;
- история обращений получила loading, empty, error/retry и count states;
- добавлен regression test для submit guard;
- сохранены endpoint, payload и supplier role semantics.

Evidence текущего slice: `output/playwright/supplier-corrections-redesign-full.png` и `output/playwright/supplier-corrections-redesign-mobile.png`. Остальные buyer/admin/auth поверхности пока не мигрированы и не должны считаться автоматически унифицированными.

## 14. Implementation checkpoint: auth login

Второй implementation slice выполнен в `apps/landing-web`:

- login подключен к `MarketplaceProvider` и shared `packages/ui` controls;
- email/password получили видимые labels, required semantics, единый focus и 44px control contract;
- auth typography переведена на Manrope с Cyrillic/Latin subsets;
- login headline больше не использует Georgia/Times New Roman;
- основной login, Apple и demo actions используют общий button contract;
- сохранены `/auth/login`, `/auth/password/forgot`, social exchange, demo handoff и role routing;
- mobile smoke на 390px повторно проверен после исправления auto-min-width overflow.

Known limitation: dev browser console по-прежнему содержит CSP/Next refresh noise и предупреждения интеграций Google/Apple. Favicon добавлен в этот slice; оставшийся console noise относится к dev/runtime-hardening, не скрыт как UI success.

## 15. Implementation checkpoint: public Marketplace catalog

Третий implementation slice выполнен в `apps/buyer-web`:

- public catalog header search переведён на shared `DmInput` и `DmButton`;
- catalog sort и error/empty actions переведены на shared `DmSelect` и `DmButton`;
- buyer typography переведена с Inter на Manrope с Cyrillic/Latin subsets;
- catalog/header colors, borders and brand accents используют semantic tokens из `packages/ui`;
- сохранены query params, typed `/catalog/search`, category/stock/sort behavior и product links;
- production build buyer-web прошёл;
- mobile smoke на 390px показал `viewport=390`, `scroll=390`, `bodyScroll=390`.

Runtime note: на момент browser smoke API `127.0.0.1:4012` не был запущен, поэтому populated catalog response/card grid не утверждается как проверенная часть этого slice. Реально проверены header, search/select semantics, responsive layout и catalog error/retry state; card-state QA требует поднятого API.

## 16. Implementation checkpoint: admin shell

Четвёртый implementation slice выполнен в `apps/admin-web`:

- admin подключён к `MarketplaceProvider` и общим `packages/ui` styles;
- shell переведён на общий `AppShell` с emerald brand, sidebar, mobile drawer, topbar и theme toggle;
- admin typography переведена с Inter на Manrope;
- shell search, section select и action controls используют shared primitives;
- overview-level colors и states переведены на semantic tokens;
- сохранены admin auth gate, section navigation, API routes и feature composition;
- admin typecheck и production build прошли;
- desktop visual smoke подтвердил styled shell;
- mobile smoke на 390px подтвердил `390/390/390`, drawer navigation открывается и закрывается.

Ограничения этого slice: feature-панели admin и их legacy CSS/native controls ещё не мигрированы целиком. Browser console показывает только `ERR_CONNECTION_REFUSED` к API `127.0.0.1:4012` в окружении без поднятого backend; это не ошибка shell-рендера. Дальнейшая миграция контролов и populated-data QA остаются отдельными bounded-срезами.

## 17. Implementation checkpoint: admin organization form

Пятый implementation slice выполнен в `apps/admin-web` и `packages/ui`:

- добавлен shared `DmCheckbox` для capability selections;
- `OrganizationQuickCreate` переведён с native input/button controls на `DmField`, `DmInput`, `DmCheckbox` и `DmButton`;
- обязательные labels, required markers, БИН hint и keyboard-friendly dialog semantics сохранены;
- error feedback получил `role="alert"`, success feedback сохраняет `role="status"`;
- API endpoint `/organizations`, request payload и 409/error semantics не изменены;
- modal и recoverable API error проверены браузером с заполненными полями.

Ограничения: остальные admin feature-панели пока содержат legacy controls и будут переноситься отдельными небольшими срезами.

## 18. Implementation checkpoint: admin foundation management

Шестой implementation slice выполнен в `apps/admin-web` и `packages/ui`:

- роли, memberships, атрибуты каталога и правила атрибутов переведены на общий контракт `DmField`, `DmInput`, `DmSelect`, `DmCheckbox` и `DmButton`;
- labels, required markers, hints для permissions и порядка, видимый focus и единые control states теперь одинаковы с auth, supplier corrections и organization form;
- native input/select/button controls в этом feature-блоке удалены без изменения backend endpoints, payloads и role/catalog semantics;
- checked state capability-флагов и catalog flags использует shared checkbox styling;
- desktop visual smoke подтверждает unified emerald controls и grid form density;
- mobile smoke на 390px показал `bodyScroll=390` и `documentScroll=390`, без горизонтального overflow;
- при недоступном API пользователь видит явный recoverable status, empty memberships/attribute definitions и сохраняет доступ к форме для повторной попытки после запуска backend.

Evidence текущего slice: `output/playwright/admin-foundation-management.png` и `output/playwright/admin-foundation-management-mobile.png`.

Ограничения: populated roles, memberships, attributes и category rules не прошли end-to-end проверку, потому что browser environment не содержит запущенного API `127.0.0.1:4012`; остальные admin feature-панели по-прежнему требуют отдельных миграционных срезов.

## 19. Полный редизайн: выбор направления, 2026-09-14

Основание: владелец запросил полный редизайн и визуальные референсы перед
составлением схемы реализации. Цель — дорогой, удобный, минималистичный и
внушающий доверие интерфейс. Текущий результат — два растровых концепта одного
каталога и выбранное владельцем направление B — Quiet Editorial. Утверждён
визуальный характер, не полные макеты страниц или реализация frontend.
Стек Next.js / TypeScript / Fluent UI v9 / packages/ui сохраняется.

### 19.1 Референсы для выбора

| Вариант | Характер | Что оценить |
| --- | --- | --- |
| [A — Emerald Precision](references/2026-09-14/reference-a-emerald-precision.png) | Чёткие карточки, светлая emerald-основа, заметные действия, более структурированная подача | Скорость сравнения, группировку полей, плотность и заметность действий |
| [B — Quiet Editorial](references/2026-09-14/reference-b-quiet-editorial.png) | Тёплый светлый фон, открытые колонки, тонкие разделители, более выразительная типографика | Спокойствие, визуальный характер, читаемость и количество полезных данных на экране |

Решение владельца 14.09.2026: **B — Quiet Editorial** (явный ответ «B»).
Вариант A сохраняется как рассмотренная альтернатива, но не выбран для реализации.
Предложенная ранее комбинация B/A не считается согласованной этим ответом.

Принятый визуальный характер: тёплый светлый фон, графитовый текст, глубокий
изумрудный акцент, открытые колонки и тонкие разделители, спокойная выразительная
типографика и достаточный воздух. Manrope и технический mono сохраняют свои
роли. Точные значения токенов, плотность рабочих таблиц, responsive и состояния
компонентов ещё требуют проработки и проверки; изображение не служит CSS-спецификацией.
На все роли распространяется один согласованный визуальный язык с разной
плотностью по задаче пользователя. Новые конкурирующие направления не создаются
без запроса владельца; требования читаемости и доступности остаются обязательными.

Оба изображения созданы встроенным ImageGen и визуально просмотрены.
[Полные исходные промпты и ограничения](references/2026-09-14/generation-prompts.txt)
сохранены рядом. Первая строка товаров использует одинаковые названия,
упаковки, цены и остатки; генератор изменил второстепенные счётчики и некоторые
значения нижнего ряда. Это не согласованные fixtures, требования или текущие
данные DentMarket. Изображения товаров синтетические, не supplier media.

Концепт не доказывает точный Manrope rendering, WCAG, responsive, загрузку API
или работу кнопок. Подсчёт товаров и выбор категорий берутся из реального
контракта. Цена/остаток принадлежат предложению конкретного поставщика, а не
canonical product: в итоговой карточке необходимо явно обозначить выбранное
предложение либо переход к сравнению; не обещать покупку абстрактного товара.

### 19.2 Как превратить выбор в реализацию

Это дизайн-handoff для существующей B5-очереди Foundation, не второй backlog
и не поручение выполнить все шаги автоматически.

1. Выбор владельца выполнен: B — Quiet Editorial, решение записано в §19.1.
   Глобальная тема меняется только в согласованной задаче реализации после
   проработки эталонов и компонентных правил.
2. Зафиксировать полный охват страниц/feature-панелей marketplace, auth,
   Buyer, Supplier, Admin и пяти существующих дополнительных demo-блоков:
   роль, задача, главный action, API/данные, состояния и критерий приёмки.
   Реестр включает все поверхности, но не создаёт новые бизнес-функции.
3. В выбранном направлении подготовить пять эталонов: каталог, товар и
   сравнение предложений, корзина/reprice, заказ поставщика, документолог.
   Добавить mobile, loading/empty/error/conflict/permission состояния;
   статичное изображение happy path не заменяет этот контракт.
4. Сверить эталоны с существующими packages/ui primitives, закрепить
   семантические токены, плотность и поведение в этих двух UI standards.
   Затем сделать один интерактивный эталон на существующем стеке; на время
   проектирования допускаются явно обозначенные fixtures, но не fake API pass.
5. После принятия эталона переносить согласованные сценарии: общая навигация
   и auth → закупка Buyer → Supplier → Admin → остальные принятые поверхности.
   Сохранять URL/API/права/денежные и договорные правила. Пробел backend
   выносить в соответствующий CORE-пункт, не скрывать визуальным успехом.
6. Каждый изменённый сценарий принимает свои gates по Workflow; финальный
   общий путь остаётся POST-FULL. X в B5/Core ставится только за проверенный
   outcome, не за генерацию картинок. Спорные payment/agreement состояния
   требуют принятого backend-контракта до окончательной реализации UI.

Текущий статус: владелец выбрал B — Quiet Editorial; пять desktop-референсов
подготовлены с общей верхней навигацией (§19.3–19.4). Это не полная приёмка
пяти эталонов: полный реестр страниц, mobile, остальные состояния и
интерактивный прототип ещё не выполнены. Код, токены, API, база данных и
runtime-профили этой задачей не изменяются; production/DEMO/B5 gates не закрыты.

### 19.3 Утверждённое изменение оболочки

Владелец отклонил предложенный общий sidebar и утвердил все ссылки на страницы
в header сверху; при прокрутке header должен скрываться. Поэтому исходный
референс B с левой колонкой фильтров остаётся историей выбора визуального
характера, а новым композиционным master служит каталог из §19.4.

На всех пяти страницах нет глобального sidebar: одинаковые header, логотип,
поиск, порядок навигационных слотов, типографика, иконки, разделители и поля
контента. Меняется активный раздел. В supplier-варианте в тех же слотах
показываются организация поставщика и «Предложения» вместо buyer-корзины;
ролевые права не расширяются ради одинакового текста. Остальные разрешённые
ссылки доступны через header-menu «Ещё», а не исчезают из продуктового scope.
Перечень всех пунктов меню ещё требует полного route/role inventory.

Фильтры горизонтальны и находятся внутри каталога. Блок суммы справа в корзине
и характеристики рядом с фото товара — рабочий контент, не боковая навигация.
Референсы показывают положение в начале страницы с видимым header. Скролл
не реализован и не доказан картинкой. Предложенная детализация — скрытие вниз,
появление вверх/в начале, сохранение доступа при focus и открытом меню — описана
в [UI/UX Standard §2.1](UI_UX_IMPLEMENTATION_STANDARD.md#21-глобальная-навигация-редизайна--решение-владельца-14092026).
Пороги, анимация, responsive и клавиатурный доступ принимаются в прототипе.

До создания кардинально другой структуры или возврата sidebar требуется
обсуждение и явное утверждение владельцем. Такая смена не выполняется как
автоматическое следствие другого типа страницы.

### 19.4 Пять desktop-референсов с одним master-header

| Страница | Референс | Показанное состояние |
| --- | --- | --- |
| Каталог | [01 — каталог](references/2026-09-14/top-header/01-catalog.png) | Горизонтальные фильтры, предложения с упаковкой/ценой/остатком и переходом к сравнению |
| Товар и сравнение | [02 — предложения](references/2026-09-14/top-header/02-product-offers.png) | Сравнение одинаковой упаковки; stale offer недоступен для покупки |
| Корзина/reprice | [03 — корзина](references/2026-09-14/top-header/03-cart-reprice.png) | Старая/новая цена и остаток; нехватка количества блокирует checkout даже после акцепта diff |
| Заказ поставщика | [04 — подтверждение](references/2026-09-14/top-header/04-supplier-order.png) | Предпросмотр частичного подтверждения, обязательная причина и пересчёт суммы |
| Документолог | [05 — архив](references/2026-09-14/top-header/05-documents.png) | Документы по контрагенту/заказу, версии и просмотр; квитанция не равна принятой оплате |

Все файлы — 1536×1024 PNG. Built-in ImageGen: исходный B → новый catalogue
master → четыре edits с этим master в качестве входа. Использованы прочитанные
ImageGen, Taste Redesign, Agency UI Designer/UX Architect: единая композиция,
типографика, компонентные и доменные границы. Не создавались агенты или новые
интеграции. [Точные промпты и примечания](references/2026-09-14/top-header/generation-prompts.txt).

Визуально проверены отсутствие боковой навигации, общая геометрия header,
читабельность основных полей и показанных денег/остатков. Проверена арифметика:
корзина 61 400 → 63 400 ₸ при прежних количествах; недостаток 3 запрошенных
против 2 доступных упаковок остаётся блокером. В самостоятельном примере заказа
поставщика 63 400 → 55 950 ₸, уменьшение 7 450 ₸. Это разные демонстрационные
снимки сценариев, не один сквозной order fixture; товары multi-supplier корзины
не объединяются этим изображением в один реальный supplier order.

Ограничения: generated PNG не гарантирует pixel-identical header или точные
font/token значения. Окончательная идентичность достигается одним общим
компонентом и воспроизводимой visual regression, а не пятью независимыми
реализациями по картинкам. Синтетические packshots, тексты статусов, PDF и
суммы не вводят enum/API/юридическое правило. Референсы не показывают все
loading/empty/error/mobile состояния, скролл или реальную работу API.
Inline-композиция supplier confirmation пока предложение, не изменение
существующей формы/контракта; неподтверждённые действия CORE-01/02 не обходятся.
