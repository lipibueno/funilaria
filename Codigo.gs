/**
 * API de Orcamentos - Funilaria  (v4)
 * Planilha "Funilaria - Base" > Extensoes > Apps Script > cole este arquivo.
 *
 * ANTES DE PUBLICAR, leia SETUP.md. Em resumo:
 *  1. Crie um ID do cliente OAuth (tipo "Aplicativo da Web") no Google Cloud
 *     e cole abaixo em CLIENT_ID. O mesmo valor vai no index.html.
 *  2. Implantar > Nova implantacao > App da Web
 *       Executar como: Eu
 *       Quem pode acessar: Qualquer pessoa
 *     (O "qualquer pessoa" e do Google; quem controla o acesso de verdade
 *      e a aba Usuarios desta planilha, verificada em cada chamada.)
 *  3. No primeiro acesso, entre com a MESMA conta Google que e dona da
 *     planilha. Ela e cadastrada sozinha como "dono" na aba Usuarios.
 *     Depois cadastre os funcionarios nessa aba.
 */

var CLIENT_ID = '415802568647-spdi71hljj8a8778n5a811ukb7hco3ns.apps.googleusercontent.com';
var JANELA_CORRECAO_MIN = 15;    // minutos para corrigir o proprio lancamento sem ser dono
var MESES_PADRAO = 12;           // quanto historico o app baixa por padrao
var MAX_FOTO_MB = 5;
var PASTA_FOTOS = '';            // ID de uma pasta do Drive; vazio = cria sozinho

/* ===================== estrutura da planilha ===================== */

var ESTRUTURA_V = '7';
var ESTRUTURA = {
  Config:     ['Chave','Valor'],
  Usuarios:   ['Email','Nome','Papel','Ativo'],
  Clientes:   ['ID','Nome','Telefone','Obs'],
  Servicos:   ['ID','Descricao','Categoria','ValorPadrao','Ativo'],
  Orcamentos: ['ID','Numero','Data','ClienteID','ClienteNome','Telefone','Placa','Modelo','Ano','Cor',
               'Status','Total','Pago','Saldo','Arquivado','Obs','AtualizadoEm','Versao','Travado',
               'CriadoPor','AlteradoPor','MotivoCancelamento','ChaveIdem','ValorCobrado'],
  Itens:      ['ID','OrcamentoID','Ordem','Descricao','Qtd','Valor','Subtotal','FotoURL'],
  Pagamentos: ['ID','OrcamentoID','Data','Valor','Forma','Obs','Estorno','EstornoDeID',
               'LancadoPor','LancadoEmMs','Motivo'],
  Log:        ['Quando','Email','Acao','Entidade','EntidadeID','Antes','Depois','Motivo'],
  // Sessoes guarda o HASH do token, nunca o token. Quem abrir a planilha nao
  // consegue se passar por ninguem.
  Sessoes:    ['TokenHash','Email','CriadaEm','ExpiraEmMs','Aparelho','UltimoUsoMs']
};

// Cria abas e colunas que faltarem. Nunca apaga nem reordena o que ja existe.
function garantirEstrutura() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('estrutura') === ESTRUTURA_V) return;
  var ss = pl();
  for (var nome in ESTRUTURA) {
    var s = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cab = cabecalhoDe(s);
    if (!cab.length) {
      s.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
      s.setFrozenRows(1);
      continue;
    }
    var faltam = ESTRUTURA[nome].filter(function (c) { return cab.indexOf(c) < 0; });
    if (faltam.length) s.getRange(1, cab.length + 1, 1, faltam.length).setValues([faltam]);
  }
  props.setProperty('estrutura', ESTRUTURA_V);
}

function cabecalhoDe(s) {
  if (!s.getLastColumn()) return [];
  var v = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  while (v.length && String(v[v.length - 1]).trim() === '') v.pop();
  return v.map(String);
}

/**
 * RODE ESTA FUNCAO UMA VEZ no editor, depois de colar o codigo e antes de publicar.
 *
 * Ela encosta de proposito em todos os servicos que a API usa, para o Google pedir
 * todas as permissoes numa tacada so. A que costuma faltar e a de chamada externa
 * (script.external_request): e ela que valida o login, e as versoes antigas do app
 * nao usavam, entao a autorizacao antiga nao a inclui.
 *
 * Rodar doGet NAO serve para isso, porque doGet nao chama nenhum servico externo.
 */
function autorizar() {
  var linhas = ['Permissoes concedidas:'];

  garantirEstrutura();
  linhas.push('- planilha: ' + pl().getName());

  // a chamada externa que valida o token do login (token de mentira de proposito)
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=teste',
                            { muteHttpExceptions: true });
  linhas.push('- chamada externa (validacao do login): HTTP ' + r.getResponseCode() +
              ' (400 aqui e o esperado)');

  linhas.push('- pasta de fotos: ' + pastaFotos().getName());

  var dono = donoDaPlanilha();
  linhas.push('- conta do dono: ' + (dono || 'NAO IDENTIFICADA'));

  // Cadastra o dono aqui mesmo. Assim o primeiro acesso nao depende de o
  // servidor conseguir descobrir quem e o dono na hora do login.
  linhas.push('');
  var jaTem = ler('Usuarios');
  if (jaTem.length) {
    linhas.push('Aba Usuarios ja tem ' + jaTem.length + ' pessoa(s). Nada a cadastrar.');
  } else if (dono) {
    gravar('Usuarios', { Email: dono, Nome: 'Dono', Papel: 'dono', Ativo: true }, 'Email');
    registrar(dono, 'primeiro_acesso', 'Usuarios', dono, '', 'dono', 'cadastrado pela funcao autorizar');
    linhas.push('Cadastrei ' + dono + ' como dono na aba Usuarios.');
  } else {
    linhas.push('ATENCAO: nao consegui descobrir o dono. Abra a aba Usuarios da planilha');
    linhas.push('e preencha a mao: Email = seu e-mail, Nome = seu nome, Papel = dono, Ativo = TRUE.');
  }

  linhas.push('');
  linhas.push(CLIENT_ID ? 'CLIENT_ID preenchido: ' + CLIENT_ID.slice(0, 18) + '...'
                        : 'ATENCAO: CLIENT_ID vazio!');
  linhas.push('Tudo certo. Agora publique: Implantar > Gerenciar implantacoes > lapis > Nova versao.');

  var txt = linhas.join('\n');
  Logger.log(txt);
  return txt;
}

/**
 * ZERA A PLANILHA para uma oficina comecar do nada.
 *
 * NAO e exposta na API de proposito: so roda aqui no editor, a mao. Para usar,
 * troque a linha abaixo por CONFIRMA = 'APAGAR TUDO' e rode a funcao.
 * Depois volte a linha como estava, para ninguem rodar sem querer.
 *
 * Apaga: orcamentos, itens, pagamentos, clientes e o historico.
 * Mantem: a lista de servicos, os dados da oficina (Config) e quem tem acesso.
 * Para zerar tambem essas, passe zerarTudo = true.
 */
function limparDados(confirmacao, tambemCadastros) {
  var CONFIRMA = confirmacao !== undefined ? confirmacao : '';   // <<< troque por 'APAGAR TUDO'
  var zerarTudo = tambemCadastros !== undefined ? !!tambemCadastros : false;

  // Rodar pelo botao do editor nao passa argumento, entao cai na linha acima:
  // sem editar o codigo, nada e apagado.
  if (CONFIRMA !== 'APAGAR TUDO') {
    return 'Nada foi apagado. Para confirmar, edite a funcao limparDados e ponha ' +
           "CONFIRMA = 'APAGAR TUDO', depois rode de novo.";
  }

  garantirEstrutura();
  var abas = ['Orcamentos', 'Itens', 'Pagamentos', 'Clientes', 'Log'];
  if (zerarTudo) abas = abas.concat(['Servicos', 'Usuarios']);

  var apagadas = [];
  abas.forEach(function (nome) {
    var s = aba(nome);
    var n = s.getLastRow() - 1;
    if (n > 0) s.deleteRows(2, n);          // linha 1 e o cabecalho, fica
    apagadas.push(nome + ': ' + Math.max(0, n));
  });

  // a numeracao volta para 1
  var cfg = aba('Config');
  var v = cfg.getDataRange().getValues();
  var achou = false;
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === 'proximo_numero') { cfg.getRange(i + 1, 2).setValue(1); achou = true; }
  }
  if (!achou) cfg.appendRow(['proximo_numero', 1]);

  if (zerarTudo) {
    var manter = ['oficina_nome', 'oficina_telefone', 'oficina_endereco', 'oficina_doc', 'validade_dias'];
    for (var j = v.length - 1; j >= 1; j--) {
      if (manter.indexOf(String(v[j][0])) >= 0) cfg.getRange(j + 1, 2).setValue('');
    }
    apagadas.push('Config: valores limpos');
  }

  var msg = 'Planilha zerada.\n- ' + apagadas.join('\n- ') +
            '\n- proximo_numero: 1' +
            '\n\nAgora rode autorizar() para se cadastrar como dono de novo.' +
            '\nE volte CONFIRMA para vazio no codigo.';
  Logger.log(msg);
  return msg;
}

/* ===================== entrada ===================== */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.diag !== '1') {
    return _json({ ok: true, msg: 'API de orcamentos ativa', versao: ESTRUTURA_V });
  }

  // Diagnostico: abra a URL do app com ?diag=1 no fim.
  // Roda com a mesma autorizacao das chamadas de verdade, entao mostra
  // exatamente o que esta faltando. Nao expoe e-mail nem dado da planilha.
  var d = { versao: ESTRUTURA_V, clientIdPreenchido: !!CLIENT_ID };

  try {
    var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=teste',
                              { muteHttpExceptions: true });
    d.chamadaExterna = 'LIBERADA (HTTP ' + r.getResponseCode() + ', 400 e o esperado)';
  } catch (err) {
    d.chamadaExterna = 'BLOQUEADA -> rode a funcao autorizar() no editor, aceite as ' +
                       'permissoes e publique nova versao';
  }

  try {
    var em = String(Session.getEffectiveUser().getEmail() || '');
    d.executandoComo = em
      ? 'dono da planilha (correto)'
      : 'visitante -> ERRADO: na implantacao, "Executar como" tem que ser Eu';
  } catch (e2) {
    d.executandoComo = 'visitante -> ERRADO: na implantacao, "Executar como" tem que ser Eu';
  }

  try {
    pl().getName();
    d.planilha = 'acessivel';
  } catch (e3) {
    d.planilha = 'BLOQUEADA';
  }

  d.ok = d.chamadaExterna.indexOf('LIBERADA') === 0 &&
         d.executandoComo.indexOf('correto') > 0 &&
         d.planilha === 'acessivel' && !!CLIENT_ID;
  return _json(d);
}

function doPost(e) {
  var req = {}, usuario = null;
  try {
    req = JSON.parse(e.postData.contents);
    garantirEstrutura();

    var acao = ACOES[req.action];
    if (!acao) throw erro('ACAO', 'Acao desconhecida: ' + req.action);

    // Duas acoes rodam sem login, porque sao a propria porta de entrada. Elas se
    // protegem sozinhas: limite de envios, codigo de uso unico e resposta igual
    // para e-mail conhecido ou nao. Nenhuma delas le ou grava dado de orcamento.
    if (!acao.semLogin) {
      usuario = autenticar(req.token);
      if (acao.papeis.indexOf(usuario.Papel) < 0) {
        throw erro('PERMISSAO', 'Seu acesso e de ' + usuario.Papel + ' e nao permite esta acao');
      }
    }

    if (!acao.escreve) return _json({ ok: true, data: acao.fn(req, usuario) });

    // escrita: uma por vez, para nao gerar numero repetido nem sobrescrever linha
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) throw erro('OCUPADO', 'Outra pessoa esta salvando agora. Tente de novo.');
    try {
      return _json({ ok: true, data: acao.fn(req, usuario) });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    var cod = err && err.codigo ? err.codigo : 'ERRO';
    var msg = err && err.publica ? err.message : String(err && err.message || err);
    if (cod === 'ERRO') {
      registrar(usuario ? usuario.Email : '?', 'falha', 'Sistema', req.action || '', '',
                String(err && err.stack || err).slice(0, 500), '');
    }
    return _json({ ok: false, codigo: cod, error: msg });
  }
}

var ACOES = {
  pedirCodigo:        { fn: pedirCodigo,        papeis: [],                      escreve: false, semLogin: true },
  entrarComCodigo:    { fn: entrarComCodigo,    papeis: [],                      escreve: true,  semLogin: true },
  sair:               { fn: sair,               papeis: ['dono', 'funcionario'], escreve: true },
  encerrarSessoes:    { fn: encerrarSessoes,    papeis: ['dono'],                escreve: true },
  carregar:           { fn: carregar,           papeis: ['dono', 'funcionario'], escreve: false },
  listarLog:          { fn: listarLog,          papeis: ['dono'],                escreve: false },
  salvarOrcamento:    { fn: salvarOrcamento,    papeis: ['dono', 'funcionario'], escreve: true },
  mudarStatus:        { fn: mudarStatus,        papeis: ['dono', 'funcionario'], escreve: true },
  arquivar:           { fn: arquivar,           papeis: ['dono', 'funcionario'], escreve: true },
  cancelarOrcamento:  { fn: cancelarOrcamento,  papeis: ['dono'],                escreve: true },
  registrarPagamento: { fn: registrarPagamento, papeis: ['dono', 'funcionario'], escreve: true },
  estornarPagamento:  { fn: estornarPagamento,  papeis: ['dono', 'funcionario'], escreve: true },
  salvarServico:      { fn: salvarServico,      papeis: ['dono', 'funcionario'], escreve: true },
  desativarServico:   { fn: desativarServico,   papeis: ['dono'],                escreve: true },
  salvarCliente:      { fn: salvarCliente,      papeis: ['dono', 'funcionario'], escreve: true },
  salvarUsuario:      { fn: salvarUsuario,      papeis: ['dono'],                escreve: true },
  enviarFoto:         { fn: enviarFoto,         papeis: ['dono', 'funcionario'], escreve: false },
  baixarFoto:         { fn: baixarFoto,         papeis: ['dono', 'funcionario'], escreve: false }
};

/* ===================== login ===================== */

// Confere o token do Google Sign-In e devolve a linha da aba Usuarios.
function autenticar(token) {
  if (!token) throw erro('NAO_AUTORIZADO', 'Entre para continuar');
  // Dois jeitos de entrar convivem: o token do Google e um JWT (tem dois pontos),
  // a sessao criada pelo codigo por e-mail e um texto opaco.
  var email = String(token).split('.').length === 3 ? emailDoToken(token) : emailDaSessao(token);
  var u = usuarioPor(email);
  if (!u) u = semearDono(email);
  if (!u) throw erro('NAO_AUTORIZADO', email + ' nao tem acesso. Peca ao dono para liberar.');
  if (String(u.Ativo) === 'false') throw erro('NAO_AUTORIZADO', 'Seu acesso foi desativado.');
  u.Email = String(u.Email).trim().toLowerCase();
  u.Papel = String(u.Papel || 'funcionario').toLowerCase() === 'dono' ? 'dono' : 'funcionario';
  return u;
}

function emailDoToken(token) {
  var cache = CacheService.getScriptCache();
  var chave = 'tk_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var guardado = cache.get(chave);
  if (guardado) return guardado;

  if (!CLIENT_ID) throw erro('CONFIG', 'Falta preencher CLIENT_ID no Apps Script (veja SETUP.md)');

  var r;
  try {
    r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
  } catch (falha) {
    // acontece quando a autorizacao do script e anterior a esta versao do codigo
    if (String(falha).indexOf('UrlFetchApp') >= 0 || String(falha).indexOf('external_request') >= 0) {
      throw erro('CONFIG', 'O script nao tem permissao para validar o login. ' +
                 'No editor do Apps Script, rode a funcao "autorizar" uma vez, ' +
                 'aceite as permissoes e publique uma nova versao.');
    }
    throw falha;
  }
  if (r.getResponseCode() !== 200) throw erro('NAO_AUTORIZADO', 'Login expirado. Entre de novo.');

  var d = JSON.parse(r.getContentText());
  if (d.aud !== CLIENT_ID) throw erro('NAO_AUTORIZADO', 'Token gerado por outro aplicativo');
  if (String(d.iss).replace('https://', '') !== 'accounts.google.com') {
    throw erro('NAO_AUTORIZADO', 'Token de origem inesperada');
  }
  if (String(d.email_verified) !== 'true') throw erro('NAO_AUTORIZADO', 'E-mail nao verificado no Google');

  var faltaSeg = Math.floor((Number(d.exp) * 1000 - Date.now()) / 1000);
  if (faltaSeg <= 0) throw erro('NAO_AUTORIZADO', 'Login expirado. Entre de novo.');
  if (!d.email) throw erro('NAO_AUTORIZADO', 'Token sem e-mail');

  var email = String(d.email).toLowerCase();
  cache.put(chave, email, Math.min(300, faltaSeg));
  return email;
}

/* ---------- entrar com codigo de 6 digitos por e-mail ---------- */

var CODIGO_VALE_MIN = 10;     // quanto tempo o codigo serve
var CODIGO_TENTATIVAS = 5;    // erros permitidos antes de invalidar
var SESSAO_DIAS = 365;        // "fica logado sempre": so sai quando pedir
var LIMITE_POR_EMAIL_HORA = 5;
var LIMITE_GERAL_DIA = 60;    // protege a cota de e-mail do Google

// Pede o codigo. Nao exige login, entao e a porta de entrada: tudo aqui e limitado.
function pedirCodigo(req) {
  var email = String(req.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) throw erro('DADO', 'Informe um e-mail valido');

  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();

  // trava por e-mail
  var chaveQtd = 'qtd_' + _hash(email);
  var qtd = _num(cache.get(chaveQtd));
  if (qtd >= LIMITE_POR_EMAIL_HORA) {
    throw erro('MUITAS', 'Voce ja pediu varios codigos. Espere alguns minutos.');
  }

  // trava geral do dia, para ninguem queimar a cota de e-mail da conta
  var hojeTxt = _ymd(new Date());
  var totalHoje = _num(props.getProperty('envios_' + hojeTxt));
  if (totalHoje >= LIMITE_GERAL_DIA) {
    throw erro('MUITAS', 'Limite de envios de hoje atingido. Entre com a conta Google ou tente amanha.');
  }

  var u = usuarioPor(email);
  var ativo = u && String(u.Ativo) !== 'false';

  if (ativo) {
    var codigo = _codigoNovo();
    cache.put('cod_' + _hash(email), JSON.stringify({
      h: _hash(email + ':' + codigo), exp: Date.now() + CODIGO_VALE_MIN * 60000, erros: 0
    }), CODIGO_VALE_MIN * 60);

    MailApp.sendEmail({
      to: email,
      subject: codigo + ' e o seu codigo de acesso',
      body: 'Ola' + (u.Nome ? ' ' + u.Nome : '') + ',\n\n' +
            'Seu codigo para entrar no app de orcamentos:\n\n    ' + codigo + '\n\n' +
            'Ele vale por ' + CODIGO_VALE_MIN + ' minutos e serve uma vez so.\n\n' +
            'Se nao foi voce que pediu, ignore este e-mail: sem o codigo ninguem entra.'
    });

    props.setProperty('envios_' + hojeTxt, String(totalHoje + 1));
    registrar(email, 'codigo_enviado', 'Sessoes', email, '', '', '');
  } else {
    // E-mail desconhecido nao recebe nada, e a resposta e a mesma de quem recebeu:
    // de fora nao da para descobrir quem tem acesso a oficina.
    registrar(email, 'codigo_negado', 'Sessoes', email, '', 'e-mail sem acesso', '');
  }

  cache.put(chaveQtd, String(qtd + 1), 3600);
  return { enviado: true, validadeMin: CODIGO_VALE_MIN };
}

// Confere o codigo e devolve a sessao.
function entrarComCodigo(req) {
  var email = String(req.email || '').trim().toLowerCase();
  var codigo = String(req.codigo || '').replace(/\D/g, '');
  if (!email || !codigo) throw erro('DADO', 'Informe o e-mail e o codigo');

  var cache = CacheService.getScriptCache();
  var chave = 'cod_' + _hash(email);
  var guardado = cache.get(chave);
  if (!guardado) throw erro('CODIGO', 'Codigo expirado. Peca um novo.');

  var d = JSON.parse(guardado);
  if (Date.now() > d.exp) { cache.remove(chave); throw erro('CODIGO', 'Codigo expirado. Peca um novo.'); }
  if (d.erros >= CODIGO_TENTATIVAS) { cache.remove(chave); throw erro('CODIGO', 'Codigo bloqueado por erros. Peca um novo.'); }

  if (d.h !== _hash(email + ':' + codigo)) {
    d.erros++;
    cache.put(chave, JSON.stringify(d), CODIGO_VALE_MIN * 60);
    throw erro('CODIGO', 'Codigo errado. Faltam ' + (CODIGO_TENTATIVAS - d.erros) + ' tentativa(s).');
  }

  cache.remove(chave);                       // um codigo serve uma vez so
  var u = usuarioPor(email);
  if (!u || String(u.Ativo) === 'false') throw erro('NAO_AUTORIZADO', 'Este e-mail nao tem acesso.');

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  limparSessoesVelhas();
  gravar('Sessoes', {
    TokenHash: _hash(token), Email: email, CriadaEm: new Date().toISOString(),
    ExpiraEmMs: Date.now() + SESSAO_DIAS * 86400000,
    Aparelho: String(req.aparelho || '').slice(0, 80), UltimoUsoMs: Date.now()
  }, 'TokenHash');
  registrar(email, 'entrou', 'Sessoes', '', '', 'codigo por e-mail', '');

  return {
    token: token,
    usuario: { email: email, nome: u.Nome, papel: String(u.Papel).toLowerCase() === 'dono' ? 'dono' : 'funcionario' }
  };
}

// Quem e o dono desta sessao. Tambem renova o "ultimo uso".
function emailDaSessao(token) {
  var h = _hash(token);
  var s = aba('Sessoes');
  if (s.getLastRow() < 2) throw erro('NAO_AUTORIZADO', 'Sessao nao encontrada. Entre de novo.');

  var cab = cabecalhoDe(s);
  var iH = cab.indexOf('TokenHash'), iEmail = cab.indexOf('Email');
  var iExp = cab.indexOf('ExpiraEmMs'), iUso = cab.indexOf('UltimoUsoMs');
  var v = s.getRange(2, 1, s.getLastRow() - 1, cab.length).getValues();

  for (var i = 0; i < v.length; i++) {
    if (String(v[i][iH]) !== h) continue;
    if (_num(v[i][iExp]) < Date.now()) {
      s.deleteRow(i + 2);
      throw erro('NAO_AUTORIZADO', 'Sua sessao expirou. Entre de novo.');
    }
    // grava o uso no maximo uma vez por hora, para nao escrever na planilha a cada clique
    if (Date.now() - _num(v[i][iUso]) > 3600000) s.getRange(i + 2, iUso + 1).setValue(Date.now());
    return String(v[i][iEmail]).trim().toLowerCase();
  }
  throw erro('NAO_AUTORIZADO', 'Sessao nao encontrada. Entre de novo.');
}

// Sair: apaga a sessao deste aparelho. Sem isso, "fica logado" nao teria volta.
function sair(req, u) {
  var h = _hash(String(req.token || ''));
  var s = aba('Sessoes');
  if (s.getLastRow() < 2) return { saiu: true };
  var cab = cabecalhoDe(s);
  var iH = cab.indexOf('TokenHash');
  var v = s.getRange(2, iH + 1, s.getLastRow() - 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i][0]) === h) s.deleteRow(i + 2);
  }
  registrar(u.Email, 'saiu', 'Sessoes', '', '', '', '');
  return { saiu: true };
}

// O dono pode derrubar todas as sessoes de alguem (celular perdido, sai da equipe).
function encerrarSessoes(req, u) {
  var alvo = String(req.email || '').trim().toLowerCase();
  if (!alvo) throw erro('DADO', 'Informe o e-mail');
  var s = aba('Sessoes');
  if (s.getLastRow() < 2) return { encerradas: 0 };
  var cab = cabecalhoDe(s);
  var iEmail = cab.indexOf('Email');
  var v = s.getRange(2, iEmail + 1, s.getLastRow() - 1, 1).getValues();
  var n = 0;
  for (var i = v.length - 1; i >= 0; i--) {
    if (String(v[i][0]).trim().toLowerCase() === alvo) { s.deleteRow(i + 2); n++; }
  }
  registrar(u.Email, 'sessoes_encerradas', 'Sessoes', alvo, '', String(n), req.motivo || '');
  return { encerradas: n };
}

function limparSessoesVelhas() {
  var s = aba('Sessoes');
  if (s.getLastRow() < 2) return;
  var cab = cabecalhoDe(s);
  var iExp = cab.indexOf('ExpiraEmMs');
  var v = s.getRange(2, iExp + 1, s.getLastRow() - 1, 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) {
    if (_num(v[i][0]) < Date.now()) s.deleteRow(i + 2);
  }
}

function _hash(txt) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt)));
}

// Digitos vindos do gerador de UUID, que e bem melhor que Math.random para isto.
function _codigoNovo() {
  var bruto = Utilities.getUuid() + Utilities.getUuid();
  var d = String(bruto).replace(/\D/g, '');
  while (d.length < 6) d += String(Math.floor(Math.random() * 10));
  return d.slice(-6);
}

function usuarioPor(email) {
  var achou = null;
  ler('Usuarios').forEach(function (u) {
    if (String(u.Email).trim().toLowerCase() === email) achou = u;
  });
  return achou;
}

// Primeiro acesso: se a aba Usuarios esta vazia, o dono da planilha entra como dono.
// Ninguem mais passa por aqui, porque so o dono da planilha satisfaz a comparacao
// com getEffectiveUser().
function semearDono(email) {
  if (ler('Usuarios').length) return null;
  var dono = donoDaPlanilha();
  if (!dono || dono !== email) return null;
  var u = { Email: email, Nome: 'Dono', Papel: 'dono', Ativo: true };
  gravar('Usuarios', u, 'Email');
  registrar(email, 'primeiro_acesso', 'Usuarios', email, '', 'dono', 'cadastro automatico do dono da planilha');
  return u;
}

// Quem e o dono. Session.getEffectiveUser() falha em algumas contas, entao o
// caminho principal e perguntar ao Drive quem e o dono do arquivo da planilha.
function donoDaPlanilha() {
  try {
    var d = DriveApp.getFileById(pl().getId()).getOwner();
    if (d && d.getEmail()) return String(d.getEmail()).toLowerCase();
  } catch (e) {}
  try {
    var s = String(Session.getEffectiveUser().getEmail() || '');
    if (s) return s.toLowerCase();
  } catch (e2) {}
  return '';
}

function salvarUsuario(req, u) {
  var alvo = String(req.email || '').trim().toLowerCase();
  if (!alvo || alvo.indexOf('@') < 0) throw erro('DADO', 'Informe um e-mail valido');
  var papel = String(req.papel || 'funcionario').toLowerCase() === 'dono' ? 'dono' : 'funcionario';
  var ativo = req.ativo === false ? false : true;
  var antes = usuarioPor(alvo);

  if (alvo === u.Email && (papel !== 'dono' || !ativo)) {
    throw erro('PERMISSAO', 'Voce nao pode remover o proprio acesso de dono');
  }
  var linha = { Email: alvo, Nome: req.nome || (antes ? antes.Nome : ''), Papel: papel, Ativo: ativo };
  gravar('Usuarios', linha, 'Email');
  registrar(u.Email, antes ? 'usuario_alterado' : 'usuario_criado', 'Usuarios', alvo,
            antes ? antes.Papel + '/' + antes.Ativo : '', papel + '/' + ativo, req.motivo || '');
  return linha;
}

/* ===================== leitura ===================== */

function carregar(req, u) {
  var incluirArquivados = !!req.incluirArquivados;
  var meses = _num(req.meses) || MESES_PADRAO;
  var corte = new Date();
  corte.setMonth(corte.getMonth() - meses);
  var corteTxt = _ymd(corte);

  var orcs = ler('Orcamentos').filter(function (o) {
    if (!incluirArquivados && String(o.Arquivado) === 'true') return false;
    if (String(o.Arquivado) === 'true' && String(o.Data).slice(0, 10) < corteTxt) return false;
    return true;
  });
  var ids = {};
  orcs.forEach(function (o) { ids[String(o.ID)] = 1; });
  var meus = function (r) { return ids[String(r.OrcamentoID)] === 1; };

  return {
    usuario: { email: u.Email, nome: u.Nome, papel: u.Papel },
    config: lerConfig(),
    clientes: ler('Clientes'),
    servicos: ler('Servicos'),
    orcamentos: orcs,
    itens: ler('Itens').filter(meus),
    pagamentos: ler('Pagamentos').filter(meus)
  };
}

function listarLog(req) {
  var l = ler('Log');
  return l.slice(Math.max(0, l.length - (_num(req.limite) || 200))).reverse();
}

/* ===================== orcamento ===================== */

function salvarOrcamento(req, u) {
  var env = req.orcamento || {};
  var itens = req.itens || [];
  var novo = !env.ID;
  var o, antes = null;

  if (novo) {
    // Reenvio da fila offline: se este orcamento ja entrou, devolve o que existe
    // em vez de criar de novo. Sem isso, cada nova tentativa geraria duplicata.
    var idem = String(req.chaveIdem || '').trim();
    if (idem) {
      var repetido = porChaveIdem(idem);
      if (repetido) {
        return {
          orcamento: repetido, repetido: true,
          itens: ler('Itens').filter(function (i) { return String(i.OrcamentoID) === String(repetido.ID); }),
          pagamentos: pagamentosDe(repetido.ID)
        };
      }
    }
    o = {
      ID: novoId('O'), Numero: proximoNumero(), Status: 'Orcamento', Versao: 0,
      CriadoPor: u.Email, Arquivado: false, ChaveIdem: idem
    };
  } else {
    antes = buscar('Orcamentos', env.ID);
    if (!antes) throw erro('NAO_ENCONTRADO', 'Este orcamento nao existe mais na planilha');
    if (antes.Status === 'Cancelado') throw erro('CANCELADO', 'Orcamento cancelado nao pode ser alterado');
    conferirVersao(antes, env.Versao);
    if (estaTravado(antes)) {
      exigirDono(u, 'Este orcamento esta pago e fechado. So o dono pode alterar.');
      if (!String(req.motivo || '').trim()) {
        throw erro('MOTIVO', 'Informe o motivo da alteracao de um orcamento ja pago');
      }
    }
    // o app nao decide numero, status, autor nem valores pagos
    o = {
      ID: antes.ID, Numero: antes.Numero, Status: antes.Status, Versao: _num(antes.Versao),
      CriadoPor: antes.CriadoPor, Arquivado: antes.Arquivado,
      MotivoCancelamento: antes.MotivoCancelamento, ChaveIdem: antes.ChaveIdem,
      // mantido se o app nao mandar; a lista de campos abaixo sobrescreve quando vier
      ValorCobrado: antes.ValorCobrado
    };
  }

  ['Data','ClienteID','ClienteNome','Telefone','Placa','Modelo','Ano','Cor','Obs','ValorCobrado'].forEach(function (c) {
    if (env[c] !== undefined) o[c] = env[c];
  });
  if (!o.Data) o.Data = _ymd(new Date());
  o.Placa = String(o.Placa || '').toUpperCase().trim();
  if (!String(o.ClienteNome || '').trim() && !o.Placa) {
    throw erro('DADO', 'Informe ao menos o cliente ou a placa');
  }

  vincularCliente(o);
  gravarItens(o.ID, itens);
  recalcular(o, u);
  registrar(u.Email, novo ? 'orcamento_criado' : 'orcamento_alterado', 'Orcamentos', o.ID,
            antes ? resumo(antes) : '', resumo(o), req.motivo || '');

  return {
    orcamento: o,
    itens: ler('Itens').filter(function (i) { return String(i.OrcamentoID) === String(o.ID); }),
    pagamentos: pagamentosDe(o.ID)
  };
}

function gravarItens(oid, itens) {
  apagarPorFiltro('Itens', 'OrcamentoID', oid);
  itens.forEach(function (it, i) {
    var q = _num(it.Qtd) || 1;
    var v = _num(it.Valor);
    if (v < 0) throw erro('DADO', 'Valor de servico nao pode ser negativo');
    gravar('Itens', {
      ID: it.ID || novoId('I'), OrcamentoID: oid, Ordem: i + 1,
      Descricao: String(it.Descricao || '').slice(0, 300),
      Qtd: q, Valor: v, Subtotal: _arred(q * v), FotoURL: it.FotoURL || ''
    });
  });
}

// Recalcula total/pago/saldo SEMPRE a partir da planilha, nunca do que o app mandou.
function recalcular(o, u) {
  var total = 0;
  ler('Itens').forEach(function (i) {
    if (String(i.OrcamentoID) === String(o.ID)) total += _num(i.Qtd) * _num(i.Valor);
  });
  var pago = somaPagamentos(o.ID);
  o.Total = _arred(total);
  // ValorCobrado e o preco fechado com o cliente. Vazio ou zero = cobra a soma
  // dos servicos. O saldo sempre sai do que vai ser cobrado, nao da lista.
  o.ValorCobrado = _num(o.ValorCobrado) > 0 ? _arred(o.ValorCobrado) : '';
  var cobravel = aCobrar(o);
  o.Pago = _arred(pago);
  o.Saldo = _arred(cobravel - pago);
  if (o.Status === 'Aguardando pagamento' && o.Saldo <= 0) o.Status = 'Finalizado';
  o.Travado = o.Status === 'Finalizado' && o.Saldo <= 0 && cobravel > 0;
  o.Versao = _num(o.Versao) + 1;
  o.AtualizadoEm = new Date().toISOString();
  o.AlteradoPor = u.Email;
  gravar('Orcamentos', o);
  return o;
}

var PROXIMO_OK = {
  'Orcamento': ['Aprovado'],
  'Aprovado': ['Em execucao', 'Orcamento'],
  'Em execucao': ['Pronto p/ entrega', 'Aprovado'],
  'Pronto p/ entrega': ['Finalizado', 'Em execucao'],
  'Aguardando pagamento': ['Finalizado', 'Pronto p/ entrega'],
  'Finalizado': ['Pronto p/ entrega']
};

function mudarStatus(req, u) {
  var o = buscar('Orcamentos', req.id);
  if (!o) throw erro('NAO_ENCONTRADO', 'Orcamento nao encontrado');
  if (o.Status === 'Cancelado') throw erro('CANCELADO', 'Orcamento cancelado nao muda de etapa');
  conferirVersao(o, req.versao);

  var novo = req.status;
  if ((PROXIMO_OK[o.Status] || []).indexOf(novo) < 0) {
    throw erro('ETAPA', 'Nao da para ir de "' + o.Status + '" para "' + novo + '"');
  }
  if (estaTravado(o)) exigirDono(u, 'Este orcamento esta pago e fechado. So o dono pode reabrir.');

  var antes = o.Status;
  // entregar com saldo devedor nao vira "Finalizado"
  if (novo === 'Finalizado' && _num(o.Saldo) > 0) novo = 'Aguardando pagamento';
  o.Status = novo;
  recalcular(o, u);
  registrar(u.Email, 'status', 'Orcamentos', o.ID, antes, o.Status, req.motivo || '');
  return o;
}

function arquivar(req, u) {
  var o = buscar('Orcamentos', req.id);
  if (!o) throw erro('NAO_ENCONTRADO', 'Orcamento nao encontrado');
  var antes = String(o.Arquivado);
  o.Arquivado = req.arquivar === false ? false : true;
  recalcular(o, u);
  registrar(u.Email, 'arquivar', 'Orcamentos', o.ID, antes, String(o.Arquivado), '');
  return o;
}

// Substitui a exclusao. A linha continua na planilha, marcada como cancelada.
function cancelarOrcamento(req, u) {
  var o = buscar('Orcamentos', req.id);
  if (!o) throw erro('NAO_ENCONTRADO', 'Orcamento nao encontrado');
  var motivo = String(req.motivo || '').trim();
  if (!motivo) throw erro('MOTIVO', 'Informe o motivo do cancelamento');
  if (somaPagamentos(o.ID) !== 0) {
    throw erro('PAGO', 'Este orcamento tem pagamento lancado. Estorne os pagamentos antes de cancelar.');
  }
  conferirVersao(o, req.versao);
  var antes = resumo(o);
  o.Status = 'Cancelado';
  o.Arquivado = true;
  o.MotivoCancelamento = motivo;
  recalcular(o, u);
  registrar(u.Email, 'orcamento_cancelado', 'Orcamentos', o.ID, antes, resumo(o), motivo);
  return o;
}

function conferirVersao(o, versao) {
  // Ausente = app antigo, que nao sabe conferir versao: recusa.
  // Vazio = linha criada antes desta versao da planilha, onde Versao ainda nao existia: vale 0.
  if (versao === undefined || versao === null) {
    throw erro('CONFLITO', 'Atualize o aplicativo antes de salvar (versao nao informada)');
  }
  if (_num(versao) !== _num(o.Versao)) {
    throw erro('CONFLITO', 'Alguem alterou este orcamento antes de voce. Recarregue e refaca a alteracao.');
  }
}

function porChaveIdem(idem) {
  var achou = null;
  ler('Orcamentos').forEach(function (o) {
    if (o.ChaveIdem && String(o.ChaveIdem) === String(idem)) achou = o;
  });
  return achou;
}

// Quanto o cliente vai pagar: o valor fechado, se houver; senao a soma dos servicos.
function aCobrar(o) {
  var v = _num(o.ValorCobrado);
  return _arred(v > 0 ? v : _num(o.Total));
}

function estaTravado(o) {
  return String(o.Travado) === 'true' ||
         (o.Status === 'Finalizado' && _num(o.Saldo) <= 0 && aCobrar(o) > 0);
}

function exigirDono(u, msg) {
  if (u.Papel !== 'dono') throw erro('PERMISSAO', msg);
}

/* ===================== pagamentos (so entram, nunca saem) ===================== */

function pagamentosDe(oid) {
  return ler('Pagamentos').filter(function (p) { return String(p.OrcamentoID) === String(oid); });
}

function somaPagamentos(oid) {
  var s = 0;
  pagamentosDe(oid).forEach(function (p) { s += _num(p.Valor); });
  return _arred(s);
}

function registrarPagamento(req, u) {
  var o = buscar('Orcamentos', req.orcamentoId);
  if (!o) throw erro('NAO_ENCONTRADO', 'Orcamento nao encontrado');
  if (o.Status === 'Cancelado') throw erro('CANCELADO', 'Orcamento cancelado nao recebe pagamento');

  var valor = _arred(_num(req.valor));
  if (!(valor > 0)) throw erro('VALOR', 'Informe um valor maior que zero');
  var saldo = _arred(aCobrar(o) - somaPagamentos(o.ID));
  if (saldo <= 0) throw erro('VALOR', 'Este orcamento ja esta totalmente pago');
  if (valor > saldo + 0.005) {
    throw erro('VALOR', 'O valor e maior que o saldo de ' + saldo.toFixed(2).replace('.', ',') +
                        '. Confira se nao sobrou um zero.');
  }

  var p = {
    ID: novoId('P'), OrcamentoID: o.ID, Data: req.data || _ymd(new Date()),
    Valor: valor, Forma: formaValida(req.forma), Obs: String(req.obs || '').slice(0, 200),
    Estorno: false, EstornoDeID: '', LancadoPor: u.Email, LancadoEmMs: Date.now(), Motivo: ''
  };
  gravar('Pagamentos', p);
  recalcular(o, u);
  registrar(u.Email, 'pagamento', 'Pagamentos', p.ID, '', p.Valor + ' ' + p.Forma + ' orc ' + o.ID, '');
  return { pagamento: p, orcamento: o };
}

// Nao existe apagar pagamento: gera um lancamento negativo ligado ao original.
function estornarPagamento(req, u) {
  var p = buscar('Pagamentos', req.id);
  if (!p) throw erro('NAO_ENCONTRADO', 'Pagamento nao encontrado');
  if (String(p.Estorno) === 'true') throw erro('ESTORNO', 'Este lancamento ja e um estorno');
  if (jaEstornado(p.ID)) throw erro('ESTORNO', 'Este pagamento ja foi estornado');

  var o = buscar('Orcamentos', p.OrcamentoID);
  if (!o) throw erro('NAO_ENCONTRADO', 'Orcamento do pagamento nao encontrado');

  var ms = _num(p.LancadoEmMs);
  var naJanela = ms > 0 &&
                 (Date.now() - ms) / 60000 <= JANELA_CORRECAO_MIN &&
                 String(p.LancadoPor).trim().toLowerCase() === u.Email;
  var motivo = String(req.motivo || '').trim();
  if (!naJanela) {
    exigirDono(u, 'Passaram mais de ' + JANELA_CORRECAO_MIN +
                  ' minutos. So o dono pode estornar este pagamento.');
    if (!motivo) throw erro('MOTIVO', 'Informe o motivo do estorno');
  }

  var e = {
    ID: novoId('P'), OrcamentoID: o.ID, Data: _ymd(new Date()),
    Valor: -_num(p.Valor), Forma: p.Forma, Obs: 'estorno de ' + p.ID,
    Estorno: true, EstornoDeID: p.ID, LancadoPor: u.Email, LancadoEmMs: Date.now(),
    Motivo: motivo || 'correcao dentro de ' + JANELA_CORRECAO_MIN + ' min'
  };
  gravar('Pagamentos', e);
  recalcular(o, u);
  registrar(u.Email, 'estorno', 'Pagamentos', p.ID, p.Valor, e.Valor, e.Motivo);
  return { estorno: e, orcamento: o };
}

function jaEstornado(pid) {
  return ler('Pagamentos').some(function (x) { return String(x.EstornoDeID) === String(pid); });
}

function formaValida(f) {
  var ok = ['Pix', 'Dinheiro', 'Cartao', 'Transferencia'];
  return ok.indexOf(String(f)) >= 0 ? String(f) : 'Pix';
}

/* ===================== clientes e servicos ===================== */

function vincularCliente(o) {
  var nome = String(o.ClienteNome || '').trim();
  if (!nome) return;
  var tel = String(o.Telefone || '').replace(/\D/g, '');
  var achou = null;
  ler('Clientes').forEach(function (c) {
    if (achou) return;
    if (o.ClienteID && String(c.ID) === String(o.ClienteID)) achou = c;
    else if (String(c.Nome).trim().toLowerCase() === nome.toLowerCase()) achou = c;
    else if (tel && String(c.Telefone).replace(/\D/g, '') === tel) achou = c;
  });
  if (!achou) {
    achou = { ID: novoId('C'), Nome: nome, Telefone: o.Telefone || '', Obs: '' };
    gravar('Clientes', achou);
  } else if (o.Telefone && String(achou.Telefone) !== String(o.Telefone)) {
    achou.Telefone = o.Telefone;
    gravar('Clientes', achou);
  }
  o.ClienteID = achou.ID;
}

function salvarCliente(req, u) {
  var c = req.cliente || {};
  if (!String(c.Nome || '').trim()) throw erro('DADO', 'Informe o nome do cliente');
  var antes = c.ID ? buscar('Clientes', c.ID) : null;
  var linha = {
    ID: c.ID || novoId('C'), Nome: String(c.Nome).trim().slice(0, 120),
    Telefone: String(c.Telefone || '').slice(0, 30), Obs: String(c.Obs || '').slice(0, 300)
  };
  gravar('Clientes', linha);
  registrar(u.Email, antes ? 'cliente_alterado' : 'cliente_criado', 'Clientes', linha.ID,
            antes ? resumo(antes) : '', resumo(linha), '');
  return linha;
}

function salvarServico(req, u) {
  var s = req.servico || {};
  if (!String(s.Descricao || '').trim()) throw erro('DADO', 'Informe a descricao do servico');
  var antes = s.ID ? buscar('Servicos', s.ID) : null;
  if (antes && _num(antes.ValorPadrao) !== _num(s.ValorPadrao)) {
    exigirDono(u, 'So o dono pode mudar o valor padrao de um servico da lista');
  }
  var linha = {
    ID: s.ID || novoId('S'), Descricao: String(s.Descricao).trim().slice(0, 300),
    Categoria: String(s.Categoria || 'Outros').trim().slice(0, 60),
    ValorPadrao: _arred(_num(s.ValorPadrao)), Ativo: s.Ativo === false ? false : true
  };
  gravar('Servicos', linha);
  registrar(u.Email, antes ? 'servico_alterado' : 'servico_criado', 'Servicos', linha.ID,
            antes ? resumo(antes) : '', resumo(linha), '');
  return linha;
}

// Servico sai da lista mas continua nos orcamentos antigos.
function desativarServico(req, u) {
  var s = buscar('Servicos', req.id);
  if (!s) throw erro('NAO_ENCONTRADO', 'Servico nao encontrado');
  s.Ativo = false;
  gravar('Servicos', s);
  registrar(u.Email, 'servico_desativado', 'Servicos', s.ID, 'ativo', 'inativo', req.motivo || '');
  return s;
}

/* ===================== fotos ===================== */

function enviarFoto(req, u) {
  var base64 = String(req.base64 || '');
  if (!base64) throw erro('DADO', 'Foto vazia');
  if (base64.length * 3 / 4 > MAX_FOTO_MB * 1024 * 1024) {
    throw erro('DADO', 'Foto acima de ' + MAX_FOTO_MB + ' MB');
  }
  var mime = req.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  var ext = mime === 'image/png' ? '.png' : '.jpg';
  var nome = 'orc-' + novoId('F') + ext;   // nome gerado aqui, nunca o que o app mandou

  var arq = pastaFotos().createFile(Utilities.newBlob(Utilities.base64Decode(base64), mime, nome));
  // ATENCAO: link publico. Necessario para a foto abrir no app e no PDF.
  // Veja a nota sobre isso em SETUP.md.
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  registrar(u.Email, 'foto', 'Drive', arq.getId(), '', nome, '');
  return { url: 'https://drive.google.com/thumbnail?id=' + arq.getId() + '&sz=w1000', id: arq.getId() };
}

// Devolve a foto em base64 para o app montar o PDF.
// O navegador nao consegue ler a imagem do Drive direto (o Drive nao manda os
// cabecalhos de CORS), entao quem busca e o servidor, que ja tem a permissao.
function baixarFoto(req, u) {
  var id = String(req.id || '').trim();
  if (!id) {
    var m = String(req.url || '').match(/[?&]id=([\w-]+)/) || String(req.url || '').match(/\/d\/([\w-]+)/);
    id = m ? m[1] : '';
  }
  if (!id) throw erro('DADO', 'Foto sem identificacao');

  var blob;
  try {
    blob = DriveApp.getFileById(id).getBlob();
  } catch (e) {
    throw erro('NAO_ENCONTRADO', 'Foto nao encontrada no Drive');
  }
  var bytes = blob.getBytes();
  if (bytes.length > 6 * 1024 * 1024) throw erro('DADO', 'Foto grande demais para o PDF');

  return {
    id: id,
    mime: blob.getContentType() || 'image/jpeg',
    base64: Utilities.base64Encode(bytes)
  };
}

function pastaFotos() {
  if (PASTA_FOTOS) return DriveApp.getFolderById(PASTA_FOTOS);
  var raiz = pastaPorNome(DriveApp, 'Fotos Orcamentos');
  return pastaPorNome(raiz, String(new Date().getFullYear()));
}

function pastaPorNome(pai, nome) {
  var it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

/* ===================== planilha ===================== */

function pl() { return SpreadsheetApp.getActiveSpreadsheet(); }

function aba(nome) {
  var s = pl().getSheetByName(nome);
  if (!s) throw erro('ABA', 'Aba nao encontrada: ' + nome);
  return s;
}

function ler(nome) {
  var s = aba(nome);
  var v = s.getDataRange().getValues();
  if (v.length < 2) return [];
  var cab = v[0];
  var saida = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === '') continue;
    var o = {};
    for (var j = 0; j < cab.length; j++) {
      if (String(cab[j]).trim() === '') continue;
      var val = v[i][j];
      if (val instanceof Date) val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      o[cab[j]] = val;
    }
    saida.push(o);
  }
  return saida;
}

function lerConfig() {
  var o = {};
  ler('Config').forEach(function (l) { o[l.Chave] = l.Valor; });
  return o;
}

function gravar(nome, obj, colChave) {
  colChave = colChave || 'ID';
  var s = aba(nome);
  var cab = cabecalhoDe(s);
  var iChave = cab.indexOf(colChave);
  if (iChave < 0) throw erro('ABA', 'Aba ' + nome + ' sem coluna ' + colChave);

  var linha = cab.map(function (c) {
    var v = obj[c];
    return v === undefined || v === null ? '' : v;
  });
  var pos = -1;
  if (s.getLastRow() > 1) {
    var chaves = s.getRange(2, iChave + 1, s.getLastRow() - 1, 1).getValues();
    var procurada = String(obj[colChave]).trim().toLowerCase();
    for (var i = 0; i < chaves.length; i++) {
      if (String(chaves[i][0]).trim().toLowerCase() === procurada) { pos = i; break; }
    }
  }
  if (pos >= 0) s.getRange(pos + 2, 1, 1, linha.length).setValues([linha]);
  else s.getRange(s.getLastRow() + 1, 1, 1, linha.length).setValues([linha]);
}

function buscar(nome, id) {
  var achou = null;
  ler(nome).forEach(function (o) {
    var chave = o.ID !== undefined ? o.ID : o.Email;
    if (String(chave) === String(id)) achou = o;
  });
  return achou;
}

function apagarPorFiltro(nome, coluna, valor) {
  var s = aba(nome);
  if (s.getLastRow() < 2) return;
  var v = s.getDataRange().getValues();
  var col = v[0].indexOf(coluna);
  if (col < 0) return;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][col]) === String(valor)) s.deleteRow(i + 1);
  }
}

function proximoNumero() {
  var s = aba('Config');
  var v = s.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] === 'proximo_numero') {
      var n = parseInt(v[i][1], 10) || 1;
      s.getRange(i + 1, 2).setValue(n + 1);
      return n;
    }
  }
  s.appendRow(['proximo_numero', 2]);
  return 1;
}

/* ===================== log ===================== */

function registrar(email, acao, entidade, id, antes, depois, motivo) {
  try {
    aba('Log').appendRow([new Date(), email || '?', acao, entidade, String(id || ''),
                          _texto(antes), _texto(depois), String(motivo || '').slice(0, 300)]);
  } catch (e) { /* o log nunca derruba a operacao */ }
}

function resumo(o) {
  var campos = ['Numero','Status','Total','ValorCobrado','Pago','Saldo','Placa','ClienteNome','Arquivado',
                'Nome','Descricao','ValorPadrao'];
  var p = [];
  campos.forEach(function (c) { if (o[c] !== undefined && o[c] !== '') p.push(c + '=' + o[c]); });
  return p.join(' ');
}

function _texto(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return s.length > 900 ? s.slice(0, 900) + '...' : s;
}

/* ===================== utilitarios ===================== */

function erro(codigo, msg) {
  var e = new Error(msg);
  e.codigo = codigo;
  e.publica = true;
  return e;
}

function novoId(prefixo) {
  return prefixo + Date.now().toString(36).toUpperCase() +
    Math.floor(Math.random() * 1000).toString(36).toUpperCase();
}

function _num(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v === null || v === undefined ? '' : v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function _arred(n) { return Math.round(_num(n) * 100) / 100; }

function _ymd(d) {
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
