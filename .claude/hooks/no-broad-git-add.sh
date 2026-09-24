#!/usr/bin/env bash
# 16.09.2026: CLAUDE.md уже запрещает `git add -A`/`git add .` словами («прежде staging —
# добавлять конкретные файлы по имени») — тот же перевод текстового правила в технический
# отказ, что уже сделан для ядра (protect-core.sh) и версии (version-guard.sh). Широкий add
# может незаметно подхватить .env/секрет/чужой временный файл рядом; список файлов по имени —
# всегда осознанный выбор, не «что накопилось».
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_name||'')+'\n'+((j.tool_input&&j.tool_input.command)||'').replace(/\n/g,'\\n')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')

if [[ "$tool" == "Bash" ]]; then
  # 25.09.2026, найдено adversarial-тестом: три реальных обхода не ловились —
  # "git add ./" (слэш после точки), "git add \".\"" (точка в кавычках),
  # "git add <полный путь до корня репо>" (функционально то же самое, что ".",
  # но не совпадает ни с одной альтернативой). Регэксп теперь принимает
  # необязательные кавычки и слэш; путь до корня репо сравнивается отдельно —
  # вычислен реальным git rev-parse, не предположен.
  # каждая git-команда в составной строке (после &&/;/|) проверяется отдельно — широкий add
  # мог бы прятаться не первым в цепочке
  if printf '%s' "$cmd" | grep -qE '(^|[;&|]) *git +add +(-A\b|--all\b|["'"'"']?\.\/?["'"'"']?( |$)|-["'"'"']?\.\/?["'"'"']?( |$))'; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git add -A/--all/. добавляет всё накопившееся в рабочем дереве, не осознанный список — правило CLAUDE.md. Укажи конкретные файлы по имени (git add path/to/file1 path/to/file2)."}}'
    exit 0
  fi
  if printf '%s' "$cmd" | grep -qE '(^|[;&|]) *git +add\b'; then
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
    if [[ -n "$REPO_ROOT" ]]; then
      REPO_ROOT_ESC=$(printf '%s' "$REPO_ROOT" | sed 's/[.[\*^$/]/\\&/g')
      if printf '%s' "$cmd" | grep -qE "git +add +[\"']?${REPO_ROOT_ESC}/?[\"']?( |\$)"; then
        echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git add с полным путём до корня репозитория — то же самое, что git add -A, просто другим текстом. Укажи конкретные файлы по имени."}}'
        exit 0
      fi
    fi
  fi
fi
exit 0
