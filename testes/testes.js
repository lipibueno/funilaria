const fs = require('fs'), vm = require('vm');
const { montarAmbiente } = require('./fakegas');

const CODIGO = fs.readFileSync('C:/Users/lipib/Downloads/cris/Codigo.gs', 'utf8');

let ok = 0, falhou = 0;
function t(nome, fn){
  try { fn(); console.log('  ok   ', nome); ok++; }
  catch (e) { console.log('  FALHA', nome, '->', e.message); falhou++; }
}
function igual(a, b, msg){
  if (String(a) !== String(b)) throw new Error((msg || '') + ' esperado ' + b + ', veio ' + a);
}
function recusa(fn, codigo){
  const r = fn();
  if (r.ok) throw new Error('deveria ter recusado, mas passou');
  if (codigo && r.codigo !== codigo) throw new Error('codigo ' + r.codigo + ' (' + r.error + '), esperado ' + codigo);
  return r;
}

function novoApp(){
  const g = montarAmbiente();
  vm.createContext(g);
  vm.runInContext(CODIGO, g);
  g.CLIENT_ID = 'CID';
  // tokens fictícios: chave = token, valor = resposta do tokeninfo
  const tok = (email) => {
    // id_token do Google e um JWT: tres partes separadas por ponto.
    // O app distingue por isso, entao o token de teste tem que ter a mesma forma.
    const t = 'cab.' + Buffer.from(email).toString('base64url') + '.assin';
    g.__tokens[t] = { aud: 'CID', iss: 'https://accounts.google.com', email,
                      email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 3600 };
    return t;
  };
  const post = (corpo) => JSON.parse(
    g.doPost({ postData: { contents: JSON.stringify(corpo) } }).txt);
  const chamar = (action, email, corpo) =>
    post(Object.assign({ action, token: email ? tok(email) : undefined }, corpo || {}));
  const aba = n => g.__ss.getSheetByName(n);
  return { g, chamar, aba, tok, post };
}

// Sobe o app já com dono e um funcionário cadastrados.
function appPronto(){
  const a = novoApp();
  a.chamar('carregar', 'dono@oficina.com');                   // semeia o dono
  const r = a.chamar('salvarUsuario', 'dono@oficina.com',
    { email: 'func@oficina.com', nome: 'Zé', papel: 'funcionario' });
  if (!r.ok) throw new Error('nao consegui cadastrar funcionario: ' + r.error);
  return a;
}

function criarOrc(a, quem, itens){
  const r = a.chamar('salvarOrcamento', quem, {
    orcamento: { ClienteNome: 'Maria', Telefone: '69999990000', Placa: 'abc1d23', Modelo: 'Gol' },
    itens: itens || [{ Descricao: 'Porta motorista', Qtd: 1, Valor: 380 }]
  });
  if (!r.ok) throw new Error('nao criou orcamento: ' + r.error);
  return r.data.orcamento;
}

console.log('\n--- estrutura e login ---');
t('cria todas as abas que faltavam', () => {
  const a = novoApp();
  a.chamar('carregar', 'dono@oficina.com');
  ['Config','Usuarios','Clientes','Servicos','Orcamentos','Itens','Pagamentos','Log']
    .forEach(n => { if (!a.aba(n)) throw new Error('falta a aba ' + n); });
});

t('sem token nao entra', () => {
  const a = novoApp();
  recusa(() => a.post({ action: 'carregar' }), 'NAO_AUTORIZADO');
});

t('token de outro aplicativo nao entra', () => {
  const a = novoApp();
  a.g.__tokens['falso'] = { aud: 'OUTRO', iss: 'https://accounts.google.com',
    email: 'x@y.com', email_verified: 'true', exp: Math.floor(Date.now()/1000)+3600 };
  recusa(() => a.post({ action: 'carregar', token: 'falso' }), 'NAO_AUTORIZADO');
});

t('token expirado nao entra', () => {
  const a = novoApp();
  a.g.__tokens['velho'] = { aud: 'CID', iss: 'https://accounts.google.com',
    email: 'dono@oficina.com', email_verified: 'true', exp: Math.floor(Date.now()/1000)-10 };
  recusa(() => a.post({ action: 'carregar', token: 'velho' }), 'NAO_AUTORIZADO');
});

t('script sem permissao de chamada externa avisa o que fazer', () => {
  const a = novoApp();
  a.g.UrlFetchApp.fetch = () => {
    throw new Error('Voce nao tem permissao para chamar UrlFetchApp.fetch. ' +
                    'Permissoes necessarias: https://www.googleapis.com/auth/script.external_request');
  };
  const r = recusa(() => a.chamar('carregar', 'dono@oficina.com'), 'CONFIG');
  if (!/autorizar/.test(r.error)) throw new Error('a mensagem devia dizer para rodar "autorizar": ' + r.error);
  if (!/nova versao/i.test(r.error)) throw new Error('a mensagem devia mandar publicar de novo: ' + r.error);
});

t('outra falha da chamada externa nao vira mensagem de permissao', () => {
  const a = novoApp();
  a.g.UrlFetchApp.fetch = () => { throw new Error('DNS timeout'); };
  const r = recusa(() => a.chamar('carregar', 'dono@oficina.com'));
  if (r.codigo === 'CONFIG') throw new Error('confundiu falha de rede com falta de permissao');
});

t('e-mail estranho nao entra nem no primeiro acesso', () => {
  const a = novoApp();
  recusa(() => a.chamar('carregar', 'invasor@gmail.com'), 'NAO_AUTORIZADO');
});

t('dono e identificado pelo Drive quando Session falha', () => {
  const a = novoApp();
  // reproduz a conta em que Session.getEffectiveUser() nao funciona
  a.g.Session.getEffectiveUser = () => { throw new Error('sem permissao'); };
  const r = a.chamar('carregar', 'dono@oficina.com');
  if (!r.ok) throw new Error(r.error);
  igual(r.data.usuario.papel, 'dono');
});

t('sem Drive e sem Session, ninguem vira dono sozinho', () => {
  const a = novoApp();
  a.g.Session.getEffectiveUser = () => { throw new Error('sem permissao'); };
  a.g.__driveDono = null;
  recusa(() => a.chamar('carregar', 'dono@oficina.com'), 'NAO_AUTORIZADO');
});

t('autorizar cadastra o dono na aba Usuarios', () => {
  const a = novoApp();
  a.g.Session.getEffectiveUser = () => { throw new Error('sem permissao'); };
  const saida = a.g.autorizar();
  if (!/Cadastrei dono@oficina\.com como dono/.test(saida)) {
    throw new Error('devia ter cadastrado o dono: ' + saida);
  }
  const us = a.g.ler('Usuarios');
  igual(us.length, 1);
  igual(us[0].Email, 'dono@oficina.com');
  igual(us[0].Papel, 'dono');
  // e o login seguinte entra direto
  const r = a.chamar('carregar', 'dono@oficina.com');
  if (!r.ok) throw new Error(r.error);
  igual(r.data.usuario.papel, 'dono');
});

t('autorizar rodado duas vezes nao duplica nem rebaixa ninguem', () => {
  const a = appPronto();
  const saida = a.g.autorizar();
  if (!/ja tem 2 pessoa/.test(saida)) throw new Error('devia dizer que ja havia gente: ' + saida);
  igual(a.g.ler('Usuarios').length, 2);
});

t('autorizar avisa quando nao descobre o dono', () => {
  const a = novoApp();
  a.g.Session.getEffectiveUser = () => { throw new Error('sem permissao'); };
  a.g.__driveDono = null;
  const saida = a.g.autorizar();
  if (!/NAO IDENTIFICADA/.test(saida)) throw new Error('devia avisar: ' + saida);
  if (!/preencha a mao/.test(saida)) throw new Error('devia ensinar o caminho manual: ' + saida);
  igual(a.g.ler('Usuarios').length, 0);
});

t('primeiro acesso do dono da planilha vira dono', () => {
  const a = novoApp();
  const r = a.chamar('carregar', 'dono@oficina.com');
  igual(r.data.usuario.papel, 'dono');
});

t('depois de semeado, desconhecido continua fora', () => {
  const a = appPronto();
  recusa(() => a.chamar('carregar', 'invasor@gmail.com'), 'NAO_AUTORIZADO');
});

t('acesso desativado nao entra', () => {
  const a = appPronto();
  a.chamar('salvarUsuario', 'dono@oficina.com', { email: 'func@oficina.com', ativo: false });
  recusa(() => a.chamar('carregar', 'func@oficina.com'), 'NAO_AUTORIZADO');
});

t('funcionario nao mexe em usuarios', () => {
  const a = appPronto();
  recusa(() => a.chamar('salvarUsuario', 'func@oficina.com',
    { email: 'amigo@x.com', papel: 'dono' }), 'PERMISSAO');
});

t('dono nao consegue tirar o proprio acesso', () => {
  const a = appPronto();
  recusa(() => a.chamar('salvarUsuario', 'dono@oficina.com',
    { email: 'dono@oficina.com', papel: 'funcionario' }), 'PERMISSAO');
});

console.log('\n--- entrar com codigo por e-mail ---');

// Le o codigo do e-mail que o simulador "enviou".
function codigoDoEmail(a){
  const ultimo = a.g.__emails[a.g.__emails.length - 1];
  if (!ultimo) return null;
  const m = String(ultimo.subject).match(/(\d{6})/);
  return m ? m[1] : null;
}

t('pedir codigo manda e-mail para quem tem acesso', () => {
  const a = appPronto();
  const r = a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  if (!r.ok) throw new Error(r.error);
  igual(a.g.__emails.length, 1);
  igual(a.g.__emails[0].to, 'func@oficina.com');
  if (!/^\d{6} e o seu codigo/.test(a.g.__emails[0].subject)) {
    throw new Error('assunto devia comecar com o codigo: ' + a.g.__emails[0].subject);
  }
});

t('e-mail sem acesso nao recebe nada, e a resposta e a mesma', () => {
  const a = appPronto();
  const bom = a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const mau = a.post({ action: 'pedirCodigo', email: 'ninguem@fora.com' });
  igual(JSON.stringify(mau.data), JSON.stringify(bom.data), 'as respostas tem que ser iguais:');
  igual(a.g.__emails.length, 1, 'so o cadastrado recebeu:');
});

t('codigo certo entra e devolve sessao', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const r = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) });
  if (!r.ok) throw new Error(r.error);
  if (!r.data.token || r.data.token.length < 40) throw new Error('token fraco ou ausente');
  igual(r.data.usuario.email, 'func@oficina.com');
  igual(r.data.usuario.papel, 'funcionario');
});

t('a sessao serve para usar o app', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  const r = a.post({ action: 'carregar', token: tk });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.usuario.email, 'func@oficina.com');
});

t('o token guardado na planilha e o hash, nao o token', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  const linhas = a.g.ler('Sessoes');
  igual(linhas.length, 1);
  if (String(linhas[0].TokenHash) === tk) throw new Error('o token foi guardado em texto puro!');
  if (String(linhas[0].TokenHash).indexOf(tk) >= 0) throw new Error('o token aparece dentro do hash!');
});

t('codigo errado nao entra e vai consumindo tentativas', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const r = recusa(() => a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: '000000' }), 'CODIGO');
  if (!/tentativa/.test(r.error)) throw new Error('devia dizer quantas faltam: ' + r.error);
});

t('codigo bloqueia depois de 5 erros', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const certo = codigoDoEmail(a);
  for (let i = 0; i < 5; i++) {
    a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: '000000' });
  }
  // agora nem o codigo certo passa
  recusa(() => a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: certo }), 'CODIGO');
});

t('codigo serve uma vez so', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const c = codigoDoEmail(a);
  const r1 = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: c });
  if (!r1.ok) throw new Error(r1.error);
  recusa(() => a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: c }), 'CODIGO');
});

t('codigo de um e-mail nao serve para outro', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const c = codigoDoEmail(a);
  recusa(() => a.post({ action: 'entrarComCodigo', email: 'dono@oficina.com', codigo: c }), 'CODIGO');
});

t('codigo expirado nao entra', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const c = codigoDoEmail(a);
  // envelhece o codigo guardado
  for (const k in a.g.__cache){
    if (k.indexOf('cod_') === 0){
      const d = JSON.parse(a.g.__cache[k]); d.exp = Date.now() - 1000;
      a.g.__cache[k] = JSON.stringify(d);
    }
  }
  recusa(() => a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: c }), 'CODIGO');
});

t('token inventado nao entra', () => {
  const a = appPronto();
  recusa(() => a.post({ action: 'carregar', token: 'a'.repeat(64) }), 'NAO_AUTORIZADO');
});

t('sessao expirada e recusada e sai da planilha', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  const s = a.aba('Sessoes');
  const cab = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  s.getRange(2, cab.indexOf('ExpiraEmMs') + 1).setValue(Date.now() - 1000);
  recusa(() => a.post({ action: 'carregar', token: tk }), 'NAO_AUTORIZADO');
  igual(a.g.ler('Sessoes').length, 0, 'a linha vencida devia ter sido removida:');
});

t('sair derruba a sessao daquele aparelho', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  const r = a.post({ action: 'sair', token: tk });
  if (!r.ok) throw new Error(r.error);
  recusa(() => a.post({ action: 'carregar', token: tk }), 'NAO_AUTORIZADO');
});

t('acesso desativado derruba a sessao existente', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  a.chamar('salvarUsuario', 'dono@oficina.com', { email: 'func@oficina.com', ativo: false });
  recusa(() => a.post({ action: 'carregar', token: tk }), 'NAO_AUTORIZADO');
});

t('dono encerra as sessoes de alguem', () => {
  const a = appPronto();
  a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const tk = a.post({ action: 'entrarComCodigo', email: 'func@oficina.com', codigo: codigoDoEmail(a) }).data.token;
  const r = a.chamar('encerrarSessoes', 'dono@oficina.com', { email: 'func@oficina.com', motivo: 'celular perdido' });
  igual(r.data.encerradas, 1);
  recusa(() => a.post({ action: 'carregar', token: tk }), 'NAO_AUTORIZADO');
});

t('funcionario nao encerra sessao dos outros', () => {
  const a = appPronto();
  recusa(() => a.chamar('encerrarSessoes', 'func@oficina.com', { email: 'dono@oficina.com' }), 'PERMISSAO');
});

t('limite de pedidos por e-mail segura o abuso', () => {
  const a = appPronto();
  for (let i = 0; i < 5; i++) a.post({ action: 'pedirCodigo', email: 'func@oficina.com' });
  const r = recusa(() => a.post({ action: 'pedirCodigo', email: 'func@oficina.com' }), 'MUITAS');
  igual(a.g.__emails.length, 5, 'nao podia ter mandado o sexto:');
});

t('o login do Google continua funcionando junto', () => {
  const a = appPronto();
  const r = a.chamar('carregar', 'dono@oficina.com');
  if (!r.ok) throw new Error(r.error);
  igual(r.data.usuario.papel, 'dono');
});

console.log('\n--- orcamento e concorrencia ---');
t('cria com numero, total e placa em maiuscula', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  igual(o.Numero, 1); igual(o.Total, 380); igual(o.Saldo, 380); igual(o.Placa, 'ABC1D23');
});

t('numeros nao se repetem', () => {
  const a = appPronto();
  const n = [criarOrc(a, 'func@oficina.com').Numero, criarOrc(a, 'func@oficina.com').Numero,
             criarOrc(a, 'func@oficina.com').Numero];
  if (new Set(n).size !== 3) throw new Error('numeros repetidos: ' + n.join(','));
});

t('total vem dos itens, nao do que o app mandou', () => {
  const a = appPronto();
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ClienteNome: 'Maria', Placa: 'AAA1A11', Total: 999999, Pago: 999999, Saldo: 0 },
    itens: [{ Descricao: 'x', Qtd: 2, Valor: 100 }]
  });
  igual(r.data.orcamento.Total, 200); igual(r.data.orcamento.Pago, 0); igual(r.data.orcamento.Saldo, 200);
});

t('app nao consegue forjar o status pelo salvar', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, Status: 'Finalizado', ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 380 }]
  });
  igual(r.data.orcamento.Status, 'Orcamento');
});

t('salvar sem versao e recusado', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  recusa(() => a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 10 }]
  }), 'CONFLITO');
});

t('dois aparelhos editando: o segundo e barrado', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const copiaA = Object.assign({}, o), copiaB = Object.assign({}, o);
  const r1 = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: Object.assign({}, copiaA, { Obs: 'do aparelho A' }),
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 380 }] });
  if (!r1.ok) throw new Error('o primeiro deveria passar: ' + r1.error);
  recusa(() => a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: Object.assign({}, copiaB, { Obs: 'do aparelho B' }),
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 380 }] }), 'CONFLITO');
});

t('etapa invalida e recusada', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  recusa(() => a.chamar('mudarStatus', 'func@oficina.com',
    { id: o.ID, status: 'Finalizado', versao: o.Versao }), 'ETAPA');
});

console.log('\n--- fila offline: reenvio nao duplica ---');
t('mesma chaveIdem reenviada nao cria segundo orcamento', () => {
  const a = appPronto();
  const corpo = {
    orcamento: { ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'Porta motorista', Qtd: 1, Valor: 380 }],
    chaveIdem: 'K-TESTE-1'
  };
  const r1 = a.chamar('salvarOrcamento', 'func@oficina.com', corpo);
  if (!r1.ok) throw new Error(r1.error);
  const r2 = a.chamar('salvarOrcamento', 'func@oficina.com', corpo);   // reenvio
  if (!r2.ok) throw new Error(r2.error);
  igual(r2.data.repetido, 'true', 'devia vir marcado como repetido:');
  igual(r2.data.orcamento.ID, r1.data.orcamento.ID, 'mesmo orcamento:');
  const todos = a.chamar('carregar', 'dono@oficina.com').data.orcamentos;
  igual(todos.length, 1, 'quantidade de orcamentos na planilha:');
  igual(todos[0].Numero, 1, 'nao consumiu outro numero:');
});

t('reenvio depois de a pessoa ja ter editado nao desfaz a edicao', () => {
  const a = appPronto();
  const corpo = { orcamento: { ClienteNome: 'Maria', Placa: 'ABC1D23' },
                  itens: [{ Descricao: 'x', Qtd: 1, Valor: 380 }], chaveIdem: 'K-TESTE-2' };
  const o = a.chamar('salvarOrcamento', 'func@oficina.com', corpo).data.orcamento;
  // editou depois de criado
  const dep = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', Obs: 'combinado' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 500 }] }).data.orcamento;
  igual(dep.Total, 500);
  // a fila tenta de novo o envio original
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', corpo);
  igual(r.data.repetido, 'true');
  igual(r.data.orcamento.Total, 500, 'o valor editado tinha que continuar:');
  igual(r.data.orcamento.Obs, 'combinado');
});

t('chaves diferentes criam orcamentos diferentes', () => {
  const a = appPronto();
  const base = { orcamento: { ClienteNome: 'Maria', Placa: 'ABC1D23' },
                 itens: [{ Descricao: 'x', Qtd: 1, Valor: 10 }] };
  a.chamar('salvarOrcamento', 'func@oficina.com', Object.assign({}, base, { chaveIdem: 'K-A' }));
  a.chamar('salvarOrcamento', 'func@oficina.com', Object.assign({}, base, { chaveIdem: 'K-B' }));
  igual(a.chamar('carregar', 'dono@oficina.com').data.orcamentos.length, 2);
});

t('salvar sem chaveIdem continua funcionando', () => {
  const a = appPronto();
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 10 }] });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.repetido, 'undefined');
});

console.log('\n--- pagamentos ---');
function ateProntoEntrega(a, quem){
  let o = criarOrc(a, quem);
  ['Aprovado','Em execucao','Pronto p/ entrega'].forEach(s=>{
    const r = a.chamar('mudarStatus', quem, { id: o.ID, status: s, versao: o.Versao });
    if (!r.ok) throw new Error('nao avancou para ' + s + ': ' + r.error);
    o = r.data;
  });
  return o;
}

t('pagamento acima do saldo e recusado (erro de zero)', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  recusa(() => a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 3800, forma: 'Pix' }), 'VALOR');
});

t('pagamento parcial acerta o saldo', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const r = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 200, forma: 'Pix' });
  igual(r.data.orcamento.Pago, 200); igual(r.data.orcamento.Saldo, 180);
});

t('entregar com saldo vira "Aguardando pagamento"', () => {
  const a = appPronto();
  let o = ateProntoEntrega(a, 'func@oficina.com');
  const r = a.chamar('mudarStatus', 'func@oficina.com',
    { id: o.ID, status: 'Finalizado', versao: o.Versao });
  igual(r.data.Status, 'Aguardando pagamento');
});

t('quitar quem estava aguardando finaliza sozinho', () => {
  const a = appPronto();
  let o = ateProntoEntrega(a, 'func@oficina.com');
  o = a.chamar('mudarStatus', 'func@oficina.com',
    { id: o.ID, status: 'Finalizado', versao: o.Versao }).data;
  const r = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 380, forma: 'Dinheiro' });
  igual(r.data.orcamento.Status, 'Finalizado');
  igual(r.data.orcamento.Travado, 'true');
});

t('BUG ANTIGO: salvar o orcamento nao apaga mais pagamento de outro aparelho', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const visaoAntiga = Object.assign({}, o);               // aparelho A abriu aqui
  const pg = a.chamar('registrarPagamento', 'dono@oficina.com',
    { orcamentoId: o.ID, valor: 200, forma: 'Pix' });     // aparelho B recebeu
  igual(pg.data.orcamento.Pago, 200);
  // aparelho A salva uma correcao de texto com a visao velha
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: Object.assign({}, visaoAntiga, { Obs: 'correcao' }),
    itens: [{ Descricao: 'Porta motorista', Qtd: 1, Valor: 380 }] });
  // ou e barrado por conflito, ou passa preservando o pagamento. Nunca some dinheiro.
  const naPlanilha = a.chamar('carregar', 'dono@oficina.com').data;
  const soma = naPlanilha.pagamentos.filter(p => p.OrcamentoID === o.ID)
    .reduce((s, p) => s + Number(p.Valor), 0);
  igual(soma, 200, 'o pagamento tinha que continuar la:');
  if (r.ok) igual(r.data.orcamento.Pago, 200, 'total pago apos salvar:');
});

console.log('\n--- valor cobrado (preco fechado com o cliente) ---');
t('sem valor cobrado, cobra a soma dos servicos', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  igual(o.Total, 1200); igual(o.Saldo, 1200); igual(o.ValorCobrado, '');
});

t('valor cobrado manda no saldo, e os servicos continuam registrados', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.orcamento.Total, 1200, 'a soma dos servicos nao muda:');
  igual(r.data.orcamento.ValorCobrado, 1000);
  igual(r.data.orcamento.Saldo, 1000, 'o saldo sai do valor cobrado:');
});

t('pagar o valor cobrado quita, mesmo sendo menor que os servicos', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  o = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] }).data.orcamento;
  const r = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 1000, forma: 'Pix' });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.orcamento.Saldo, 0); igual(r.data.orcamento.Pago, 1000);
});

t('nao aceita pagamento acima do valor cobrado', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  o = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] }).data.orcamento;
  // 1200 era o total dos servicos, mas o combinado foi 1000
  recusa(() => a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 1200, forma: 'Pix' }), 'VALOR');
});

t('tirar o valor cobrado volta a cobrar a soma dos servicos', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  o = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] }).data.orcamento;
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: '' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] });
  igual(r.data.orcamento.Saldo, 1200);
});

t('valor cobrado sobrevive a um salvar que nao o envia', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  o = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] }).data.orcamento;
  const r = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', Obs: 'sem mandar o campo' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] });
  igual(r.data.orcamento.ValorCobrado, 1000, 'nao podia ter sumido:');
  igual(r.data.orcamento.Saldo, 1000);
});

t('quitado pelo valor cobrado fecha o orcamento', () => {
  const a = appPronto();
  let o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'x', Qtd: 1, Valor: 1200 }]);
  o = a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23', ValorCobrado: 1000 },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 1200 }] }).data.orcamento;
  ['Aprovado','Em execucao','Pronto p/ entrega'].forEach(s=>{
    o = a.chamar('mudarStatus', 'func@oficina.com', { id: o.ID, status: s, versao: o.Versao }).data;
  });
  o = a.chamar('mudarStatus', 'func@oficina.com', { id: o.ID, status: 'Finalizado', versao: o.Versao }).data;
  igual(o.Status, 'Aguardando pagamento');
  const r = a.chamar('registrarPagamento', 'func@oficina.com', { orcamentoId: o.ID, valor: 1000, forma: 'Pix' });
  igual(r.data.orcamento.Status, 'Finalizado');
  igual(r.data.orcamento.Travado, 'true');
});

console.log('\n--- arquivar orcamento que o cliente nao fechou ---');
t('da para arquivar ainda em "Orcamento"', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  igual(o.Status, 'Orcamento');
  const r = a.chamar('arquivar', 'func@oficina.com', { id: o.ID, arquivar: true });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.Arquivado, 'true');
  const ativos = a.chamar('carregar', 'dono@oficina.com').data.orcamentos;
  if (ativos.some(x => String(x.ID) === String(o.ID))) throw new Error('devia ter saido do painel');
});

t('arquivado continua na planilha e da para desarquivar', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  a.chamar('arquivar', 'func@oficina.com', { id: o.ID, arquivar: true });
  const todos = a.chamar('carregar', 'dono@oficina.com', { incluirArquivados: true }).data.orcamentos;
  if (!todos.some(x => String(x.ID) === String(o.ID))) throw new Error('sumiu da planilha');
  const r = a.chamar('arquivar', 'func@oficina.com', { id: o.ID, arquivar: false });
  igual(r.data.Arquivado, 'false');
});

console.log('\n--- travado depois de pago ---');
function orcQuitado(a){
  let o = ateProntoEntrega(a, 'func@oficina.com');
  a.chamar('registrarPagamento', 'func@oficina.com', { orcamentoId: o.ID, valor: 380, forma: 'Pix' });
  o = a.chamar('mudarStatus', 'func@oficina.com',
    { id: o.ID, status: 'Finalizado', versao: a.chamar('carregar','dono@oficina.com').data
        .orcamentos.find(x=>x.ID===o.ID).Versao });
  return a.chamar('carregar', 'dono@oficina.com').data.orcamentos.find(x => x.ID === o.data.ID || x.ID === o.ID);
}

t('funcionario nao altera orcamento pago e fechado', () => {
  const a = appPronto();
  const o = orcQuitado(a);
  igual(o.Travado, 'true');
  recusa(() => a.chamar('salvarOrcamento', 'func@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'inventado', Qtd: 1, Valor: 5000 }] }), 'PERMISSAO');
});

t('dono tambem precisa dar motivo para alterar orcamento pago', () => {
  const a = appPronto();
  const o = orcQuitado(a);
  recusa(() => a.chamar('salvarOrcamento', 'dono@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 400 }] }), 'MOTIVO');
});

t('dono com motivo altera, e fica registrado no Log', () => {
  const a = appPronto();
  const o = orcQuitado(a);
  const r = a.chamar('salvarOrcamento', 'dono@oficina.com', {
    orcamento: { ID: o.ID, Versao: o.Versao, ClienteNome: 'Maria', Placa: 'ABC1D23' },
    itens: [{ Descricao: 'x', Qtd: 1, Valor: 400 }], motivo: 'cliente pediu peca extra' });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.orcamento.Total, 400);
  const log = a.chamar('listarLog', 'dono@oficina.com').data;
  if (!log.some(l => String(l.Motivo).includes('peca extra')))
    throw new Error('o motivo nao foi para o Log');
});

t('funcionario nao reabre orcamento fechado', () => {
  const a = appPronto();
  const o = orcQuitado(a);
  recusa(() => a.chamar('mudarStatus', 'func@oficina.com',
    { id: o.ID, status: 'Pronto p/ entrega', versao: o.Versao }), 'PERMISSAO');
});

console.log('\n--- estorno ---');
t('estorno devolve o saldo e some -valor na planilha', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const pg = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 200, forma: 'Pix' }).data.pagamento;
  const r = a.chamar('estornarPagamento', 'func@oficina.com', { id: pg.ID });
  if (!r.ok) throw new Error(r.error);
  igual(r.data.orcamento.Pago, 0); igual(r.data.orcamento.Saldo, 380);
  igual(r.data.estorno.Valor, -200);
  const pags = a.chamar('carregar', 'dono@oficina.com').data.pagamentos
    .filter(p => p.OrcamentoID === o.ID);
  igual(pags.length, 2, 'o lancamento original tem que continuar la:');
});

t('nao da para estornar duas vezes', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const pg = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 100, forma: 'Pix' }).data.pagamento;
  a.chamar('estornarPagamento', 'func@oficina.com', { id: pg.ID });
  recusa(() => a.chamar('estornarPagamento', 'dono@oficina.com',
    { id: pg.ID, motivo: 'de novo' }), 'ESTORNO');
});

t('funcionario nao estorna lancamento de outra pessoa', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const pg = a.chamar('registrarPagamento', 'dono@oficina.com',
    { orcamentoId: o.ID, valor: 100, forma: 'Pix' }).data.pagamento;
  recusa(() => a.chamar('estornarPagamento', 'func@oficina.com', { id: pg.ID }), 'PERMISSAO');
});

t('funcionario nao estorna passada a janela de 15 min', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const pg = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 100, forma: 'Pix' }).data.pagamento;
  // envelhece o lancamento na planilha
  const f = a.aba('Pagamentos');
  const cab = f.getRange(1, 1, 1, f.getLastColumn()).getValues()[0];
  const col = cab.indexOf('LancadoEmMs') + 1;
  for (let i = 2; i <= f.getLastRow(); i++){
    if (f.getRange(i, 1).getValues()[0][0] === pg.ID) f.getRange(i, col).setValue(Date.now() - 20*60*1000);
  }
  recusa(() => a.chamar('estornarPagamento', 'func@oficina.com', { id: pg.ID }), 'PERMISSAO');
});

t('dono estorna depois da janela, mas so com motivo', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const pg = a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 100, forma: 'Pix' }).data.pagamento;
  recusa(() => a.chamar('estornarPagamento', 'dono@oficina.com', { id: pg.ID }), 'MOTIVO');
  const r = a.chamar('estornarPagamento', 'dono@oficina.com',
    { id: pg.ID, motivo: 'pix caiu duplicado' });
  if (!r.ok) throw new Error(r.error);
});

console.log('\n--- cancelar em vez de excluir ---');
t('funcionario nao cancela', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  recusa(() => a.chamar('cancelarOrcamento', 'func@oficina.com',
    { id: o.ID, motivo: 'x', versao: o.Versao }), 'PERMISSAO');
});

t('cancelar sem motivo e recusado', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  recusa(() => a.chamar('cancelarOrcamento', 'dono@oficina.com',
    { id: o.ID, versao: o.Versao }), 'MOTIVO');
});

t('nao cancela orcamento com pagamento lancado', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  a.chamar('registrarPagamento', 'func@oficina.com', { orcamentoId: o.ID, valor: 50, forma: 'Pix' });
  const atual = a.chamar('carregar','dono@oficina.com').data.orcamentos.find(x=>x.ID===o.ID);
  recusa(() => a.chamar('cancelarOrcamento', 'dono@oficina.com',
    { id: o.ID, motivo: 'desistiu', versao: atual.Versao }), 'PAGO');
});

t('cancelar guarda a linha na planilha, nao apaga', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  const r = a.chamar('cancelarOrcamento', 'dono@oficina.com',
    { id: o.ID, motivo: 'cliente desistiu', versao: o.Versao });
  if (!r.ok) throw new Error(r.error);
  const todos = a.chamar('carregar', 'dono@oficina.com', { incluirArquivados: true }).data.orcamentos;
  const achou = todos.find(x => x.ID === o.ID);
  if (!achou) throw new Error('a linha desapareceu da planilha');
  igual(achou.Status, 'Cancelado');
  igual(achou.MotivoCancelamento, 'cliente desistiu');
});

t('orcamento cancelado nao volta a receber pagamento', () => {
  const a = appPronto();
  const o = criarOrc(a, 'func@oficina.com');
  a.chamar('cancelarOrcamento', 'dono@oficina.com',
    { id: o.ID, motivo: 'desistiu', versao: o.Versao });
  recusa(() => a.chamar('registrarPagamento', 'func@oficina.com',
    { orcamentoId: o.ID, valor: 10, forma: 'Pix' }), 'CANCELADO');
});

console.log('\n--- servicos e fotos ---');
t('funcionario nao muda valor padrao de servico existente', () => {
  const a = appPronto();
  const s = a.chamar('salvarServico', 'dono@oficina.com',
    { servico: { Descricao: 'Pintura capo', ValorPadrao: 500 } }).data;
  recusa(() => a.chamar('salvarServico', 'func@oficina.com',
    { servico: { ID: s.ID, Descricao: 'Pintura capo', ValorPadrao: 50 } }), 'PERMISSAO');
});

t('funcionario cadastra servico novo', () => {
  const a = appPronto();
  const r = a.chamar('salvarServico', 'func@oficina.com',
    { servico: { Descricao: 'Polimento', ValorPadrao: 120 } });
  if (!r.ok) throw new Error(r.error);
});

t('funcionario nao desativa servico', () => {
  const a = appPronto();
  const s = a.chamar('salvarServico', 'dono@oficina.com',
    { servico: { Descricao: 'X', ValorPadrao: 1 } }).data;
  recusa(() => a.chamar('desativarServico', 'func@oficina.com', { id: s.ID }), 'PERMISSAO');
});

t('desativar servico nao apaga a linha', () => {
  const a = appPronto();
  const s = a.chamar('salvarServico', 'dono@oficina.com',
    { servico: { Descricao: 'X', ValorPadrao: 1 } }).data;
  a.chamar('desativarServico', 'dono@oficina.com', { id: s.ID });
  const lista = a.chamar('carregar', 'dono@oficina.com').data.servicos;
  const achou = lista.find(x => x.ID === s.ID);
  if (!achou) throw new Error('servico desapareceu');
  igual(achou.Ativo, 'false');
});

t('foto grande e recusada', () => {
  const a = appPronto();
  recusa(() => a.chamar('enviarFoto', 'func@oficina.com',
    { base64: 'A'.repeat(9 * 1024 * 1024) }), 'DADO');
});

t('funcionario nao le o historico', () => {
  const a = appPronto();
  recusa(() => a.chamar('listarLog', 'func@oficina.com', {}), 'PERMISSAO');
});

t('acao inexistente e recusada', () => {
  const a = appPronto();
  recusa(() => a.chamar('apagarTudo', 'dono@oficina.com', {}), 'ACAO');
});


console.log('\n--- zerar a planilha para outra oficina ---');
t('limparDados nao faz nada sem a confirmacao', () => {
  const a = appPronto();
  criarOrc(a, 'func@oficina.com');
  const r = a.g.limparDados();
  if (!/Nada foi apagado/.test(r)) throw new Error('devia ter recusado: ' + r);
  igual(a.g.ler('Orcamentos').length, 1, 'o orcamento tinha que continuar la:');
});

t('com a confirmacao, apaga movimento e preserva servicos e acessos', () => {
  const a = appPronto();
  a.chamar('salvarServico', 'dono@oficina.com', { servico: { Descricao: 'Polimento', ValorPadrao: 120 } });
  const o = criarOrc(a, 'func@oficina.com');
  a.chamar('registrarPagamento', 'func@oficina.com', { orcamentoId: o.ID, valor: 50, forma: 'Pix' });
  // libera a trava do mesmo jeito que a pessoa faria no editor
  const r = a.g.limparDados('APAGAR TUDO');
  if (!/Planilha zerada/.test(r)) throw new Error(r);
  igual(a.g.ler('Orcamentos').length, 0, 'orcamentos:');
  igual(a.g.ler('Itens').length, 0, 'itens:');
  igual(a.g.ler('Pagamentos').length, 0, 'pagamentos:');
  igual(a.g.ler('Clientes').length, 0, 'clientes:');
  if (!a.g.ler('Servicos').length) throw new Error('a lista de servicos nao devia ter sido apagada');
  if (!a.g.ler('Usuarios').length) throw new Error('os acessos nao deviam ter sido apagados');
});

t('depois de zerar, a numeracao recomeca em 1', () => {
  const a = appPronto();
  criarOrc(a, 'func@oficina.com'); criarOrc(a, 'func@oficina.com');
  a.g.limparDados('APAGAR TUDO');
  igual(criarOrc(a, 'func@oficina.com').Numero, 1);
});

t('zerarTudo tambem limpa servicos e acessos', () => {
  const a = appPronto();
  a.chamar('salvarServico', 'dono@oficina.com', { servico: { Descricao: 'X', ValorPadrao: 1 } });
  criarOrc(a, 'func@oficina.com');
  a.g.limparDados('APAGAR TUDO', true);
  igual(a.g.ler('Servicos').length, 0, 'servicos:');
  igual(a.g.ler('Usuarios').length, 0, 'usuarios:');
  // e o proximo a entrar volta a ser o dono da planilha
  const r = a.chamar('carregar', 'dono@oficina.com');
  if (!r.ok) throw new Error(r.error);
  igual(r.data.usuario.papel, 'dono');
});

t('zerar nao quebra a estrutura: da para usar em seguida', () => {
  const a = appPronto();
  criarOrc(a, 'func@oficina.com');
  a.g.limparDados('APAGAR TUDO');
  const o = criarOrc(a, 'func@oficina.com', [{ Descricao: 'y', Qtd: 2, Valor: 50 }]);
  igual(o.Numero, 1); igual(o.Total, 100); igual(o.Saldo, 100);
});

console.log('\n' + ok + ' passaram, ' + falhou + ' falharam\n');
process.exit(falhou ? 1 : 0);
