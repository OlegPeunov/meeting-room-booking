# Meeting Room Booking

Тестовое задание Mad Devs: интерфейс бронирования переговорной комнаты.

## Запуск

Требуется Node.js 22.13+ в ветке 22 или Node.js 24+; для разработки используется Node.js 24.21.0.
Если установлен nvm, выполните `nvm use` в папке проекта.

```sh
npm install
npm run dev
```

Адрес dev-сервера выводится в терминале (по умолчанию http://localhost:5173).

## Команды

- `npm run dev` — запуск dev-сервера.
- `npm run typecheck` — проверка TypeScript без сборки приложения.
- `npm run lint` — ESLint; предупреждения считаются ошибками.
- `npm run build` — проверка типов и production-сборка.
- `npm run preview` — локальный просмотр готовой production-сборки.

## Текущий этап

Подготовлена основа Vite + React + TypeScript: strict-режим, ESLint,
минимальная стартовая страница и адаптивные CSS-стили.

Бронирования, API, MSW, sessionStorage и автоматические тесты пока не реализованы.
