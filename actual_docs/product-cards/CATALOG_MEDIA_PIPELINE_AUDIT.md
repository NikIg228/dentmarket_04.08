# Каталог: аудит и целевой стандарт изображений

**Статус:** технический аудит и отложенный implementation brief
**Дата снимка:** 2026-08-18
**Область:** изображения товарных карточек Buyer Web, `ProductMedia`, локальное
хранилище и пилотный каталог на 500 карточек.

## 1. Цель документа

Зафиксировать, как изображения товаров собираются, нормализуются, хранятся и
отображаются сейчас, а также определить целевой media pipeline для следующего
этапа разработки. Документ не подтверждает права публикации изображений и не
объявляет текущий pipeline production-ready.

Изменение продуктовых правил выполняется через
`../product/DENTMARKET_PRODUCT_V2.md`, а
архитектурное решение о едином владельце media-данных при необходимости должно
быть оформлено отдельным ADR.

## 2. Краткий вывод

В проекте уже есть правильная техническая основа: загрузка изображений,
фильтрация очевидных нецелевых assets, `Sharp`, квадратный холст 1200×1200,
`fit: contain`, WebP и сохранение локальной копии. Buyer Web также использует
`object-fit: contain`, поэтому товарные фотографии в основных карточках не
обрезаются.

Однако pipeline не является единым и воспроизводимым:

- основной нормализатор жёстко связан со старым Supabase-проектом;
- он отсутствует в стандартных `package.json` командах и CI;
- PostgreSQL и JSON manifest имеют разные media-состояния;
- текущие 500 `ProductMedia` в локальной БД имеют статус `PENDING`;
- существующий фильтр пропускает `exactProductPhoto: true`, даже если запись
  остаётся `PENDING` и не имеет `normalizedStorageKey`;
- отсутствует автоматическая проверка резкости, занимаемой площади, водяных
  знаков, соответствия варианту и визуальной понятности товара;
- права большинства supplier-изображений не подтверждены.

Следовательно, существующий код следует использовать как основу, но до
публичного пилота его необходимо объединить в один локально воспроизводимый
pipeline с проверяемым Definition of Done.

## 3. Текущая цепочка данных

```text
Страница поставщика / официальный каталог производителя
                         |
                         v
CSV и нормализованный полный каталог
                         |
                         v
public-catalog-full.json + public-catalog-media-full.json
                         |
                         v
Отбор пилотных 500 карточек
                         |
             +-----------+-----------+
             |                       |
             v                       v
public-catalog-media.json   buyer-web/public/catalog/products
             |                       |
             +-----------+-----------+
                         |
                         v
             Публичный fallback Buyer Web
                         |
                         v
       sync-public-catalog-to-production.mjs
                         |
                         v
             PostgreSQL ProductMedia
                         |
                         v
           Search API и защищённая выдача
```

Во время публичного просмотра Buyer Web может использовать встроенный JSON и
локальные файлы. При успешном запросе к API каталог загружается из PostgreSQL.
API возвращает только записи `ProductMedia` со статусом `READY`.

## 4. Подтверждённый снимок текущего состояния

Показатели ниже проверены по текущему manifest, локальным файлам и локальному
PostgreSQL на дату документа. Они могут измениться после повторной сборки
каталога.

| Показатель | Текущее значение |
| --- | ---: |
| Пилотные карточки | 500 |
| Карточки с соответствием media manifest | 500 |
| Уникальные записи активного media manifest | 429 |
| Локальные файлы в `buyer-web/public/catalog` | 437 |
| Общий размер локальных файлов | 37 951 834 байта |
| Квадратные изображения 1200×1200 | 393 |
| Неквадратные изображения | 36 |
| Изображения с шириной или высотой меньше 800 | 18 |
| Минимальная найденная высота | 357 px при ширине 1200 px |
| `ProductMedia` в локальном PostgreSQL | 500 |
| `ProductMedia READY` в локальном PostgreSQL | 0 |
| `ProductMedia PENDING` в локальном PostgreSQL | 500 |

Разница между 500 карточками и 429 manifest entries возникает из-за повторного
использования отдельных source-page/media записей. Политика пилотного отбора
ограничивает повторное использование одного изображения тремя карточками.

## 5. Имеющиеся скрипты и их ответственность

### 5.1 `scripts/normalize-catalog-images.mjs`

Основной supplier-image normalizer:

- получает Product и ProductMedia через Supabase REST;
- ищет source page в `externalMetadata`;
- анализирует `og:image`, `twitter:image` и теги `<img>`;
- исключает URL с признаками logo, favicon, icon, sprite, banner, placeholder;
- исключает SVG и GIF;
- отклоняет ответы меньше 2 000 байт;
- выполняет EXIF-aware поворот;
- создаёт WebP 1200×1200 через `fit: contain`;
- добавляет фон `#F7F8FA`;
- использует WebP quality 86 и effort 4;
- сохраняет файл в `apps/buyer-web/public/catalog/products` и
  `.local-storage/catalog/products`;
- записывает provenance metadata и переводит media в `READY`.

Ограничения:

- жёсткая связь с конкретным Supabase REST endpoint и service-role lookup;
- отсутствует штатная root-команда запуска;
- выбор кандидата основан на HTML-эвристиках, а не на анализе изображения;
- обрабатываются только media, где `metadata.exactProductPhoto !== true`;
- текущие `PENDING + exactProductPhoto: true` записи не попадают в очередь;
- отсутствует dry-run manifest и локальный PostgreSQL mode;
- нет повторяемого quality report и CI gate.

### 5.2 `scripts/publish-manufacturer-model-media.mjs`

Обрабатывает вручную подготовленный список официальных manufacturer assets:

- валидирует URL и исключает очевидные нецелевые assets;
- загружает исходник;
- сохраняет пропорции;
- уменьшает изображение до границы 1200×1200 через FFmpeg;
- сохраняет PNG и обновляет public manifest;
- фиксирует source page, source image и rights status.

Скрипт не добавляет квадратный холст. Поэтому официальные изображения могут
оставаться, например, 1200×357. Они не обрезаются в UI, но длинный товар может
занимать слишком малую высоту в квадратной миниатюре.

Кроме того, скрипт использует `sips`, что делает его платформенно зависимым и
неподходящим для воспроизводимого Linux/Windows CI без доработки.

### 5.3 `scripts/build-public-media-manifest.mjs`

Выгружает готовые `ProductMedia` из Supabase, оставляет только `READY`,
`exactProductPhoto: true` и существующие локальные файлы, затем строит полный
media manifest.

### 5.4 `scripts/build-pilot-catalog.mjs`

Формирует активный пилотный срез. Карточка допускается только при наличии
точного локального media, достаточного описания и варианта товара. Также
ограничивается повторное использование одного asset.

### 5.5 `scripts/sync-public-catalog-to-production.mjs`

Синхронизирует JSON-каталог с PostgreSQL. Если у существующей записи нет
`normalizedStorageKey`, media получает `PENDING`; новая media-запись также
создаётся как `PENDING`. Сам локальный файл при этом не импортируется в
ObjectStorage и не становится защищённым API asset.

### 5.6 `scripts/prune-pilot-media.mjs`

Проверяет отсутствующие ссылки manifest и удаляет только неиспользуемые
локальные файлы. По умолчанию работает в dry-run; удаление требует `--apply`.

Этот скрипт отвечает за очистку, но не за качество изображения.

## 6. Отображение в Buyer Web

Основные товарные поверхности используют безопасную геометрию:

- список товаров: фиксированный контейнер 128×128;
- изображение: `width: 100%`, `height: 100%`, `object-fit: contain`;
- внутренний отступ: 5 px;
- фон: `#F7F8FA`;
- модальная карточка: квадратный media block и `object-fit: contain`;
- deal cards также используют `object-fit: contain`.

`object-fit: cover` используется для декоративных плиток категорий, а не для
основной фотографии товара.

Текущее правило предотвращает обрезку, но не гарантирует визуальную
различимость. Узкий длинный объект внутри квадратного thumbnail неизбежно
занимает небольшую высоту. Для таких товаров нужен либо подготовленный
квадратный master с безопасным crop/trim пустого пространства, либо отдельная
адаптивная композиция thumbnail.

## 7. Сильные стороны текущего решения

- сохранение исходного source page и source image;
- исключение очевидных логотипов и placeholders;
- запрет на случайное растягивание изображения;
- `contain` вместо destructive crop;
- единый размер supplier-generated masters 1200×1200;
- WebP-компрессия приемлемого качества;
- локальные копии не зависят от доступности сайта поставщика;
- media manifest отделён от продуктовых данных;
- пилотный отбор требует точное локальное фото;
- UI имеет понятное состояние «Фото добавляем», если media отсутствует.

## 8. Критические разрывы

### M-01. Два источника правды

JSON manifest содержит рабочие локальные изображения, а PostgreSQL содержит
500 `PENDING` записей. Успешный live API может вернуть карточку без изображения,
хотя public fallback показывает её с фото.

### M-02. Невыполнимая очередь нормализатора

Запись может одновременно иметь `PENDING` и `exactProductPhoto: true`.
Нормализатор исключает такую запись по metadata и не исправляет её.

### M-03. Нет content-aware QA

Не проверяются:

- доля товара в кадре;
- резкость и pixelation;
- чрезмерные пустые поля;
- водяные знаки и рекламный текст;
- соответствие изображения названию и варианту;
- наличие нескольких товаров или коллажа;
- фон, контраст и различимость на thumbnail;
- perceptual duplicates.

### M-04. Источник изображения выбирается эвристически

Первый допустимый HTML candidate может быть качественным технически, но не
обязательно соответствовать конкретному товару или REF.

### M-05. Неквадратные manufacturer assets

36 активных assets не квадратные; для 18 хотя бы одно измерение меньше 800.
Обрезки нет, но длинные объекты отображаются мелко в квадратной карточке.

### M-06. Нет единого storage workflow

Скрипт обновляет старый Supabase, локальный runtime использует local storage или
MinIO/S3, а JSON-синхронизация не переносит файл в ObjectStorage.

### M-07. Неподтверждённые права

Supplier media в основном маркируется `SOURCE_UNVERIFIED`. Техническое наличие
файла не даёт права публичного коммерческого использования.

### M-08. Нет автоматического доказательства качества

В CI отсутствуют команды, проверяющие manifest, размеры, file integrity,
дубликаты, БД-статусы и фактическое отображение в Buyer Web.

## 9. Целевой стандарт media master

### 9.1 Формат

- основной master: 1200×1200 px;
- формат: WebP, sRGB;
- quality: 84–88;
- фон: прозрачный, белый или `#F7F8FA` согласно source asset;
- destructive crop товара запрещён;
- EXIF orientation применяется до анализа;
- исходный файл сохраняется отдельно и неизменно;
- для UI генерируются производные размеры 320, 640 и 1200 px.

### 9.2 Композиция

- товар полностью находится в кадре;
- безопасный отступ от границы 6–10%;
- удаляются только подтверждённые однотонные или прозрачные внешние поля;
- длинные товары получают отдельную thumbnail-композицию без изменения master;
- запрещено увеличивать маленький исходник и объявлять его high quality;
- фотография конкретного варианта должна быть связана с `ProductVariant`, если
  внешний вид варианта существенно отличается.

### 9.3 Минимальные проверки

- декодирование без ошибок;
- допустимый MIME и расширение;
- размер исходника не меньше принятого порога либо `REVIEW_REQUIRED`;
- отсутствие экстремального blur;
- проверка aspect ratio и занимаемой площади;
- perceptual hash для поиска дублей;
- запрет logo/placeholder/banner patterns;
- source page и source image обязательны;
- checksum обязательна;
- rights status обязательный и не скрывается;
- визуальный thumbnail smoke на desktop и mobile.

### 9.4 Статусы

```text
PENDING -> PROCESSING -> READY
                     -> REVIEW_REQUIRED
                     -> REJECTED
```

`READY` означает, что файл существует в активном ObjectStorage, прошёл
технические проверки и может быть отдан API. Подтверждение прав следует хранить
отдельно; `READY` не должно автоматически означать legal clearance.

## 10. Целевая архитектура

1. Единый adapter читает задания из локального PostgreSQL.
2. Source downloader сохраняет immutable original и checksum.
3. Normalizer на Sharp создаёт master и derivatives.
4. Quality analyzer рассчитывает resolution, blur, whitespace, occupancy,
   aspect ratio и perceptual hash.
5. Policy engine выбирает `READY`, `REVIEW_REQUIRED` или `REJECTED`.
6. Storage adapter пишет в local storage, MinIO/S3 или Supabase без изменения
   доменной логики.
7. `ProductMedia.normalizedStorageKey` записывается только после успешной
   фиксации файла.
8. API возвращает только `READY`; Buyer Web показывает управляемый fallback для
   остальных статусов.
9. Verification script сравнивает БД, manifest и физические assets.

## 11. Отложенный implementation checklist

### Этап 1. Единый локальный pipeline

- [ ] Удалить hard-coded Supabase project из normalizer.
- [ ] Добавить PostgreSQL repository и общий ObjectStorage adapter.
- [ ] Обрабатывать `PENDING` независимо от `exactProductPhoto`.
- [ ] Разделить `exactProductPhoto` и технический processing status.
- [ ] Добавить root-команду `pnpm catalog:normalize-media`.
- [ ] Обеспечить идемпотентный повторный запуск.

### Этап 2. Нормализация и QA

- [ ] Сохранять immutable original и SHA-256.
- [ ] Реализовать safe trim и квадратный master с отступом.
- [ ] Генерировать WebP derivatives 320/640/1200.
- [ ] Добавить resolution, blur, whitespace и occupancy checks.
- [ ] Добавить perceptual duplicate detection.
- [ ] Добавить `REVIEW_REQUIRED` с машиночитаемыми reason codes.
- [ ] Исправить manufacturer pipeline без зависимости от `sips`.

### Этап 3. Согласование данных

- [ ] Импортировать существующие локальные assets в активный ObjectStorage.
- [ ] Заполнить `normalizedStorageKey`, MIME, размеры и checksum.
- [ ] Переводить в `READY` только реально существующие и проверенные файлы.
- [ ] Устранить расхождение JSON manifest и PostgreSQL.
- [ ] Определить ADR: PostgreSQL + ObjectStorage как основной источник правды.

### Этап 4. UI и операционный контроль

- [ ] Проверить 500 карточек в 128×128, modal и mobile layouts.
- [ ] Ввести отдельный thumbnail для экстремально длинных товаров.
- [ ] Добавить операторскую очередь media review.
- [ ] Показывать понятный placeholder без layout shift.
- [ ] Зафиксировать policy подтверждения прав использования.

### Этап 5. Проверки

- [ ] Добавить `pnpm verify:catalog-media`.
- [ ] Проверять отсутствующие файлы и dangling DB records.
- [ ] Проверять dimensions, MIME, checksum и READY invariants.
- [ ] Проверять duplicate threshold и quality reason codes.
- [ ] Добавить Playwright visual smoke товарной карточки.
- [ ] Включить media gate в release verification.

## 12. Definition of Done будущей реализации

- 100% пилотных карточек имеют существующий media asset или явно утверждённый
  нейтральный placeholder;
- 100% `READY` записей имеют существующий storage object, checksum, MIME,
  width, height, source и provenance;
- ни одна `PENDING` запись не выдаётся live API как готовое изображение;
- товар не обрезается в list, modal и mobile представлениях;
- автоматические проверки выявляют blur, малое разрешение, экстремальные поля и
  дубликаты;
- сомнительные assets попадают в `REVIEW_REQUIRED`, а не публикуются молча;
- PostgreSQL/ObjectStorage и fallback manifest не расходятся;
- права использования либо подтверждены, либо asset не используется в
  публичной коммерческой публикации;
- фактически проходят `pnpm typecheck`, `pnpm test`,
  `pnpm verify:catalog-media`, Buyer Web build, Playwright media smoke и
  `git diff --check`.

## 13. Что не входит в текущую задачу

Этот документ не изменяет скрипты, PostgreSQL, media files, UI или статусы
`ProductMedia`. Все пункты реализации остаются незакрытыми до отдельной задачи
с тестами и фактическими verification results.

## 14. Связанные файлы

- `scripts/normalize-catalog-images.mjs`
- `scripts/publish-manufacturer-model-media.mjs`
- `scripts/build-public-media-manifest.mjs`
- `scripts/build-pilot-catalog.mjs`
- `scripts/sync-public-catalog-to-production.mjs`
- `scripts/prune-pilot-media.mjs`
- `apps/buyer-web/app/data/public-catalog-media.json`
- `apps/buyer-web/public/catalog/products/`
- `apps/buyer-web/app/page.tsx`
- `apps/buyer-web/app/page.module.css`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/catalog/catalog-media.controller.ts`
- `apps/api/src/platform/storage/object-storage.service.ts`
- `apps/api/prisma/schema.prisma`
- `pilot-catalog.md`
