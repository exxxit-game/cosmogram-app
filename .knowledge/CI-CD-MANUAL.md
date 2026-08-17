# Руководство по CI/CD для Cosmogram

## 🚨 Частые ошибки и решения

### 1. Ошибка: `Process completed with exit code 1`
**Симптом:** Тесты падают сразу при запуске Puppeteer.
**Причина:** В среде GitHub Actions нет системных библиотек для запуска Chrome (библиотеки GTK, Cairo и т.д.).
**Решение:** В файле `.github/workflows/ci.yml` **обязательно** должен быть шаг установки зависимостей перед тестами:

```yaml
- name: Install dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libgbm1 libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6
```

### 2. Ошибка: `No files were found... test-results.json`
**Симптом:** Артефакты не загружаются, невозможно посмотреть лог упавших тестов.
**Причина:** Тесты упали до создания файла отчета, или шаг загрузки артефактов срабатывает только при успехе (`success()`).
**Решение:** Использовать условие `if: always()` в шаге загрузки артефактов, чтобы забрать лог даже при падении:

```yaml
- name: Upload Test Results
  if: always() # Важно! Загружаем даже при ошибке
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: test-results.json
```

### 3. Ошибка: `Node.js 20 is deprecated`
**Симптом:** Желтые предупреждения в логах о устаревшей версии Node.
**Причина:** GitHub меняет версии рантаймеров на серверах.
**Решение:** Обновить действие `actions/setup-node@v4` на использование актуальной версии:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22' # Или новее
```

### 4. Путаница: "Pages Build" vs "CI"
**Симптом:** Ты видишь зеленый значок ✅ рядом с коммитом (Deploy to GitHub Pages), но тесты на самом деле не шли или упали.
**Объяснение:** 
- **GitHub Pages** — это просто копирование файлов (`index.html`, `js/`, `css/`) на хостинг. Он **не исполняет** JavaScript и не проверяет логику.
- **GitHub Actions (CI)** — это отдельный процесс, который запускает код в изолированной среде, прогоняет тесты и проверяет работоспособность.
**Проверка:** 
- Не смотри на вкладку *Environments* или *Deployments*.
- Ищи вкладку **Actions** → выбери workflow **Cosmogram CI**. Только там реальный статус тестов.

---

## 🛡️ Как добавить новый тест ("Стража")

Система тестов построена так, что добавление нового теста занимает 1 минуту.

1. Открой файл `js/guards.js`.
2. Добавь новую функцию-тест по шаблону:

```javascript
// Пример: проверка существования игрока
guard('Player exists', () => {
  const player = window.game?.player;
  if (!player) throw new Error('Player object is missing');
  if (typeof player.update !== 'function') throw new Error('Player has no update method');
});
```

3. Сохрани файл, сделай коммит и запуш (`git push`).
4. GitHub Actions автоматически подхватит новый тест при следующем запуске.

---

## 💰 Экономика (Кэширование)

Ускорение сборки критически важно для быстрой обратной связи.

| Сценарий | Время выполнения | Расход трафика |
|----------|------------------|----------------|
| **Без кэша** | ~60 сек | ~150 MB (каждый раз) |
| **С кэшем** (`cache: 'npm'`) | ~10 сек | ~0 MB (восстановление локально) |

**Правила:**
1. В `ci.yml` всегда используй ключ кэширования:
   ```yaml
   - name: Cache node modules
     uses: actions/cache@v3
     with:
       path: node_modules
       key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
   ```
2. **Никогда не удаляй `package-lock.json`** вручную. Если он исчезнет или изменится хэш, кэш сбросится, и следующая сборка будет медленной.
3. Если нужно принудительно сбросить кэш (например, обновились системные библиотеки), измени версию ключа в `ci.yml` (например, `key: v2-${{ ... }}`).

---

## 📂 Структура файлов CI/CD

```
.github/
└── workflows/
    └── ci.yml            ← Главный конфиг запуска
tests/
├── run-ci.js             ← Скрипт запуска в headless браузере
└── guards-list.js        ← Список всех активных стражей
js/
└── guards.js             ← Логика реестра тестов
.knowledge/
└── CI-CD-MANUAL.md       ← ЭТОТ ФАЙЛ
```

## 🆘 Экстренная помощь

Если тесты падают непонятно почему:
1. Зайди в **Actions** → кликни на красный крест ❌.
2. Кликни на шаг `Run Tests`.
3. Прочитай вывод консоли. Ищи строки `Error:` или `Failed:`.
4. Скачай артефакт `test-results` (если настроен `if: always()`), чтобы увидеть полный JSON отчет.
5. Проверь, не забыл ли ты установить системные зависимости (см. пункт 1).
