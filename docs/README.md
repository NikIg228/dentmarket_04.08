# Документация DentMarket KZ

Этот индекс отделяет целевые правила работы от исторических отчётов. Начинайте
новую задачу с документов в разделе «Управление разработкой».

## Управление разработкой

- [Правила агентов и разработчиков](../AGENTS.md) — обязательный маршрут
  изменения кода, данных и контрактов.
- [Workflow разработки](DEVELOPMENT_WORKFLOW.md) — шаблон задачи, матрица
  проверок и правила коммита.
- [Стандарт UI/UX](UI_UX_IMPLEMENTATION_STANDARD.md) — единые правила для
  кабинетов и публичных страниц.
- [Product V2](../DENTMARKET_PRODUCT_V2.md) — целевой scope и бизнес-правила.
- [Backend Foundation V2](../DENTMARKET_BACKEND_FOUNDATION_V2.md) — план
  технической реализации и backend DoD.
- [Acceptance matrix](../PROJECT_ACCEPTANCE_MATRIX.md) — доказательства
  готовности. Проверяйте дату и не считайте исторические записи текущим CI.

## Архитектура и эксплуатация

- [Архитектура](architecture.md)
- [Операции](operations.md)
- [Безопасность](security.md)
- [Production deployment](production-deployment.md)
- [ADR](adr/)

## Данные, каталог и интеграции

- [Pilot catalog](pilot-catalog.md)
- [Connector readiness](connector-readiness.md)
- [Runbooks](runbooks/)
- [Traceability](traceability.md)

## Исторические документы

- [Verification log](verification.md) содержит журнал прошлых запусков, а не
  доказательство текущего состояния ветки.
- `v4-implementation-status.md`, `trust-geo-ai.md` и коммерческие readiness
  материалы могут описывать возможности вне границы Product V2. При конфликте
  приоритет у Product V2.
