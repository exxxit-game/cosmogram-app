'use strict';
/* ============================================================
   НАГРАДЫ-ДОСЬЕ (модуль). 02.10.2026 владелец: «достижение, которое выглядит как статистика, как чек из магазина, — не достижение»;
   макет «Награды — архив досье» (claude.ai/artifact/FmZVGKQ5YQPG5Hnrr1WWhH), «Делаем». Награда — сама эмблема и строка истории, без звёзд ✦ и без
   связи со скинами/покупками (владелец: «это формирует зависимость покупать их»). Пять открытых наград (видно, как получить) и девять секретных
   «досье» (условие не показывается, на закрытых — замок и намёк). Условия — только то, что игра реально определяет (см. achRunCheck).
   Исследование и проверенные космические факты: .knowledge/RESEARCH-2026-10-ACHIEVEMENTS-SECRETS.md.
   Зависит от core.js (Store, L, toast, haptic, sfx, saneNumber), game.js (Stats, S, rec), ui.js (setScreen) — грузится после game.js.
   ============================================================ */

const fmtN=n=>String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const needOf=a=>typeof a.need==='function'?a.need():a.need;
const aT=a=>{ const l=(typeof langEff!=='undefined')?langEff:'ru'; return ((a.x&&a.x[l]) || (l==='id'?null:a[l]) || a.en || a.ru); }; // у награды есть поле id (идентификатор), совпадающее с кодом индонезийского языка: его перевод лежит в a.tr.id

/* Строки экрана наград: пока только по-русски (как и текст Хартии) — ovT() берёт русскую, если на языке игрока строки нет. */
Object.assign(I18N.ru,{
  achSumOpen:(n,t)=>'Открыто '+n+' из '+t, achLast:'Последняя находка', achNotYet:'Ещё не найдено',
  achFoundHd:'Найдено', achNotFoundHd:'Не найдено', achSecretHd:(f,t)=>'Засекречено · найдено '+f+' из '+t,
  achSecretLbl:n=>'Засекречено · досье №'+n, achDossier:n=>'досье №'+n,
  achClaimCls:'Достижение', achClaimSec:n=>'Секретное досье №'+n, achNext:'Дальше'
});

/* ---------- Список: открытые (open) — видно, как получить; секретные (secret, no — номер досье) — условие скрыто ----------
   em — эмблема (символ #ea-<em> в спрайте index.html); val/need — прогресс для открытых; события секретных см. achRunCheck().
   id c1/f1/d1/d2 оставлены прежними — уже полученные награды игроков не теряются. Скины и «Тюнинг» убраны совсем. */
const ACH=[
  {id:'c1', em:'karman', need:100000, val:()=>Stats.totalDist,
    ru:{n:'Линия Кармана', d:'Сто километров вверх. Граница космоса для всех, кроме американцев: им хватает восьмидесяти.'}},
  {id:'f1', em:'pilot', need:1, val:()=>Store.get('gyroGold',0),
    ru:{n:'Пилот', d:'Самолёт послушался наклона. Подозрительно.'}},
  {id:'d1', em:'vyzov', need:1, val:()=>Stats.duelsSent||0,
    ru:{n:'Первый вызов', d:'Бросил другу вызов. Друг пока не знает, что это было предупреждение.'}},
  {id:'d2', em:'pobeditel', need:1, val:()=>Stats.duelsWon||0,
    ru:{n:'Победитель дуэли', d:'Побил чужую планку. Друг называет это случайностью.'}},
  {id:'o5', em:'lishniy', ev:true,
    ru:{n:'Лишний манёвр', d:'За один полёт проехать по горизонтали двадцать пять ширин экрана. Самолёт не жаловался.'}},
  {id:'s1', em:'poekhali', secret:true, no:1,
    ru:{n:'Поехали!', d:'12 апреля 1961. Одно слово, которое запомнили лучше всего остального.', h:'Начало всегда одно.'}},
  {id:'s2', em:'vernulis', secret:true, no:2,
    ru:{n:'Все вернулись', d:'Белка и Стрелка: семнадцать витков вокруг Земли. Вернулись все, и мыши тоже.', h:'Счёт идёт подряд.'}},
  {id:'s3', em:'laika', secret:true, no:3,
    ru:{n:'Лайка', d:'3 ноября 1957. Долго говорили, что она прожила неделю. Правда стала известна в 2002 году.', h:'Тишина — тоже ответ.'}},
  {id:'s4', em:'wow', secret:true, no:4,
    ru:{n:'Wow!', d:'15 августа 1977. Сигнал длился 72 секунды и больше не повторился.', h:'Он длился чуть больше минуты.'}},
  {id:'s5', em:'g2373', secret:true, no:5,
    ru:{n:'23 на 73', d:'16 ноября 1974. 1679 точек, посланных к звёздному скоплению. Ответа ждём до сих пор.', h:'Если разложить, получится картинка.'}},
  {id:'s6', em:'pylinka', secret:true, no:6,
    ru:{n:'Пылинка', d:'14 февраля 1990. С шести миллиардов километров Земля — точка меньше пикселя.', h:'Чем меньше, тем лучше видно.'}},
  {id:'s7', em:'panic', secret:true, no:7,
    ru:{n:'Не паникуй', d:'Эта надпись стоит на приборной панели «Стармена», который летит мимо Земли с 6 февраля 2018 года.', h:'Ответ на главный вопрос.'}},
  {id:'s8', em:'mir', secret:true, no:8,
    ru:{n:'Мир', d:'23 марта 2001. Станция прожила пятнадцать лет и затонула в Тихом океане.', h:'Четыре этапа — один путь.'}},
  {id:'s9', em:'gdevse', secret:true, no:9,
    ru:{n:'Где все?', d:'Парадокс Ферми, 1950. Если они есть, где они? Пустое небо месяца — тоже ответ.', h:'Если они есть, где они?'}}
];

/* 02.10.2026 перевод наград на en/es/pt/fr (черновик ИИ, носитель не читал). Факты те же, что в русском тексте; даты и числа не менялись. */
Object.assign(I18N.en,{
  achSumOpen:(n,t)=>'Unlocked '+n+' of '+t, achLast:'Last find', achNotYet:'Not found yet', achFoundHd:'Found', achNotFoundHd:'Not found',
  achSecretHd:(f,t)=>'Classified · found '+f+' of '+t, achSecretLbl:n=>'Classified · file No. '+n, achDossier:n=>'file No. '+n,
  achClaimCls:'Achievement', achClaimSec:n=>'Classified file No. '+n, achNext:'Next'
});
Object.assign(I18N.es,{
  achSumOpen:(n,t)=>'Desbloqueado '+n+' de '+t, achLast:'Último hallazgo', achNotYet:'Aún sin encontrar', achFoundHd:'Encontrados', achNotFoundHd:'Sin encontrar',
  achSecretHd:(f,t)=>'Clasificado · encontrados '+f+' de '+t, achSecretLbl:n=>'Clasificado · expediente n.º '+n, achDossier:n=>'expediente n.º '+n,
  achClaimCls:'Logro', achClaimSec:n=>'Expediente clasificado n.º '+n, achNext:'Siguiente'
});
Object.assign(I18N.pt,{
  achSumOpen:(n,t)=>'Desbloqueado '+n+' de '+t, achLast:'Última descoberta', achNotYet:'Ainda por encontrar', achFoundHd:'Encontradas', achNotFoundHd:'Não encontradas',
  achSecretHd:(f,t)=>'Sigiloso · encontradas '+f+' de '+t, achSecretLbl:n=>'Sigiloso · dossiê n.º '+n, achDossier:n=>'dossiê n.º '+n,
  achClaimCls:'Conquista', achClaimSec:n=>'Dossiê sigiloso n.º '+n, achNext:'Próxima'
});
Object.assign(I18N.fr,{
  achSumOpen:(n,t)=>'Débloqué '+n+' sur '+t, achLast:'Dernière trouvaille', achNotYet:'Pas encore trouvé', achFoundHd:'Trouvés', achNotFoundHd:'Non trouvés',
  achSecretHd:(f,t)=>'Classifié · trouvés '+f+' sur '+t, achSecretLbl:n=>'Classifié · dossier n° '+n, achDossier:n=>'dossier n° '+n,
  achClaimCls:'Succès', achClaimSec:n=>'Dossier classifié n° '+n, achNext:'Suivant'
});
const ACH_TR={
  c1:{en:{n:'Kármán Line',d:'One hundred kilometers straight up. The edge of space for everyone except the Americans: eighty is enough for them.'},
    es:{n:'Línea de Kármán',d:'Cien kilómetros hacia arriba. El límite del espacio para todos, salvo para los estadounidenses: a ellos les bastan ochenta.'},
    pt:{n:'Linha de Kármán',d:'Cem quilômetros para cima. O limite do espaço para todos, exceto os americanos: para eles, oitenta bastam.'},
    fr:{n:'Ligne de Kármán',d:'Cent kilomètres à la verticale. La limite de l’espace pour tout le monde, sauf pour les Américains : quatre-vingts leur suffisent.'}},
  f1:{en:{n:'Pilot',d:'The plane obeyed the tilt. Suspicious.'},
    es:{n:'Piloto',d:'El avión obedeció la inclinación. Sospechoso.'},
    pt:{n:'Piloto',d:'O avião obedeceu à inclinação. Suspeito.'},
    fr:{n:'Pilote',d:'L’avion a obéi à l’inclinaison. Suspect.'}},
  d1:{en:{n:'First Challenge',d:'You challenged a friend. The friend does not know yet that it was a warning.'},
    es:{n:'Primer desafío',d:'Desafiaste a un amigo. Tu amigo todavía no sabe que era una advertencia.'},
    pt:{n:'Primeiro desafio',d:'Você desafiou um amigo. Seu amigo ainda não sabe que era um aviso.'},
    fr:{n:'Premier défi',d:'Vous avez défié un ami. Il ne sait pas encore que c’était un avertissement.'}},
  d2:{en:{n:'Duel Winner',d:'You beat someone else’s mark. Your friend calls it luck.'},
    es:{n:'Ganador del duelo',d:'Superaste la marca de otro. Tu amigo lo llama casualidad.'},
    pt:{n:'Vencedor do duelo',d:'Você superou a marca de outro. Seu amigo chama isso de acaso.'},
    fr:{n:'Vainqueur du duel',d:'Vous avez battu le record d’un autre. Votre ami appelle ça un coup de chance.'}},
  o5:{en:{n:'Extra Maneuver',d:'In a single flight, travel twenty-five screen widths sideways. The plane did not complain.'},
    es:{n:'Maniobra de más',d:'En un solo vuelo, recorre veinticinco anchos de pantalla en horizontal. El avión no se quejó.'},
    pt:{n:'Manobra extra',d:'Em um único voo, percorra vinte e cinco larguras de tela na horizontal. O avião não reclamou.'},
    fr:{n:'Manœuvre de trop',d:'En un seul vol, parcourez vingt-cinq largeurs d’écran à l’horizontale. L’avion ne s’est pas plaint.'}},
  s1:{en:{n:'Poyekhali!',d:'April 12, 1961. One word remembered better than anything else.',h:'There is only ever one beginning.'},
    es:{n:'¡Poyekhali!',d:'12 de abril de 1961. Una palabra que se recuerda mejor que todo lo demás.',h:'El comienzo siempre es uno.'},
    pt:{n:'Poyekhali!',d:'12 de abril de 1961. Uma palavra lembrada melhor do que todo o resto.',h:'O começo é sempre um só.'},
    fr:{n:'Poïekhali !',d:'12 avril 1961. Un mot que l’on retient mieux que tout le reste.',h:'Le début est toujours unique.'}},
  s2:{en:{n:'All Came Back',d:'Belka and Strelka: seventeen orbits around the Earth. They all came back, the mice too.',h:'The count goes in a row.'},
    es:{n:'Todos volvieron',d:'Belka y Strelka: diecisiete vueltas a la Tierra. Volvieron todos, y los ratones también.',h:'La cuenta va seguida.'},
    pt:{n:'Todos voltaram',d:'Belka e Strelka: dezessete voltas ao redor da Terra. Voltaram todos, os ratos também.',h:'A contagem segue em sequência.'},
    fr:{n:'Tous sont revenus',d:'Belka et Strelka : dix-sept tours autour de la Terre. Tous sont revenus, les souris aussi.',h:'Le compte se fait d’affilée.'}},
  s3:{en:{n:'Laika',d:'November 3, 1957. For a long time it was said she lived a week. The truth became known in 2002.',h:'Silence is also an answer.'},
    es:{n:'Laika',d:'3 de noviembre de 1957. Durante mucho tiempo se dijo que vivió una semana. La verdad se supo en 2002.',h:'El silencio también es una respuesta.'},
    pt:{n:'Laika',d:'3 de novembro de 1957. Por muito tempo se disse que ela viveu uma semana. A verdade só foi conhecida em 2002.',h:'O silêncio também é uma resposta.'},
    fr:{n:'Laïka',d:'3 novembre 1957. On a longtemps dit qu’elle avait vécu une semaine. La vérité n’a été connue qu’en 2002.',h:'Le silence est aussi une réponse.'}},
  s4:{en:{n:'Wow!',d:'August 15, 1977. The signal lasted 72 seconds and never repeated.',h:'It lasted a little over a minute.'},
    es:{n:'¡Wow!',d:'15 de agosto de 1977. La señal duró 72 segundos y no se repitió nunca más.',h:'Duró poco más de un minuto.'},
    pt:{n:'Wow!',d:'15 de agosto de 1977. O sinal durou 72 segundos e nunca mais se repetiu.',h:'Durou pouco mais de um minuto.'},
    fr:{n:'Wow !',d:'15 août 1977. Le signal a duré 72 secondes et ne s’est jamais répété.',h:'Il a duré un peu plus d’une minute.'}},
  s5:{en:{n:'23 by 73',d:'November 16, 1974. 1679 dots sent toward a star cluster. We are still waiting for an answer.',h:'Arrange them in a grid and a picture appears.'},
    es:{n:'23 por 73',d:'16 de noviembre de 1974. 1679 puntos enviados hacia un cúmulo estelar. Seguimos esperando respuesta.',h:'Si los ordenas, aparece una imagen.'},
    pt:{n:'23 por 73',d:'16 de novembro de 1974. 1679 pontos enviados a um aglomerado estelar. Seguimos esperando a resposta.',h:'Se você os organizar, surge uma imagem.'},
    fr:{n:'23 sur 73',d:'16 novembre 1974. 1679 points envoyés vers un amas d’étoiles. Nous attendons toujours la réponse.',h:'Une fois disposés en grille, une image apparaît.'}},
  s6:{en:{n:'Mote of Dust',d:'February 14, 1990. From six billion kilometers away, Earth is a dot smaller than a pixel.',h:'The smaller it is, the clearer it shows.'},
    es:{n:'Mota de polvo',d:'14 de febrero de 1990. Desde seis mil millones de kilómetros, la Tierra es un punto más pequeño que un píxel.',h:'Cuanto más pequeño, mejor se ve.'},
    pt:{n:'Grão de poeira',d:'14 de fevereiro de 1990. A seis bilhões de quilômetros, a Terra é um ponto menor que um pixel.',h:'Quanto menor, melhor se vê.'},
    fr:{n:'Grain de poussière',d:'14 février 1990. À six milliards de kilomètres, la Terre est un point plus petit qu’un pixel.',h:'Plus c’est petit, mieux on voit.'}},
  s7:{en:{n:'Don’t Panic',d:'This phrase is on the dashboard of Starman, who has been flying past Earth since February 6, 2018.',h:'The answer to the main question.'},
    es:{n:'No entres en pánico',d:'Esta frase está en el salpicadero de Starman, que pasa volando junto a la Tierra desde el 6 de febrero de 2018.',h:'La respuesta a la pregunta fundamental.'},
    pt:{n:'Não entre em pânico',d:'Esta frase está no painel do Starman, que passa voando pela Terra desde 6 de fevereiro de 2018.',h:'A resposta para a questão principal.'},
    fr:{n:'Pas de panique',d:'Cette inscription figure sur le tableau de bord de « Starman », qui file au large de la Terre depuis le 6 février 2018.',h:'La réponse à la grande question.'}},
  s8:{en:{n:'Mir',d:'March 23, 2001. The station lived for fifteen years and sank into the Pacific Ocean.',h:'Four stages, one path.'},
    es:{n:'Mir',d:'23 de marzo de 2001. La estación vivió quince años y se hundió en el océano Pacífico.',h:'Cuatro etapas, un solo camino.'},
    pt:{n:'Mir',d:'23 de março de 2001. A estação viveu quinze anos e afundou no oceano Pacífico.',h:'Quatro etapas, um só caminho.'},
    fr:{n:'Mir',d:'23 mars 2001. La station a vécu quinze ans avant de sombrer dans l’océan Pacifique.',h:'Quatre étapes, un seul chemin.'}},
  s9:{en:{n:'Where Is Everybody?',d:'The Fermi paradox, 1950. If they exist, where are they? The empty track of the month is also an answer.',h:'If they exist, where are they?'},
    es:{n:'¿Dónde está todo el mundo?',d:'La paradoja de Fermi, 1950. Si existen, ¿dónde están? La pista vacía del mes también es una respuesta.',h:'Si existen, ¿dónde están?'},
    pt:{n:'Onde está todo mundo?',d:'O paradoxo de Fermi, 1950. Se eles existem, onde estão? A pista vazia do mês também é uma resposta.',h:'Se eles existem, onde estão?'},
    fr:{n:'Où sont-ils tous ?',d:'Le paradoxe de Fermi, 1950. S’ils existent, où sont-ils ? La trace vide du mois est aussi une réponse.',h:'S’ils existent, où sont-ils ?'}}
};
ACH.forEach(a=>{ const tr=ACH_TR[a.id]; if(tr) Object.assign(a,tr); });
Object.assign(I18N.id,{
  achSumOpen:(n,t)=>'Terbuka '+n+' dari '+t, achLast:'Temuan terakhir', achNotYet:'Belum ditemukan', achFoundHd:'Ditemukan', achNotFoundHd:'Tidak ditemukan',
  achSecretHd:(f,t)=>'Rahasia · ditemukan '+f+' dari '+t, achSecretLbl:n=>'Rahasia · berkas No. '+n, achDossier:n=>'berkas No. '+n,
  achClaimCls:'Pencapaian', achClaimSec:n=>'Berkas rahasia No. '+n, achNext:'Berikutnya'
});
const ACH_TR_ID={
 "c1": {
  n: "Garis Kármán",
  d: "Seratus kilometer ke atas. Batas antariksa bagi semua orang kecuali orang Amerika: bagi mereka delapan puluh sudah cukup."
 },
 "f1": {
  n: "Pilot",
  d: "Pesawat menuruti kemiringan. Mencurigakan."
 },
 "d1": {
  n: "Tantangan Pertama",
  d: "Kamu menantang seorang teman. Temanmu belum tahu bahwa itu peringatan."
 },
 "d2": {
  n: "Pemenang Duel",
  d: "Kamu mengalahkan batas orang lain. Temanmu menyebutnya kebetulan."
 },
 "o5": {
  n: "Manuver Berlebih",
  d: "Dalam satu penerbangan, tempuh dua puluh lima lebar layar secara horizontal. Pesawat tidak mengeluh."
 },
 "s1": {
  n: "Poyekhali!",
  d: "12 April 1961. Satu kata yang diingat lebih baik daripada yang lain.",
  h: "Awal selalu hanya satu."
 },
 "s2": {
  n: "Semuanya Kembali",
  d: "Belka dan Strelka: tujuh belas putaran mengelilingi Bumi. Semuanya kembali, tikus-tikusnya juga.",
  h: "Hitungannya berurutan."
 },
 "s3": {
  n: "Laika",
  d: "3 November 1957. Lama dikatakan ia hidup seminggu. Kebenarannya baru terungkap pada 2002.",
  h: "Hening juga sebuah jawaban."
 },
 "s4": {
  n: "Wow!",
  d: "15 Agustus 1977. Sinyalnya berlangsung 72 detik dan tidak pernah terulang.",
  h: "Lamanya sedikit lebih dari semenit."
 },
 "s5": {
  n: "23 kali 73",
  d: "16 November 1974. 1679 titik dikirim ke gugus bintang. Kita masih menunggu jawabannya.",
  h: "Jika disusun, muncul sebuah gambar."
 },
 "s6": {
  n: "Debu Kecil",
  d: "14 Februari 1990. Dari jarak enam miliar kilometer, Bumi hanyalah titik yang lebih kecil dari satu piksel.",
  h: "Semakin kecil, semakin jelas terlihat."
 },
 "s7": {
  n: "Jangan Panik",
  d: "Frasa ini ada di dasbor Starman, yang melintas di dekat Bumi sejak 6 Februari 2018.",
  h: "Jawaban atas pertanyaan utama."
 },
 "s8": {
  n: "Mir",
  d: "23 Maret 2001. Stasiun itu hidup lima belas tahun dan tenggelam di Samudra Pasifik.",
  h: "Empat etape, satu jalan."
 },
 "s9": {
  n: "Ke Mana Semua Orang?",
  d: "Paradoks Fermi, 1950. Jika mereka ada, di mana mereka? Langit bulan ini yang kosong juga sebuah jawaban.",
  h: "Jika mereka ada, di mana mereka?"
 }
};
ACH.forEach(a=>{ if(ACH_TR_ID[a.id]) a.x={id:ACH_TR_ID[a.id]}; });
Object.assign(I18N.tr,{
  achSumOpen:(n,t)=>t+' içinden '+n+' açık', achLast:'Son keşif', achNotYet:'Henüz bulunmadı', achFoundHd:'Bulundu', achNotFoundHd:'Bulunmadı',
  achSecretHd:(f,t)=>'Gizli · '+t+' içinden '+f+' bulundu', achSecretLbl:n=>'Gizli · dosya No. '+n, achDossier:n=>'dosya No. '+n,
  achClaimCls:'Başarım', achClaimSec:n=>'Gizli dosya No. '+n, achNext:'Sonraki'
});
const ACH_TR_TR={
 "c1": {
  n: "Kármán Çizgisi",
  d: "Yüz kilometre yukarı. Amerikalılar dışında herkes için uzayın sınırı: onlara seksen yeter."
 },
 "f1": {
  n: "Pilot",
  d: "Uçak eğime uydu. Şüpheli."
 },
 "d1": {
  n: "İlk Meydan Okuma",
  d: "Bir arkadaşına meydan okudun. Arkadaşın bunun bir uyarı olduğunu henüz bilmiyor."
 },
 "d2": {
  n: "Düello Galibi",
  d: "Başkasının çıtasını geçtin. Arkadaşın buna tesadüf diyor."
 },
 "o5": {
  n: "Fazladan Manevra",
  d: "Tek uçuşta yatayda yirmi beş ekran genişliği katet. Uçak şikâyet etmedi."
 },
 "s1": {
  n: "Poyehali!",
  d: "12 Nisan 1961. Her şeyden iyi hatırlanan tek bir söz.",
  h: "Başlangıç hep tektir."
 },
 "s2": {
  n: "Hepsi Döndü",
  d: "Belka ve Strelka: Dünya çevresinde on yedi tur. Hepsi döndü, fareler de.",
  h: "Sayım art arda gider."
 },
 "s3": {
  n: "Layka",
  d: "3 Kasım 1957. Uzun süre bir hafta yaşadığı söylendi. Gerçek 2002’de öğrenildi.",
  h: "Sessizlik de bir cevaptır."
 },
 "s4": {
  n: "Wow!",
  d: "15 Ağustos 1977. Sinyal 72 saniye sürdü ve bir daha tekrarlanmadı.",
  h: "Bir dakikadan biraz uzun sürdü."
 },
 "s5": {
  n: "23’e 73",
  d: "16 Kasım 1974. Bir yıldız kümesine 1679 nokta gönderildi. Cevabı hâlâ bekliyoruz.",
  h: "Dizersen bir resim çıkar."
 },
 "s6": {
  n: "Toz Zerresi",
  d: "14 Şubat 1990. Altı milyar kilometre uzaktan Dünya, bir pikselden küçük bir nokta.",
  h: "Ne kadar küçükse o kadar iyi görünür."
 },
 "s7": {
  n: "Panik Yapma",
  d: "Bu söz, 6 Şubat 2018’den beri Dünya’nın yanından geçip giden Starman’ın gösterge panelinde yazıyor.",
  h: "Asıl sorunun cevabı."
 },
 "s8": {
  n: "Mir",
  d: "23 Mart 2001. İstasyon on beş yıl yaşadı ve Pasifik Okyanusu’na gömüldü.",
  h: "Dört etap — tek yol."
 },
 "s9": {
  n: "Herkes Nerede?",
  d: "Fermi paradoksu, 1950. Varlarsa, neredeler? Ayın boş göğü de bir cevap.",
  h: "Varlarsa, neredeler?"
 }
};
ACH.forEach(a=>{ if(ACH_TR_TR[a.id]) a.x=Object.assign(a.x||{}, {tr:ACH_TR_TR[a.id]}); });


function achUnlockedSet(){ return saneArray(Store.get('ach',[]),[]).filter(x=>typeof x==='string'); } // v1.282.20: битое значение роняло achCheck прямо из gameOver — забег и очки терялись
function achDates(){ const o=Store.get('achD',{}); return (o && typeof o==='object' && !Array.isArray(o))?o:{}; } // id → время получения (мс); у наград, полученных до 02.10.2026, даты нет

/* Карман наград: открытые, но ещё не показанные карточкой. */
function achQueue(){ return saneArray(Store.get('achQ',[]),[]).filter(x=>typeof x==='string'); }
function achQShow(){
  const el=$('achBadge'); if(!el) return;
  const n=achQueue().length;
  el.textContent=n>9?'9+':String(n);
  el.classList.toggle('hidden', n<=0);
}

/* Выдача: список id → открытые, дата, карман. Тихо, без тост-спама: каждая награда получит свою карточку. */
function achGrant(ids){
  const un=achUnlockedSet(), d=achDates(), fresh=[];
  for(const id of ids){ if(un.indexOf(id)<0 && ACH.some(a=>a.id===id)){ un.push(id); d[id]=Date.now(); fresh.push(id); } }
  if(!fresh.length) return;
  Store.set('ach',un); Store.set('achD',d);
  const q=achQueue(); for(const id of fresh) if(q.indexOf(id)<0) q.push(id);
  Store.set('achQ',q); achQShow();
}
/* Проверка по счётчикам (после забега, стрика, дуэли, наклона). */
function achCheck(){
  const un=achUnlockedSet(), ids=[];
  for(const a of ACH){
    if(!a.val || un.indexOf(a.id)>=0) continue;
    let v=0; try{ v=a.val(); }catch(e){}
    if(v>=needOf(a)) ids.push(a.id);
  }
  achGrant(ids);
}
/* Проверка секретов и «Лишнего манёвра» по итогам забега — зовёт gameOver() в ui.js. c: {distM}. Всё считается по тому, что игра уже знает (S, rec). */
function achWidths(){ let t=0; for(let i=1;i<rec.length;i++) t+=Math.abs(rec[i][0]-rec[i-1][0]); return t/91; } // сколько ширин экрана самолёт проехал по горизонтали за забег (rec: x в 92 уровнях)
function achRunCheck(c){
  const ids=[], live=!S.wasRestored;
  if(live && Stats.deaths>=1) ids.push('s1'); // «Поехали!» — первый полёт в жизни
  if(live && (S.gateBest||0)>=17) ids.push('s2'); // «Все вернулись» — 17 ворот подряд (game.js: S.gateRun/gateBest)
  if(live && S.wowCenter) ids.push('s4'); // «Wow!» — 72-я секунда по центру (game.js)
  if(live && c.distM===1679) ids.push('s5'); // «23 на 73» — гибель ровно на 1 679-м метре
  if(live && S.time>0 && S.time<2) ids.push('s6'); // «Пылинка» — гибель меньше чем через 2 секунды после взлёта (первые 1,5 с самолёт неуязвим)
  if(c.distM===42) ids.push('s7'); // «Не паникуй» — гибель на 42-м метре (пасхалка уже была в игре)
  if(live && S.mode==='relay' && S.relayLegDone && S.relayLeg>=RELAY_LEGS_TOTAL) ids.push('s8'); // «Мир» — Эстафета пройдена до конца
  if(live && S.mode==='daily' && S.crowdSeen===0) ids.push('s9'); // «Где все?» — «Небо месяца», сервер ответил, и чужих полётов нет
  if(live && rec.length>=20 && achWidths()>=25) ids.push('o5'); // «Лишний манёвр»
  achGrant(ids);
}
/* «Лайка»: победа в «Без касаний» и потом 7 секунд ничего не трогать на экране итогов (тишина — тоже ответ). */
let _laikaT=0;
function achLaikaDisarm(){ if(_laikaT){ clearTimeout(_laikaT); _laikaT=0; } document.removeEventListener('pointerdown',achLaikaDisarm,true); document.removeEventListener('keydown',achLaikaDisarm,true); }
function achLaikaArm(){
  achLaikaDisarm();
  _laikaT=setTimeout(function(){ _laikaT=0; achLaikaDisarm(); if(screenName==='over') achGrant(['s3']); },7000);
  document.addEventListener('pointerdown',achLaikaDisarm,true); document.addEventListener('keydown',achLaikaDisarm,true);
}

/* ---------- Карточка награды: праздник по одной (без звёзд) ---------- */
let claimOpen=false, claimTotal=0, claimPos=0;
function achEmb(em,w,filt){ return '<svg viewBox="0 0 64 64" width="'+w+'" height="'+w+'"'+(filt?' style="filter:'+filt+'"':'')+' aria-hidden="true"><use href="#ea-'+em+'"></use></svg>'; }
function achClaimMaybe(){ // автопоказ при возврате в меню с непустым карманом
  if(claimOpen || screenName!=='menu') return;
  if(!achQueue().length) return;
  claimTotal=achQueue().length; claimPos=0;
  achClaimShow();
}
function achClaimShow(){
  const q=achQueue(); if(!q.length){ achClaimHide(); return; }
  const a=ACH.find(x=>x.id===q[0]);
  if(!a){ Store.set('achQ',q.slice(1)); achQShow(); achClaimShow(); return; } // мусор в кармане (например, снятые награды про скины) — выкинуть
  const md=$('claimMedal'), elCls=$('claimCls'), elName=$('claimName'), elDesc=$('claimDesc'),
    elRw=$('claimRw'), elQ=$('claimQ'), elBtn=$('claimBtn'), elBurst=$('claimBurst'), elScreen=$('claimScreen');
  if(!md||!elCls||!elName||!elDesc||!elRw||!elQ||!elBtn||!elBurst||!elScreen){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','claimScreen');
    return;
  }
  claimOpen=true;
  const tt=aT(a);
  md.className='claimMedal '+(a.secret?'mGold':'mSilver');
  md.innerHTML=achEmb(a.em,76); // эмблема награды вместо трофея
  elCls.textContent = a.secret ? ovT('achClaimSec')(a.no) : ovT('achClaimCls');
  elName.textContent=tt.n;
  elDesc.textContent=tt.d;
  elRw.innerHTML=''; elRw.classList.add('hidden'); // 02.10.2026: звёзд за награды нет
  claimPos++;
  elQ.textContent=claimPos+' / '+claimTotal;
  elBtn.textContent = q.length>1 ? ovT('achNext') : L.achDone;
  elBurst.innerHTML='';
  for(let i=0;i<10;i++){
    const st=document.createElement('i');
    const ang=(i/10)*6.283, dist=70+Math.random()*46;
    st.style.setProperty('--dx',(Math.cos(ang)*dist).toFixed(0)+'px');
    st.style.setProperty('--dy',(Math.sin(ang)*dist).toFixed(0)+'px');
    st.style.animationDelay=(Math.random()*0.12)+'s';
    elBurst.appendChild(st);
  }
  elScreen.classList.remove('hidden');
  haptic('success'); sfx.ach();
  if(a.secret) setTimeout(()=>{ if(claimOpen) sfx.ach(); },160); // секретное — двойной колокольчик
}
function achClaimTake(){
  const q=achQueue();
  Store.set('achQ',q.slice(1)); achQShow();
  haptic('light');
  if(achQueue().length) achClaimShow(); else achClaimHide();
}
function achClaimHide(){ claimOpen=false; const s=$('claimScreen'); if(s) s.classList.add('hidden'); }
if(typeof $==='function' && $('claimBtn')) $('claimBtn').addEventListener('click', achClaimTake);

/* Ближайшая непройденная точка космической шкалы — строка мотивации на итогах («До Линии Кармана») */
function achNextLoc(){
  const a=ACH[0];
  return ((Stats.totalDist||0)<needOf(a)) ? a : null;
}

/* ---------- Экран «Достижения»: статистика + архив досье ---------- */
function favMode(){
  const g=Stats.gGames||0, t=Stats.tGames||0, k=Stats.kGames||0; // v1.280.0: keys — своя честная категория, не тонет в touch
  if(g===0&&t===0&&k===0) return '—';
  if(k>=g&&k>=t) return L.modeKeys;
  return g>=t?L.modeGyro:L.modeTouch;
}
const ACH_STAT_ICO=[
  ['plane','#9fb4d8'],['ruler','#9fe8ff'],['star4','#f0c040'],['combo','#8fff9f'],
  ['nearmiss','#eef4ff'],['trophy','#c58fff'],['checkbadge','#f0c040'],['target','#ff9f8f'],
];
// 01.10.2026 «Паспорт пилота» (владелец выбрал вариант Б макета «Достижения → Мои»: «Мне очень бы понравилось. Красиво.»): вместо восьми плиток и папки «Управление» —
// обложка пилота (свой самолёт, ник, звание, три числа), рекорды по режимам с местом в мире, полоска «Как ты летаешь» и «Мастерство». «Открыто N / M» и список достижений ниже не тронуты.
function achPassportHtml(){
  const T=ovT, esc=escapeHtml;
  const g=Stats.gGames||0, t=Stats.tGames||0, k=Stats.kGames||0, tot=g+t+k;
  const km=Math.round((Stats.totalDist||0)/1000), sa=heroRecordFor('touch').val, dl=heroRecordFor('daily').val, sl=heroRecordFor('slalom').val, rl=saneNumber(Store.get('bestRelayContrib',0),0);
  const nick=esc((typeof myCallsign==='function'&&myCallsign())||'');
  const month=(function(){ try{ return new Date().toLocaleDateString((typeof langEff!=='undefined'&&langEff)||'ru',{month:'long'}); }catch(e){ return ''; } })();
  const row=function(ico,nm,sub,val,plId,hasVal){
    return '<div class="mpRow">'+ic(ico,'mpMi')+'<div class="mpNm">'+nm+'<small>'+sub+'</small></div>'
      +(hasVal?'<div class="mpVl">'+val+'</div><div class="mpPl hidden" id="'+plId+'"></div>':'<div class="mpVl mpGo">'+val+'</div>')+'</div>';
  };
  const pct=function(n){ return tot>0&&n>0?Math.max(1,Math.round(100*n/tot)):0; };
  const pT=pct(t), pG=pct(g), pK=pct(k);
  const how=tot>0
    ? '<div class="mpSec">'+T('achPassHow')+'</div><div class="mpHow"><div class="mpBar">'
      +(pT?'<i style="flex:'+pT+';background:linear-gradient(90deg,#4fd6c8,#1c978c)"></i>':'')
      +(pG?'<i style="flex:'+pG+';background:linear-gradient(90deg,#7f8cff,#4650c4)"></i>':'')
      +(pK?'<i style="flex:'+pK+';background:linear-gradient(90deg,#ffb84d,#d9831a)"></i>':'')+'</div>'
      +'<div class="mpLeg"><div class="mpLg">'+ic('ctl-touch')+'<div><b>'+L.modeTouch+'</b><br>'+pT+'%</div></div>'
      +'<div class="mpLg">'+ic('ctl-gyro')+'<div><b>'+L.modeGyro+'</b><br>'+pG+'%</div></div>'
      +'<div class="mpLg">'+ic('ctl-keys')+'<div><b>'+L.modeKeys+'</b><br>'+pK+'%</div></div></div></div>'
    : '';
  const cc=function(ico,col,n,lbl){ return '<div class="mpCc">'+ic(ico,'mpCi')+'<div><b>'+n+'</b><span>'+lbl+'</span></div></div>'; };
  return '<div class="mpHero"><div class="mpSt"></div><canvas class="mpShip" width="172" height="172"></canvas>'
    +'<div class="mpTx"><b>'+(nick||T('achPassPilot'))+'</b><span>'+T(km>=100?'achPassC1':'achPassPilot')+'</span><em id="mpBest">'+(sa>0?T('achPassBest')(fmtN(sa)):T('achPassNoRec'))+'</em></div>'
    +'<div class="mpRow3"><div><b style="color:#9fe8ff">'+fmtN(Stats.games||0)+'</b><span>'+T('achPassFlights')+'</span></div>'
    +'<div><b>'+fmtN(km)+' '+T('achPassKm')+'</b><span>'+T('achPassWent')+'</span></div>'
    +'<div><b style="color:#f0c040">'+fmtN(Stats.totalStars||0)+'</b><span>'+T('achPassStars')+'</span></div></div></div>'
    +'<div class="mpSec">'+T('achPassRecs')+'</div>'
    +row('mode-sa',L.modeClassic,T('achPassSubScore'),fmtN(sa),'mpPlSA',sa>0)
    +row('mode-daily',L.modeDaily,esc(month),fmtN(dl),'mpPlDL',dl>0)
    +row('mode-relay',L.modeRelay,rl>0?T('achPassSubLeg'):T('achPassSubNoLeg'),rl>0?fmtN(rl):T('achPassGo'),'mpPlRL',rl>0)
    +row('mode-slalom',L.modeSlalom,T('achPassSubTime'),sl>0?fmtTimeRes(sl):'',  'mpPlSL',sl>0)
    +how
    +'<div class="mpSec">'+T('achPassMast')+'</div><div class="mpChips">'
    +cc('mast-near','#eef4ff',fmtN(Stats.nearMiss||0),T('achPassNear'))+cc('mast-perfect','#f0c040',fmtN(Stats.perfectRuns||0),T('achPassPerfect'))
    +cc('mast-combo','#8fff9f','×'+(Stats.bestCombo||0),T('achPassCombo'))+cc('mast-rec','#ff9f8f',fmtN(Stats.recBeats||0),T('achPassBeat'))+'</div>';
}
let _achPassGen=0;
/* 01.10.2026 (находка tools/screen-audit.mjs на данных «самое широкое»): ник до 10 знаков из самых широких букв (ЩЩЩЩЩЩЩЩЩЩ, WWWWWWWWWW) не помещался в обложку и обрезался многоточием. Теперь кегль ника уменьшается, пока ник не влезет целиком (минимум 13 px). */
function achFitNick(root){ const nb=root.querySelector('.mpTx b'); if(!nb) return; nb.style.fontSize=''; let fs=22; while(nb.scrollWidth>nb.clientWidth+1 && fs>13){ fs-=1; nb.style.fontSize=fs+'px'; } }
function achPassportFill(root){ requestAnimationFrame(()=>achFitNick(root)); setTimeout(()=>achFitNick(root),350);
  const cv=root.querySelector('.mpShip'); if(cv && typeof overSkinDraw==='function') overSkinDraw(cv, S.skin); // свой самолёт
  if(typeof syncAvailable!=='function' || !syncAvailable()) return; // гостю места не показываем — только рекорды
  const gen=++_achPassGen, put=function(id,rank){ if(gen!==_achPassGen) return; const el=document.getElementById(id); if(!el||!(rank>0)) return; el.textContent='#'+rank; el.classList.remove('hidden'); el.classList.toggle('g',rank===1); };
  if(typeof syncTop==='function') Promise.all(['touch','gyro','keys'].map(function(c){ return syncTop(c).catch(function(){ return null; }); })).then(function(rs){
    const mine=Math.max(myBestFor('touch'),myBestFor('gyro'),myBestFor('keys')); let rk=0;
    rs.forEach(function(d){ if(d&&d.ok&&d.me&&Number(d.me.best)===mine&&d.me.rank>0) rk=rk?Math.min(rk,d.me.rank):d.me.rank; });
    put('mpPlSA',rk);
    const b=document.getElementById('mpBest'); if(b && rk===1 && mine>0) b.textContent=ovT('achPassBest')(fmtN(mine))+' · '+ovT('achPassFirst');
  });
  if(typeof syncDailyTop==='function') syncDailyTop(trackDayKey()).then(function(d){ if(d&&d.ok&&d.me) put('mpPlDL',d.me.rank); }).catch(function(){});
  if(typeof syncSlalomTop==='function') syncSlalomTop(typeof SLALOM_ETERNAL_DAY!=='undefined'?SLALOM_ETERNAL_DAY:'').then(function(d){ if(d&&d.ok&&d.me) put('mpPlSL',d.me.rank); }).catch(function(){});
}
function achDateTxt(ts){ try{ return new Date(ts).toLocaleDateString((typeof langEff!=='undefined'&&langEff)||'ru',{day:'numeric',month:'short'}).replace(/\.$/,''); }catch(e){ return ''; } }
/* Экран наград по макету «Награды — архив досье»: свёрнутый вид (полоса, последняя находка, значки), найденные, не найденные и засекреченные.
   Проценты игроков и редкость — отдельным шагом с сервером; пока их нет, строка показывает только дату. */
function renderAch(){
  const T=ovT, esc=escapeHtml;
  const ids=ACH.map(a=>a.id), un=achUnlockedSet().filter(id=>ids.indexOf(id)>=0), dates=achDates();
  const elStats=$('achStats'), elProg=$('achProg'), elProgFill=$('achProgFill'), elList=$('achList');
  if(!elStats||!elProg||!elProgFill||!elList){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','achStats');
    return;
  }
  elStats.innerHTML=achPassportHtml(); achPassportFill(elStats); // «Паспорт пилота» не тронут
  const pw=$('achProgWrap'); if(pw) pw.classList.add('hidden'); // старая полоса заменена свёрнутым видом ниже
  const total=ACH.length, got=un.length;
  const byId=id=>ACH.find(a=>a.id===id);
  const found=un.map(byId).filter(Boolean).reverse(); // последняя находка — первой
  const unearnedOpen=ACH.filter(a=>!a.secret && un.indexOf(a.id)<0);
  const secretsLocked=ACH.filter(a=>a.secret && un.indexOf(a.id)<0);
  const secTotal=ACH.filter(a=>a.secret).length, secFound=secTotal-secretsLocked.length;
  const ring=a=>a.secret?'#b073ea':'#9fb4d8';
  const lockSvg='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8a99bd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
  let h='<div class="dsSum"><div class="dsSumTop"><span>'+T('achSumOpen')(got,total)+'</span><b>'+Math.round(got/total*100)+'%</b></div>'
    +'<div class="dsBar"><i style="width:'+(got/total*100)+'%"></i></div>';
  if(found.length){
    const a=found[0], tt=aT(a);
    h+='<div class="dsLab">'+T('achLast')+'</div><div class="dsLast"><div class="dsMico" style="border-color:'+ring(a)+'">'+achEmb(a.em,31)+'</div><div class="dsLastTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span></div></div>'
      +'<div class="dsMini">'+found.slice(0,6).map(x=>'<div class="dsMico" style="border-color:'+ring(x)+'">'+achEmb(x.em,31)+'</div>').join('')+(found.length>6?'<span class="dsMore">+'+(found.length-6)+'</span>':'')+'</div>';
  }
  const lockRest=unearnedOpen.length+secretsLocked.length;
  if(lockRest){
    h+='<div class="dsLab">'+T('achNotYet')+'</div><div class="dsMini">'
      +Array(Math.min(5,lockRest)).fill('<div class="dsMico lk">'+lockSvg+'</div>').join('')+(lockRest>5?'<span class="dsMore">+'+(lockRest-5)+'</span>':'')+'</div>';
  }
  h+='</div>';
  if(found.length){
    h+='<div class="dsSec">'+T('achFoundHd')+'</div>';
    for(const a of found){
      const tt=aT(a), ts=dates[a.id];
      const meta=[ts?achDateTxt(ts):'', a.secret?T('achDossier')(a.no):''].filter(Boolean).join(' · ');
      h+='<div class="dsRow"><div class="dsIco" style="border-color:'+ring(a)+'">'+achEmb(a.em,50)+'</div><div class="dsTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span>'+(meta?'<div class="dsMeta">'+esc(meta)+'</div>':'')+'</div></div>';
    }
  }
  if(unearnedOpen.length){
    h+='<div class="dsSec">'+T('achNotFoundHd')+'</div>';
    for(const a of unearnedOpen){
      const tt=aT(a); let prog='', bar='';
      if(a.val){ let v=0; try{ v=a.val(); }catch(e){} const nd=needOf(a); prog=fmtN(Math.min(v,nd))+' / '+fmtN(nd); bar='<div class="dsPb"><i style="width:'+Math.min(100,Math.round(v/nd*100))+'%"></i></div>'; }
      h+='<div class="dsRow off"><div class="dsIco dim">'+achEmb(a.em,50,'grayscale(1) opacity(.5)')+'</div><div class="dsTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span>'+(prog?'<div class="dsMeta">'+prog+'</div>':'')+bar+'</div></div>';
    }
  }
  if(secretsLocked.length){
    h+='<div class="dsSec">'+T('achSecretHd')(secFound,secTotal)+'</div>';
    for(const a of secretsLocked){
      h+='<div class="dsRow sec"><div class="dsIco dim"><svg viewBox="0 0 64 64" width="50" height="50" aria-hidden="true"><use href="#ea-lock"></use></svg></div><div class="dsTx"><b class="q">'+T('achSecretLbl')(a.no)+'</b><span class="hint">'+esc(aT(a).h||'')+'</span></div></div>';
    }
  }
  elList.innerHTML=h;
  // слабый телефон / «меньше движения»: эмблемы стоят неподвижно (анимация — удовольствие, не нагрузка)
  try{ const still=(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof Q!=='undefined' && Q.level<2);
    if(still) elList.querySelectorAll('svg').forEach(function(sv){ if(sv.pauseAnimations) sv.pauseAnimations(); }); }catch(e){}
}
