# Buyer web

Рабочий кабинет стоматологической клиники: PostgreSQL FTS search, offer comparison, cart, split checkout, supplier orders, documents и notifications.

```bash
npm run dev:buyer
```

По умолчанию использует `http://127.0.0.1:4012/api` и demo buyer `00000000-0000-4000-8000-000000000030`.

Публичный каталог загружает по 24 товара через внутренний BFF-маршрут
`GET /catalog-search`. Товары, цены, наличие и предложения остаются
авторитетными данными core API; если у живой карточки ещё нет `READY` media,
BFF дополняет только фото из локального media-manifest по точному совпадению
товара. При недоступности API `GET /catalog-fallback` отдаёт такой же
ограниченный результат из локального снимка. JSON-файлы и media-manifest
остаются на серверной стороне и не входят в начальный браузерный bundle.

`npm run build --workspace=@marketplace/buyer-web` после Next build
автоматически проверяет budget initial JavaScript скриптом
`scripts/verify-buyer-bundle.mjs`.
