# Настройки и Диагностика на ПК vs телефон — исследование (28.09.2026)

Задача владельца: компьютерная версия (браузер, мышь+клавиатура) показывает в «Настройках» и
«Диагностике» телефонное (гироскоп, вибрация, тревога «датчик молчит»), дыру в «Проверках»,
путаницу названий, «PORO / PO RO». «Очень глубоко подумать». Скилл deep-search, 4 линии:
наш код, техника браузеров (первоисточники), азиатские практики (JA/KO/ZH), европейские (EN/RU/DE/FR/ES/PT).

## 1. Наш код (v1.478.571)
- Две проверки гироскопа. Слабая `HAS_GYRO = typeof DeviceOrientationEvent!=='undefined'`
  (`js/input.js:8`) — true на любом настольном браузере. Честная `gyroSensorThere()`
  (`js/gyro.js:24-31`): телефон по tg.platform ИЛИ реально пришло событие с ненулевыми данными
  (`realGyroSeen`, `input.js:18-29`). Настройки (`ui.js:5094`) и Диагностика (`ui.js:3722-3726`)
  берут СЛАБУЮ → на ПК видны гироскоп/чувствительность/калибровка, красная «датчик молчит»,
  «Оживить» ничего не делает (`ui.js:3808-3814`). Кнопка «Полёт без рук» уже на честной — прячется верно.
- Вибрация: строки `setVibroBtn`, `setMorseHapBtn`, `diagVibroBtn` не смотрят ни на что.
- Дыра в «Проверках»: пустой `.statusBar.gyroBar` (min-height 32px) под «Проверкой вибрации»
  (`index.html:4912-4932`); сброс min-height есть только для `#settingsScreen` (`index.html:1919`).
- «Диагностика ошибок» (`setBeaconBtn`) = выключатель автоотчётов (телеметрии);
  «Диагностика» (`diagBtn`) = экран. Кнопка «Скопировать отчёт» в Диагностике убрана 02.09.2026,
  отправка — только через «Поддержка» → «Добавить автодиагностику».
- «PORO» — `myCallsign()`→`sanitizeCallsign` (режет пробелы); «PO RO» — `accIn(syncAuthName())`
  сырое имя. Поле позывного: placeholder обновляется только в applyLang, не после входа.
- Клавиши: `keyBindRowsVisibility()` прячет по `'ontouchstart' in window` — ноутбук с сенсорным
  экраном потеряет строки клавиш.

## 2. Техника (первоисточники)
- Спецификация W3C (CRD 2025-02-12): без датчика событие приходит с null. Chromium на ПК шлёт
  ОДНО событие с null (исходник device_orientation_event_pump.cc); Firefox на ПК — ничего.
  → «датчик есть» только после события с ненулевыми данными; до этого — нет. Ждать таймаут не нужно,
  если прятать до доказательства (так уже устроена `gyroSensorThere()`).
- `requestPermission` теперь есть и в Chrome (Intent to Ship, M151, 2026-06-17) — перестал значить «iOS».
- Telegram Desktop на датчики сразу отвечает UNSUPPORTED (исходник tdesktop), HapticFeedback там молча
  ничего не делает. SDK на клиентах <8.0 не зовёт callback — нужен таймаут.
- Вибрация: `navigator.vibrate` на настольном Chrome возвращает true, а реализация — пустая функция
  (исходник vibration_manager_impl.cc); Firefox убрал на ПК в 129; Safari нет вовсе; проверить
  «вибрация реально есть» НЕВОЗМОЖНО (WICG Web Haptics прямо это отказывается давать) → решать по
  устройству: Telegram android/ios, Android-браузер; на ПК прятать.
- Клавиатуру обнаружить нельзя (Media Queries 4 прямо говорит); честный сигнал — реальный keydown.
  Для «мыши» — `any-pointer:fine`. Гибриды (ноутбук с тачем, iPad с клавиатурой) — показывать по
  последнему реально использованному вводу (`pointerType`, keydown).

## 3. Практики
- Прятать то, что НИКОГДА не может работать на устройстве; гасить с причиной то, что выключено
  другой настройкой (Nielsen 2025-11-13, Smashing 2024-05-21, Apple HIG game controls 2025-06-09,
  Steam Deck Verified: «не показывать клавиатуру/мышь, если это не активный ввод»).
- Android settings guidelines: под каждым пунктом — текущее значение; 10–15 пунктов на экран;
  «Дополнительно» только если скрывает ≥3.
- Диагностика без ложных тревог — VALORANT: уровни «внимание/критично», говорит ЧЬЯ проблема
  (сеть/устройство/сервер), короткие вспышки игнорировать.
- Отчёт — одна-две кнопки от места проблемы, всё техническое прикладывается само, игрок пишет одну
  фразу (Bugnet 2026-05-01). WeChat: `wx.createFeedbackButton` — журнал копится тихо, уходит только
  по нажатию игрока. Простое имя: «Сообщить о проблеме», «debug» — только для технического.
- Китай (游戏陀螺 2019-12-10): не использовать серый для «выкл» (читается как «заблокировано»);
  гироскоп — режимом, не голым вкл/выкл (PUBG Mobile).
- Япония: ключи — при конфликте возвращать старое и подсвечивать красным (nekojara 2025-06-17).
- RU/DE/FR/ES/PT/KO: нового почти ничего (честно).

Источники с датами — в отчётах агентов этой сессии; ключевые ссылки: w3.org/TR/orientation-event,
github.com/chromium/chromium (…device_orientation_event_pump.cc, …vibration_manager_impl.cc),
tdesktop attach_bot_webview.cpp, core.telegram.org/bots/webapps, developer.apple.com/design/
human-interface-guidelines/game-controls, partner.steamgames.com/doc/steamdeck/compat,
learn.microsoft.com XAG 107, jakobnielsenphd.substack.com/p/inactive-buttons,
source.android.com/docs/core/settings/settings-guidelines, playvalorant.com (instability basics),
developers.weixin.qq.com (createFeedbackButton), youxituoluo.com/523638.html.
