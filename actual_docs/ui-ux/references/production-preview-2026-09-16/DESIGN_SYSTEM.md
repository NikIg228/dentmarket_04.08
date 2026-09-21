# Визуальная система v1 — предложение на основе утверждённых оригиналов

## Статус

OWNER_DIRECTION: Quiet Editorial, светлая база, зелёный акцент, выразительный
sans-serif, тонкие разделители; верхняя навигация без глобального sidebar;
скрытие вниз/возврат вверх; локальные фильтры каталога могут быть слева.
PROPOSED: все точные значения ниже, группировка меню и конкретный responsive.
Existing source: Manrope во всех4layouts, Fluent UI v9/packages/ui сохраняются
для будущей реализации. Preview HTML не вводит новую библиотеку в приложения.

## Токены

| Семантика | Предложение | Основание |
| --- | --- | --- |
| Page/surface/subtle | #fafaf8 / #ffffff / #f3f4f4 | визуальная оценкаR01–04 |
| Text/secondary | #111820 / #536170 | графит и спокойный secondary |
| Border/control border | #e1e5e7 / #aab4bd | subtle separators; control border отдельно для различимости |
| Primary/hover/pressed | #006451 / #005443 / #004536 | глубокий зелёный из эталонов |
| Selected | #eaf4ef | выбор, не доказательство trust |
| Warning text/bg | #805015 / #fff5e4 | текст+иконка, не только цвет |
| Danger text/bg | #a8253c / #fff0f2 | ошибка/опасное действие |
| Info text/bg | #315b70 / #eef5f8 | нейтральное пояснение |
| Font UI | Manrope,Segoe UI,sans-serif | установленный в приложениях, не угаданный поPNG |
| IDs | Consolas,monospace в preview | локальный fallback; Roboto Mono в целевом standard |
| H1/H2/body/meta | 42/24/16/13px desktop;30/22/15/13mobile | предлагаемая нормализация |
| Leading | H1 1.12; body1.5 | плотность+читаемость |
| Spacing | 4,8,12,16,24,32,40,48,64px | общий4pxритм |
| Radius | control6,panel6,overlay10px | уточнение эталонов, не текущийtoken retrofit |
| Controls |44px default; desktop compact36px при mobile44 | keyboard/touch |
| Header |74px desktop, mobile2rows при поиске | R03 master; одинаковый template |
| Content |max1444px,46px поля при1536;24tablet/16mobile | приближённая композицияPNG |
| Z layers |header20,popover30,modal40,toast50 | не произвольные огромныеz-index |
| Motion |140ms feedback; reduced-motion0ms | без декоративного parallax |

Пары цветов проверить вычислением contrast; результат не является полной WCAG
сертификацией. Нет обязательной dark theme: она не задана исходными эталонами.

## Оболочка

Один Header: brand/city/search/nav/more/context/org. Buyer's context cart,
Supplier offers, Operator queue. Primary nav роли может отличаться по правам;
поиск оператора подписан как поиск рабочих сущностей, не товарный поиск.
Desktop1536 показывает все слоты; tablet сокращает ссылки в«Ещё»; mobile
brand+menu+org в первой строке и поиск во второй. Невидимые элементы inert.
Header при scroll-down>80 скрывается, scroll-up возвращается; открытое меню
или focus внутри блокирует скрытие. Skip link вызывает header и ведёт в main.
Sticky header не меняет высоту content при появлении. Reduced-motion без slide.

## Компонентные контракты

Forms: постоянный label+help ?, required явно, hint рядом, error по месту;
numeric ввод не делает неявныйSave. Help поддерживает hover/focus и click,
Escape закрывает и возвращает focus. Важные ограничения всегда видимы.
Select/combobox: closed/open/search/empty/loading/error/disabled; длинный список
скроллится внутри max-height; selected виден text/check. Keyboard Arrow/Enter/
Escape; ввод сохраняется. Нельзя скрывать единственное исправление в overflow.

Dialog: короткое решение/форма; title+consequence+primary+cancel; max-height
viewport−32, scroll внутри; начальный focus на заголовок/первое поле, trap,
Escape/outside одинаково запрашивают discard при dirty, возврат на trigger.
Drawer: контекст/детали поверх списка, mobile почти full width; не новый sidebar.
Popover: помощь или небольшой выбор, привязан кtrigger и переворачивается у
края. Menu: действия и навигация, Arrow/Enter/Escape. Modal nested popover не
закрывает весь dialog. Прототипные submit не делают API и явно сообщают это.

Tables: header sentence case, данные по строкам, money right, SKU/meta secondary.
Mobile transactional rows становятся labelled cards; operator matrix может
иметь локальный scroll с сохранённым row context, не overflow всей страницы.
Empty различает первый вход и filtered-empty;403 не маскируется пустым списком.
Loading сохраняет layout; failure показывает объект, причину и следующий шаг,
безstack/SQL. Success только после реального сервера в будущей реализации.

## Контроль данных

Пример supplier order DM-0264 содержит товары только Демо-поставщика01:
2×18900 +2×7450 +1×3250 =55950₸. Запрошено files3, уменьшение7450₸.
Multi-supplier cart R02 — отдельный сценарий, а не тот же order aggregate.
Архив invoice INV-0264 на55950₸, статус «Сформирован», payment «Не подтверждена».
Никакой REVIEWED или uploaded receipt не меняет это наpaid. Тестовый договор
помеченнеюридическим; actualpublicationguard не обходится.

## Handoff

Сначала утвердить систему/контрольные экраны, затем будущая задача реализации
общего header и primitives, auth, buyer journey, supplier, operator, optional.
Не менять API и backend ради формы картинки. Новые lookup или missingscenario
требуют соответствующего CORE outcome. EngineeringDoD остаётся Workflow.
