# Книга Ошибок и Решений (Troubleshooting Guide)

Этот документ собирает все известные ошибки проекта Cosmogram и способы их решения.
Читай его перед тем, как гуглить ошибку или спрашивать ИИ.

---

## 🛠 CI/CD и GitHub Actions

### 1. Ошибка: `Process completed with exit code 1`
**Симптом:** Тесты падают сразу после запуска.
**Причина:** Puppeteer не может запустить Chrome в Linux-контейнере без системных библиотек.
**Решение:** Добавить шаг установки зависимостей в `.github/workflows/ci.yml`:
```yaml
- name: Install dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libgbm1 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0
```

### 2. Ошибка: `No files were found... test-results.json`
**Симптом:** Артефакты не загружаются, даже если тесты шли.
**Причина:** Файл отчета не создан из-за падения скрипта, или шаг загрузки пропускается при ошибке.
**Решение:** В шаге `upload-artifact` добавить условие `if: always()`:
```yaml
- name: Upload Test Results
  uses: actions/upload-artifact@v4
  if: always() # Загружать даже при падении
  with:
    name: test-results
    path: test-results.json
```

### 3. Предупреждение: `Node.js 20 is deprecated`
**Симптом:** Желтое предупреждение в логах.
**Причина:** GitHub постепенно отказывается от Node 20.
**Решение:** В файле workflow указать свежую версию:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22' # Или 'latest'
```

### 4. Путаница: "Pages Build" vs "CI"
**Симптом:** Видишь зеленую галочку деплоя, но тесты не запускались.
**Суть:** GitHub Pages просто копирует файлы. Он НЕ исполняет JS и НЕ запускает тесты.
**Где смотреть тесты:** Вкладка **Actions** → Workflow **Cosmogram CI**.

---

## 🧪 Тесты ("Стражи")

### Как добавить нового стража?
1. Открой файл `js/guards.js`.
2. Добавь функцию теста:
   ```javascript
   function testNewFeature() {
     // логика проверки
     return true; // или false
   }
   GUARDS.push(testNewFeature);
   ```
3. Сохрани файл. Система автоматически отправит изменения на GitHub и запустит тесты.

### Где смотреть результаты тестов в браузере?
Открой консоль разработчика (F12) на странице игры. Там выводится отчет `GUARDS REPORT`.

---

## 💰 Экономика (Кэширование)

**Зачем нужно?**
- Без кэша: установка зависимостей ~60 сек.
- С кэшем: восстановление ~10 сек.

**Правила:**
1. В workflow обязательно: `cache: 'npm'`.
2. **Никогда не удаляй `package-lock.json`** вручную, иначе кэш сбросится и сборка замедлится.
3. Если кэш битый — удали его вручную во вкладке Actions → Caches.

---

## 📂 Структура знаний

Все важные решения хранятся в папке `.knowledge/`:
- `PROJECT.md` — общее описание.
- `ARCHITECTURE.md` — как устроен код.
- `ERRORS.md` (этот файл) — база ошибок.
- `CI-CD-MANUAL.md` — инструкция по настройке серверов.
