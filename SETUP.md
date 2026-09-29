# Instalação — Orçamentos Funilaria (v4)

Esta versão fecha o app com login de conta Google e passa a validar **no servidor**
quem pode fazer o quê. Sem os passos 1 a 4 abaixo o app não funciona: é de propósito.

Tempo estimado: 20 a 30 minutos, uma vez só.

---

## 1. Criar o ID do cliente OAuth

É o que permite o app provar ao Apps Script quem está usando.

1. Abra <https://console.cloud.google.com/> com a **mesma conta Google que é dona da planilha**.
2. Crie um projeto (ou use um existente). Nome livre, ex. `Orcamentos Funilaria`.
3. Menu **APIs e serviços → Tela de permissão OAuth**:
   - Tipo: **Externo**
   - Nome do app: `Orçamentos Funilaria`
   - E-mail de suporte e de contato: o seu
   - Salve. Não precisa publicar nem pedir verificação: em **Usuários de teste**,
     adicione os e-mails de quem vai usar (você e os funcionários).
4. Menu **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - Em **Origens JavaScript autorizadas**, adicione o endereço onde o app fica hospedado:
     - GitHub Pages: `https://SEUUSUARIO.github.io`
     - se testar na máquina: `http://localhost:8080`
   - Criar. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

> A origem tem que bater exatamente com o endereço do app, sem a barra final e sem o
> caminho. Se errar, o botão de login aparece mas não funciona.

## 2. Colar o ID do cliente nos dois lugares

- Em `index.html`, linha logo no começo do `<script>`:
  ```js
  const CLIENT_ID = 'cole-aqui.apps.googleusercontent.com';
  ```
- Em `Codigo.gs`, no topo:
  ```js
  var CLIENT_ID = 'cole-aqui.apps.googleusercontent.com';
  ```

Tem que ser **o mesmo valor** nos dois. O servidor recusa token gerado por outro
aplicativo justamente comparando esse valor.

> Client ID não é segredo: ele aparece no código do app no navegador e pode ficar no
> GitHub sem problema. O que **nunca** deve ir para o GitHub é a URL `/exec` da sua API.

## 3. Publicar o Apps Script

1. Na planilha **Funilaria - Base**: **Extensões → Apps Script**.
2. Apague o conteúdo e cole o `Codigo.gs` desta pasta. Salve.
3. **Implantar → Nova implantação → App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
4. Copie a URL que termina em `/exec`.

> "Qualquer pessoa" aqui é exigência do Google para o app conseguir chamar a API sem
> passar pela tela de login dele. O controle de acesso real é o do passo 4: toda
> chamada verifica o token e consulta a aba `Usuarios`. Sem token válido de um e-mail
> autorizado, nada é lido nem gravado.

Ao publicar, o script vai pedir autorização para acessar a planilha, o Drive e fazer
chamadas externas (essa última é para validar o token no Google). É esperado.

## 4. Primeiro acesso e cadastro das pessoas

1. Abra o app, toque em **Configurar conexão** e cole a URL `/exec`. Salve.
2. Entre com a **conta Google dona da planilha**. Ela é cadastrada automaticamente
   como `dono` na aba `Usuarios` — isso só funciona para essa conta e só enquanto a
   aba estiver vazia.
3. Vá em **Mais → Quem pode entrar** e cadastre cada funcionário pelo e-mail Google.

Quem não estiver na aba `Usuarios` não passa do login, mesmo tendo a URL da API.

---

## O que mudou nas regras

### Quem pode o quê

| Ação | Funcionário | Dono |
|---|---|---|
| Criar e editar orçamento não pago | sim | sim |
| Avançar e voltar etapas | sim | sim |
| Receber pagamento | sim | sim |
| Cadastrar serviço novo | sim | sim |
| Estornar o próprio lançamento, até 15 min | sim | sim |
| Estornar qualquer pagamento depois disso | **não** | sim, com motivo |
| Alterar orçamento já pago e fechado | **não** | sim, com motivo |
| Reabrir orçamento fechado | **não** | sim |
| Cancelar orçamento | **não** | sim, com motivo |
| Mudar valor padrão de serviço da lista | **não** | sim |
| Tirar serviço da lista | **não** | sim |
| Liberar/bloquear acesso de pessoas | **não** | sim |
| Ver o histórico de alterações | **não** | sim |

A janela de 15 minutos está em `JANELA_CORRECAO_MIN`, no topo do `Codigo.gs`.

### Nada mais é apagado

- **Pagamento** não se exclui: gera um lançamento negativo ligado ao original
  (`Estorno`, `EstornoDeID`, `Motivo`). Os dois ficam na planilha, e o caixa fecha certo.
- **Orçamento** não se exclui: vira `Status = Cancelado`, com `MotivoCancelamento`,
  e sai do painel. Cancelar exige que os pagamentos sejam estornados antes.
- **Serviço** não se exclui: recebe `Ativo = false`, sai da lista de novos orçamentos
  e continua nos antigos.
- Toda alteração vai para a aba **`Log`**: quando, quem, o que, antes, depois e motivo.

### Valores

O servidor recalcula `Total`, `Pago` e `Saldo` a partir das abas `Itens` e `Pagamentos`
em toda gravação. O que o app manda nesses campos é ignorado. Pagamento acima do saldo
é recusado, o que pega o erro de digitar um zero a mais.

### Duas pessoas ao mesmo tempo

Cada orçamento tem uma coluna `Versao`. O app manda a versão que carregou; se ela não
for a atual, a gravação é recusada com a mensagem "alguém alterou antes de você" e o
app recarrega. Antes disso, quem salvasse por último sobrescrevia o outro em silêncio —
inclusive apagando pagamento lançado de outro aparelho.

As escritas também passam por `LockService`, uma por vez, para não sair número de
orçamento repetido.

---

## Colunas novas na planilha

**Você não precisa criar nada à mão.** Na primeira chamada, o script cria as abas e
colunas que faltarem, sem apagar nem reordenar o que já existe. Isso foi testado com
uma planilha na estrutura antiga e com dados dentro.

- `Orcamentos`: `Versao`, `Travado`, `CriadoPor`, `AlteradoPor`, `MotivoCancelamento`
- `Pagamentos`: `Estorno`, `EstornoDeID`, `LancadoPor`, `LancadoEmMs`, `Motivo`
- `Servicos`: `Ativo`
- abas novas: `Usuarios`, `Log`

---

## Decisão pendente: as fotos são públicas por link

`enviarFoto` marca cada foto como **"qualquer pessoa com o link"** no Drive. É o que
permite a foto abrir dentro do app e no PDF enviado ao cliente. O efeito colateral é
que quem obtiver o link vê a foto sem login — e foto de veículo com placa é dado
pessoal, o que a LGPD alcança.

Mantive como estava para não quebrar o envio de PDF, mas com dois ajustes: nome de
arquivo gerado no servidor (não mais o que o app manda), limite de 5 MB e tipo restrito
a JPEG/PNG. As fotos vão para `Fotos Orçamentos/<ano>`.

Se quiser fechar isso, o caminho é servir a imagem por um `doGet` autenticado do próprio
Apps Script — custa perder a foto dentro do PDF. Me avise se preferir esse lado.

---

## Ao publicar uma alteração no GitHub

Troque o número em `sw.js`:

```js
const CACHE = 'funilaria-v4';   // v5, v6...
```

A página em si já é buscada da rede primeiro, então a atualização chega sozinha. Trocar
o número garante que os arquivos auxiliares em cache também sejam renovados.

---

## Testes

As regras de dinheiro e de permissão têm testes automatizados que rodam fora do Google,
com um simulador do Apps Script:

```bash
node testes/testes.js
```

São 43 casos cobrindo login, papéis, concorrência, travamento após pagamento, estorno,
cancelamento e limites de valor. Há também `node testes/migra.js`, que sobe uma planilha
na estrutura antiga com dados e confere que a migração preserva tudo.
