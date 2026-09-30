// Simulador mínimo do ambiente Apps Script, para rodar Codigo.gs no Node.
class Folha {
  constructor(nome){ this.nome = nome; this.g = []; }
  _ext(r, c){
    while (this.g.length < r) this.g.push([]);
    for (const l of this.g) while (l.length < c) l.push('');
  }
  getLastRow(){
    let u = 0;
    this.g.forEach((l, i) => { if (l.some(v => String(v) !== '')) u = i + 1; });
    return u;
  }
  getLastColumn(){
    let u = 0;
    this.g.forEach(l => l.forEach((v, j) => { if (String(v) !== '') u = Math.max(u, j + 1); }));
    return u;
  }
  getRange(r, c, nr = 1, nc = 1){
    const f = this;
    return {
      getValues(){
        f._ext(r + nr - 1, c + nc - 1);
        const s = [];
        for (let i = 0; i < nr; i++) s.push(f.g[r - 1 + i].slice(c - 1, c - 1 + nc));
        return s;
      },
      setValues(v){
        f._ext(r + v.length - 1, c + v[0].length - 1);
        v.forEach((l, i) => l.forEach((x, j) => { f.g[r - 1 + i][c - 1 + j] = x; }));
      },
      setValue(x){ f._ext(r, c); f.g[r - 1][c - 1] = x; }
    };
  }
  getDataRange(){ return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(a){ this.g[this.getLastRow()] = a.slice(); this._ext(this.getLastRow(), a.length); }
  deleteRow(i){ this.g.splice(i - 1, 1); }
  deleteRows(i, n){ this.g.splice(i - 1, n); }
  setFrozenRows(){}
}

class Planilha {
  constructor(){ this.folhas = {}; }
  getName(){ return 'Funilaria - Base'; }
  getId(){ return 'PLANILHA_ID'; }
  getSheetByName(n){ return this.folhas[n] || null; }
  insertSheet(n){ return (this.folhas[n] = new Folha(n)); }
}

function montarAmbiente(){
  const ss = new Planilha();
  const props = {};
  const cache = {};
  const g = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getUi: () => {
        if (g.__semUi) throw new Error('sem interface');
        return {
          ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
          Button: { OK: 'OK', CANCEL: 'CANCEL' },
          createMenu: nome => { const m = { itens: [] };
            m.addItem = (rot, fn) => { m.itens.push(rot + '->' + fn); return m; };
            m.addSeparator = () => m;
            m.addToUi = () => { g.__menu = { nome: nome, itens: m.itens }; };
            return m; },
          prompt: (titulo, texto, bs) => ({
            getSelectedButton: () => g.__respostaBotao || 'OK',
            getResponseText: () => (g.__respostaTexto === undefined ? '' : g.__respostaTexto)
          }),
          alert: (titulo, texto) => { g.__alertas.push(titulo + ': ' + String(texto).slice(0, 120)); }
        };
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => (k in cache ? cache[k] : null),
        put: (k, v) => { cache[k] = v; },
        remove: k => { delete cache[k]; }
      })
    },
    __cache: cache,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock(){} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_a, t) => require('crypto').createHash('sha256').update(t).digest(),
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
      getUuid: () => require('crypto').randomUUID(),
      base64Decode: s => Buffer.from(s, 'base64'),
      newBlob: (b, m, n) => ({ b, m, n }),
      formatDate: (d, _tz, _f) => d.toISOString().slice(0, 10)
    },
    Session: {
      getScriptTimeZone: () => 'America/Porto_Velho',
      getEffectiveUser: () => ({ getEmail: () => g.__dono })
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: t => ({ txt: t, setMimeType(){ return this; } })
    },
    UrlFetchApp: {
      fetch: url => {
        const t = decodeURIComponent(String(url).split('id_token=')[1] || '');
        const d = g.__tokens[t];
        if (!d) return { getResponseCode: () => 400, getContentText: () => '{}' };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(d) };
      }
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' },
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: n => criarPasta(n),
      getFileById: () => {
        if (g.__driveDono === null) throw new Error('sem permissao');
        return { getOwner: () => (g.__driveDono ? { getEmail: () => g.__driveDono } : null) };
      }
    },
    Logger: { log(){} },
    MailApp: {
      sendEmail: o => { g.__emails.push(o); }
    },
    __emails: [],
    __alertas: [],
    __menu: null,
    __respostaBotao: null,
    __respostaTexto: undefined,
    __semUi: false,
    __tokens: {},
    __dono: 'dono@oficina.com',
    __driveDono: 'dono@oficina.com',
    __ss: ss
  };
  function criarPasta(nome){
    return {
      getName: () => nome || 'Fotos Orcamentos',
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: n => criarPasta(n),
      createFile: () => ({ getId: () => 'FILE1', setSharing(){} })
    };
  }
  return g;
}

module.exports = { montarAmbiente };
