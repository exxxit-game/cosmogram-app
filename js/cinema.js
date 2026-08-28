'use strict';
/* ============================================================
   CINEMA (модуль, шаг 1 из плана «Кино полёта» — см. владелец,
   28.08.2026, и .knowledge/FLIGHT-CINEMA-ARCHITECTURE.md):
   только подбор рабочего видеокодека. Ничего не рендерит, не
   трогает игру и не вызывается пока ниоткуда — следующий шаг
   подключит сюда запись живого канваса через VideoEncoder.

   Порядок и сами кодеки — по живым пробам webcodecsProbe()
   (js/beacon.js) из таблицы beacons (проверено 28.08.2026, 110
   проб: 82 android, 20 Win32, 3 ios, несколько linux/tdesktop):
     H.264 — 0% и на Android, и на Win32 (аппаратно и программно),
             но 100% на iOS (3 из 3 проб, hw и sw) — пробуем первым,
             дёшево для платформ, где он есть.
     VP9   — программно ~72% Android, 90% Win32, 100% iOS.
     VP8   — те же ~72%/90%/100% — как запасной вариант к VP9.
     AV1 не пробуем: 63% Android, ниже соседей, третьего запасного
     кодека сверх VP8/VP9 сейчас смысла нет.
   Примерно у 28% проверенных Android-устройств не собрался НИ ОДИН
   кодек — на них pickVideoCodec() честно вернёт null, а не подменит
   отказ подделкой. */
const CINEMA_CODECS=[
  {id:'h264', str:'avc1.42001E'},
  {id:'vp9',  str:'vp09.00.10.08'},
  {id:'vp8',  str:'vp8'},
];
async function pickVideoCodec(w, h){
  w = w||1080; h = h||1920;
  if (typeof VideoEncoder==='undefined') return null; // старый браузер — честно ничего, не гадаем
  for (const codec of CINEMA_CODECS){
    const cfg={ codec:codec.str, width:w, height:h, bitrate:2_000_000, framerate:30, hardwareAcceleration:'no-preference' };
    try{
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r && r.supported) return { id:codec.id, config:cfg };
    }catch(e){} // отказ этого кодека — пробуем следующий по списку, не ошибка модуля
  }
  return null; // ни один кодек не собрался — честный отказ, дальше решает вызывающий код
}
