# ADR 007: единый outbound request gateway

## Статус

Принято.

## Контекст

Интеграции поставщика выполняются background worker с серверными правами и
сохранёнными credentials. Для `CUSTOM_API` tenant задаёт `configuration.baseUrl`,
а старый адаптер передавал этот URL непосредственно в `fetch`. Проверка только
схемы `https://` не запрещала loopback, private/link-local адреса, cloud metadata,
DNS rebinding, небезопасные порты и redirect на другой origin. Ответ worker
сохранялся в результате integration job, поэтому SSRF мог стать каналом чтения.

Провайдер `MOYSKLAD` также принимал tenant-controlled override официального API
host, хотя для managed connector это не является допустимой конфигурацией.

## Решение

В `SecurityModule` вводится единый `OutboundRequestGateway` со следующими
инвариантами:

1. Разрешён только HTTPS без URL credentials и только порт 443.
2. Все A/AAAA ответы проверяются до соединения. Если хотя бы один адрес не
   является публичным, запрос отклоняется.
3. Соединение закрепляется за уже проверенным IP через custom DNS lookup, а TLS
   продолжает проверять исходный hostname. Это закрывает смену адреса между
   validation и connect.
4. Redirect разрешён только внутри того же origin, повторно проходит DNS/IP
   policy на каждом hop и запрещён для write-операций. Максимум — три redirect.
5. Общий deadline ограничен 60 секундами, ответ — 4 MiB; integration adapters
   используют 2 MiB. Сжатые ответы не принимаются, чтобы limit применялся к
   фактически полученным байтам без decompression ambiguity.
6. Transport headers (`Host`, `Content-Length`, `Transfer-Encoding`, proxy и
   connection headers) не могут быть переопределены вызывающим кодом.
7. Низкоуровневые DNS/socket ошибки нормализуются и не попадают в job result или
   tenant-visible error. Policy и response-limit ошибки являются permanent,
   timeout и network failures — retryable.
8. `MOYSKLAD` всегда использует `https://api.moysklad.ru/api/remap/1.2` и exact
   host allowlist. `CUSTOM_API` сохраняет возможность tenant-selected public
   endpoint, но только через gateway.

Прямой `fetch` в этих production adapters запрещён отдельным CI gate
`pnpm verify:outbound-security`.

## Последствия

- Исходный integration SSRF source-to-sink path отклоняется до сетевого ответа.
- Public Custom API остаётся доступным, но private/VPN/on-prem endpoint на текущем
  пилотном этапе не поддерживается. Для него потребуется отдельная архитектура
  agent/relay с аутентифицированным egress, а не ослабление gateway.
- Provider connector не может быть перенаправлен tenant-конфигурацией.
- Gateway является общей серверной границей и может быть повторно использован
  при исправлении notification webhook SSRF, но эта отдельная Medium-задача не
  считается закрытой данным ADR.
- Публичный HTTP API и Prisma schema не меняются; migration не требуется.
