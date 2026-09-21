# Реестр страниц и поверхностей

Всего 78 design surfaces. Снимок исходников 2026-09-15T20:25:17.369Z; HEAD 3d644963ed72f99a100e180db2d373bc5abeaef9.

PARTIAL = код/поверхность есть, полнота не сертифицирована. SCOPED_ACCEPTED = принят конкретный AUD slice, не вся страница. TARGET = согласованное направление, реализации не заявляем. CONDITIONAL = flag/adapter/external dependency. DESIGN = атлас, не новый маршрут. Все новые макеты PROPOSED.

| ID | Роль / задача | Маршрут или поверхность | Реализация | Действие | Source |
| --- | --- | --- | --- | --- | --- |
| public-home | public: Закупки без лишних звонков | landing:/ | PARTIAL | Открыть каталог | apps/landing-web/app/page.tsx |
| public-about | public: О DentMarket | buyer:/about | PARTIAL | Перейти в каталог | apps/buyer-web/app/about/page.tsx |
| public-suppliers | public: Ваш ассортимент — в закупках клиник | buyer:/suppliers | PARTIAL | Стать поставщиком | apps/buyer-web/app/suppliers/page.tsx |
| public-catalog | buyer: Стоматологические материалы | buyer:/catalog; / active=catalog | PARTIAL | Сравнить предложения | apps/buyer-web/app/catalog/page.tsx |
| product-offers | buyer: Композит универсальный A2 | buyer:/products/[id]; product dialog | PARTIAL | В корзину | apps/buyer-web/app/products/[id]/page.tsx |
| buyer-cart | buyer: Корзина | buyer:/ active=cart; target /cart | SCOPED_ACCEPTED | Принять изменения | apps/buyer-web/app/features/purchasing/buyer-cart.tsx |
| buyer-checkout | buyer: Проверка заказа | target buyer:/checkout; current cart action | TARGET | Оформить заказ | actual_docs/product/DENTMARKET_PRODUCT_V2.md |
| buyer-orders | buyer: Заказы клиники | buyer:/ active=orders; target /orders | PARTIAL | Открыть заказ | apps/buyer-web/app/features/purchasing/buyer-orders.tsx |
| buyer-order-detail | buyer: Заказ № DM-0264 | order details inside buyer orders | PARTIAL | Открыть документы | apps/buyer-web/app/order-decision-details.tsx |
| buyer-documents | buyer: Документы | buyer:/documents | PARTIAL | Загрузить документ | apps/buyer-web/app/documents/page.tsx |
| buyer-document-detail | buyer: Счёт № INV-0264 | buyer:/documents → detail dialog | PARTIAL | Скачать PDF | packages/ui/src/document-archive.tsx |
| buyer-document-upload | buyer: Загрузка документа | buyer:/documents → upload dialog | PARTIAL | Загрузить документ | packages/ui/src/document-archive.tsx |
| buyer-workspace | buyer: Списки и бюджеты | buyer:/ active=workspace | PARTIAL | Создать список | apps/buyer-web/app/buyer-services-panel.tsx |
| buyer-notifications | buyer: Уведомления | buyer:/ active=notifications | PARTIAL | Отметить прочитанными | apps/buyer-web/app/page.tsx |
| buyer-support | buyer: Поддержка | buyer:/ active=support | PARTIAL | Создать обращение | apps/buyer-web/app/buyer-services-panel.tsx |
| buyer-assistant | buyer: AI-помощник | buyer:/ active=assistant; local go_live | CONDITIONAL | Отправить | apps/buyer-web/app/buyer-services-panel.tsx |
| buyer-recommendations | buyer: Варианты поставки | buyer:/ active=smart-commerce; local go_live | CONDITIONAL | Подобрать предложения | apps/buyer-web/app/smart-commerce-panel.tsx |
| buyer-reviews | buyer: Отзыв о поставщике | review action inside order; trust flag | CONDITIONAL | Отправить отзыв | apps/buyer-web/app/page.tsx |
| account | buyer: Организация и реквизиты | target buyer:/account | TARGET | Сохранить реквизиты | actual_docs/product/DENTMARKET_PRODUCT_V2.md |
| team | buyer: Команда и доступ | CORE-05; account/team target | TARGET | Пригласить сотрудника | actual_docs/backend/DENTMARKET_BACKEND_FOUNDATION_V2.md |
| supplier-dashboard | supplier: Обзор поставщика | supplier:/ active=dashboard | PARTIAL | Перейти к заказам | apps/supplier-web/app/features/supplier-workspace/supplier-dashboard.tsx |
| supplier-onboarding | supplier: Подготовка к публикации | supplier:/ onboarding panel | PARTIAL | Открыть договор | apps/supplier-web/app/onboarding-progress.tsx |
| supplier-orders | supplier: Заказы поставщику | supplier:/ active=orders | PARTIAL | Открыть заказ | apps/supplier-web/app/features/supplier-workspace/supplier-orders.tsx |
| supplier-order-detail | supplier: Заказ № DM-0264 | supplier order confirmation dialog | PARTIAL | Подтвердить частично | apps/supplier-web/app/order-confirmation-panel.tsx |
| supplier-shipment | supplier: Отгрузка заказа DM-0264 | supplier order → shipment panel | PARTIAL | Подтвердить отгрузку | apps/supplier-web/app/shipment-panel.tsx |
| supplier-offers | supplier: Предложения | supplier:/ active=offers | PARTIAL | Создать предложение | apps/supplier-web/app/features/supplier-workspace/supplier-offers.tsx |
| supplier-offer-editor | supplier: Предложение: композит A2 | manual create/edit; CORE-04 acceptance open | PARTIAL | Сохранить черновик | apps/supplier-web/app/features/supplier-workspace/supplier-offers.tsx |
| supplier-inventory | supplier: Остатки и актуальность | supplier:/ active=inventory | PARTIAL | Сохранить остаток | apps/supplier-web/app/features/supplier-workspace/supplier-inventory.tsx |
| supplier-imports | supplier: Загрузка товаров | supplier:/ active=integrations | PARTIAL | Загрузить прайс | apps/supplier-web/app/features/supplier-workspace/supplier-integrations.tsx |
| supplier-import-review | supplier: Проверка прайса | import batch → rows/matching | PARTIAL | Сопоставить строку | apps/supplier-web/app/features/supplier-workspace/supplier-integrations.tsx |
| supplier-connectors | supplier: Учётные системы | supplier integrations → connector onboarding | CONDITIONAL | Проверить подключение | apps/supplier-web/app/connector-onboarding.tsx |
| supplier-compliance | supplier: Документы поставщика | supplier:/ active=compliance | PARTIAL | Загрузить подтверждение | apps/supplier-web/app/features/supplier-workspace/supplier-compliance.tsx |
| supplier-agreement | supplier: Договор с DentMarket | supplier onboarding → marketplace agreement | CONDITIONAL | Открыть документ | apps/supplier-web/app/marketplace-agreement-panel.tsx |
| supplier-corrections | supplier: Исправления карточек | supplier offer → correction panel | PARTIAL | Отправить исправление | apps/supplier-web/app/product-corrections-panel.tsx |
| supplier-documents | supplier: Документы | supplier:/documents | PARTIAL | Загрузить документ | apps/supplier-web/app/documents/page.tsx |
| supplier-document-detail | supplier: Счёт № INV-0264 | supplier:/documents → detail dialog | PARTIAL | Скачать PDF | packages/ui/src/document-archive.tsx |
| supplier-promotions | supplier: Акции и продвижение | supplier:/ active=promotions; local go_live | CONDITIONAL | Создать акцию | apps/supplier-web/app/promotions-panel.tsx |
| supplier-trust | supplier: Отзывы и география | supplier:/ active=trust; local go_live | CONDITIONAL | Ответить на отзыв | apps/supplier-web/app/supplier-trust-panel.tsx |
| billing | supplier: Услуги платформы | billing backend exists; complete frontend not accepted | TARGET | Посмотреть условия | actual_docs/product/DENTMARKET_OUT_OF_PILOT_FEATURES.md |
| admin-overview | admin: Рабочая очередь | admin:/ active=overview or orders | PARTIAL | Разобрать обращение | apps/admin-web/app/operation-queue.tsx |
| admin-organizations | admin: Организации | admin:/ active=organizations | PARTIAL | Создать организацию | apps/admin-web/app/resource-lists.tsx |
| admin-organization-create | admin: Новая организация | admin organization quick-create dialog | PARTIAL | Создать организацию | apps/admin-web/app/organization-quick-create.tsx |
| admin-access | admin: Пользователи и права | admin:/ active=organizations/access | PARTIAL | Назначить роль | apps/admin-web/app/foundation-management.tsx |
| admin-catalog | admin: Мастер-карточки и варианты | admin:/ active=catalog | PARTIAL | Создать карточку | apps/admin-web/app/catalog-foundation.tsx |
| admin-taxonomy | admin: Атрибуты каталога | admin organizations → attributes/category rules | PARTIAL | Добавить атрибут | apps/admin-web/app/foundation-management.tsx |
| admin-catalog-quality | admin: Качество каталога | admin:/ active=catalog → quality | PARTIAL | Открыть проблемные карточки | apps/admin-web/app/catalog-quality.tsx |
| admin-corrections | admin: Проверка исправлений | admin:/ active=catalog → corrections | PARTIAL | Принять исправление | apps/admin-web/app/product-correction-queue.tsx |
| admin-imports | admin: Сопоставление товаров | admin:/ active=imports → review | PARTIAL | Подтвердить сопоставление | apps/admin-web/app/catalog-import-review.tsx |
| admin-supply | admin: Предложение и публикация | admin:/ active=imports → supplier operations | PARTIAL | Проверить готовность | apps/admin-web/app/supplier-operations.tsx |
| admin-lots | admin: Партии и резервы | admin imports → lots/reservations | PARTIAL | Открыть резерв | apps/admin-web/app/supplier-operations.tsx |
| admin-connectors | admin: Подключения и ошибки | admin:/ active=imports → integrations | CONDITIONAL | Открыть подключение | apps/admin-web/app/integration-operations.tsx |
| admin-connector-readiness | admin: Готовность коннекторов | admin imports → readiness registry | PARTIAL | Открыть проверку | apps/admin-web/app/connector-readiness-registry.tsx |
| admin-agreements | admin: Договоры с поставщиками | admin:/ active=orders → agreements | CONDITIONAL | Открыть договор | apps/admin-web/app/agreement-operations.tsx |
| admin-controls | admin: Допуск поставщиков | admin:/ active=access → controls | PARTIAL | Рассмотреть допуск | apps/admin-web/app/supplier-controls.tsx |
| admin-assurance | admin: Готовность и ограничения | admin:/ active=access → assurance | PARTIAL | Открыть проверку | apps/admin-web/app/platform-assurance.tsx |
| admin-trust | admin: Риски и апелляции | admin:/ active=security; trust enabled | CONDITIONAL | Рассмотреть обращение | apps/admin-web/app/trust-operations.tsx |
| admin-audit | admin: Журнал действий | admin:/ active=security → audit | PARTIAL | Применить фильтры | apps/admin-web/app/audit-operations.tsx |
| admin-settings | admin: Настройки платформы | admin:/ active=settings | PARTIAL | Обновить сведения | apps/admin-web/app/platform-settings.tsx |
| admin-metrics | admin: Операционные показатели | admin:/ overview → live metrics | PARTIAL | Обновить показатели | apps/admin-web/app/live-metrics.tsx |
| manual-payment | buyer: Подтверждение оплаты | CORE-02 proposal; not a live route | TARGET | Отправить на проверку | actual_docs/product/DENTMARKET_PRODUCT_V2.md |
| auth-login | auth: Вход в DentMarket | landing:/login; buyer:/login redirects | PARTIAL | Войти | apps/landing-web/app/login/page.tsx |
| auth-register | auth: Создать аккаунт | landing:/register?role=buyer / supplier | PARTIAL | Продолжить | apps/landing-web/app/register/page.tsx |
| auth-resume | auth: Продолжить регистрацию | landing:/register/resume | SCOPED_ACCEPTED | Продолжить | apps/landing-web/app/register/resume/page.tsx |
| auth-verify | auth: Подтверждение почты | landing:/verify-email | PARTIAL | Перейти ко входу | apps/landing-web/app/verify-email/page.tsx |
| auth-reset | auth: Восстановление доступа | landing:/reset-password | PARTIAL | Сохранить пароль | apps/landing-web/app/reset-password/page.tsx |
| auth-admin | auth: Вход оператора | admin:/login with MFA | SCOPED_ACCEPTED | Подтвердить вход | apps/admin-web/app/login/page.tsx |
| legal-terms | public: Условия использования | landing:/legal/terms | PARTIAL | Вернуться | apps/landing-web/app/legal/terms/page.tsx |
| legal-privacy | public: Конфиденциальность | landing:/legal/privacy | PARTIAL | Вернуться | apps/landing-web/app/legal/privacy/page.tsx |
| system-empty | buyer: Заказы клиники | shared empty/first use | PARTIAL | Открыть каталог | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| system-error | buyer: Не удалось загрузить документы | shared async error | PARTIAL | Повторить | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| system-forbidden | buyer: Недостаточно прав | shared403 | PARTIAL | Выбрать организацию | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| system-session | buyer: Войдите снова | expired session during work | PARTIAL | Войти | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| system-not-found | public: Страница не найдена | framework404; custom composition proposed | TARGET | Открыть каталог | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| system-loading | buyer: Документы | shared loading skeleton | PARTIAL | Сравнить состояния | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| components-controls | buyer: Компоненты · ввод и действия | component atlas; not app route | DESIGN | Сравнить состояния | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| components-overlays | buyer: Компоненты · раскрытые элементы | component atlas; modal/select/popover | DESIGN | Сравнить состояния | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| components-feedback | buyer: Компоненты · состояния | component atlas; not app route | DESIGN | Сравнить состояния | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |
| components-navigation | buyer: Компоненты · навигация | header/city/org/menu/table controls | DESIGN | Сравнить состояния | actual_docs/ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md |

## Полнота маршрутов

- apps/landing-web/app/register/resume/page.tsx
- apps/admin-web/app/login/page.tsx
- apps/admin-web/app/page.tsx
- apps/buyer-web/app/about/page.tsx
- apps/buyer-web/app/catalog/page.tsx
- apps/buyer-web/app/documents/page.tsx
- apps/buyer-web/app/login/page.tsx
- apps/buyer-web/app/page.tsx
- apps/buyer-web/app/products/[id]/page.tsx
- apps/buyer-web/app/suppliers/page.tsx
- apps/landing-web/app/legal/privacy/page.tsx
- apps/landing-web/app/legal/terms/page.tsx
- apps/landing-web/app/login/page.tsx
- apps/landing-web/app/page.tsx
- apps/landing-web/app/register/page.tsx
- apps/landing-web/app/reset-password/page.tsx
- apps/landing-web/app/verify-email/page.tsx
- apps/supplier-web/app/documents/page.tsx
- apps/supplier-web/app/page.tsx

Файлы `page 2.tsx` не являются Next route и не добавляют страницы. API route.ts не UI. Вкладки существующих root pages учтены отдельными surface IDs. Document detail/upload показаны как контекстный слой, не новый обязательный URL.

## Состояния и данные

Каждой поверхности назначены default/loading/empty/error/permission там, где применимо; переходы/drafts/conflicts описаны в DESIGN_SYSTEM и атласе. Не все комбинации равнозначны: public/legal не нуждаются в сохраняющем API. В галерее состояния прототипа явно synthetic.

## Не утверждённые поверхности

Manual payment CORE-02, account/team и billing full UI — PROPOSED/TARGET, не подтверждение реальных API. Auth compact shell ожидает ответа владельца; до решения отличается только представление в предложении. Связанный order fixture использует одного supplier, корзина с3suppliers — отдельный контекст.
