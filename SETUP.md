# Instalação — Orçamentos Funilaria (v4)

Esta versão fecha o app com login de conta Google e passa a validar **no servidor**
quem pode fazer o quê. Sem os passos 1 a 4 abaixo o app não funciona: é de propósito.

Tempo estimado: 20 a 30 minutos, uma vez só.

---

## 1. Criar o ID do cliente OAuth

É o que permite o app provar ao Apps Script quem está usando.

1. Abra <https://console.cloud.google.com/> com a **mesma conta Google que é dona da planilha**.
2. Crie um projeto (ou use um existente). Nome livre, ex. `Orcamentos Funilaria`.
3. Abra o **Google Auth Platform** (busque por "Google Auth Platform" no topo, ou
   menu **APIs e serviços → Tela de permissão OAuth**) e preencha:
   - **Branding**: nome do app `Orçamentos Funilaria` e seu e-mail de suporte
   - **Público-alvo**: tipo **Externo**. Não precisa publicar nem pedir verificação —
     enquanto ficar em "Teste", basta adicionar em **Usuários de teste** os e-mails de
     quem vai usar (você e os funcionários).

   > Em contas mais antigas, esses dois blocos aparecem juntos como uma única tela
   > chamada "Tela de permissão OAuth", com o campo "Usuários de teste" no fim.

4. Menu **Clientes → Criar cliente** (nas contas antigas: **Credenciais → Criar
   credenciais → ID do cliente OAuth**):
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: qualquer coisa, só identifica no console. Ex.: `Cliente Web 1`
   - Em **Origens JavaScript autorizadas**, uma URI por linha, com o endereço onde o
     app fica hospedado:
     - GitHub Pages: `https://SEUUSUARIO.github.io`
     - se for testar na máquina, adicione também: `http://localhost:8080`
   - **Deixe "URIs de redirecionamento autorizados" vazio.** Esse campo é para login
     feito por servidor; o nosso usa só a origem JavaScript.
   - Clique em **Criar**.
5. Abre uma caixa com o **ID do cliente** (termina em `.apps.googleusercontent.com`).
   Copie. Se fechar sem copiar, ele continua em **Clientes → o cliente que você criou**.

> A origem é só `https://` + domínio: **sem o caminho e sem a barra no fim**. Mesmo que
> o app fique em `https://seuusuario.github.io/cris/`, a origem é
> `https://seuusuario.github.io`. Se errar, o botão de login aparece mas não funciona.

> Se sobrar um campo de URI em branco, o formulário acusa "Origem inválida: o URI não
> pode estar vazio". Apague o campo na lixeira ao lado dele.

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
2. Apague o conteúdo (Ctrl+A) e cole o `Codigo.gs` desta pasta por cima. Salve.
3. **Conceda as permissões antes de publicar.** Escolha a função **`autorizar`** na
   lista suspensa do topo do editor e clique em **Executar**:
   - "Autorização necessária" → **Revisar permissões**
   - Escolha a conta dona da planilha
   - "O Google não verificou este app" → **Avançado** → **Acessar (nome do projeto)**
   - **Permitir**

   O registro de execução deve terminar em "Tudo certo".
4. **Implantar → Nova implantação → App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Copie a URL que termina em `/exec`.

> "Qualquer pessoa" aqui é exigência do Google para o app conseguir chamar a API sem
> passar pela tela de login dele. O controle de acesso real é o do passo 4: toda
> chamada verifica o token e consulta a aba `Usuarios`. Sem token válido de um e-mail
> autorizado, nada é lido nem gravado.

O passo 3 existe por um motivo específico: a permissão de **chamada externa**
(`script.external_request`) é a que valida o login, e as versões antigas do app não a
usavam. Se o script já estava autorizado de antes, a autorização antiga não a inclui, e
o app falha no login com *"Você não tem permissão para chamar UrlFetchApp.fetch"*.

Rodar `doGet` **não** resolve: essa função não chama nenhum serviço externo, então o
Google não pede a permissão que falta. É por isso que existe a função `autorizar` — ela
encosta de propósito na planilha, no Drive e na chamada externa, de uma vez.

Se esse erro aparecer, rode `autorizar` e **publique uma nova versão** depois.

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

- `Orcamentos`: `Versao`, `Travado`, `CriadoPor`, `AlteradoPor`, `MotivoCancelamento`, `ChaveIdem`, `ValorCobrado`
- `Pagamentos`: `Estorno`, `EstornoDeID`, `LancadoPor`, `LancadoEmMs`, `Motivo`
- `Servicos`: `Ativo`
- abas novas: `Usuarios`, `Log`, `Sessoes`

---

## Como ficou o preenchimento

O objetivo era tirar campo da frente de quem usa.

**A placa vem primeiro.** A tela de orçamento novo abre com o teclado na placa. Ao
completar os 7 caracteres, se aquele carro já passou pela oficina o app preenche
sozinho cliente, telefone, veículo, ano e cor, e mostra "✓ Já atendido aqui". Só
preenche campo vazio — nunca sobrescreve o que foi digitado.

Modelo, ano, cor e data ficaram atrás de **Mais detalhes do carro**, recolhido. Na
prática, orçamento de carro conhecido sai com um campo preenchido e dois toques.

**Serviço entra no toque.** O campo de digitar com autocomplete saiu. Em lugar dele,
"＋ Escolher serviços" abre uma folha com os serviços em grade, separados por
categoria, cada um já com o valor. Um toque põe no orçamento; tocar de novo no mesmo
aumenta a quantidade. A folha fica aberta para pôr vários seguidos e mostra o total
correndo no pé. Serviço que não está na lista se cadastra ali mesmo, num formulário
só, e já entra no orçamento.

**Valor com máscara de centavos.** Digitar `38000` mostra `380,00`; `3800000` mostra
`38.000,00`. Não existe mais ponto no lugar errado. O telefone também é formatado
enquanto se digita — mas o app não reformata número que já estava na planilha, porque
registros antigos podem ter o `55` na frente e seriam truncados.

**O campo não perde o foco.** Antes, cada dígito redesenhava a tela inteira e o cursor
saía do lugar. Agora só o subtotal daquela linha e a caixa de totais são atualizados.

**Confirmações viraram folhas.** Os `confirm()` e `prompt()` do navegador saíram. No
lugar entrou uma folha que sobe de baixo, fecha no toque fora ou no Esc, e valida
antes de fechar — motivo obrigatório não deixa mais confirmar em branco.

---

## Sem internet

A oficina não tem sinal em todo canto, então o app trata os casos de forma diferente,
de propósito:

| Situação | Sem internet |
|---|---|
| Criar orçamento novo | **fica guardado** no aparelho e sobe sozinho depois |
| Alterar orçamento já salvo | recusado, com aviso claro |
| Receber ou estornar pagamento | recusado, com aviso claro |

As duas últimas exigem conexão na hora por motivo concreto: alterar depende da `Versao`
atual da planilha, e pagamento lançado duas vezes é dinheiro errado. O app diz que não
deu, em vez de fingir que gravou.

O que está na fila aparece no topo do painel como **"no aparelho"**, com uma barra
amarela e um "enviar agora". O envio acontece sozinho quando a conexão volta e a cada
login.

**Reenvio não duplica.** Cada orçamento da fila leva uma `ChaveIdem` gerada no
aparelho. Se o envio for tentado duas vezes — conexão instável, app reaberto no meio —
o servidor reconhece a chave e devolve o orçamento que já existe em vez de criar outro.
Isso está coberto por testes, inclusive o caso de o orçamento ter sido editado entre a
primeira tentativa e o reenvio (a edição é preservada).

Fotos tiradas sem internet ficam no aparelho em base64 e vão para o Drive no reenvio,
uma a uma. O base64 nunca é gravado na planilha.

**Rascunho não se perde.** O que está sendo preenchido é guardado no aparelho a cada
alteração. Se o app fechar no meio, no próximo login ele pergunta se quer continuar de
onde parou. Rascunho com mais de uma semana é descartado.

---

## Entrar no app

Há dois caminhos, e os dois convivem:

**Código de 6 dígitos por e-mail (principal).** A pessoa digita o e-mail, recebe um
código e entra. Não precisa de conta Google e **não existe senha** — logo não há senha
para vazar, esquecer ou trocar. Quem manda o e-mail é o próprio Apps Script, pela conta
dona da planilha (cota de ~100 e-mails por dia em conta comum).

**Conta Google (alternativo).** Continua funcionando. Serve de reserva: se o envio de
e-mail falhar, você ainda entra.

Nos dois casos vale a mesma regra — só entra quem está na aba **`Usuarios`**.

### Como está protegido

- O código vale **10 minutos**, serve **uma vez só** e some depois de **5 erros**.
- Um e-mail pode pedir no máximo **5 códigos por hora**; o sistema todo, **60 por dia**.
  Isso impede que alguém queime a cota de e-mail da conta e trave o login de todos.
- E-mail que não está na lista **não recebe nada**, e a resposta é igual à de quem
  recebeu: de fora não dá para descobrir quem trabalha na oficina.
- A sessão fica no aparelho até a pessoa **sair**. Na planilha é guardado apenas o
  **hash** do token: quem abrir a aba `Sessoes` não consegue se passar por ninguém.
- Bloquear alguém em "Quem pode entrar" derruba a sessão na hora.
- Perdeu o celular? Em **Quem pode entrar**, "Desconectar este e-mail de todos os
  aparelhos". A pessoa continua liberada e volta a entrar com um novo código.

## Instalar na tela inicial

O app é instalável e abre em tela cheia, sem barra de navegador.

- **Android/Chrome:** botão **📲 Instalar na tela inicial** em *Mais*, ou ⋮ → Instalar aplicativo.
- **iPhone:** só pelo **Safari** → Compartilhar ⬆️ → Adicionar à Tela de Início. O iOS não
  oferece instalação automática, e link aberto de dentro do WhatsApp não serve: tem que
  ser o Safari.

## Instalar para outra oficina

Cada oficina é **uma planilha + uma implantação do Apps Script**. O aplicativo
publicado é o mesmo para todo mundo: `https://lipibueno.github.io/funilaria/`. O que
separa uma oficina da outra é a URL `/exec` que cada aparelho tem em **Ajustes**.

Para montar uma nova:

1. **Copie a planilha**: abra a sua, **Arquivo → Fazer uma cópia**. A cópia fica na
   conta de quem vai usar (ou na sua, se for você que administra).
2. **Zere os dados** da cópia — veja a seção seguinte.
3. Na cópia: **Extensões → Apps Script**, cole o `Codigo.gs`, rode `autorizar`,
   e publique (**Implantar → Nova implantação → App da Web**, Executar como: Eu,
   Quem pode acessar: Qualquer pessoa). Guarde a nova URL `/exec`.
4. Ajuste os dados da oficina na aba **`Config`**: nome, telefone, endereço, documento.
5. No celular da pessoa, abra o mesmo endereço do app, vá em **Ajustes** e cole a URL
   `/exec` **da planilha dela**.

Ponto importante: **o `CLIENT_ID` pode continuar o mesmo**. Ele identifica o
*aplicativo*, não os dados. Duas oficinas com o mesmo `CLIENT_ID` e planilhas
diferentes não se enxergam — cada Apps Script só lê a planilha à qual está preso, e só
aceita quem está na aba `Usuarios` dela.

O que você precisa fazer no Google Cloud é adicionar o e-mail de cada pessoa em
**Público-alvo → Usuários de teste**, enquanto o app estiver em modo de teste.

> Se preferir separar de vez, a outra pessoa cria o próprio cliente OAuth e troca o
> `CLIENT_ID` nos dois arquivos, publicando o app numa conta GitHub dela. Só vale a
> pena se forem negócios independentes.

## Zerar a planilha

A função **`limparDados`** no `Codigo.gs` faz isso. Ela é de propósito **não exposta na
API**: só roda à mão, no editor, e sem confirmação explícita não apaga nada.

1. No editor, encontre a função `limparDados` (perto do topo).
2. Troque a linha:
   ```js
   var CONFIRMA = confirmacao !== undefined ? confirmacao : '';
   ```
   por:
   ```js
   var CONFIRMA = confirmacao !== undefined ? confirmacao : 'APAGAR TUDO';
   ```
3. Selecione `limparDados` na lista de funções e **Executar**.
4. **Volte a linha como estava** e salve, para ninguém rodar sem querer.

Apaga: orçamentos, itens, pagamentos, clientes e o histórico. Mantém: a lista de
serviços, os dados da oficina e quem tem acesso. A numeração volta para 1.

Para limpar **também** serviços, `Config` e `Usuarios`, troque `tambemCadastros` para
`true` na mesma linha de cima. Depois rode `autorizar` de novo para se recadastrar
como dono.

> Isso apaga de verdade, sem desfazer. Faça **Arquivo → Fazer uma cópia** antes se a
> planilha tiver algo que você queira guardar.

## Valor cobrado

O orçamento tem dois números diferentes, de propósito:

- **Serviços** — a soma da lista, o preço de tabela.
- **Valor cobrado** — o que foi fechado com o cliente.

Quando o valor cobrado está preenchido, é ele que manda: o saldo, o limite do
pagamento, o PDF e o "falta receber" saem dele. A lista de serviços continua registrada
com os valores cheios, e a diferença aparece como **Desconto**.

Deixar vazio significa cobrar a soma dos serviços.

Quem pode mexer segue a mesma regra das outras alterações: livre enquanto o orçamento
não estiver pago e fechado; depois disso, só o dono, com motivo, e fica no `Log`.

## Fotos no PDF

As fotos anexadas aos serviços entram no fim do PDF, duas por linha, com a descrição
embaixo. Elas são buscadas pelo servidor (ação `baixarFoto`), porque o Drive não libera
a imagem direto para o navegador. Foto que falhar é pulada: o orçamento sai assim
mesmo, sem travar o envio.

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
const CACHE = 'funilaria-v5';   // v6, v7...
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

São 94 casos cobrindo login, papéis, concorrência, travamento após pagamento, estorno,
cancelamento, limites de valor e a idempotência da fila offline. Há também `node testes/migra.js`, que sobe uma planilha
na estrutura antiga com dados e confere que a migração preserva tudo.
