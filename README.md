# Продуктовая ферма

Локальный прототип проверки ИИ-гипотез: карточка → очередь → исследование → сравнение вариантов → расчёт → отчёт → решение → генерируемый MVP одного сценария.

Текущая приёмка и известные ограничения: [статус](docs/verification.md). Наличие исходников не означает прохождение сквозной приёмки мастер-промпта.

## Запуск

Требуются Docker Desktop с Linux containers и Docker Compose. В PowerShell из корня проекта:

```powershell
./scripts/setup.ps1
docker compose up --build -d
docker compose ps
```

Скрипт сохраняет локальные пароли в `.env` и не перезаписывает существующий файл. Впишите GROQ_API_KEY непосредственно в `.env`, затем пересоздайте API, Worker и Runner командой `docker compose up -d --force-recreate api worker runner`. Ключи не передавайте в чат, исходники или отчёты.

Открыть [ферму](http://localhost:3000). Пароль владельца — OWNER_PASSWORD, проверяющего — REVIEWER_PASSWORD из локального `.env`. Данные этих ролей изолированы. Без ключа сервис показывает «Не настроено»; исследование ожидает настройки.

Выбран Groq Cloud Free: openai/gpt-oss-20b для текста, whisper-large-v3-turbo для русской речи, groq/compound-mini для web_search. Модели задаются версионным ProviderProfile; GROQ_MODEL и STT_MODEL переопределяют текст/речь. Автоматический переход к другому поставщику отключён. Free — тариф аккаунта Groq, а не суффикс модели; приложение не меняет тариф. Можно указать публичные HTTPS-источники; без них запускается поиск. 9 сентября полный прогон с поиском и отдельная живая проверка генератора успешны; детали и границы — в статусе приёмки.

## Материалы

- [Контекст и границы](docs/context.md)
- [Реестр требований и карта покрытия](docs/requirements.md)
- [Архитектура и восстановление](docs/architecture.md)
- [Интеграции](docs/integrations.md)
- [Расчёт и данные](docs/calculation.md)
- [Эксплуатация](docs/operations.md)
- [Web на Vercel](docs/vercel.md)
- [Политика данных](docs/data-policy.md)
- [Журнал разработки](docs/development-log.md)

Документы из `docs/` доступны внутри приложения в разделе «Настройки и документация». Репозиторий: [NikitaUwu/TestFarm](https://github.com/NikitaUwu/TestFarm).

