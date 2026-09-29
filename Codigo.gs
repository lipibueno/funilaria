/**
 * API de Orcamentos - Funilaria
 * Cole este codigo em Extensoes > Apps Script da planilha "Funilaria - Base".
 * Depois: Implantar > Nova implantacao > App da Web
 *   Executar como: Eu
 *   Quem pode acessar: Qualquer pessoa
 * Copie a URL gerada e cole na tela de ajustes do PWA.
 */

// Pasta do Drive onde as fotos serao gravadas. Deixe vazio que ele cria sozinho.
var PASTA_FOTOS = '';

function doGet(e) {
  return _json({ ok: true, msg: 'API de orcamentos ativa' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var fn = ACOES[req.action];
    if (!fn) return _json({ ok: false, error: 'Acao desconhecida: ' + req.action });
    return _json({ ok: true, data: fn(req) });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.stack || err) });
  }
}

var ACOES = {
  carregar: carregar,
  salvarOrcamento: salvarOrcamento,
  mudarStatus: mudarStatus,
  arquivar: arquivar,
  excluirOrcamento: excluirOrcamento,
  salvarServico: salvarServico,
  excluirServico: excluirServico,
  salvarCliente: salvarCliente,
  enviarFoto: enviarFoto
};

/* ---------- acoes ---------- */

// Devolve tudo que o app precisa para funcionar.
function carregar(req) {
  var incluirArquivados = !!req.incluirArquivados;
  var orcs = ler('Orcamentos').filter(function (o) {
    return incluirArquivados || String(o.Arquivado) !== 'true';
  });
  return {
    config: lerConfig(),
    clientes: ler('Clientes'),
    servicos: ler('Servicos'),
    orcamentos: orcs,
    itens: ler('Itens'),
    pagamentos: ler('Pagamentos')
  };
}

// Grava o orcamento inteiro: cabecalho, itens e pagamentos de uma vez.
function salvarOrcamento(req) {
  var o = req.orcamento;
  var itens = req.itens || [];
  var pagamentos = req.pagamentos || [];

  if (!o.ID) o.ID = novoId('O');
  if (!o.Numero) o.Numero = proximoNumero();

  var total = 0;
  itens.forEach(function (it) {
    it.Subtotal = _num(it.Qtd) * _num(it.Valor);
    total += it.Subtotal;
  });
  var pago = 0;
  pagamentos.forEach(function (p) { pago += _num(p.Valor); });

  o.Total = total;
  o.Pago = pago;
  o.Saldo = total - pago;
  if (o.Status === 'Aguardando pagamento' && o.Saldo <= 0) o.Status = 'Finalizado';
  o.AtualizadoEm = new Date().toISOString();
  if (!o.Status) o.Status = 'Orcamento';
  if (o.Arquivado === undefined) o.Arquivado = false;

  gravar('Orcamentos', o);

  apagarPorFiltro('Itens', 'OrcamentoID', o.ID);
  itens.forEach(function (it, i) {
    it.ID = it.ID || novoId('I');
    it.OrcamentoID = o.ID;
    it.Ordem = i + 1;
    gravar('Itens', it);
  });

  apagarPorFiltro('Pagamentos', 'OrcamentoID', o.ID);
  pagamentos.forEach(function (p) {
    p.ID = p.ID || novoId('P');
    p.OrcamentoID = o.ID;
    gravar('Pagamentos', p);
  });

  return { orcamento: o, itens: itens, pagamentos: pagamentos };
}

// Regra do saldo: com saldo devedor, concluir manda para espera.
function mudarStatus(req) {
  var o = buscar('Orcamentos', req.id);
  if (!o) throw new Error('Orcamento nao encontrado');
  var novo = req.status;
  if (novo === 'Finalizado' && _num(o.Saldo) > 0) novo = 'Aguardando pagamento';
  o.Status = novo;
  o.AtualizadoEm = new Date().toISOString();
  gravar('Orcamentos', o);
  return o;
}

function arquivar(req) {
  var o = buscar('Orcamentos', req.id);
  if (!o) throw new Error('Orcamento nao encontrado');
  o.Arquivado = req.arquivar === false ? false : true;
  gravar('Orcamentos', o);
  return o;
}

function excluirOrcamento(req) {
  apagarPorFiltro('Itens', 'OrcamentoID', req.id);
  apagarPorFiltro('Pagamentos', 'OrcamentoID', req.id);
  apagarPorFiltro('Orcamentos', 'ID', req.id);
  return { id: req.id };
}

function salvarServico(req) {
  var s = req.servico;
  if (!s.ID) s.ID = novoId('S');
  gravar('Servicos', s);
  return s;
}

function excluirServico(req) {
  apagarPorFiltro('Servicos', 'ID', req.id);
  return { id: req.id };
}

function salvarCliente(req) {
  var c = req.cliente;
  if (!c.ID) c.ID = novoId('C');
  gravar('Clientes', c);
  return c;
}

// Recebe a foto em base64 e devolve o link publico do Drive.
function enviarFoto(req) {
  var pasta = pastaFotos();
  var bytes = Utilities.base64Decode(req.base64);
  var blob = Utilities.newBlob(bytes, req.mime || 'image/jpeg', req.nome || ('foto-' + Date.now() + '.jpg'));
  var arq = pasta.createFile(blob);
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: 'https://drive.google.com/thumbnail?id=' + arq.getId() + '&sz=w1000',
    id: arq.getId()
  };
}

/* ---------- planilha ---------- */

function pl() { return SpreadsheetApp.getActiveSpreadsheet(); }

function aba(nome) {
  var s = pl().getSheetByName(nome);
  if (!s) throw new Error('Aba nao encontrada: ' + nome);
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

// Atualiza a linha do ID ou acrescenta uma nova no fim.
function gravar(nome, obj) {
  var s = aba(nome);
  var cab = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  var linha = cab.map(function (c) {
    var v = obj[c];
    return v === undefined || v === null ? '' : v;
  });
  var ids = s.getLastRow() > 1
    ? s.getRange(2, 1, s.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];
  var pos = ids.indexOf(String(obj.ID));
  if (pos >= 0) s.getRange(pos + 2, 1, 1, linha.length).setValues([linha]);
  else s.appendRow(linha);
}

function buscar(nome, id) {
  var achou = null;
  ler(nome).forEach(function (o) { if (String(o.ID) === String(id)) achou = o; });
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
  return 1;
}

function pastaFotos() {
  if (PASTA_FOTOS) return DriveApp.getFolderById(PASTA_FOTOS);
  var nome = 'Fotos Orcamentos';
  var it = DriveApp.getFoldersByName(nome);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nome);
}

/* ---------- utilitarios ---------- */

function novoId(prefixo) {
  return prefixo + Date.now().toString(36).toUpperCase() +
    Math.floor(Math.random() * 1000).toString(36).toUpperCase();
}

function _num(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
