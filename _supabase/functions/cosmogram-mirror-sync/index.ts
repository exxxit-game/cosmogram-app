// v1.108.1 «Закрытый синк»: тянул файлы с личного dev-адреса (kimi.page) в публичный бакет
// Storage — список файлов устарел (js/daily.js, css/style.css — таких файлов в реальном
// проекте уже нет), настоящий бот идёт через GitHub Pages. Без проверки авторизации
// любой мог вызвать её и перезаписать хранилище чем угодно. Полное удаление требует
// панели Supabase.
Deno.serve((_req) => {
  return new Response('Этот синк отключён — игра живёт на GitHub Pages.', {
    status: 410,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});
