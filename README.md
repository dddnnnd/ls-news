# Los Santos News — GitHub Pages ready

Этот комплект собран из текущего сайта LSN и исправляет главные проблемы интеграции Supabase и статического хостинга.

## Что исправлено

- `lsn_articles` теперь содержит поля, которые реально запрашивают сайт: `excerpt`, `author_name`, `status`, `published_at`, `type`.
- Для старой и новой логики публикаций добавлена совместимость `lead ↔ excerpt` и `author ↔ author_name`.
- Исправлена RLS-логика публикаций.
- Добавлены таблица баннеров и Storage bucket `article-images`.
- Добавлены RPC-функции для User ID и ролей, используемые редакционным кабинетом.
- `auth.html` и `editor.html` остаются входными точками и возвращают пользователя в нужный диалог главной страницы.
- `supabase-config.js` больше не привязан к Netlify: URL сайта определяется относительно текущего GitHub Pages адреса.
- Добавлен `.nojekyll`, чтобы GitHub Pages отдавал статические файлы без обработки Jekyll.

## Публикация на GitHub Pages

1. Создай/открой репозиторий.
2. Загрузи содержимое этой папки в корень репозитория.
3. В GitHub открой **Settings → Pages**.
4. В **Build and deployment** выбери **Deploy from a branch**, ветку `main` и папку `/ (root)`.
5. Дождись публикации.

## Supabase

Один раз выполни весь файл `supabase-setup.sql` в **Supabase → SQL Editor**.

В **Authentication → URL Configuration** добавь настоящий адрес GitHub Pages:
- `https://<username>.github.io/<repository>/`
- `https://<username>.github.io/<repository>/auth.html`

Если используется пользовательский домен — добавь его вместо GitHub Pages.

Если включено подтверждение email, настрой SMTP или отключи `Confirm email` в настройках Supabase.

## Важно

`supabase-config.js` содержит только publishable key. `service_role` key и пароль базы данных сюда добавлять нельзя.

После публикации очисти кэш браузера один раз или открой сайт в приватном окне. Страница статьи работает через `article.html?id=...`.


## Если Supabase сообщает 42P13

Файл `supabase-setup.sql` уже содержит безопасное удаление старой версии
`public.lsn_admin_list_users()` перед созданием новой версии. Не вставляй
сокращённые примеры с `...` — используй файл целиком.

## Структура GitHub Pages

Главный файл сайта — `index.html`. GitHub Pages должен публиковать корень
репозитория из ветки `main`. Файл `.nojekyll` уже включён.

Не добавляй в репозиторий `service_role` ключ Supabase или пароль базы данных.


## Supabase SQL

Запускайте `supabase-setup.sql` целиком в Supabase SQL Editor. Внутри уже предусмотрены DROP FUNCTION для функций, у которых PostgreSQL не позволяет менять RETURN TYPE через CREATE OR REPLACE.
