# Развёртывание v1.3

Один Vercel-проект содержит Next.js, Route Handlers, Workflow, Python Function и Rules. Root Directory — `web`, Framework — Next.js, Node — 22.x, Output Directory — без переопределения. Настройки установки и обязательной сборки находятся в `web/vercel.json`.

## Серверные переменные

| Переменная | Назначение |
| --- | --- |
| NEON_BASE или DATABASE_URL | Neon; NEON_BASE имеет приоритет |
| BLOB_READ_WRITE_TOKEN | Private Blob |
| ROUTERAI_API_KEY | Единый ключ LLM, STT и поиска RouterAI |
| INTERNAL_API_TOKEN | Общий секрет внутренних вызовов Python и Rules |
| APP_ORIGIN | Постоянный адрес приложения для внутренних HTTP-вызовов |

Локальные значения хранятся в `web/.env.local`. Значения Vercel задаются отдельно; префикс NEXT_PUBLIC для них недопустим. API_URL, ключи Tavily/Царь Роутера и Cloudflare Tunnel новому приложению не нужны. Для защищённых preview предусмотрен VERCEL_AUTOMATION_BYPASS_SECRET.

## Новый checkout

Из `web` установите закреплённый lockfile командой `npx --yes pnpm@10.34.5 install --frozen-lockfile`. Подготовьте локальные серверные переменные по `.env.example`. Схему новой базы создаёт `npx --yes pnpm@10.34.5 run db:migrate`; миграции Drizzle/SQL находятся в `web/drizzle`. В существующем Neon первая миграция уже применена. v1.3 хранит дополнительные поля в имеющемся JSONB и не требует изменения схемы.

После локальных изменений выполните commit и push в GitHub, затем production deployment из связанного корня: `npx --yes vercel@59.11.7 deploy --prod --yes`. Git-интеграция также может автоматически начать deployment после push. Для текущего проекта постоянный адрес — https://test-farm-tan.vercel.app.

Скрипт `web/scripts/configure-vercel.ts` передаёт значения из локального окружения в production/preview через stdin CLI, выводя только имена. Перед запуском задайте APP_ORIGIN нужного окружения. Для отдельного preview используйте отдельные Neon/Blob credentials, если нужна изоляция данных. Не печатайте содержимое `.env.local` или файлов ключей.

## Эксплуатация

Модели, лимиты и резервы находятся в `web/farm/policy.json`; изменение требует новой версии конфигурации. Ошибки и стоимость смотрите в ExecutionLog. Старый run нельзя продолжать с RouterAI вместо записанного поставщика: запустите новое исследование.

Пауза/отмена прекращают следующие действия, но начатый запрос может завершиться и быть оплачен. При отсутствии usage.cost резерв остаётся занят. Для изменения лимита отредактируйте BudgetPolicy и создайте новый run; старые снимки не переписывайте.

Исторические данные не импортируются; старые Docker volumes не затрагиваются. Тесты и пробные платные вызовы отключены по запросу пользователя. Статус публикации фиксируется отдельно от функциональной проверки.
