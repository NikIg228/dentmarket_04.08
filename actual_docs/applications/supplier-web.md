# Supplier web

Рабочий кабинет поставщика: offers/prices, inventory/lots, supplier orders, integrations, compliance, documents и payment profile.

```bash
npm run dev:supplier
```

Demo selector содержит пять поставщиков из dentistry seed.

## Загрузка рабочих разделов

Корневой экран не запрашивает весь кабинет сразу. `app/supplier-section-data.ts`
загружает только данные активного раздела:

- dashboard — семь наборов данных для метрик и приоритетов;
- offers и orders — по одному набору;
- inventory, compliance и documents — по два набора;
- integrations — четыре набора;
- promotions и trust загружают данные внутри собственных панелей и не создают
  корневых запросов.

Dashboard остаётся в initial JavaScript. Остальные рабочие разделы подключаются
через `next/dynamic` после выбора пользователем. Все Fluent icons импортируются
из family subpath, а не из root barrel.

Production build автоматически запускает `scripts/verify-supplier-bundle.mjs`.
Для маршрута `/` закреплены пределы: не более 20 initial JS-файлов,
1 250 000 raw bytes и 380 000 gzip bytes. Контракт загрузки разделов и запрет
root icon barrel покрыты тестами в `app/supplier-section-data.test.ts` и
`app/performance-boundaries.test.ts`.
