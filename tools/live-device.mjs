#!/usr/bin/env node
/* 18.09.2026 (владелец: «можешь создать новые инструменты, которых у нас ещё нету») —
   консолидация. За эту марафон-сессию живая отладка на подключённых телефонах (Samsung
   SM-A032F, Oppo CPH2631) шла через adb + Chrome DevTools Protocol НАПРЯМУЮ, но каждый раз
   отдельным одноразовым скриптом в /c/tmp: cdp_eval.js, cdp_console.js, cdp_shot.js,
   cdp_tap.js — у каждого своя копипаста подключения к ws://localhost:PORT/devtools/page/ID,
   и они успели разойтись: cdp_eval.js/cdp_shot.js честно делают `require('ws')`, а
   cdp_console.js молча полагается на глобальный WebSocket и упал бы без пакета `ws`, если бы
   Node был < 22. measure-title-clearance.mjs (этот же tools/, тоже 18.09.2026) уже показал
   правильный путь — глобальный WebSocket, ноль npm-пакетов, только child_process/fs/zlib —
   но остался единственным местом, где так сделано. Этот файл — ОДИН инструмент вместо пяти
   расходящихся копий: адрес форварда (adb PID) находится сам, все CDP-примитивы (eval,
   console, screenshot, tap, список открытых вкладок) — подкоманды одного CLI, одна функция
   подключения, без единого нового npm-пакета (глобальный WebSocket — Node 18.17+/20+/22+,
   на этой машине Node 24).

   Использование:
     node tools/live-device.mjs devices
       — список подключённых телефонов (adb devices -l).
     node tools/live-device.mjs forward <serial> [port]
       — сам находит webview_devtools_remote_<pid> живого WebView на телефоне и делает
         adb forward tcp:<port> (порт по умолчанию 9333). Нужно один раз после переподключения
         телефона/перезапуска Telegram — раньше PID искали руками через
         `adb shell cat /proc/net/unix | grep webview_devtools_remote`.
     node tools/live-device.mjs pages [port]
       — список открытых страниц WebView на форварднутом порту (id, url, title) —
         тот id нужен всем командам ниже.
     node tools/live-device.mjs eval <pageId> <jsExpression> [port]
       — выполняет JS в живой странице, печатает результат (Runtime.evaluate, awaitPromise).
     node tools/live-device.mjs console <pageId> [durationMs] [port]
       — слушает console-вызовы и необработанные исключения указанное время (по умолчанию 4000мс).
     node tools/live-device.mjs screenshot <pageId> <outPngPath> [port]
       — Page.captureScreenshot (снимок именно WebView через CDP — НЕ видит то, что поверх
         рисует сам Telegram нативно; для нативных элементов типа кнопки «Назад» нужен
         adb screencap, см. measure-title-clearance.mjs).
     node tools/live-device.mjs tap <pageId> <x> <y> [port]
       — настоящий touch-жест (Input.dispatchTouchEvent) — Telegram WebView этого требует,
         мышиный click может не долететь до того же обработчика, что реальный палец.
     node tools/live-device.mjs wake <serial> [port]
       — 18.09.2026, найдено живьём (владелец разблокировал экран, screenshot/tap всё равно
         сперва падали TIMEOUT — оказалось, экран проснулся, а сам Telegram — нет, был на
         списке чатов, мини-игра свёрнута в нижнюю плашку). Будит экран (adb keyevent), если
         спал, поднимает Telegram на передний план (adb monkey -p org.telegram.messenger).
         ЧЕСТНО НЕ ДОГАДЫВАЕТСЯ дальше: если страница WebView после этого всё ещё [свёрнуто]
         (мини-игра свёрнута в плашку внутри Telegram, не сам Telegram в фоне) — координаты
         плашки меняются от экрана к экрану, гадать рискованно; печатает явную подсказку
         «сам разверни на телефоне» вместо тыка вслепую.

   Пример полного захода на новом подключении:
     node tools/live-device.mjs devices
     node tools/live-device.mjs forward R7STA05K3BK 9333
     node tools/live-device.mjs pages 9333
     node tools/live-device.mjs eval 800575AE... "GAME_VERSION" 9333

   Живьём проверено 18.09.2026 на Samsung SM-A032F: devices/forward/pages/eval/console честно
   работают, даже когда страница помечена [свёрнуто] (Telegram открыт не на экране игры) —
   Runtime/Log-домены CDP не требуют композита кадра. А вот screenshot/tap на свёрнутой
   странице аккуратно падают в TIMEOUT (не зависают молча) — Page.captureScreenshot и
   Input.dispatchTouchEvent требуют, чтобы вкладка реально рисовала кадр. Если эти две команды
   ловят TIMEOUT — сначала открой на телефоне саму игру (не просто разбуди экран), это не баг
   инструмента, а честное ограничение CDP на бэкграунженном WebView. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT_DEFAULT = 9333;
const [cmd, ...args] = process.argv.slice(2);

function fail(msg){ console.error('ERROR: ' + msg); process.exit(1); }

function sh(cmd){ return execSync(cmd, { encoding: 'utf8' }); }

function cmdDevices(){
  const out = sh('adb devices -l');
  const lines = out.split('\n').slice(1).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { console.log('(телефоны не подключены)'); return; }
  lines.forEach(l => console.log(l));
}

function cmdForward(serial, port){
  if (!serial) fail('usage: forward <serial> [port]');
  port = port || PORT_DEFAULT;
  const socketList = sh(`adb -s ${serial} shell cat /proc/net/unix`);
  const m = socketList.match(/webview_devtools_remote_(\d+)/);
  if (!m) fail(`не нашёл живой webview_devtools_remote_* на ${serial} — открыт ли Telegram с игрой сейчас?`);
  const pid = m[1];
  sh(`adb -s ${serial} forward tcp:${port} localabstract:webview_devtools_remote_${pid}`);
  console.log(`forwarded tcp:${port} -> ${serial}:webview_devtools_remote_${pid}`);
}

async function cmdWake(serial, port){
  if (!serial) fail('usage: wake <serial> [port]');
  port = port || PORT_DEFAULT;
  const power = sh(`adb -s ${serial} shell dumpsys power`);
  const asleep = /mWakefulness=Asleep/.test(power);
  if (asleep) {
    sh(`adb -s ${serial} shell input keyevent KEYCODE_WAKEUP`);
    console.log('экран разбужен (был asleep)');
  } else {
    console.log('экран уже был awake');
  }
  const activity = sh(`adb -s ${serial} shell dumpsys activity activities`);
  const resumedMatch = activity.match(/ResumedActivity: ActivityRecord\{[^}]*\s(\S+)\/\S+/);
  const resumedPkg = resumedMatch ? resumedMatch[1] : '(не определить)';
  if (resumedPkg !== 'org.telegram.messenger') {
    sh(`adb -s ${serial} shell monkey -p org.telegram.messenger -c android.intent.category.LAUNCHER 1`);
    console.log(`Telegram поднят на передний план (был активен: ${resumedPkg})`);
    await new Promise(r => setTimeout(r, 1500));
  } else {
    console.log('Telegram уже был на переднем плане');
  }
  try {
    const pages = await listPages(port);
    const gamePage = pages.find(p => /cosmogram-app\/($|index\.html)/.test(p.url) || p.url.endsWith('cosmogram-app/'));
    if (!gamePage) {
      console.log('⚠ страница игры не найдена в списке CDP-вкладок — форвард настроен? (live-device.mjs forward), или Telegram открыт не на чате с игрой.');
      return;
    }
    const hidden = JSON.parse(gamePage.description || '{}').visible === false;
    if (hidden) {
      console.log(`⚠ страница игры (${gamePage.id}) всё ещё [свёрнуто] — Telegram спереди, но сама мини-игра свёрнута в нижнюю плашку. Координаты плашки на разных экранах разные, тыкать вслепую рискованно (можно попасть не туда) — разверни её на телефоне сам (тап по плашке "Cosmogram" внизу экрана), потом снова pages/screenshot.`);
    } else {
      console.log(`✅ страница игры (${gamePage.id}) видима и готова к screenshot/tap`);
    }
  } catch (e) {
    console.log('не удалось проверить CDP-вкладки (' + e.message + ') — форвард настроен?');
  }
}

async function listPages(port){
  const res = await fetch(`http://localhost:${port}/json`);
  if (!res.ok) fail(`GET /json на порту ${port} вернул ${res.status} — форвард настроен? (live-device.mjs forward)`);
  return res.json();
}

async function cmdPages(port){
  port = port || PORT_DEFAULT;
  const pages = await listPages(port);
  if (!pages.length) { console.log('(нет открытых страниц)'); return; }
  pages.forEach(p => console.log(`${p.id}  ${p.url}  ${JSON.parse(p.description||'{}').visible === false ? '[свёрнуто]' : ''}`));
}

function cdpCall(port, pageId, method, params = {}, timeoutMs = 10000){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${pageId}`);
    const id = 1;
    const timer = setTimeout(() => { try{ws.close();}catch{} reject(new Error('TIMEOUT')); }, timeoutMs);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id, method, params })));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    ws.addEventListener('error', (e) => { clearTimeout(timer); reject(new Error('WS ERROR: ' + (e.message || e.type))); });
  });
}

/* 18.09.2026 (найдено живым тестом сразу после написания, телефон разблокирован владельцем):
   `tap` изначально звал cdpCall() дважды — каждый вызов открывает и закрывает СВОЁ ws-
   соединение. Между touchStart и touchEnd соединение успевало закрыться и открыться заново —
   Android WebView сбрасывает состояние жеста при закрытии CDP-сессии, второй вызов падал
   с «Must send a TouchStart first». Открытая живая сессия (эта функция) держит ОДНО
   соединение на весь жест — то, что случайный побочный BACK на телефоне после первого
   провала не наделал беды, было везением с раскладкой экрана, не гарантией. */
function cdpSession(port, pageId){
  const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${pageId}`);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(new Error('WS ERROR: ' + (e.message || e.type))));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  return {
    async call(method, params = {}, timeoutMs = 10000){
      await ready;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('TIMEOUT')); }, timeoutMs);
        pending.set(id, { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: (e) => { clearTimeout(timer); reject(e); } });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close(){ try { ws.close(); } catch {} }
  };
}

async function cmdEval(pageId, expr, port, timeoutMs){
  if (!pageId || expr === undefined) fail('usage: eval <pageId> <jsExpression> [port] [timeoutMs]');
  port = port || PORT_DEFAULT;
  timeoutMs = timeoutMs || 10000;
  const result = await cdpCall(port, pageId, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, timeoutMs);
  console.log(JSON.stringify(result, null, 2));
}

async function cmdConsole(pageId, duration, port){
  if (!pageId) fail('usage: console <pageId> [durationMs] [port]');
  duration = Number(duration || 4000);
  port = port || PORT_DEFAULT;
  const logs = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/devtools/page/${pageId}`);
    let id = 1;
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: id++, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: id++, method: 'Log.enable' }));
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const argsTxt = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        logs.push(`[console.${msg.params.type}] ${argsTxt}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        // 23.09.2026: url/lineNumber добавлены — раньше видели ТЕКСТ ошибки без места, гадать
        // откуда она вообще было нечем (живой Oppo-specific exception, точку никак не найти
        // без source location).
        const d = msg.params.exceptionDetails;
        const loc = d.url ? ` @ ${d.url}:${d.lineNumber}:${d.columnNumber}` : '';
        const stack = d.stackTrace && d.stackTrace.callFrames ? ' | stack: ' + d.stackTrace.callFrames.map(f=>`${f.functionName||'<anon>'}@${f.url}:${f.lineNumber}`).join(' < ') : '';
        logs.push(`[EXCEPTION] ${d.text} ${d.exception ? (d.exception.description || d.exception.value || '') : ''}${loc}${stack}`);
      }
      if (msg.method === 'Log.entryAdded') {
        logs.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
      }
    });
    ws.addEventListener('error', (e) => reject(new Error('WS ERROR: ' + (e.message || e.type))));
    setTimeout(() => { try{ws.close();}catch{} resolve(); }, duration);
  });
  console.log(logs.length ? logs.join('\n') : '(нет новых сообщений за это время)');
}

async function cmdScreenshot(pageId, outPath, port){
  if (!pageId || !outPath) fail('usage: screenshot <pageId> <outPngPath> [port]');
  port = port || PORT_DEFAULT;
  const result = await cdpCall(port, pageId, 'Page.captureScreenshot', { format: 'png' });
  if (!result || !result.data) fail('CDP не вернул данные снимка');
  writeFileSync(outPath, Buffer.from(result.data, 'base64'));
  console.log('saved ' + outPath);
  /* 19.09.2026: проверил три способа автоматически поймать враньё CDP (document.visibilityState,
     document.hasFocus()/hidden, размер PNG-файла в байтах) — ни один не сработал, все три
     докладывали «всё нормально» в момент, когда кадр был заведомо неверным (страница сама не
     знает, что отдаёт устаревший композит). Честного автоматического детектора не существует —
     единственная защита - громкое предупреждение при КАЖДОМ вызове, не только в комментарии
     наверху файла, который легко пропустить. */
  console.error('⚠ ВНИМАНИЕ: эта команда (CDP screenshot) может тихо отдать УСТАРЕВШИЙ кадр без единой ошибки — доказано живьём 19.09.2026 (грей вместо звёздного фона, все проверки "страница видима" при этом отвечали true). Для настоящей визуальной проверки используй: node tools/live-device.mjs hwshot <serial> <outPngPath>');
}

/* 19.09.2026, найдено живьём (соло-аудит, продолжение того же захода): Page.captureScreenshot
   ТИХО отдавал серый плейсхолдер вместо настоящего кадра на «видимой» по /json странице —
   три подряд снимка через `screenshot` показывали плоский серый фон вместо звёздного градиента.
   Проверка computed style (getComputedStyle(document.body).backgroundColor) сразу показала
   настоящий rgb(11,22,38) — тёмно-синий, не серый; adb screencap (аппаратный, минуя CDP-
   композит вовсе) подтвердил: фон правильный. НИ ОДНОЙ ошибки от CDP при этом не было — просто
   неверный кадр с кодом успеха. hwshot — то же самое, что measure-title-clearance.mjs уже
   использует для нативных элементов Telegram, здесь как самостоятельная команда для любой
   визуальной проверки, не только геометрии заголовка. */
function cmdHwshot(serial, outPath){
  if (!serial || !outPath) fail('usage: hwshot <serial> <outPngPath>');
  const buf = Buffer.from(sh(`adb -s ${serial} exec-out screencap -p | base64`).replace(/\n/g, ''), 'base64');
  writeFileSync(outPath, buf);
  console.log('saved ' + outPath + ' (аппаратный adb screencap — настоящий кадр экрана, надёжнее CDP screenshot)');
}

async function cmdTap(pageId, x, y, port){
  if (!pageId || x === undefined || y === undefined) fail('usage: tap <pageId> <x> <y> [port]');
  x = Number(x); y = Number(y);
  port = port || PORT_DEFAULT;
  const session = cdpSession(port, pageId);
  try {
    await session.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await session.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    console.log(`tap sent at ${x},${y}`);
  } finally { session.close(); }
}

const HELP = `live-device.mjs — живая отладка подключённых телефонов через adb + CDP, без npm-зависимостей
  devices
  forward <serial> [port]
  pages [port]
  eval <pageId> <jsExpression> [port] [timeoutMs]   — timeoutMs по умолчанию 10000, поднять для тяжёлых батчей на слабом телефоне
  console <pageId> [durationMs] [port]
  screenshot <pageId> <outPngPath> [port]
  tap <pageId> <x> <y> [port]
  wake <serial> [port]
  hwshot <serial> <outPngPath>   — настоящий кадр экрана (adb screencap), надёжнее screenshot`;

try {
  switch (cmd) {
    case 'devices': cmdDevices(); break;
    case 'forward': cmdForward(args[0], args[1] && Number(args[1])); break;
    case 'wake': await cmdWake(args[0], args[1] && Number(args[1])); break;
    case 'hwshot': cmdHwshot(args[0], args[1]); break;
    case 'pages': await cmdPages(args[0] && Number(args[0])); break;
    case 'eval': await cmdEval(args[0], args[1], args[2] && Number(args[2]), args[3] && Number(args[3])); break;
    case 'console': await cmdConsole(args[0], args[1], args[2] && Number(args[2])); break;
    case 'screenshot': await cmdScreenshot(args[0], args[1], args[2] && Number(args[2])); break;
    case 'tap': await cmdTap(args[0], args[1], args[2], args[3] && Number(args[3])); break;
    default: console.log(HELP); process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  fail(e.message);
}
