# ADR 011 — полный функциональный состав локальной демонстрации

Статус: принято владельцем продукта 2026-09-14. Реализация и test evidence
учитываются отдельно в [Acceptance Matrix](../../governance/PROJECT_ACCEPTANCE_MATRIX.md).

## Контекст и границы

Владелец разрешил вернуть AI, trust/reviews, promotions, billing и smart
recommendations в локальную демонстрацию. Существующий go_live уже включает
эти пять модулей вместе; pilot намеренно исключает их на API, web и API client.
Подключение новых внешних интеграций, production launch и завершение всех
optional-сценариев не входят в решение.

## Решение

1. Product V2 §5.2 разрешает полный состав локально. Launcher `npm run dev`
   выбирает go_live при отсутствии явно заданного process profile и передаёт
   его и соответствующий публичный флаг API и всем Next-приложениям.
2. `npm run dev:pilot` или явный DEPLOYMENT_PROFILE=pilot возвращает ограниченный
   набор. Shared schema, CI, Docker и прямой API launch сохраняют default pilot.
   Конфликт/неизвестный профиль вызывает отказ до старта процессов.
3. Launcher отклоняет NODE_ENV=production; это не способ ослабить production
   environment validation. Имя go_live определяет module graph, не LIVE_VERIFIED.
4. Сохраняются permissions, AI tool authorization, billing entitlements и
   соглашения. Включённый маршрут не является общедоступным действием.
5. Отдельно уточнён инвариант Product V2 §9.7: договор **площадка–поставщик
   обязателен до публикации**. Optional buyer–supplier framework — другой
   договор. Existing assertActive не удаляется и не заменяется checkbox/PDF.

## Альтернативы и последствия

Не вводим третье значение demo и независимые пять флагов: пользователь разрешил
ровно существующий полный набор. Не меняем глобальный default на go_live,
чтобы старые CI/release/pilot guardrails не расширились неявно. Простой возврат
меню без API composition привёл бы к запросам отсутствующих контроллеров.

Требуется перезапуск локального окружения; production web требует пересборки
с нужным профилем. Внешняя модель AI, реальные списания и провайдеры по-прежнему
нуждаются в отдельных подключениях и проверках. Полнота billing UI отдельно
от активации backend-модуля. Не создаём фиктивный успех или новые demo credentials.

## Проверки и rollback

- local-profile: пять функций, совпадение API/web, explicit pilot, mismatch,
  invalid value, production refusal и отсутствие передачи секретов в public env;
- frontend-profile, pilot-composition, production-config и существующие
  agreement/authority tests сохраняют противоположные инварианты;
- typecheck/test/build и pilot web suite; отдельный browser smoke полного
  профиля проверяет доступность существующих панелей и маршрутов;
- rollback: остановить launcher, `npm run dev:pilot`; для Next production
  заново собрать все web с pilot. Данные, agreements и permissions не удалять.

Не закрывать CORE-01–09/POST-BE/POST-FULL или production security gate по
результатам этой локальной активации.
