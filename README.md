# Orçamentos — Funilaria

PWA de orçamentos de funilaria e pintura. Os dados ficam numa planilha do Google,
acessada por uma API em Apps Script.

- **Instalação e regras de acesso:** [SETUP.md](SETUP.md) — leia antes de publicar.
- `index.html` — o app todo (tela, lógica, PDF)
- `Codigo.gs` — a API: login, permissões, gravação na planilha e log
- `sw.js` — cache para abrir sem internet
- `testes/` — testes das regras de dinheiro e permissão (`node testes/testes.js`)
- `_versao-anterior/` — a v3, antes do login

## Rodar na máquina

Precisa ser por http, não abrindo o arquivo direto, senão o login do Google não carrega:

```bash
npx serve -l 8080 .
```

E `http://localhost:8080` tem que estar nas origens autorizadas do ID do cliente OAuth.

## Nunca no repositório

A URL `/exec` da API. Ela é digitada em **Ajustes** e fica só no aparelho.
O `CLIENT_ID` pode ficar: ele é público por natureza.
