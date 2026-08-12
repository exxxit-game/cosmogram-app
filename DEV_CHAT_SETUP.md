# Настройка CosmoCoder (служебный чат) — 5 минут

Три файла:
- `worker.js` — код для Cloudflare Worker (прячет API-ключ)
- `dev-chat.html` — страница чата (кладётся рядом с `index.html` в репозитории)
- этот файл — инструкция

## 1. Получи ключ Anthropic API

console.anthropic.com → Settings → API Keys → Create Key. Скопируй (начинается на `sk-ant-...`).

## 2. Создай Worker на Cloudflare

1. Зайди на **dash.cloudflare.com** (бесплатная регистрация, если ещё нет аккаунта).
2. В меню слева: **Workers & Pages** → **Create** → **Create Worker**.
3. Дай имя, например `cosmocoder-proxy` → **Deploy** (сначала задеплоится шаблон-заглушка).
4. Нажми **Edit code** — откроется редактор.
5. Удали всё содержимое, вставь код из `worker.js` целиком.
6. **Save and Deploy**.

## 3. Добавь секретный ключ

1. В настройках воркера: **Settings** → **Variables and Secrets**.
2. **Add variable**:
   - Type: **Secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: твой ключ `sk-ant-...`
3. Ещё одна переменная (можно как обычный текст, не секрет):
   - Name: `ALLOWED_ORIGIN`
   - Value: `https://superduck77.github.io`
   (это ограничивает доступ к воркеру только со страниц твоей игры)
4. **Save and Deploy**.

## 4. Скопируй адрес воркера

На странице воркера сверху будет адрес вида:
```
https://cosmocoder-proxy.твой-логин.workers.dev
```
Скопируй его.

## 5. Впиши адрес в dev-chat.html

Открой `dev-chat.html`, найди в конце файла:
```javascript
const CONFIG = {
  workerUrl: 'https://ВСТАВЬ-СВОЙ-АДРЕС.workers.dev',
};
```
Замени на свой адрес из шага 4.

## 6. Залей в репозиторий

`dev-chat.html` кладётся **рядом с `index.html`** в папке `app/` (там же, где `manifest.json`, `sw.js`).
`worker.js` в репозиторий заливать не обязательно — он уже живёт на Cloudflare, но можно сохранить для истории кода.

```bash
git add app/dev-chat.html
git commit -m "add: CosmoCoder — служебный чат разработчика"
git push
```

## 7. Открой

```
https://superduck77.github.io/cosmogram-app/dev-chat.html
```

Страница нигде не подключена к игровым экранам и не появится в меню игроков — попасть на неё можно только по прямой ссылке.

## Стоимость

Claude Sonnet — примерно $3 за million input токенов, $15 за million output. Для чата на пару вопросов в день это копейки (доли цента за диалог). Cloudflare Workers бесплатны до 100 000 запросов в день.

## Если что-то не работает

- **"Не достучался до Worker'а"** — проверь, что адрес в `CONFIG.workerUrl` скопирован верно и без опечаток, и что воркер задеплоен (статус Active в дашборде).
- **"Forbidden origin"** — `ALLOWED_ORIGIN` в воркере не совпадает с адресом, откуда открыта страница. Для локальной проверки временно поставь значение `*`.
- **"ANTHROPIC_API_KEY not configured"** — секрет не сохранился, повтори шаг 3.
