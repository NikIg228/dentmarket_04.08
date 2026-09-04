# Admin web

Операторский кабинет DentMarket: обзор платформы, организации и доступ,
канонический каталог, импорт поставщиков, заказы и договоры, контроль доверия и
настройки пилота.

```bash
npm run dev:admin
```

В общем локальном окружении используйте `npm run dev` и открывайте
`http://admin.localhost:3080`. Gateway также проксирует `/api` в core API.

## Граница загрузки разделов

Маршрут `/` синхронно подключает только оболочку и содержимое стартового
overview: `LiveMetrics` и `OperationQueue`. Остальные 16 операторских панелей
объявлены через `next/dynamic` в `app/admin-section-components.tsx` и загружаются
после выбора соответствующего раздела. У каждой ленивой панели есть общий
loading state из `packages/ui`.

Fluent icons импортируются из family subpath, а не из root barrel. Это правило и
список динамических границ проверяет `app/performance-boundaries.test.ts`.

Production build автоматически запускает `scripts/verify-admin-bundle.mjs`.
Для `/` закреплены пределы: не более 20 initial JS-файлов, 1 050 000 raw bytes и
330 000 gzip bytes.

Контрольное измерение 2026-09-04:

- до разделения: 26 JS-файлов, 1 071 814 raw / 314 041 gzip bytes;
- после разделения: 16 JS-файлов, 937 674 raw / 281 851 gzip bytes;
- route page chunk: 151 336 → 17 676 raw bytes.

Production browser smoke подтвердил overview с реальными метриками и очередью,
а переход в «Организации» отдельно догрузил три JS-chunk и данные этого раздела;
ошибок и предупреждений в console не было.
