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

var CLIENT_ID = '';              // <<< cole aqui o ID do cliente OAuth
var JANELA_CORRECAO_MIN = 15;    // minutos para corrigir o proprio lancamento sem ser dono
var MESES_PADRAO = 12;           // quanto historico o app baixa por padrao
var MAX_FOTO_MB = 5;
var PASTA_FOTOS = '';            // ID de uma pasta do Drive; vazio = cria sozinho

/* ===================== estrutura da planilha ===================== */

var ESTRUTURA_V = '5';
var ESTRUTURA = {
  Config:     ['Chave','Valor'],
  Usuarios:   ['Email','Nome','Papel','Ativo'],
  Clientes:   ['ID','Nome','Telefone','Obs'],
  Servicos:   ['ID','Descricao','Categoria','ValorPadrao','Ativo'],
  Orcamentos: ['ID','Numero','Data','ClienteID','ClienteNome','Telefone','Placa','Modelo','Ano','Cor',
               'Status','Total','Pago','Saldo','Arquivado','Obs','AtualizadoEm','Versao','Travado',
               'CriadoPor','AlteradoPor','MotivoCancelamento','ChaveIdem'],
  Itens:      ['ID','OrcamentoID','Ordem','Descricao','Qtd','Valor','Subtotal','FotoURL'],
  Pagamentos: ['ID','OrcamentoID','Data','Valor','Forma','Obs','Estorno','EstornoDeID',
               'LancadoPor','LancadoEmMs','Motivo'],
  Log:        ['Quando','Email','Acao','Entidade','EntidadeID','Antes','Depois','Motivo']
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

/* ===================== entrada ===================== */

function doGet() {
  return _json({ ok: true, msg: 'API de orcamentos ativa', versao: ESTRUTURA_V });
}

function doPost(e) {
  var req = {}, usuario = null;
  try {
    req = JSON.parse(e.postData.contents);
    garantirEstrutura();

    var acao = ACOES[req.action];
    if (!acao) throw erro('ACAO', 'Acao desconhecida: ' + req.action);

    usuario = autenticar(req.token);
    if (acao.papeis.indexOf(usuario.Papel) < 0) {
      throw erro('PERMISSAO', 'Seu acesso e de ' + usuario.Papel + ' e nao permite esta acao');
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
  enviarFoto:         { fn: enviarFoto,         papeis: ['dono', 'funcionario'], escreve: false }
};

/* ===================== login ===================== */

// Confere o token do Google Sign-In e devolve a linha da aba Usuarios.
function autenticar(token) {
  if (!token) throw erro('NAO_AUTORIZADO', 'Entre com sua conta Google para continuar');
  var email = emailDoToken(token);
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

  var r = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true });
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
  var dono = '';
  try { dono = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  if (!dono || dono !== email) return null;
  var u = { Email: email, Nome: 'Dono', Papel: 'dono', Ativo: true };
  gravar('Usuarios', u, 'Email');
  registrar(email, 'primeiro_acesso', 'Usuarios', email, '', 'dono', 'cadastro automatico do dono da planilha');
  return u;
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
      MotivoCancelamento: antes.MotivoCancelamento, ChaveIdem: antes.ChaveIdem
    };
  }

  ['Data','ClienteID','ClienteNome','Telefone','Placa','Modelo','Ano','Cor','Obs'].forEach(function (c) {
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
  o.Pago = _arred(pago);
  o.Saldo = _arred(total - pago);
  if (o.Status === 'Aguardando pagamento' && o.Saldo <= 0) o.Status = 'Finalizado';
  o.Travado = o.Status === 'Finalizado' && o.Saldo <= 0 && o.Total > 0;
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

function estaTravado(o) {
  return String(o.Travado) === 'true' ||
         (o.Status === 'Finalizado' && _num(o.Saldo) <= 0 && _num(o.Total) > 0);
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
  var saldo = _arred(_num(o.Total) - somaPagamentos(o.ID));
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
  var campos = ['Numero','Status','Total','Pago','Saldo','Placa','ClienteNome','Arquivado',
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
