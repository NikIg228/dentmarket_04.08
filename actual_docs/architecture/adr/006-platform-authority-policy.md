# ADR 006: Platform authority поверх tenant RBAC

## Статус

Принято.

## Контекст

RBAC организации отвечает на вопрос, какие действия участник может выполнять
внутри активной организации. Некоторые ресурсы DentMarket при этом являются
общими для всей платформы: canonical catalog, операторские очереди и системные
роли. Наличие permission в tenant-роли само по себе не должно давать право
изменять или читать такие ресурсы.

До этого решения поставщик мог получить `catalog.product.create`, tenant-admin
мог создать роль с произвольным permission или назначить глобальную роль, а
роль AI выбиралась клиентом. Эти пути позволяли пересечь границу между tenant
и platform authority.

## Решение

В modular monolith вводится единая `PlatformAuthorityPolicy` со следующими
инвариантами:

1. Platform-операция разрешена только активному участнику активной организации
   с capability `MARKETPLACE_OPERATOR`.
2. Запись в canonical catalog, включая варианты, атрибуты и упаковки, является
   platform-операцией. Поставщик создаёт или импортирует `ProductCandidate`, а
   canonical product появляется после операторской модерации.
3. AI-роли `BUYER` и `SUPPLIER` доступны только организациям с соответствующей
   capability. Роли `OPERATOR` и `SUPPORT` доступны только
   `MARKETPLACE_OPERATOR`. Проверка выполняется при создании диалога и повторно
   перед чтением/выполнением сохранённого диалога.
4. Tenant-admin может создать роль только с подмножеством собственных
   effective permissions. Назначать напрямую или через приглашение можно
   только роли своей организации, права которых также не превышают права
   актёра. Effective permissions вычисляются только из ролей активной
   организации; legacy global/foreign assignments игнорируются. При принятии
   сохранённого приглашения ownership всех ролей повторно проверяется перед
   транзакцией. Глобальные роли не входят в tenant role management.
5. Отказ происходит до доменной записи, audit/outbox effect или AI tool
   execution и возвращается как безопасный `403 Forbidden`.

Policy является общей серверной границей и вызывается из domain services.
Controller permissions остаются первым, но не единственным уровнем проверки.

## Последствия

- Уже выданный tenant permission не обходит platform authority.
- Новые supplier owner роли больше не получают `catalog.product.create`.
- Публичные HTTP DTO и Prisma schema не меняются; migration не требуется.
- Добавляется отдельная PostgreSQL/API regression-проверка отказов и
  сохранения легитимного operator flow.
- Новые platform-wide операции обязаны использовать эту policy либо отдельное
  ADR с эквивалентной deny-by-default границей.
