// mode-palette-search.mjs — подбор цветов режимов ИЗМЕРЕНИЕМ (30.09.2026): OKLab-расстояние при обычном зрении и трёх видах дальтонизма (матрицы Machado 2009, сверены по первоисточнику), контраст текста ≥4.5:1 к тёмной карточке, отличие от золота результата. Запуск: node tools/mode-palette-search.mjs. Смысл режима задаёт диапазон оттенка (SLOTS), любимость — .knowledge/RESEARCH-2026-09-FAVORITE-COLOR-SURVEYS-*.md.
// Подбор цветов 7 режимов: смысл (диапазон оттенка) × любимость × измеренная различимость (норма + 3 вида дальтонизма) × отличие от золота результата.
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { c = Math.max(0, Math.min(1, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };
const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function toOKLab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOKLCH(L, C, h) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  return rgb.some((v) => v < -0.001 || v > 1.001) ? null : rgb.map(gam);
}
const MAT = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
];
const labs = (rgb255) => { const v = rgb255.map(lin); return MAT.map((M) => toOKLab(M.map((row) => Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))))); };
const d4 = (A, B) => { let m = 9; for (let k = 0; k < 4; k++) { const a = A[k], b = B[k]; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < m) m = d; } return m; };

const relLum = (rgb) => { const [r,g,b]=rgb.map(lin); return 0.2126*r+0.7152*g+0.0722*b; };
const BG = unhex('#101a2e'); // тёмная карточка экрана итогов
const contrast = (rgb) => { const a=relLum(rgb)+0.05, b=relLum(BG)+0.05; return a>b? a/b : b/a; };
const GOLD = { id: 'ЗОЛОТО', rgb: unhex('#f0c040') }; GOLD.labs = labs(GOLD.rgb);
const SLOTS = [
  ['Score Attack', 'синий: главный режим, космос; самый любимый цвет в опросах', [238, 268], [0.60, 0.68, 0.76]],
  ['Speedrun', 'оранжево-красный: скорость, жар', [28, 52], [0.70, 0.76, 0.82]],
  ['Без касаний', 'циан: лёд, чистота, точность', [195, 222], [0.76, 0.84, 0.90]],
  ['Биатлон', 'зелёный: мишень, природа; №2 по любимости', [140, 165], [0.66, 0.74, 0.82]],
  ['Эстафета', 'фиолетовый: команда, цепочка', [292, 322], [0.56, 0.64, 0.72]],
  ['Небо месяца', 'розовый: закат, календарь (вместо золота)', [335, 360], [0.72, 0.80, 0.88]],
  ['Караван', 'песок/серебро/лайм: груз, путь (вместо янтаря)', [70, 130], [0.78, 0.86, 0.92]]
];
const CS = [[0.12,0.15,0.18],[0.12,0.15,0.18],[0.12,0.15,0.18],[0.12,0.15,0.18],[0.12,0.15,0.18],[0.12,0.15,0.18],[0.06,0.10,0.14]]; // насыщенность: у шести режимов не тусклее 0.12, у Каравана (песок/лайм) от 0.06
const cand = SLOTS.map(([id, why, hr, Ls], si) => { const Cs = CS[si];
  const out = [];
  for (let h = hr[0]; h <= hr[1]; h += 6) for (const L of Ls) for (const C of Cs) { const rgb = fromOKLCH(L, C, h); if (rgb) { const o = { id, rgb, L, C, h }; o.labs = labs(rgb); if (d4(o.labs, GOLD.labs) > 0.11 && contrast(rgb) >= 4.5) out.push(o); } }
  return out;
});
console.log('кандидатов по слотам:', cand.map((c) => c.length).join(' '), '(отличие от золота результата ≥ 0.11 во всех видах зрения)');
// поиск: для каждого слота оставляем по 9 кандидатов (равномерно), максимизируем минимум
const pool = cand.map((list) => { const step = Math.max(1, Math.floor(list.length / 9)); return list.filter((_, i) => i % step === 0).slice(0, 9); });
let best = { s: -1 };
function rec(i, ch, cur) {
  if (i === pool.length) { if (cur > best.s) best = { s: cur, ch: ch.slice() }; return; }
  for (const c of pool[i]) {
    let m = cur; for (const p of ch) { const d = d4(p.labs, c.labs); if (d < m) m = d; if (m <= best.s) break; }
    if (m <= best.s) continue; ch.push(c); rec(i + 1, ch, m); ch.pop();
  }
}
rec(0, [], 9);
console.log('\nЛучшая семёрка — минимальное расстояние между любыми двумя режимами при любом виде зрения:', best.s.toFixed(3));
best.ch.forEach((c) => console.log('  ' + c.id.padEnd(13), hex(...c.rgb), 'L' + c.L, 'C' + c.C, 'h' + c.h, ' контраст к карточке ' + contrast(c.rgb).toFixed(1) + ':1'));
// слабое место найденной
let worst = { d: 9 };
for (let i = 0; i < best.ch.length; i++) for (let j = i + 1; j < best.ch.length; j++) { const d = d4(best.ch[i].labs, best.ch[j].labs); if (d < worst.d) worst = { d, a: best.ch[i].id, b: best.ch[j].id }; }
console.log('  слабое место:', worst.a, '~', worst.b, worst.d.toFixed(3));
// шкала: 0.02 ≈ едва заметно, 0.05 ≈ различимо рядом, 0.10 ≈ уверенно различимо
