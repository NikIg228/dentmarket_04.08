# Live provider and infrastructure readiness

## Назначение

Этот runbook отделяет три разных уровня доказательства production-готовности:

1. **Configuration ready** — обязательные секреты и HTTPS/TLS endpoints заданы,
   placeholders отсутствуют, production runtime fail-closed.
2. **Reachability verified** — DentMarket из deployment-контура получил успешный
   ответ от выделенных health endpoints PSP, ЭЦП, email и SMS.
3. **Live evidence complete** — на одной immutable revision реально прошли
   бизнес-циклы, supplier sync и инфраструктурные drills с внешними receipts и
   четырьмя approvals.

Успешный health check не равен capture/refund, подписанию, доставке сообщения или
восстановлению данных. Скрипты не повышают connector до `LIVE_VERIFIED`
автоматически и не изменяют БД.

## Текущий статус

- [x] Production environment fail-closed требует PSP webhook secret,
      аутентифицированный ЭЦП gateway, email/SMS и TLS для PostgreSQL/Redis.
- [x] Configuration и reachability preflight не выводит секреты, запрещает
      redirect и привязывает bearer token к origin business endpoint.
- [x] Машинный evidence contract проверяет 20 сценариев, четыре approvals,
      freshness и полное совпадение immutable git SHA.
- [ ] PSP sandbox capture/refund/webhook реально выполнены.
- [ ] Квалифицированная ЭЦП и legal sign-off реально выполнены.
- [ ] Один supplier connector реально прошёл sync/export cycle.
- [ ] Email и SMS имеют provider delivery receipts.
- [ ] Managed infrastructure, failover, restore, alert и staging soak имеют
      внешние receipts.

## Локально проверяемый контракт

```powershell
npm run build
npm run verify:production-config
npm run verify:production-readiness-contract
```

Production `go_live` требует:

- PostgreSQL URL с `sslmode=require`, `verify-ca` или `verify-full`;
- Redis только через `rediss://`;
- S3-compatible private storage с credentials и server-side encryption;
- внешний PSP, bearer token и отдельный `PAYMENT_WEBHOOK_SECRET_EXTERNAL`;
- внешний ЭЦП gateway, bearer token и отдельный callback secret;
- отдельные HTTPS endpoints и tokens для email и SMS;
- Sentry, OTLP и независимый metrics token.

## Configuration preflight

В deployment shell загрузите секреты из secret manager, затем выполните:

```powershell
$env:NODE_ENV="production"
npm run verify:production-connectors
```

Команда выводит только названия checks и причины отказа, не значения секретов.
Она завершается с ненулевым кодом при отсутствующем, коротком, placeholder или
небезопасном значении. Supplier credentials не дублируются в environment: они
хранятся в зашифрованной `IntegrationConnection` и доказываются job/evidence
циклом ниже.

## Reachability preflight

Провайдер должен предоставить безопасный `GET` health endpoint, который не
создаёт платёж, подпись или сообщение. Не следует автоматически добавлять
`/health` к business URL: путь задаётся явно.

```powershell
$env:SIGNATURE_GATEWAY_HEALTHCHECK_URL="https://..."
$env:PAYMENT_GATEWAY_HEALTHCHECK_URL="https://..."
$env:EMAIL_PROVIDER_HEALTHCHECK_URL="https://..."
$env:SMS_PROVIDER_HEALTHCHECK_URL="https://..."
$env:CHECK_EXTERNAL_CONNECTORS="1"
npm run verify:production-connectors
```

Probe использует пятисекундный timeout, запрещает redirects и передаёт тот же
bearer token только health endpoint с тем же origin, что и business endpoint
соответствующего провайдера. Результат называется только
`reachabilityVerified`; поле `liveVerified` намеренно остаётся `false`.

## Обязательные реальные сценарии

### PSP

- capture тестового платежа в sandbox;
- refund того же allocation/transaction;
- подписанный webhook с корректным timestamp, idempotent repeat и связанной
  внутренней транзакцией.

### ЭЦП и legal

- создание внешней EDS/EGOV_QR session для реального тестового сертификата;
- подписанный callback, checksum и signer/organization binding;
- отдельное заключение юриста по шаблонам, полномочиям подписантов и допустимому
  способу подписи. Технический callback не заменяет legal sign-off.

### Supplier connector

Для одного реального `MOYSKLAD` или `CUSTOM_API` connection нужны успешные и
свежие `TEST_CONNECTION`, catalog, price, stock и `ORDER_EXPORT` jobs. Нужно
проверить mapping, reconciliation, idempotent повтор и отсутствие cross-tenant
доступа. Остальные пилотные поставщики могут оставаться на утверждённом
CSV/manual flow.

### Email и SMS

- доставка на контролируемые адрес и номер;
- provider message ID/receipt;
- отсутствие секретов и PII в логах;
- retry/dead-letter наблюдаемость для временной ошибки.

### Infrastructure

- managed PostgreSQL PITR restore;
- Redis HA failover во время multi-instance нагрузки;
- object-storage versioning/retention и восстановление объекта;
- DNS/TLS проверка публичных доменов;
- доставка synthetic alert дежурному;
- timed backup/restore drill;
- длительный staging soak B4.6 на representative hardware.

## Evidence gate

Скопируйте `live-evidence.template.json` за пределы git-tracked source, заполните
только ссылками на CI runs, provider receipts, change tickets и юридические
заключения. Секреты, токены, сертификаты, персональные данные и полные provider
payloads в evidence-файл не помещаются.

```powershell
$env:LIVE_EVIDENCE_FILE="C:\secure-evidence\dentmarket-live.json"
$env:LIVE_EVIDENCE_MAX_AGE_DAYS="30"
npm run verify:live-evidence
```

Gate требует 20 passed checks, approvals engineering/security/product
operations/legal после evidence window, свежий временной интервал и полное совпадение git SHA с
текущим checkout. Валидный формат не освобождает reviewers от проверки внешних
references.

## Stop criteria

- любой обязательный configuration/reachability/evidence check красный;
- revision deployment и evidence manifest различаются;
- provider требует небезопасный HTTP или незадокументированный redirect;
- PSP webhook, EDS callback или supplier job не идемпотентен;
- secret/PII попал в лог или evidence;
- Redis failover, PITR/restore либо staging soak нарушает SLO или целостность;
- отсутствует legal approval для ЭЦП/договорных шаблонов.

До устранения причины production остаётся `NO-GO`; controlled demo использует
зафиксированные manual/mock fallbacks из Product V2 и не выдаётся за live.
