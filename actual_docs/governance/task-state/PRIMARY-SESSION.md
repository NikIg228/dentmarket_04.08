# PRIMARY-SESSION — Platforma.Market

Дата: 2026-09-21. Это карточка исполнения, не продуктовый backlog.

- Основная задача: 01a0c36e-38a1-7942-957b-9e8620c01442; .codex/project-session.json — реестр ID.
- Фаза: idle / REFERENCE_SET_APPROVAL_PENDING; COMPREHENSION_READY проверен, четыре
  прежние задачи архивированы нативными инструментами с подтверждением.
- Основной исполнитель проекта: 01a0c36e-38a1-7942-957b-9e8620c01442.
  Единственный writer текущих docs; Оркестратор завершил публикацию и освободил
  право записи. Активного продуктового writer нет; параллельная запись запрещена.
- Текущая задача: UI-REFERENCE-SET-2026-09-21 — найти и классифицировать прежние
  референсы, предъявить владельцу набор перед редизайном. DoD: проверенные пути,
  provenance/count, карта различий, docs-only gates и scoped commit/push.
- Решение: redesign direction requested; reference set approval pending;
  implementation not started. Прежнее ограничение будущей работы полировкой снято.
- Разрешено: чтение референсов и минимальные изменения двух UI standards,
  PROJECT_HANDOFF и этой карточки. Assets и продуктовые файлы не менять.
- Не разрешено этим поручением: новые функции, исправление старого CI, миграции
  БД, смена ветки, новый worktree, force-push или перенос всего старого backlog.
- Snapshot задачи: main @ 74f503ee12297c10e22cf543003c0c2daa33daa7, исходно чисто,
  один worktree в канонической папке. Собственный dirty scope: четыре docs выше;
  чужого WIP при старте нет. Предыдущий handoff snapshot 16af5ca сохранён в истории.
- Источники/выполненное/остаток: actual_docs/PROJECT_HANDOFF.md; подробные gates в профильных docs.
- Блокер продукта: общий CI verify:search-commerce FAIL; последняя реализация остановлена пользователем.
- Hooks: REQUIRES_REVIEW_AND_TRUST, фактическое срабатывание в приложении
  не подтверждено. Unit tests не заменяют trust/runtime.
- Собственные изменяющие процессы/БД этой организационной задачи: нет.
- Проверки адаптера: расширенный набор 16/16 PASS (включая незавершённую передачу,
  отключённую ротацию и защиту от повторного создания). Ссылки и JSON проверены.
- Non-owned file preservation: SHA-256 всех остальных исходных файлов совпал
  со снимком до организационных изменений; продуктовый код не менялся.
- Передача 21.09 завершена: создана одна задача в saved project/environment=local,
  проверены продукт, checkout, требования, история/остаток, ограничения и протокол.
- Старые task IDs перечислены в retiredThreadIds реестра, история не удалена.
- Выполнено: 78 IDs/78 rendered HTML/69 templates сверены с manifest; четыре
  originals совпали по SHA-256 с Desktop и source-manifest. Семь файлов preview
  совпали с final-manifest после CRLF→LF, byte hashes различаются. Это не новый
  runtime PASS. Происхождение/ограничения/пути — Consolidation Standard §20.
- Проверки текущего docs scope: inline Node read-only gate PASS, 34 локальные
  ссылки и исторические разделы двух UI standards сохранены; diff только четырёх
  разрешённых docs, untracked нет; git diff --check PASS. Финальная новая ссылка
  AppShell и итоговый diff проверяются перед staging. Runtime suites NOT_RUN:
  код, данные и поведение не менялись. Бюджет docs gate 2мин, max3 попытки.
- Публикация: scoped commit/push и CI readback следуют после финального review;
  их фактический результат — в ответе этой основной задачи, без нового
  evidence-only коммита. Старый общий CI FAIL не объявляется исправленным.
- Практики: Agency UI Designer (reference provenance/компоненты/состояния),
  Git Workflow Master (один docs commit, явный staging, обычный push).
- Следующий шаг после публикации docs: подтверждение владельцем набора и
  варианта каталога. До ответа не начинать UI/backend/CI implementation.
- Приостановленное напоминание dentmarket переназначено на новую основную задачу;
  расписание, prompt и статус PAUSED сохранены, мониторинг не включён.
- Исторические уточнения handoff: решение 15.09 — полировка без редизайна;
  платёж пилота не утверждён; поздние результаты CI см. explicit evidence,
  а не исторический pending в CI-карточке.
- Stop: разночтение Git/владения, ошибка handoff/comprehension или неизвестный
  результат создания задачи; не создавать дубликаты.
