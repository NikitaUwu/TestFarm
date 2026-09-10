# Архитектура

Версия: 1. Конфигурация развёртывания — compose.yaml, SQL — backend/migrations.

## Context

```text
Владелец / Проверяющий → Web → API → PostgreSQL
Публичный читатель → Web → read-only проекция отчёта
Worker → ИИ-провайдер / публичные HTTPS-источники
```

## Containers и поток данных

```text
Next.js Web ─HTTP→ FastAPI API ─SQL→ PostgreSQL
                       │               ↑
                       └S3→ MinIO      │ jobs / результаты
                                 LangGraph Worker
                                       │ HTTP + Runner token
                                Изолированный Runner
                                  │            │
                            ИИ-провайдер   Rules service
```

API проверяет авторизацию, создаёт версии, сохраняет файлы, ставит исследования и пересчёты в очередь. Worker выполняет последовательный граф research → experiments → calculation → assessment → report. LangGraph checkpoints и PostgreSQL-backed очередь сохраняются независимо: checkpoint не заменяет бизнес-таблицы.

Основные модули Worker: workflow — выполнение и проверка StepResult; step_inputs — зависимость результата от входов; evidence — источники и правила решения; calculation — детерминированные численные расчёты. ProviderAdapter отделяет Groq и сохранённые альтернативные адаптеры от процесса.

## Модель и прослеживаемость

```text
Idea → IdeaVersion → ResearchRun → StepRun → StepAttempt
                  ↘ DatasetVersion → ExperimentRun → TaskObservation → Measurement
ResearchRun → EvidenceSource → EvidenceClaim
ResearchRun → CalculationRun → Scenario / SensitivityAnalysis
ResearchRun → Report → Decision → MvpBuild → MvpVersion → MvpResult
Idea → Artifact / BusinessObservation → MetricJob
```

SolutionCandidate хранит неизменяемый вариант с версией в одной таблице. Конфигурационные модели и профили представлены configurations(kind,id,version,content); каждый запуск содержит снимок. Список типов в source-модели сохранён, отдельная таблица на каждый вид конфигурации не нужна.

## Восстановление

Глобальный session advisory lock 714211 ограничивает тяжёлую очередь одним Worker. Job арендуется на 40 секунд, heartbeat каждые 10 секунд. После аварии берётся просроченная аренда и последний checkpoint. Очередь сортируется по приоритету плюс aging раз в 5 минут, затем FIFO.

Результат шага проверяется Pydantic перед передачей дальше. Ошибочная попытка записывается отдельно. Завершённые шаги используются повторно по hash значимых входов, с reused_from. Изменение названия не повторяет независимые эксперименты; новая версия dataset или решения инвалидирует их. Отчёт всегда получает входы текущего ResearchRun.

pause проверяется между внешними вызовами. cancel дополнительно вызывает Runner /cancel и завершает соответствующий дочерний процесс. Runner сохраняет request_id, hash входов и результат в SQLite на runner_state; повтор не исполняет завершённую операцию. После аварии неизвестный исход running переводится в interrupted и не повторяется автоматически. Отмена локального процесса не гарантирует отмену уже принятого запроса на стороне Groq.

## Изоляция

Runner — отдельный непривилегированный контейнер без DB/S3 credentials, read-only FS, tmpfs, CPU 1, память 768 MiB, 64 PID. Каждый запрос исполняется в завершаемом дочернем процессе. Генерируемый JavaScript работает в QuickJS без host bindings: 32 MiB, 0,5 секунды, стек 512 KiB; нет API файлов, сети или запуска процессов. Это среда одного сценария с управляемым вызовом ИИ, не общий Node/Python-хостинг.

Runner и Rules находятся в internal execution network. Выход HTTPS разрешён только через egress CONNECT api.groq.com:443. Egress не расшифровывает TLS и не получает ключ Groq. Worker/API соединяют внутренний Runner с бизнес-хранилищами; сгенерированный код не получает их секретов.

agent_results хранит отдельные контракты и результаты 13 функций; объединённые исследовательские функции явно ссылаются на общий research. mvp_jobs — устойчивая очередь генерации с лимитом исправлений, версиями кода и тестами. process_sessions связывает ручной замер с задачей, вариантом и DatasetVersion; CalculationRun сохраняет копию использованных замеров. EffectModel v2 переносит замеренные этапы в сценарии и чувствительность; прежние расчёты не переписываются.

## Развитие

Модели, промпты, роли, пороги, метод bootstrap и лимиты меняются версионной конфигурацией. Новый тип данных, шаг, ProviderAdapter или MVP требует кода и приёмки. Дополнительный микросервис оправдан независимой полезной функцией; MCP/плагины — необходимой внешней интеграцией. Отдельная очередь или Temporal рассматриваются при нескольких Worker и сложных распределённых переходах. Vector search — при подтверждённой необходимости поиска по большому корпусу, не заранее.

