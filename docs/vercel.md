> Исторический документ до v1.3; не является актуальной инструкцией запуска. Текущие изменения и покрытие: [release-v1.3.md](release-v1.3.md), эксплуатация: [serverless-deployment.md](serverless-deployment.md).

# Web на Vercel, backend на отдельном сервере

Версия: 1, 2026-09-10. Эта схема публикует только Next.js из web/. API, Worker, Runner, Rules, PostgreSQL и MinIO продолжают работать вместе через Docker Compose. Временный Cloudflare Tunnel может предоставить HTTPS-доступ к API на ноутбуке; ноутбук и туннель должны оставаться включёнными.

## Настройки проекта Vercel

| Поле | Значение |
| --- | --- |
| Repository | NikitaUwu/TestFarm |
| Production Branch | main |
| Root Directory | web |
| Framework Preset | Next.js |
| Node.js Version | 22.x |
| Install Command | Из web/vercel.json, ручной Override выключен |
| Build Command | Из web/vercel.json, ручной Override выключен |
| Output Directory | Значение по умолчанию для Next.js, Override выключен |

web/vercel.json явно запускает pnpm 10.34.5 через npx и устанавливает зависимости с --frozen-lockfile. packageManager закреплён в корневом и web/package.json; Docker использует ту же версию. Corepack больше не является обязательным условием установки на Vercel; ENABLE_EXPERIMENTAL_COREPACK можно удалить. Корневой package.json содержит только метаданные инструментов и не заменяет Root Directory=web.

В Environment Variables задайте API_URL — HTTPS-адрес backend без завершающего /api или /health. Для быстрого Cloudflare Tunnel это выданный адрес trycloudflare.com; после смены адреса обновите переменную и выполните Redeploy. Пароли БД, S3, сессий и GROQ_API_KEY остаются в серверном .env на ноутбуке, в Vercel их переносить не требуется.

## Ошибка установки pnpm

Лог первого деплоя 07efaad: Corepack не обнаружил packageManager, lockfile признан несовместимым, затем ERR_INVALID_THIS / ERR_PNPM_META_FETCH_FAIL. Поле было в web/package.json, но отсутствовало в корне. Точная версия запущенного pnpm в логе не указана. По документации Vercel, ручной Install Command «pnpm install» может выбрать старейший pnpm 6, несовместимый с lockfile 9.0. Поэтому исправление задаёт версию явно и в командах, и в метаданных.

Адрес 127.0.0.1:8402 в npm-запросах относится к среде установки пакетов, не к API фермы. Изменение API_URL, паролей PostgreSQL или Cloudflare не исправляет этот этап сборки.

После получения исправления запускайте deployment последнего коммита main. Redeploy старого deployment может повторно собирать старый коммит. Успешный локальный build не подтверждает статус Ready в Vercel — его нужно проверить по новому логу платформы.

## Ошибка упаковки Next.js 16.3

Deployment ef42c97 успешно установил зависимости, скомпилировал приложение и проверил TypeScript, но завершился ENOENT для .next/next-server.js.nft.json на onBuildComplete Vercel. Это известная несовместимость output=standalone с адаптером Next.js 16.3 ([issue #96646](https://github.com/vercel/next.js/issues/96646)). next.config.ts теперь отключает standalone при VERCEL=1, который устанавливает платформа; для локального Docker standalone сохранён. Пустой файл трассировки не создаётся, зависимости не понижаются. Предупреждение о выборе Node.js 22 вместо 24 не является причиной сбоя.

## Диагностика связи с API

Успешный deployment проверяет сборку Web, но не доступность туннеля. Проверяйте последовательно локальный `http://localhost:8000/health`, публичный `https://<текущий-туннель>/health`, затем `/api/health` на используемом сайте Vercel. Успех — HTTP 200 с JSON `status=available`; HTML страницы входа Vercel не доказывает доступность API.

Работающий процесс cloudflared не означает готовность туннеля. Его локальный metrics endpoint `/ready` должен вернуть 200 и readyConnections>0; `/quicktunnel` возвращает текущий hostname ([реализация Cloudflare](https://github.com/cloudflare/cloudflared/blob/master/metrics/metrics.go)). При восстановлении 2026-09-10 новый туннель запущен с HTTP/2 и metrics на 127.0.0.1:20242; исходный процесс имел 767 ошибок регистрации и readyConnections=0. Процесс нового туннеля должен оставаться запущенным вместе с ноутбуком и Docker.

После создания нового Quick Tunnel замените API_URL в нужных окружениях Vercel и выполните Redeploy: изменения переменной не применяются к уже существующему deployment ([документация Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables)). Не сохраняйте временный hostname в исходном коде как постоянную конфигурацию. Для стабильного адреса потребуется отдельно настроенный именованный туннель/домен либо постоянный внешний backend.

Proxy теперь различает API_URL_MISSING и сетевой отказ. Сетевой отказ сообщает о недоступности API/туннеля, а не утверждает, что PostgreSQL остановлен. В Vercel runtime logs записывается только безопасный код сетевой ошибки и HTTP-метод, без пароля, cookie, тела запроса или значения API_URL. В Vercel отсутствие API_URL больше не подменяется localhost.

## Ограничения публикации

После перехода на регистрацию (2026-09-10) backend нужно обновить вместе с Web: `docker compose build api migrate web` и `docker compose up -d api web`. Миграция 008 сохраняет прежние данные, вводит логины admin/demo для исходных аккаунтов и создаёт таблицу новых аккаунтов. API_URL остаётся прежним, дополнительные секреты для регистрации в Vercel не нужны. Регистрация и вход выполняются сервером через существующий Next.js proxy.

Текущий Next.js proxy передаёт запросы backend. Лимит тела Vercel Function 4,5 МБ ограничивает загрузку аудио через этот путь, несмотря на более высокий локальный лимит. Для больших файлов потребуется отдельный механизм прямой загрузки. PostgreSQL, MinIO и постоянный Worker не развёртываются этим проектом Vercel.

Источники: [выбор package manager](https://vercel.com/docs/package-managers), [настройки сборки](https://vercel.com/docs/builds/configure-a-build), [лимиты функций](https://vercel.com/docs/functions/limitations).
