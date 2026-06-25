# Настройка переменных окружения в Render

## Проблема
На бесплатном тарифе Render файловая система очищается при перезапуске сервера.
Поэтому вебхук, сохранённый в файл, теряется.

## Решение
Нужно добавить переменную окружения `BITRIX_WEBHOOK` в настройках Render.

## Инструкция

1. Откройте Dashboard Render: https://dashboard.render.com/
2. Выберите ваш сервис `smart-process-cron`
3. Перейдите во вкладку **Environment**
4. Добавьте переменную:
   - **Key**: `BITRIX_WEBHOOK`
   - **Value**: `https://cab.bitrix24.ru/rest/1/s3a6coos9gt5lsw9/`
5. Нажмите **Save Changes**
6. Перезапустите сервис (Manual Deploy → Deploy latest commit)

## Проверка

После перезапуска в логах должно появиться:
```
Server starting...
Current time: 2026-06-25T08:45:00.000Z
Timezone offset: 0 minutes
BITRIX_WEBHOOK env: Set
```

## Часовой пояс крона

Крон работает по времени сервера (UTC).
Если вы установили время 15:45 (UTC+7), то в UTC это 08:45.

Для проверки:
- UTC время: 08:45
- UTC+7 время: 15:45

Крон запустится в 08:45 UTC (15:45 по Новосибирску).
