const fs=require('fs'),vm=require('vm');
const {montarAmbiente}=require('./fakegas');
const g=montarAmbiente(); vm.createContext(g);
vm.runInContext(fs.readFileSync('C:/Users/lipib/Downloads/cris/Codigo.gs','utf8'),g);
g.CLIENT_ID='CID';
// planilha ANTIGA, com as colunas da v3 e um orcamento ja lancado
const ss=g.__ss;
ss.insertSheet('Config').getRange(1,1,3,2).setValues([['Chave','Valor'],['oficina_nome','Cris'],['proximo_numero',7]]);
ss.insertSheet('Clientes').getRange(1,1,2,4).setValues([['ID','Nome','Telefone','Obs'],['C001','Cliente Teste','5569999999999','Exemplo']]);
ss.insertSheet('Servicos').getRange(1,1,2,4).setValues([['ID','Descricao','Categoria','ValorPadrao'],['S001','Porta motorista','Funilaria',380]]);
ss.insertSheet('Orcamentos').getRange(1,1,2,17).setValues([
 ['ID','Numero','Data','ClienteID','ClienteNome','Telefone','Placa','Modelo','Ano','Cor','Status','Total','Pago','Saldo','Arquivado','Obs','AtualizadoEm'],
 ['O_VELHO',6,'2026-09-01','C001','Cliente Teste','5569999999999','XYZ9Z99','Gol','2018','prata','Aprovado',380,100,280,false,'','2026-09-01T10:00:00.000Z']]);
ss.insertSheet('Itens').getRange(1,1,2,8).setValues([
 ['ID','OrcamentoID','Ordem','Descricao','Qtd','Valor','Subtotal','FotoURL'],
 ['I_VELHO','O_VELHO',1,'Porta motorista',1,380,380,'']]);
ss.insertSheet('Pagamentos').getRange(1,1,2,6).setValues([
 ['ID','OrcamentoID','Data','Valor','Forma','Obs'],
 ['P_VELHO','O_VELHO','2026-09-02',100,'Pix','sinal']]);

const tok=e=>{const t='tk-'+e;g.__tokens[t]={aud:'CID',iss:'https://accounts.google.com',email:e,email_verified:'true',exp:Math.floor(Date.now()/1000)+3600};return t;};
const call=(a,e,c)=>JSON.parse(g.doPost({postData:{contents:JSON.stringify(Object.assign({action:a,token:tok(e)},c||{}))}}).txt);

let f=0; const t=(n,fn)=>{try{fn();console.log('  ok   ',n);}catch(e){console.log('  FALHA',n,'->',e.message);f++;}};
const eq=(a,b,m)=>{if(String(a)!==String(b))throw new Error((m||'')+' esperado '+b+', veio '+a);};

const d0=call('carregar','dono@oficina.com');
t('primeiro carregar migra sem erro',()=>{ if(!d0.ok) throw new Error(d0.error); });
t('colunas novas foram acrescentadas',()=>{
  const cab=ss.getSheetByName('Orcamentos').getRange(1,1,1,ss.getSheetByName('Orcamentos').getLastColumn()).getValues()[0];
  ['Versao','Travado','CriadoPor','AlteradoPor','MotivoCancelamento'].forEach(c=>{ if(cab.indexOf(c)<0) throw new Error('falta '+c); });
});
t('dados antigos continuam intactos',()=>{
  const o=d0.data.orcamentos.find(x=>x.ID==='O_VELHO');
  if(!o) throw new Error('orcamento antigo sumiu');
  eq(o.Total,380); eq(o.Pago,100); eq(o.Saldo,280); eq(o.Numero,6);
  eq(d0.data.pagamentos.length,1,'pagamento antigo:');
  eq(d0.data.itens.length,1,'item antigo:');
});
t('orcamento antigo (sem coluna Versao) ainda pode ser salvo',()=>{
  const o=d0.data.orcamentos.find(x=>x.ID==='O_VELHO');
  const r=call('salvarOrcamento','dono@oficina.com',{orcamento:Object.assign({},o,{Obs:'anotacao nova'}),
    itens:[{ID:'I_VELHO',Descricao:'Porta motorista',Qtd:1,Valor:380}]});
  if(!r.ok) throw new Error(r.error);
  eq(r.data.orcamento.Pago,100,'pagamento antigo preservado:');
  eq(r.data.orcamento.Saldo,280);
});
t('numeracao continua de onde parou',()=>{
  const r=call('salvarOrcamento','dono@oficina.com',{orcamento:{ClienteNome:'Novo',Placa:'AAA1A11'},itens:[{Descricao:'x',Qtd:1,Valor:10}]});
  eq(r.data.orcamento.Numero,7);
});
t('servico antigo sem coluna Ativo continua valendo',()=>{
  const s=call('carregar','dono@oficina.com').data.servicos.find(x=>x.ID==='S001');
  if(String(s.Ativo)==='false') throw new Error('servico antigo virou inativo');
});
t('pagamento antigo (sem LancadoEmMs) so o dono estorna',()=>{
  const r=call('estornarPagamento','dono@oficina.com',{id:'P_VELHO',motivo:'lancamento errado da versao antiga'});
  if(!r.ok) throw new Error(r.error);
  eq(r.data.orcamento.Pago,0);
});
console.log(f?'\nFALHAS: '+f:'\nmigracao ok');
process.exit(f?1:0);
