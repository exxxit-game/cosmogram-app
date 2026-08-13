#!/usr/bin/env python3
"""bump_version.py — «Четыре места, а не три, и умение чинить разъехавшееся»

История в трёх заходах:

  1. Версия жила в двух местах — sw.js решил задачу для себя (const V), index.html
     оставался ручным (18 отдельных ?v=X.Y.Z). Первая редакция скрипта это закрыла.
  2. При построчной проверке модулей нашлось ТРЕТЬЕ место — core.js: const GAME_VERSION.
     Оно течёт в телеметрию «Почты неба», в экспорт чёрного ящика и на экран «Об игре»,
     который видит сам игрок. Скрипт научили и ему (v1.280.0).
  3. Аудит 13.08.2026 нашёл ЧЕТВЁРТОЕ место — release: 'cosmogram@X.Y.Z' в index.html,
     подпись инцидентов Sentry. Скрипт заменял только строки вида ?v=СТАРАЯ и этой
     не видел вовсе. Это ровно та беда, которую чинила партия «Пожар»: там навсегда
     застыло 1.108.1, и инциденты 174 версий слипались в один мёртвый релиз. К моменту
     аудита она успела вернуться: GAME_VERSION был на 1.282.24, релиз Sentry — на 1.282.21.

Тем же аудитом выяснилось, что старая защита «стоп при расхождении» была тупиком:
при разъехавшихся местах скрипт отказывался работать, и починить рассинхрон им же
было нельзя — приходилось лезть руками ровно туда, где скрипт и нужен. Теперь у него
есть режим `--align`: он показывает все четыре места, сверяет, что новая версия выше
любой найденной, и сводит их вместе одним заходом.

И отдельно добавлена защита от беды, которая за одни сутки 12–13.08.2026 случилась
трижды: номер версии не может уехать ВНИЗ. Заливка целой папкой из устаревшей копии
трижды откатывала раздачу (1.282.21→1.282.12, 1.282.21→1.282.13, 1.282.24→1.108.0),
и каждый раз это замечали не сразу. Скрипт теперь такую версию просто не примет.

Это НЕ сборка и не бандлер — файлы остаются точно теми же статичными файлами, что
грузит браузер, ни один байт логики не меняется. Это инструмент РАЗРАБОТЧИКА,
запускаемый руками перед релизом, ровно как git commit — не часть рантайма игры.

Использование:
    python3 bump_version.py 1.283.0            # обычный подъём, когда всё сходится
    python3 bump_version.py 1.283.0 --align    # свести разъехавшиеся места

Что делает:
    1. Читает версию из всех четырёх мест: sw.js (const V), js/core.js (GAME_VERSION),
       index.html (все ?v=X.Y.Z) и index.html (release: 'cosmogram@X.Y.Z').
    2. Если места разошлись — печатает таблицу и останавливается; с --align идёт дальше.
    3. Проверяет, что новая версия строго выше каждой найденной.
    4. Заменяет номер во всех четырёх местах, считая совпадения до и после.
    5. Показывает diff на экран. Ничего не коммитит: git add/commit — решение человека.

Не трогает: manifest.*.json (у них своей версии игры нет), CHANGELOG.md (летопись
пишется руками, не автоматически).
"""
import re
import sys
import difflib

RE_SW    = re.compile(r"const V = '([\d.]+)';")
RE_CORE  = re.compile(r"const GAME_VERSION='([\d.]+)';")
RE_REL   = re.compile(r"release:\s*'cosmogram@([\d.]+)'")
RE_TAG   = re.compile(r"\?v=([\d.]+)")


def vtuple(v):
    """'1.282.24' → (1, 282, 24). Нужен, чтобы сравнивать версии числами, а не строками:
    по строкам '1.282.9' больше '1.282.24', и защита от отката пропустила бы откат."""
    return tuple(int(x) for x in v.split('.'))


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(data)


def show_diff(title, before, after):
    print(f'--- diff {title} ---')
    for line in difflib.unified_diff(before.splitlines(), after.splitlines(), lineterm=''):
        if (line.startswith('+') or line.startswith('-')) and not line.startswith(('+++', '---')):
            print(line[:200])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a for a in sys.argv[1:] if a.startswith('--')}
    unknown = flags - {'--align'}
    if unknown:
        print(f'Незнакомый ключ: {", ".join(sorted(unknown))}')
        sys.exit(1)
    if len(args) != 1:
        print('Использование: python3 bump_version.py НОВАЯ_ВЕРСИЯ [--align]')
        print('Пример:        python3 bump_version.py 1.283.0')
        sys.exit(1)

    new_v = args[0]
    if not re.match(r'^\d+\.\d+\.\d+$', new_v):
        print(f'Похоже не на версию (ожидался вид X.Y.Z): {new_v}')
        sys.exit(1)

    sw_c   = read('sw.js')
    core_c = read('js/core.js')
    html_c = read('index.html')

    m_sw = RE_SW.search(sw_c)
    if not m_sw:
        print("Не нашёл `const V = '...';` в sw.js — ничего не меняю.")
        sys.exit(1)
    m_core = RE_CORE.search(core_c)
    if not m_core:
        print("Не нашёл `const GAME_VERSION='...';` в js/core.js — ничего не меняю.")
        sys.exit(1)
    m_rel = RE_REL.search(html_c)
    if not m_rel:
        print("Не нашёл `release: 'cosmogram@...'` в index.html — ничего не меняю.")
        print("Это подпись инцидентов Sentry; без неё они слипаются в один мёртвый релиз.")
        sys.exit(1)
    tags = RE_TAG.findall(html_c)
    if not tags:
        print('В index.html не нашлось ни одного ?v=X.Y.Z — кэшбастера у раздачи нет вовсе.')
        sys.exit(1)

    tag_versions = sorted(set(tags), key=vtuple)
    found = {
        'sw.js (const V)':                m_sw[1],
        'js/core.js (GAME_VERSION)':      m_core[1],
        f'index.html ({len(tags)} тегов ?v=)': ', '.join(tag_versions),
        'index.html (release Sentry)':    m_rel[1],
    }
    all_versions = sorted({m_sw[1], m_core[1], m_rel[1], *tags}, key=vtuple)

    print('Что сейчас в четырёх местах:')
    for k, v in found.items():
        print(f'  {k:38} {v}')
    print()

    if len(all_versions) > 1 and '--align' not in flags:
        print('СТОП: места разошлись — ' + ' / '.join(all_versions) + '.')
        print('Это значит, что раздача врёт: адрес модуля не сменился, и игрок вправе')
        print('получить старый файл под тем же адресом.')
        print(f'Свести их вместе: python3 bump_version.py {new_v} --align')
        sys.exit(1)

    if len(all_versions) == 1 and all_versions[0] == new_v:
        print(f'Версия уже {new_v} — нечего менять.')
        sys.exit(0)

    highest = all_versions[-1]
    if vtuple(new_v) <= vtuple(highest):
        print(f'СТОП: {new_v} не выше самой большой найденной ({highest}).')
        print('Номер версии — кэшбастер раздачи и подпись в отчётах игроков; вниз он не ходит.')
        print('За сутки 12–13.08.2026 такой откат случался трижды и каждый раз замечался не сразу.')
        sys.exit(1)

    new_sw   = RE_SW.sub(f"const V = '{new_v}';", sw_c)
    new_core = RE_CORE.sub(f"const GAME_VERSION='{new_v}';", core_c)
    new_html = RE_TAG.sub(f'?v={new_v}', html_c)
    new_html = RE_REL.sub(f"release: 'cosmogram@{new_v}'", new_html)

    # Считаем совпадения после замены — если число не сошлось, не пишем ничего.
    checks = [
        ('sw.js const V',            len(RE_SW.findall(new_sw)),          len(RE_SW.findall(sw_c))),
        ('js/core.js GAME_VERSION',  len(RE_CORE.findall(new_core)),      len(RE_CORE.findall(core_c))),
        ('index.html ?v=',           len(RE_TAG.findall(new_html)),       len(tags)),
        ('index.html release',       len(RE_REL.findall(new_html)),       len(RE_REL.findall(html_c))),
    ]
    for what, after, before in checks:
        if after != before:
            print(f'СТОП: {what} — было {before} вхождений, стало {after}. Не сходится, ничего не пишу.')
            sys.exit(1)
    for what, got in [('sw.js', RE_SW.findall(new_sw)), ('js/core.js', RE_CORE.findall(new_core)),
                      ('index.html ?v=', RE_TAG.findall(new_html)), ('index.html release', RE_REL.findall(new_html))]:
        wrong = [g for g in got if g != new_v]
        if wrong:
            print(f'СТОП: в {what} после замены осталось чужое: {", ".join(sorted(set(wrong)))}. Ничего не пишу.')
            sys.exit(1)

    print(f'sw.js:                     {m_sw[1]} → {new_v}')
    print(f'js/core.js GAME_VERSION:   {m_core[1]} → {new_v}')
    print(f'index.html release Sentry: {m_rel[1]} → {new_v}')
    print(f'index.html ?v=:            {len(tags)} мест ({", ".join(tag_versions)}) → {new_v}')
    print()
    show_diff('sw.js', sw_c, new_sw)
    show_diff('js/core.js', core_c, new_core)
    show_diff('index.html (release Sentry)',
              '\n'.join(l for l in html_c.splitlines() if RE_REL.search(l)),
              '\n'.join(l for l in new_html.splitlines() if RE_REL.search(l)))

    write('sw.js', new_sw)
    write('js/core.js', new_core)
    write('index.html', new_html)
    print()
    print(f'Готово. {len(tags) + 3} мест обновлено ({len(tags)} тегов ?v= + sw.js + GAME_VERSION + релиз Sentry).')
    print('Дальше — руками: прогнать стражей (страж 96 стережёт именно это), проверить diff, git add/commit.')


if __name__ == '__main__':
    main()
