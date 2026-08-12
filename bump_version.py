#!/usr/bin/env python3
"""bump_version.py — v1.280.0 «Один источник, взятый всерьёз — теперь по-настоящему»

История: сначала версия жила в двух местах — sw.js решил проблему для себя (const V),
index.html оставался ручным (18 отдельных ?v=X.Y.Z). Первая версия этого скрипта закрыла
это расхождение. Но при внимательной построчной проверке модулей нашлось ТРЕТЬЕ место —
core.js: const GAME_VERSION — которое скрипт не трогал. Оно течёт в телеметрию «Почты неба»
(каждый отчёт об ошибке нёс неверную версию), в экспорт чёрного ящика, и в экран «Об игре»,
который видит сам игрок. Теперь скрипт знает про все три места разом.

Это НЕ сборка и не бандлер — файлы остаются точно теми же статичными файлами, что грузит
браузер, ни один байт логики не меняется. Это инструмент РАЗРАБОТЧИКА, запускаемый руками
перед релизом, ровно как git commit — не часть рантайма игры.

Использование:
    python3 bump_version.py 1.280.1

Что делает:
    1. Находит ТЕКУЩУЮ версию в sw.js (const V = '...').
    2. Заменяет её на новую — в sw.js, в GAME_VERSION (core.js), и в каждом ?v=СТАРАЯ
       в index.html (считает совпадения, останавливается и ничего не пишет, если число
       до/после не сходится в любом из трёх мест).
    3. Показывает diff всех трёх файлов на экран — ничего не коммитит, только меняет
       файлы на диске, дальше git add/commit — решение человека, не скрипта.

Не трогает: manifest.*.json (у них своя версия игры вообще нет — не нужна),
CHANGELOG.md (летопись пишется руками, не автоматически).
"""
import re
import sys
import difflib

def main():
    if len(sys.argv) != 2:
        print("Использование: python3 bump_version.py НОВАЯ_ВЕРСИЯ")
        print("Пример: python3 bump_version.py 1.280.1")
        sys.exit(1)
    new_v = sys.argv[1]
    if not re.match(r'^\d+\.\d+\.\d+$', new_v):
        print(f"Похоже не на версию (ожидался вид X.Y.Z): {new_v}")
        sys.exit(1)

    with open('sw.js', encoding='utf-8') as f:
        sw_content = f.read()
    m = re.search(r"const V = '([\d.]+)';", sw_content)
    if not m:
        print("Не нашёл `const V = '...';` в sw.js — ничего не меняю.")
        sys.exit(1)
    old_v = m.group(1)
    if old_v == new_v:
        print(f"Версия уже {new_v} — нечего менять.")
        sys.exit(0)

    with open('js/core.js', encoding='utf-8') as f:
        core_content = f.read()
    m2 = re.search(r"const GAME_VERSION='([\d.]+)';", core_content)
    if not m2:
        print("Не нашёл `const GAME_VERSION='...';` в js/core.js — ничего не меняю.")
        sys.exit(1)
    if m2.group(1) != old_v:
        print(f"СТОП: sw.js на {old_v}, но GAME_VERSION в core.js уже на {m2.group(1)} — "
              f"расхождение до запуска скрипта, разбираться руками, не трогаю ничего.")
        sys.exit(1)

    with open('index.html', encoding='utf-8') as f:
        html_content = f.read()

    old_pattern = f'?v={old_v}'
    new_pattern = f'?v={new_v}'
    before_count = html_content.count(old_pattern)
    if before_count == 0:
        print(f"В index.html не нашлось ни одного {old_pattern} — ничего не меняю.")
        sys.exit(1)

    new_html = html_content.replace(old_pattern, new_pattern)
    after_count = new_html.count(new_pattern)
    if before_count != after_count:
        print(f"СТОП: было {before_count} вхождений {old_pattern}, "
              f"стало {after_count} новых — не сходится, ничего не пишу.")
        sys.exit(1)

    new_sw = sw_content.replace(f"const V = '{old_v}';", f"const V = '{new_v}';")
    new_core = core_content.replace(f"const GAME_VERSION='{old_v}';", f"const GAME_VERSION='{new_v}';")

    print(f"sw.js: {old_v} → {new_v}")
    print(f"js/core.js (GAME_VERSION): {old_v} → {new_v}")
    print(f"index.html: {before_count} мест ?v={old_v} → ?v={new_v}")
    print()
    print("--- diff sw.js ---")
    for line in difflib.unified_diff(sw_content.splitlines(), new_sw.splitlines(), lineterm=''):
        if line.startswith('+') or line.startswith('-'):
            print(line)
    print("--- diff js/core.js ---")
    for line in difflib.unified_diff(core_content.splitlines(), new_core.splitlines(), lineterm=''):
        if line.startswith('+') or line.startswith('-'):
            print(line)

    with open('sw.js', 'w', encoding='utf-8') as f:
        f.write(new_sw)
    with open('js/core.js', 'w', encoding='utf-8') as f:
        f.write(new_core)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
    print()
    print(f"Готово. {before_count + 2} мест обновлено (18 в index.html + sw.js + GAME_VERSION в core.js).")
    print("Дальше — руками: проверить diff, тесты, git add/commit.")

if __name__ == '__main__':
    main()
