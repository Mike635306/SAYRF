# Тестирование email-подтверждения

## 1) Подготовка

Скопируйте `.env.template` в `.env`. Для Gmail включите двухэтапную аутентификацию Google и создайте пароль приложения. Обычный пароль от Google-аккаунта в `SMTP_PASS` не подходит.

```bash
cp .env.template .env
```

Для Gmail укажите `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, адрес Gmail в `SMTP_USER` и пароль приложения в `SMTP_PASS`. Для порта `587` сервер использует STARTTLS автоматически.

## 2) Запуск сервера

```bash
npm install
node server/index.js
```

## 3) Тестовый запрос на отправку кода

Пример запроса для отправки кода на один адрес:

```bash
curl -X POST http://localhost:3104/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{
    "login": "user@example.com",
    "notifyEmail": "other@example.com",
    "purpose": "register",
    "name": "Test User",
    "password": "ExamplePass123!"
  }'
```

Если `notifyEmail` не указан, сервер попытается отправить на `login`.

## 4) Ожидаемое поведение

- письмо отправляется только на один адрес;
- `notifyEmail` предпочтительнее `login`;
- если SMTP не настроен, сервер возвращает HTTP `503`; если Gmail отклонил отправку, сервер возвращает HTTP `502`;
- при неудачной отправке код подтверждения удаляется и не может быть использован;
- код не возвращается в ответе по умолчанию (`SHOW_CODE=0`).

Успешная отправка подтверждается ответом `sentToEmail: true`. Не публикуйте `.env` и не добавляйте реальные пароли приложения в шаблоны или репозиторий.
