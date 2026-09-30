#!/bin/sh
# Publica o app no GitHub Pages.
#
#   ./publicar.sh "descricao do que mudou"
#
# A descricao e opcional. Sem ela, o commit sai com a data.
#
# O que este script faz, nesta ordem:
#   1. roda os testes e PARA se algum falhar
#   2. avisa se voce esqueceu de trocar o numero do cache no sw.js
#   3. commita o que mudou e envia para o GitHub
#   4. confere no ar se o que subiu e mesmo o que esta na sua pasta

set -e
cd "$(dirname "$0")"

SITE="https://lipibueno.github.io/funilaria"

echo "== 1/4  testes =="
node testes/testes.js  >/dev/null || { echo "FALHOU nos testes. Nada foi publicado."; exit 1; }
node testes/migra.js   >/dev/null || { echo "FALHOU no teste de migracao. Nada foi publicado."; exit 1; }
echo "   ok"

echo "== 2/4  conferencias =="
# os dois numeros de versao precisam bater, senao a tela mostra um e o cache usa outro
APP_V=$(grep -o ">versão [0-9]*<" index.html | grep -o "[0-9]*" | head -1)
SW_V=$(grep -o "funilaria-v[0-9]*" sw.js | grep -o "[0-9]*" | head -1)
if [ "$APP_V" != "$SW_V" ]; then
  echo "   PAROU: a tela de Ajustes diz versao $APP_V e o cache do sw.js diz v$SW_V."
  echo "   Deixe os dois com o mesmo numero antes de publicar."
  exit 1
fi
echo "   versao $APP_V nos dois lugares"
# o numero do cache precisa mudar a cada publicacao, senao o celular fica na versao velha
if git diff --quiet HEAD -- sw.js && ! git diff --quiet HEAD -- index.html; then
  echo "   AVISO: index.html mudou mas sw.js nao."
  echo "   Troque o numero em: const CACHE = 'funilaria-vN'"
  printf "   Publicar mesmo assim? [s/N] "
  read resposta
  case "$resposta" in s|S|sim|SIM) ;; *) echo "   cancelado."; exit 1;; esac
fi
# a URL da API nunca pode entrar no repositorio
if git diff --cached --name-only 2>/dev/null | xargs -r grep -l "macros/s/AKfy" 2>/dev/null | grep -q .; then
  echo "   PAROU: achei uma URL /exec da API em arquivo a ser enviado. Tire antes."
  exit 1
fi
echo "   ok"

echo "== 3/4  enviando =="
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "${1:-Atualizacao de $(date '+%d/%m/%Y %H:%M')}"
  echo "   commit feito"
else
  echo "   nada novo para commitar"
fi
git push -q origin main
echo "   enviado"

echo "== 4/4  conferindo no ar =="
echo "   o GitHub leva ate uns 2 minutos para publicar"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 10
  online=$(curl -s "$SITE/index.html?nc=$(date +%s)" | wc -c | tr -d ' ')
  local_bytes=$(wc -c < index.html | tr -d ' ')
  if [ "$online" = "$local_bytes" ]; then
    echo "   PUBLICADO: o que esta no ar e o mesmo da sua pasta ($online bytes)"
    echo
    echo "   $SITE"
    exit 0
  fi
  echo "   ainda nao ($online no ar, $local_bytes aqui) - tentativa $i de 12"
done

echo "   O envio deu certo, mas o site ainda nao trocou."
echo "   Veja a aba Actions do repositorio, ou espere e recarregue."
