# ADR 008: production transport policy для privileged outbound endpoints

## Статус

Принято.

## Контекст

ADR 007 защищает tenant-controlled integration и webhook destinations через
`OutboundRequestGateway`: DNS/IP policy, HTTPS/443, redirect policy, deadline и
response-size limit. При этом несколько privileged endpoints задаются только
оператором deployment и используются специализированными SDK/adapters. Общая
`z.string().url()` проверяла синтаксис, но принимала `http://`, поэтому ошибочная
production-конфигурация могла отправить bearer token, service-role key,
подписанный cloud request, reset token или telemetry по незашифрованному каналу.

## Решение

1. `environment()` является общей fail-fast границей до запуска API/worker.
2. В production только `https:` разрешён для `OPENAI_BASE_URL`, `SUPABASE_URL`,
   `S3_ENDPOINT`, `SIGNATURE_GATEWAY_URL`, `PAYMENT_GATEWAY_URL`,
   `EMAIL_PROVIDER_URL`, `AUTH_EMAIL_BASE_URL`, `SMS_PROVIDER_URL`,
   `OTEL_EXPORTER_OTLP_ENDPOINT` и `SENTRY_DSN`, если значение задано.
3. Development/test сохраняют явные HTTP endpoints для localhost и локальных
   эмуляторов.
4. Internal cleartext HTTP не считается mTLS и не получает исключение. Private,
   VPN или on-prem egress потребует отдельного ADR с аутентифицированным relay
   или доказанным TLS boundary; ADR 007 не ослабляется.
5. Tenant-controlled destinations по-прежнему обязаны использовать
   `OutboundRequestGateway`. Production HTTPS validation не заменяет SSRF/DNS,
   redirect, timeout или response-size controls.
6. PostgreSQL TLS и Redis `rediss:` остаются отдельными infrastructure gates и
   проверяются deployment configuration/provider evidence.

## Последствия

- Небезопасная production-конфигурация отклоняется до первого outbound request.
- Локальная разработка с MinIO, локальным приложением и test providers не
  ломается.
- `verify:production-config` проверяет каждый перечисленный URL отрицательным
  HTTP case и положительным HTTPS case.
- `verify:outbound-security` хранит явный inventory credential-bearing adapters
  и не позволяет незаметно удалить endpoint из общей transport policy.
