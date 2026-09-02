# Актуальная документация DentMarket KZ

`actual_docs` — единая папка проектной документации. Корневые `README.md` и
`AGENTS.md` остаются вне неё намеренно: первый является входной страницей
репозитория, второй должен автоматически обнаруживаться агентами и
разработчиками.

## Порядок источников правды

1. [Product V2](product/DENTMARKET_PRODUCT_V2.md) — целевой продукт, границы
   пилота и бизнес-правила.
2. [Backend Foundation V2](backend/DENTMARKET_BACKEND_FOUNDATION_V2.md) —
   техническая последовательность работ и backend Definition of Done.
3. [ADR](architecture/adr/) — принятые архитектурные решения.
4. Исполняемые schemas, OpenAPI и API client в коде.
5. [Acceptance matrix](governance/PROJECT_ACCEPTANCE_MATRIX.md) — статус и
   доказательства. Историческая запись не заменяет свежий запуск проверок.

Для любой задачи дополнительно обязательны корневой
[AGENTS.md](../AGENTS.md) и
[Development Workflow](governance/DEVELOPMENT_WORKFLOW.md). Для интерфейса
также обязателен [UI/UX Standard](ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md).

## Карта разделов

### `product/` — продукт и границы пилота

- [Product V2](product/DENTMARKET_PRODUCT_V2.md)

### `backend/` — backend foundation

- [Backend Foundation V2](backend/DENTMARKET_BACKEND_FOUNDATION_V2.md)

### `governance/` — правила разработки и доказательства

- [Development Workflow](governance/DEVELOPMENT_WORKFLOW.md)
- [Project Acceptance Matrix](governance/PROJECT_ACCEPTANCE_MATRIX.md)

### `ui-ux/` — единый стандарт интерфейсов

- [UI/UX Implementation Standard](ui-ux/UI_UX_IMPLEMENTATION_STANDARD.md)

### `architecture/` — система и ADR

- [Архитектура платформы](architecture/architecture.md)
- [ER-диаграмма](architecture/er.mmd)
- [ADR 001: modular monolith](architecture/adr/001-modular-monolith.md)
- [ADR 002: hybrid catalog](architecture/adr/002-hybrid-catalog.md)
- [ADR 003: access model](architecture/adr/003-access-model.md)
- [ADR 004: provider-independent integrations](architecture/adr/004-provider-independent-integrations.md)
- [ADR 005: transactional outbox delivery](architecture/adr/005-transactional-outbox-delivery.md)

### `product-cards/` — карточки товаров и каталог

- [Pilot catalog](product-cards/pilot-catalog.md)
- [Аудит и целевой стандарт изображений](product-cards/CATALOG_MEDIA_PIPELINE_AUDIT.md)

### `integrations/` — подключения поставщиков и runbooks

- [Connector readiness](integrations/connector-readiness.md)
- [ЭЦП НУЦ РК и 1С — техническая спецификация](integrations/eds-and-1c-integration-technical-spec.md)
- [Supabase](integrations/supabase.md)
- [Manual supplier](integrations/runbooks/manual-supplier.md)
- [File import](integrations/runbooks/file-import.md)
- [МойСклад](integrations/runbooks/moysklad.md)
- [1С Agent](integrations/runbooks/one-c-agent.md)
- [Custom API](integrations/runbooks/custom-api.md)
- [External adapters](integrations/runbooks/external-adapters.md)

### `operations/` — эксплуатация и production

- [Operations](operations/operations.md)
- [Production deployment](operations/production-deployment.md)
- [Production go-live checklist](operations/production-go-live-checklist.md)
- [SLA и incident response](operations/sla-incident-response.md)

### `security/` — безопасность

- [Security](security/security.md)

### `supplier-flows/` — отдельные сценарии поставщика

- [PDF supplier cycle](supplier-flows/pdf-supplier-cycle.md)

### `applications/` — локальные приложения

- [Buyer Web](applications/buyer-web.md)
- [Supplier Web](applications/supplier-web.md)

### `history/` — исторические материалы

- [Verification log](history/verification.md)
- [Legacy traceability matrix](history/traceability.md)
- [ТЗ v4 implementation status](history/v4-implementation-status.md)
- [Trust, Geo и AI](history/trust-geo-ai.md)
- [Commercial readiness gap](history/commercial-readiness-gap.md)

Файлы из `history/` сохраняются для аудита решений, но не расширяют Product V2
и не являются текущим backlog или доказательством готовности.
