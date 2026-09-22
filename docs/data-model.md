# Модель данных и происхождение выводов

Источник схемы: `web/farm/schema.ts`, миграция `web/drizzle/0000_loose_baron_strucker.sql`. Таблицы имеют префикс `farm_`; часть предметных полей хранится в JSONB. Это описание текущих 22 таблиц, а не обещание полной целевой модели из `AGENTS.md` A4.

| Группа | Таблицы | Ключевые связи и содержание |
| --- | --- | --- |
| Доступ | `farm_accounts`, `farm_sessions`, `farm_rate_limits` | Аккаунт, хеш пароля; хеш токена сессии и срок действия; счётчики запросов |
| Ввод | `farm_ideas`, `farm_idea_versions`, `farm_intake_keys` | Владелец, приоритет, стадия; неизменяемые версии ввода; ключ идемпотентного создания |
| Оркестрация | `farm_research_runs`, `farm_jobs`, `farm_steps` | Снимок конфигурации и счётчики; приоритет и состояние очереди; результат этапа и input hash |
| Доказательства | `farm_sources` | URL и JSONB с title, publisher/domain, snippet, датами, query, claim, provider/engine и raw citation |
| Эксперименты | `farm_datasets`, `farm_variants`, `farm_trials` | Версия набора, вариант, попытка по задаче и повторению |
| Решение | `farm_calculations`, `farm_reports`, `farm_decisions` | Программный расчёт, снимок отчёта, действие человека и критерии приёмки |
| MVP | `farm_mvps`, `farm_mvp_results` | Декларативная спецификация и сохранённый результат пользовательского ввода |
| Файлы/аудит | `farm_artifacts`, `farm_execution_log`, `farm_action_data` | Приватный Blob, метаданные вызова и сохранённый ввод/вывод |
| Совместимость | `farm_legacy_archives` | Таблица прежней истории в схеме; перенос отменён и не запускается |

## Ключи и инварианты

`ideas.owner_id` указывает аккаунт. `idea_versions` имеют уникальную пару `(idea_id, version)`. ResearchRun указывает `idea_id`, `idea_version_id` и уникальную пару `(idea_id, request_key)`. Job указывает run; шаг уникален по `(run_id, name, input_hash)`. Источник уникален по `(run_id, url)`, поэтому повторная цитата того же URL не создаёт вторую строку. Trial уникален по `(run_id, variant_id, task_id, repetition)`; MVP result — по `(mvp_id, request_key)`. Отчёт указывает run, решение — отчёт, MVP — решение и идею.

Физические foreign keys и каскады смотрите в Drizzle/SQL. Не считайте JSONB полным набором типизированных таблиц целевой предметной модели: `EvidenceClaim`, `AssessmentProfileVersion`, `IntegrationSnapshot` и ряд других концепций пока представлены полями JSON, конфигурацией или не имеют отдельной сущности.

## Снимки и трассировка

При старте `runs.config` получает копию действующей политики (provider, web, budget, effect, evidence, prompts, rules). Изменение файла влияет только на новые runs. `runs.counters` хранит число вызовов, начало исполнения и раздельные `researchSpend`/`mvpSpend`: подтверждённые рубли, удержанные резервы, число вызовов без подтверждённой цены. `logs.usage` содержит usage, стоимость и generation ID, а `action_data.content` — вход/выход конкретного действия. Доступ к деталям лога через API проверяет владельца run.

Исследование сохраняет сырой ответ с annotations как `webRaw:N`, затем структурированный раунд как `webAction:N`. После нормализации citation в `farm_sources.content` сохраняются URL, title, domain, snippet, `published_at` либо null, `accessed_at`, запрос, утверждение, provider, engine и `raw_citation`. Невалидная цитата не считается доказательством. Отчёт содержит `versions` с ideaVersionId, researchRunId, datasetVersionId, solutionVersions, конфигурацией и версией Workflow. При оценке учитывайте, что не все ссылки из A4 вынесены в отдельные колонки.

## Жизненный цикл и удаление

Содержательная правка идеи создаёт новую версию и инвалидирует старые runs. Архивирование меняет стадию и освобождает слот, но не стирает данные. `DELETE /api/ideas/{id}` сначала отклоняет активное задание, затем удаляет Blob-объекты, MVP и идею; связанные записи с каскадными FK удаляются из активной БД. Часть аудио может существовать до привязки к идее: его очистку надо оценивать отдельно. Резервные копии Neon/Blob и данные, удерживаемые внешними поставщиками, не удаляются этой операцией.

Данные пилотного экрана `PostMvpMonitoring` записываются в `localStorage` браузера, а не в эти таблицы; они не участвуют в CalculationRun. [Политика данных](data-policy.md) и [известные пробелы](verification.md) раскрывают последствия.
