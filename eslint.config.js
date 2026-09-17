// 17.09.2026 (владелец, «да, стоит подключить»): ESLint как отдельный слой поверх
// jsconfig.json/checkJs — ловит другой класс ошибок (не типы, а сами паттерны кода:
// неиспользуемые переменные, недостижимый код, = вместо == и т.п.). Работает целиком
// локально (глобальная установка npm -g eslint, как и Playwright у guard.mjs — никакого
// package.json/node_modules в самой игре, никакого билд-шага, ничего никуда не уходит).
// eslint:recommended — «сигнал без шума», не выдуманный список правил.
// 17.09.2026: eslint стоит ГЛОБАЛЬНО (npm -g), не в node_modules этого репозитория — поэтому
// без импорта из 'eslint/config' (он не резолвится без локальной установки); плоский конфиг
// работает и как простой массив объектов, без хелпера defineConfig.
//
// 17.09.2026 (живой замер): игра — ~20 файлов через обычные <script> без модулей, ВСЕ функции/
// переменные верхнего уровня одного файла видны всем остальным через общую глобальную область.
// ESLint по умолчанию линтит каждый файл в изоляции — «no-undef» иначе кричит на каждый вызов
// функции из соседнего файла (137 ложных ошибок на одном partitura.js). Вместо того чтобы
// выключать самое ценное правило — считаем реальный список имён верхнего уровня по всем js/*.js
// живьём при каждом запуске (не отдельный сгенерированный файл, который можно забыть обновить).
import { readdirSync, readFileSync } from 'node:fs';
function collectGameGlobals(){
  const names = new Set();
  for (const f of readdirSync('js')) {
    if (!f.endsWith('.js') || f === 'vendor') continue;
    const src = readFileSync('js/' + f, 'utf8');
    for (const m of src.matchAll(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) names.add(m[1]); // 17.09.2026: было без async/generator — пропускало `async function keepAwake(){...}`
    for (const m of src.matchAll(/^class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    // 17.09.2026 (два живых захода подряд, каждый раз ловил себя же на неполном разборе):
    // 1) `^(?:const|let|var)\s+(имя)` ловил только ПЕРВОЕ имя в списке через запятую
    //    (let a=1, b=2, c=3;) — пропускал остальные.
    // 2) Первый фикс (взять всю строку после const/let/var) всё ещё ломался, когда список
    //    переносится на несколько строк (реальный код игры: `let rec=[], ...,\n ghostA=0,
    //    ...,\n ghostBest=0;` — три строки, одно объявление). Теперь ищем начало
    //    const/let/var и вручную идём СИМВОЛ ЗА СИМВОЛОМ (включая переносы строк) до
    //    первой «;» на глубине скобок 0 — не по регексу на строку.
    for (const m of src.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+/g)) {
      let i = m.index + m[0].length, depth = 0, cur = '';
      const parts = [];
      for (; i < src.length; i++) {
        const ch = src[i];
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
        else if (ch === ';' && depth === 0) break;
        else cur += ch;
      }
      parts.push(cur);
      for (const part of parts) {
        const nm = part.trim().match(/^([A-Za-z_$][\w$]*)/);
        if (nm) names.add(nm[1]);
      }
    }
  }
  return Object.fromEntries([...names].map(n => [n, 'writable']));
}

export default [
  {
    files: ['js/**/*.js'],
    ignores: ['js/vendor/**'], // сторонние библиотеки не наши, не линтим
    languageOptions: {
      ecmaVersion: 'latest', // 17.09.2026: было 2020 — в игре уже есть 2_000_000 (числовой разделитель, ES2021), падало с «Identifier directly after number»
      sourceType: 'script', // 17.09.2026: игра без модулей/билда — обычные <script>, не ES-модули
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly',
        localStorage: 'readonly', location: 'readonly', fetch: 'readonly', performance: 'readonly',
        setTimeout: 'readonly', setInterval: 'readonly', clearTimeout: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        Audio: 'readonly', Image: 'readonly', CustomEvent: 'readonly', URL: 'readonly',
        Telegram: 'readonly', Mp4Muxer: 'readonly', // сторонние мосты, подключены отдельными тегами
        getComputedStyle: 'readonly', Event: 'readonly', crypto: 'readonly', File: 'readonly',
        confirm: 'readonly', matchMedia: 'readonly', DeviceOrientationEvent: 'readonly',
        MouseEvent: 'readonly', MutationObserver: 'readonly', history: 'readonly', screen: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', btoa: 'readonly', atob: 'readonly',
        Path2D: 'readonly', DOMMatrix: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly',
        VideoEncoder: 'readonly', EncodedVideoChunk: 'readonly', VideoFrame: 'readonly', Blob: 'readonly',
        indexedDB: 'readonly', FileReader: 'readonly', ReportingObserver: 'readonly',
        module: 'readonly', // js/skymail.js:550 — свой же осознанный UMD-щуп typeof module!=='undefined', не браузерный API
        ...collectGameGlobals(),
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }], // warn, не error — не блокирует; caughtErrors:none — catch(e){} без обращения к e жив по всей игре, обычный безопасный приём, не шум
      'no-undef': 'error', // самое ценное правило для файлов без модулей — ловит опечатку в имени функции/переменной
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      eqeqeq: ['warn', 'smart'], // 17.09.2026: warn — в игре есть осознанные == (сверка null/undefined разом), smart это не трогает
      'no-fallthrough': 'error',
      'no-redeclare': ['error', { builtinGlobals: false }], // 17.09.2026: свой же файл ЗАКОННО объявляет то, что мы сами добавили как глобал — не конфликт
    },
  },
];
