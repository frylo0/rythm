# rythm

Личный PWA-инструмент для сборки повторяющегося недельного жизненного ритма: активности, логические дни, статистика по 168 часам и офлайн-редактирование с синхронизацией по принципу "более свежая версия побеждает".

Фронтенд работает без CDN: jQuery собирается из npm-зависимости, Bootstrap 5 и Bootstrap Icons лежат локально в `public/vendor`.
Файлы `public/vendor` должны быть в git: Docker-сборка не ходит в CDN и проверяет их наличие во время `npm run build`.

## Локальный запуск

```bash
npm install
npm run build
npm run dev
```

Приложение откроется на `http://localhost:3000`.

## Пароль

Для Docker/VPS удобнее создать `.env` интерактивно:

```bash
npm run setup:env
```

Команда спросит порт и пароль приложения, сгенерирует `RYTHM_PASSWORD_HASH` и `RYTHM_COOKIE_SECRET`, затем запишет `.env` для `docker compose`.

Если нужен только хеш пароля:

```bash
npm run hash-password -- "my-password"
```

Если `RYTHM_PASSWORD_HASH` пустой или настройка `authEnabled` выключена в интерфейсе, приложение работает без пароля.

## Docker

```bash
docker compose up -d --build
```

Состояние хранится в `data/state.json`, бэкапы последних снимков лежат в `data/backups`.

## Деплой на VPS

По умолчанию используется SSH alias `rythm-vps` и директория `/opt/rythm`:

```bash
npm run deploy:vps
```

Переопределить можно так:

```bash
RYTHM_DEPLOY_HOST=my-vps RYTHM_DEPLOY_DIR=/opt/rythm npm run deploy:vps
```
