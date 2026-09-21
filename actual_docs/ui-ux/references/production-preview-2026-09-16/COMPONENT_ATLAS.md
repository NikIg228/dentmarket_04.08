# Атлас компонентов · proposed v1.0

Открыть: `preview.html?page=components-controls`, `components-overlays`,
`components-feedback`, `components-navigation`. Статичные копии — `rendered/`.
В `viewer.html` доступны CSS-ширины 360 / 390 / 768 / 1024 / 1440 / 1536 / 1920.

Это спецификация и визуальная демонстрация, не новая библиотека компонентов.
При внедрении использовать Fluent UI v9 и `packages/ui`; native controls в
прототипе не являются решением заменить Fluent. Отдельный AI-лист
`concepts/components-overlays-ai.png` — визуальная подсказка, а не источник
поведения, точных токенов или разрешённых форматов файлов.

## Карта

| Компонент | Где показан | Состояния, доступные для просмотра | Поведение в прототипе / ограничение |
|---|---|---|---|
| Primary, secondary, icon, danger button | controls | default, hover, focus-visible, pressed, disabled, loading | Кнопки дают локальную обратную связь; loading в атласе статичен |
| Link / группа действий | все страницы | default, hover, focus | Переходы между существующими макетами; не новые app routes |
| Input / textarea | controls, offer-editor, support | filled, empty, focus, invalid | Реальный локальный ввод; не серверная валидация |
| Денежный / числовой ввод | controls, offer-editor | formatted / editing | Денежная бизнес-арифметика не выполняется этим полем |
| Quantity | cart, supplier-order, controls | default, draft edited, stock conflict | Изменение черновика и отдельное явное сохранение; рабочая корзина не меняется |
| Select | формы | closed, open (native), selected | Нативный выбор; внешний вид раскрытия зависит от браузера |
| Searchable combobox / autocomplete | overlays, import-review | открытый длинный список, search, selected | Иллюстрация списка; полноценные клавиши combobox и серверный поиск не реализованы |
| Multiselect | navigation | selected/unselected варианты | Список checkbox; не отдельный продуктовый фильтр без основания |
| Checkbox / radio / switch | controls | default, checked | Checkbox/switch интерактивны; radio — визуальный образец, полноценная группа требует реализации |
| Datepicker / range | navigation, документы | поле даты, открытый календарь, selected | Calendar board статичен; интервалы/локализация/часовой пояс не сертифицированы |
| Search, chips, reset | документы, catalogue | empty, entered, selected chip | Локальный фильтр строк в прототипе; не поиск API |
| Pagination | списки | current, disabled boundaries | Демо-данные на одной странице; многосерверная пагинация не имитируется |
| Tabs | orders, offers, navigation | active / inactive | Переключается визуальное состояние, не выполняется API-запрос; это обозначено toast |
| Accordion | navigation | open / closed | Нативный details; не потеря данных |
| Table / row / sorting | списки, import-review | default, empty/error через общие состояния | Mobile преобразует строки в карточки; PDF сохраняет локальную прокрутку |
| Bulk actions | только при доказанном сценарии | N/A в этом наборе | Массовое удаление/публикация не добавлены ради картинки |
| Modal | overlays + «Проверить настоящий dialog» | open, dirty, close confirmation | Проверены сохранение ввода, Escape, Tab wrap, возврат фокуса |
| Drawer | overlays / document-detail | open | Визуальная структура показана; отдельный полноценный interactive drawer не реализован |
| Popover / tooltip | help icons + overlays | open, focus/click | Иллюстрация/базовый HTML; полный keyboard/touch dismissal всех контекстов не принят |
| Dropdown / context menu | header, file actions | open / closed | Рабочий локальный header-menu; действия файла открывают демонстрационный dialog |
| Toast / banner / alert / badge | feedback | info, warning, error, success, partial | Успешный образец не является подтверждением backend операции |
| Upload | document-upload, feedback | selected, progress, invalid / retry | Файл не отправляется; прогресс статичный, лимиты должны браться из реального API |
| Skeleton / empty / no access | system-loading, system-empty, system-forbidden | отдельные читаемые поверхности | Это дизайн состояний, не результат реального сбоя или отказа API |
| Dangerous action / unsaved changes | overlays | open confirmation | Никакие документы или данные не удаляются |
| Organization / city / profile | navigation + header | expanded/selected | Ни tenant, ни сессия рабочего приложения не переключаются |

Не для каждого компонента применимы все девять состояний: например, у разделителя
нет success, у информационного badge нет loading, у skeleton нет pressed.
Такие комбинации N/A, а не недостающая бизнес-функция.

## Целевой контракт раскрывающихся элементов

1. Dialog открывается по явному действию; фокус — в заголовок или первый уместный
   элемент. Фон недоступен Tab. После закрытия фокус возвращается к вызвавшему
   элементу, если он сохранился; иначе к ближайшему смысловому контейнеру.
2. Escape закрывает верхний popup. В dirty-форме вместо потери ввода показывается
   подтверждение. «Продолжить редактирование» сохраняет введённые значения.
3. Клик вне обычного popup закрывает его. Для dirty/опасной формы не применяется
   молчаливое уничтожение ввода. Нажатие в дочернем popup не закрывает родителя.
4. Высота ограничивается viewport, содержимое скроллится внутри. Footer действий
   остаётся доступным. На mobile нельзя выталкивать главную кнопку за экран.
5. Select/combobox: стрелки перемещают активный вариант, Enter выбирает,
   Escape закрывает без неожиданного сброса. Multi-selection сохраняется при
   поиске. Этот полный контракт предстоит принять в настоящих Fluent компонентах.
6. Tooltip: кратко «что это и зачем», статичный вопрос рядом с label, поддержка
   hover/click/keyboard. Критические форматы/лимиты и причина блокировки видны
   постоянно. Требуется отдельно проверить dismiss по Escape и края viewport.
7. У опасных действий конкретный объект и последствия. В финальном интерфейсе
   предпочесть «Выйти без сохранения» вместо сокращённого «Выйти» на AI-листе.

## Header и адаптивность

Один CSS и одна render-функция для всех ролей. На desktop — строка 74 px;
на mobile — логотип/меню/профиль и отдельная строка поиска, 116 px суммарно.
Глобального sidebar нет. Каталог имеет допустимые локальные фильтры; на mobile
они раскрываются внутри страницы.

Подтверждены локально: скрытие header вниз, возврат вверх desktop/mobile,
удержание открытого меню на desktop. Mobile menu hold, screen reader,
экранная клавиатура и физический телефон/планшет не проверены.

Таблицы покупок превращаются в вертикальные строки с label/value. Таблица внутри
PDF не масштабируется в нечитаемый текст: документ имеет собственную прокрутку.
При 1920 px контент ограничивается общей максимальной шириной; не растягивается
до неограниченной длины строк.

## Ограничение утверждения

CREATED не означает VISUALLY_REVIEWED для всех состояний. Визуально разобран
контрольный набор; для остальных выполнены структурные/геометрические проверки
и подготовлены полноразмерные HTML-референсы. Полная ручная визуальная приёмка
всех 69 шаблонов и всех перечисленных состояний остаётся NOT_RUN.
