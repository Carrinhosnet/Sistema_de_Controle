// =====================================================================
// CARRINHOS_NET — TELA: Arquivos Contábeis
// Depende da base do index.html: $, USER, SUPABASE_URL, SUPABASE_KEY,
// FUNC_URL, verificarSessao, renovarSessao, brl, registrarTela.
// Bibliotecas (carregadas no index): XLSX (SheetJS) e JSZip.
//
// O QUE FAZ
//   Monta o pacote do mês para a contabilidade: XML e PDF de todas as
//   notas emitidas no Bling no período + um "Resumo das Notas" em Excel,
//   tudo num .zip, com as mesmas pastas do pacote que já vai hoje:
//
//     Arquivos Contábeis (09-2026)/
//       Arquivos de Venda (NF-e)/XML  e  /PDF
//       Arquivos de Devolução (NFD-e)/XML  e  /PDF
//       Outras Notas/XML  e  /PDF          (só se houver)
//       Resumo das Notas (09-2026).xlsx
//       LEIA-ME.txt
//
// COMO
//   1. "Consultar notas": a Edge Function arquivos-contabeis lista as
//      notas do período (inclusive canceladas). Mostra quantas são.
//   2. "Gerar pacote": baixa XML + PDF de cada nota, 3 por vez (limite
//      do Bling), lê os números direto de cada XML, monta o resumo e o
//      .zip AQUI no navegador e entrega o download. Nada fica guardado
//      no sistema.
//
// CLASSIFICAÇÃO (lida do próprio XML, não do Bling)
//   Devolução    = nota de ENTRADA com finalidade 4 (finNFe = 4)
//   Venda        = nota de SAÍDA cujos CFOPs são todos de venda
//                  (x101–x125, x401–x405, x501–x502)
//   Outras Notas = todo o resto (remessas, retornos, outras entradas,
//                  devolução de compra...). Não somem: vão para a pasta
//                  própria e aparecem no resumo.
//
// O QUE NÃO VEM (e a tela avisa)
//   - XML do EVENTO de cancelamento e cartas de correção: a API do Bling
//     não entrega. A nota cancelada vem (XML + PDF); o evento, baixar no
//     Bling.
//   - CT-e do Mercado Envios: a API do Mercado Livre não entrega.
// =====================================================================
const ARQ = (function(){
  const f=(id)=>$('ac-'+id);
  const FUNCAO='arquivos-contabeis';
  const PARALELO=3;          // notas baixadas ao mesmo tempo
  const TENTATIVAS=6;        // por nota, antes de desistir

  const SITUACAO={1:'Pendente',2:'Cancelada',3:'Aguardando recibo',4:'Rejeitada',5:'Autorizada',
                  6:'Autorizada',7:'Autorizada',8:'Aguardando protocolo',9:'Denegada',
                  10:'Consultando situação',11:'Bloqueada'};
  const autorizada=(s)=>[5,6,7].includes(Number(s));
  const cancelada=(s)=>Number(s)===2;

  let NOTAS=[];        // [{id,tipo,situacao,numero,dataEmissao,chave, ...depois do download}]
  let PERIODO=null;    // {inicio,fim,rotulo}
  let OCUPADO=false;

  // ---------------------------------------------------------------
  // chamada à Edge Function, com o token de login (x-sessao)
  // ---------------------------------------------------------------
  async function chamar(corpo){
    if(USER && !verificarSessao()) throw new Error('Sessão expirada.');
    renovarSessao();
    let resp;
    try{
      resp=await fetch(FUNC_URL(FUNCAO),{method:'POST',
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
                 'Content-Type':'application/json','x-sessao':(USER&&USER.token)||''},
        body:JSON.stringify(corpo)});
    }catch(e){ const err=new Error('Sem conexão com o servidor.'); err.repetir=true; throw err; }
    const txt=await resp.text(); let data; try{ data=JSON.parse(txt); }catch{ data=null; }
    if(resp.ok && data && data.ok) return data;
    const err=new Error((data&&data.erro)||('HTTP '+resp.status+(txt?': '+txt.slice(0,150):'')));
    // 429 (Bling pediu para esperar) e erros de servidor: vale tentar de novo
    err.repetir = resp.status===429 || resp.status>=500 || !!(data&&data.repetir);
    err.semSessao = resp.status===401;
    throw err;
  }
  const espera=(ms)=>new Promise(r=>setTimeout(r,ms));

  // ---------------------------------------------------------------
  // período
  // ---------------------------------------------------------------
  const pad=(n)=>String(n).padStart(2,'0');
  const isoDia=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const brData=(iso)=>iso? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4) : '';
  const NOMES_MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  function montarMeses(){
    const hoje=new Date(); let html='<option value="">Período personalizado</option>';
    for(let i=0;i<24;i++){
      const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);
      const v=d.getFullYear()+'-'+pad(d.getMonth()+1);
      html+=`<option value="${v}">${NOMES_MES[d.getMonth()]}/${d.getFullYear()}${i===0?' (mês atual)':''}</option>`;
    }
    f('mes').innerHTML=html;
    // padrão: mês anterior, que é o que vai para a contabilidade
    const ant=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);
    f('mes').value=ant.getFullYear()+'-'+pad(ant.getMonth()+1);
    aplicarMes();
  }
  function aplicarMes(){
    const v=f('mes').value; if(!v) return;
    const [y,m]=v.split('-').map(Number);
    f('de').value=isoDia(new Date(y,m-1,1));
    f('ate').value=isoDia(new Date(y,m,0));
  }
  function lerPeriodo(){
    const inicio=f('de').value, fim=f('ate').value;
    if(!inicio||!fim) throw new Error('Escolha o mês ou as duas datas.');
    if(inicio>fim) throw new Error('A data inicial é depois da final.');
    // mês cheio vira "09-2026"; qualquer outro período, "01-09-2026 a 15-09-2026"
    const [y,m]=inicio.split('-').map(Number);
    const mesCheio = inicio===isoDia(new Date(y,m-1,1)) && fim===isoDia(new Date(y,m,0));
    const rotulo = mesCheio ? pad(m)+'-'+y : brData(inicio).replace(/\//g,'-')+' a '+brData(fim).replace(/\//g,'-');
    return {inicio,fim,rotulo,mesCheio};
  }

  // ---------------------------------------------------------------
  // leitura do XML da nota
  // ---------------------------------------------------------------
  const CFOP_VENDA=(c)=>{ const n=Number(String(c).slice(1)); return (n>=101&&n<=125)||(n>=401&&n<=405)||(n>=501&&n<=502); };

  function lerXml(texto){
    const doc=new DOMParser().parseFromString(texto,'application/xml');
    if(doc.getElementsByTagName('parsererror').length) return null;
    const um=(pai,tag)=>{ const e=(pai||doc).getElementsByTagName(tag)[0]; return e? e.textContent.trim() : ''; };
    const ide=doc.getElementsByTagName('ide')[0];
    const dest=doc.getElementsByTagName('dest')[0];
    const tot=doc.getElementsByTagName('ICMSTot')[0];
    const num=(t)=>{ const v=parseFloat(um(tot,t)); return isNaN(v)?0:v; };
    const cfops=[...new Set([...doc.getElementsByTagName('det')].map(d=>um(d,'CFOP')).filter(Boolean))];
    const refs=[...doc.getElementsByTagName('refNFe')].map(e=>e.textContent.trim());
    return {
      tpNF: um(ide,'tpNF'), finNFe: um(ide,'finNFe'), serie: um(ide,'serie'), nNF: um(ide,'nNF'),
      dhEmi: um(ide,'dhEmi')||um(ide,'dEmi'), natOp: um(ide,'natOp'),
      destNome: um(dest,'xNome'), destDoc: um(dest,'CNPJ')||um(dest,'CPF')||um(dest,'idEstrangeiro'),
      destUF: um(dest,'UF'),
      cfops, refs,
      vProd:num('vProd'), vFrete:num('vFrete'), vDesc:num('vDesc'), vOutro:num('vOutro'), vNF:num('vNF'),
      chave: (um(doc,'chNFe') || (doc.getElementsByTagName('infNFe')[0]?.getAttribute('Id')||'').replace(/^NFe/,'')),
    };
  }

  // Venda / Devolução / Outras — pelo XML; sem XML, pelo tipo da lista
  function classificar(n){
    const x=n.dados;
    if(x){
      if(x.tpNF==='0') return x.finNFe==='4' ? 'devolucao' : 'outras';
      if(x.finNFe==='4') return 'outras';
      return (x.cfops.length && x.cfops.every(CFOP_VENDA)) ? 'venda' : 'outras';
    }
    return n.tipo===1 ? 'venda' : 'outras';
  }
  const PASTA={venda:'Arquivos de Venda (NF-e)', devolucao:'Arquivos de Devolução (NFD-e)', outras:'Outras Notas'};
  const ROTULO={venda:'Venda', devolucao:'Devolução', outras:'Outra'};

  // ---------------------------------------------------------------
  // tela
  // ---------------------------------------------------------------
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dataHora=(s)=>{ if(!s) return '—'; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); return m? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : s; };

  function msg(t,erro){ f('msg').textContent=t||''; f('msg').style.color=erro?'var(--danger)':'var(--muted)'; }
  function progresso(mostrar,texto,pct){
    f('progbox').style.display=mostrar?'':'none';
    if(texto!=null) f('progmsg').textContent=texto;
    if(pct!=null){ f('progbar').style.width=pct+'%'; f('progpct').textContent=Math.round(pct)+'%'; }
  }
  function travar(sim){
    OCUPADO=sim;
    ['mes','de','ate','consultar'].forEach(k=>f(k).disabled=sim);
    f('gerar').disabled = sim || !NOTAS.length;
  }

  function contar(){
    const c={venda:{q:0,v:0},cancel:{q:0,v:0},devolucao:{q:0,v:0},outras:{q:0,v:0},pend:{q:0},semXml:{q:0}};
    for(const n of NOTAS){
      const v=n.dados? n.dados.vNF : null;
      if(cancelada(n.situacao)){ c.cancel.q++; c.cancel.v+=v||0; continue; }
      if(!autorizada(n.situacao)){ c.pend.q++; continue; }
      // tentou baixar e o XML não veio: sem o XML não há valor nem
      // classificação confiáveis, então fica FORA dos totais (e avisado)
      if(!n.dados && n.estado){ c.semXml.q++; continue; }
      const k=n.dados? classificar(n) : (n.tipo===1?'venda':'entrada');
      if(k==='entrada'){ c.outras.q++; continue; } // antes do download ainda não se sabe se é devolução
      c[k].q++; c[k].v+=v||0;
    }
    return c;
  }

  function renderKpis(){
    if(!NOTAS.length){ f('kpis').innerHTML=''; return; }
    const c=contar(), baixado=NOTAS.some(n=>n.dados);
    const val=(o)=> baixado? brl(o.v) : '';
    const caixa=(lbl,hint,q,v,cor,menor)=>`<div class="kpi" style="border-left:3px solid ${cor}"><div class="lbl">${lbl}</div><div class="hint">${hint}</div><div class="val"${menor?' style="font-size:18px"':''}>${q}</div>${v?`<div style="font-size:13px;color:var(--muted);margin-top:4px">${v}</div>`:''}</div>`;
    let h='';
    h+=caixa('Notas de venda','Saídas autorizadas com CFOP de venda',c.venda.q,val(c.venda),'#22c55e');
    h+=caixa('Canceladas','Vão no pacote; o evento de cancelamento, não',c.cancel.q,val(c.cancel),'#ef4444');
    h+=caixa(baixado?'Devoluções (NFD-e)':'Notas de entrada', baixado?'Entradas com finalidade 4':'Devolução ou outra entrada: separa ao gerar',
             baixado?c.devolucao.q:c.outras.q, baixado?val(c.devolucao):'','#f59e0b');
    if(baixado && c.outras.q) h+=caixa('Outras notas','Remessas, retornos e demais',c.outras.q,val(c.outras),'#a855f7');
    if(baixado) h+=caixa('Faturamento líquido','Vendas autorizadas − devoluções',brl(c.venda.v-c.devolucao.v),'','#26a269',true);
    if(c.pend.q) h+=caixa('Outras situações','Pendentes, rejeitadas ou denegadas',c.pend.q,'','#64748b');
    if(c.semXml.q) h+=caixa('Sem XML','Fora dos totais: veja os avisos',c.semXml.q,'','#ef4444');
    f('kpis').innerHTML=h;
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!NOTAS.length){ tb.innerHTML='<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:30px">Escolha o período e clique em Consultar notas.</td></tr>'; f('contagem').textContent='—'; return; }
    tb.innerHTML=NOTAS.map((n,i)=>{
      const x=n.dados;
      const tipo = x? ROTULO[classificar(n)] : (n.tipo===1?'Saída':'Entrada');
      const sit = SITUACAO[n.situacao]||('Situação '+n.situacao);
      const corSit = cancelada(n.situacao)?'var(--danger)': autorizada(n.situacao)?'':'var(--warn)';
      let arq='<span style="color:var(--muted)">—</span>';
      if(n.estado==='baixando') arq='<span style="color:var(--muted)">baixando…</span>';
      else if(n.estado==='ok') arq='<span style="color:var(--ok)">✓ XML ✓ PDF</span>';
      else if(n.estado==='parcial') arq=`<span style="color:var(--warn)" title="${escH(n.erro)}">${n.xml?'✓':'✗'} XML ${n.pdf?'✓':'✗'} PDF</span>`;
      else if(n.estado==='erro') arq=`<span style="color:var(--danger)" title="${escH(n.erro)}">✗ falhou</span>`;
      return `<tr id="ac-l${i}">
        <td>${escH(Number(n.numero)||n.numero)}</td>
        <td>${escH(dataHora(n.dataEmissao))}</td>
        <td>${escH(tipo)}</td>
        <td style="color:${corSit}">${escH(sit)}</td>
        <td>${escH(x?x.destNome:'—')}</td>
        <td>${escH(x?x.destUF:'')}</td>
        <td>${escH(x?x.cfops.join(', '):'')}</td>
        <td class="num">${x?brl(x.vNF):'—'}</td>
        <td>${escH(n.pedidoLoja||'')}</td>
        <td>${arq}</td></tr>`;
    }).join('');
    const c=NOTAS.length;
    f('contagem').textContent = c+(c===1?' nota':' notas')+' de '+brData(PERIODO.inicio)+' a '+brData(PERIODO.fim);
  }

  function renderAvisos(final){
    const av=[];
    const canc=NOTAS.filter(n=>cancelada(n.situacao));
    if(canc.length) av.push(`<b>${canc.length} ${canc.length===1?'nota cancelada':'notas canceladas'}</b> (${canc.map(n=>Number(n.numero)||n.numero).join(', ')}): o pacote traz o XML e o PDF da nota, mas o <b>XML do evento de cancelamento</b> não vem pela API do Bling. Baixe esses eventos no Bling e coloque na pasta de Venda.`);
    const pend=NOTAS.filter(n=>!cancelada(n.situacao)&&!autorizada(n.situacao));
    if(pend.length) av.push(`<b>${pend.length} ${pend.length===1?'nota':'notas'} sem autorização</b> (${pend.map(n=>(Number(n.numero)||n.numero)+' – '+(SITUACAO[n.situacao]||n.situacao)).join(', ')}): confira no Bling. Ficam fora dos totais.`);
    if(final){
      const falhas=NOTAS.filter(n=>n.estado==='erro'||n.estado==='parcial');
      if(falhas.length) av.push(`<b style="color:var(--danger)">${falhas.length} ${falhas.length===1?'nota ficou incompleta':'notas ficaram incompletas'}</b> (${falhas.map(n=>Number(n.numero)||n.numero).join(', ')}). Estão listadas no LEIA-ME do pacote. Clique em Gerar pacote de novo para tentar outra vez, ou baixe essas no Bling.`);
    }
    av.push('Não vêm por aqui: <b>cartas de correção</b> (baixar no Bling) e os <b>CT-e do Mercado Envios</b> (baixar no painel do Mercado Livre): as APIs não entregam esses arquivos.');
    f('avisos').innerHTML = NOTAS.length ? av.map(a=>`<div style="margin:4px 0">• ${a}</div>`).join('') : '';
    f('avisos').style.display = NOTAS.length ? '' : 'none';
  }

  function renderTudo(final){ renderKpis(); renderTabela(); renderAvisos(final); }

  // ---------------------------------------------------------------
  // 1) consultar
  // ---------------------------------------------------------------
  async function consultar(){
    if(OCUPADO) return;
    let p; try{ p=lerPeriodo(); }catch(e){ msg(e.message,true); return; }
    travar(true); msg('Consultando o Bling…'); NOTAS=[]; PERIODO=p; renderTudo(false);
    try{
      const r=await chamar({acao:'listar',inicio:p.inicio,fim:p.fim});
      NOTAS=(r.notas||[]).map(n=>Object.assign(n,{estado:null,dados:null,xml:null,pdf:null,pedidoLoja:null,erro:null}));
      msg(NOTAS.length? '' : 'Nenhuma nota emitida no período.');
    }catch(e){ msg(e.message,true); NOTAS=[]; }
    finally{ travar(false); renderTudo(false); }
  }

  // ---------------------------------------------------------------
  // 2) gerar
  // ---------------------------------------------------------------
  async function baixarNota(n){
    n.estado='baixando'; n.erro=null;
    for(let t=1;t<=TENTATIVAS;t++){
      try{
        const r=await chamar({acao:'baixar',id:n.id});
        n.xml=r.xml||null; n.pdf=r.pdf||null; n.pedidoLoja=r.pedidoLoja||null;
        n.dados = n.xml ? lerXml(n.xml) : null;
        const erros=[r.erroXml,r.erroPdf].filter(Boolean);
        if(n.xml && !n.dados) erros.push('XML ilegível');
        n.estado = (n.xml&&n.pdf&&n.dados) ? 'ok' : (n.xml||n.pdf) ? 'parcial' : 'erro';
        n.erro = erros.join(' | ') || null;
        return;
      }catch(e){
        if(e.semSessao) throw e;              // sem sessão: para tudo
        n.erro=e.message;
        if(!e.repetir || t===TENTATIVAS){ n.estado='erro'; return; }
        await espera(Math.min(2000*Math.pow(2,t-1),20000));  // 2s, 4s, 8s, 16s, 20s
      }
    }
  }

  async function gerar(){
    if(OCUPADO || !NOTAS.length) return;
    travar(true); msg('');
    const total=NOTAS.length; let feitos=0, proximo=0, parou=null;
    // só baixa de novo o que ainda não está completo (2º clique = repetir falhas)
    const fila=NOTAS.filter(n=>n.estado!=='ok');
    feitos=total-fila.length;
    progresso(true,'Baixando notas do Bling…',feitos/total*100);
    let ultimoDesenho=0;
    async function trabalhador(){
      while(proximo<fila.length && !parou){
        const n=fila[proximo++];
        try{ await baixarNota(n); }
        catch(e){ parou=e; return; }
        feitos++;
        progresso(true,`Baixando notas do Bling… ${feitos} de ${total}`,feitos/total*100);
        if(Date.now()-ultimoDesenho>700){ ultimoDesenho=Date.now(); renderTudo(false); }
      }
    }
    try{
      await Promise.all(Array.from({length:Math.min(PARALELO,fila.length)},trabalhador));
      if(parou) throw parou;
      renderTudo(true);
      progresso(true,'Montando o resumo e o arquivo .zip…',100);
      await montarZip();
      const inc=NOTAS.filter(n=>n.estado!=='ok').length;
      progresso(false);
      msg(inc? `Pacote gerado com ${inc} ${inc===1?'nota incompleta':'notas incompletas'} — veja os avisos.` : 'Pacote gerado.', !!inc);
    }catch(e){
      progresso(false);
      msg((e.semSessao? 'Sua sessão não vale mais: entre de novo no sistema. ' : 'Erro: ')+e.message, true);
    }finally{ travar(false); renderTudo(true); }
  }

  // ---------------------------------------------------------------
  // planilha "Resumo das Notas"
  // ---------------------------------------------------------------
  // data/hora da nota → número de série do Excel, sem fuso (a hora que está no XML)
  function serialExcel(s){
    const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if(!m) return null;
    return (Date.UTC(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)) - Date.UTC(1899,11,30))/86400000;
  }
  function montarPlanilha(){
    const c=contar();
    const MOEDA='#,##0.00';
    const wb=XLSX.utils.book_new();

    // --- aba Totais
    const tot=[
      ['Resumo das Notas — '+(PERIODO.mesCheio? 'mês '+PERIODO.rotulo : PERIODO.rotulo)],
      ['Período: '+brData(PERIODO.inicio)+' a '+brData(PERIODO.fim)+'   ·   Gerado em '+new Date().toLocaleString('pt-BR')+(USER&&USER.nome?' por '+USER.nome:'')],
      [],
      ['Grupo','Quantidade','Valor das notas (R$)'],
      ['Notas de venda autorizadas',c.venda.q,c.venda.v],
      ['Notas de devolução (NFD-e)',c.devolucao.q,c.devolucao.v],
      ['Faturamento líquido (vendas − devoluções)','',c.venda.v-c.devolucao.v],
      [],
      ['Outras notas autorizadas (remessas, retornos e demais)',c.outras.q,c.outras.v],
      ['Notas canceladas (fora do faturamento)',c.cancel.q,c.cancel.v],
    ];
    if(c.pend.q) tot.push(['Notas sem autorização (pendentes, rejeitadas, denegadas)',c.pend.q,'']);
    if(c.semXml.q) tot.push(['Notas cujo XML não veio do Bling (FORA dos totais — ver LEIA-ME)',c.semXml.q,'']);
    tot.push([],['Valores lidos de cada XML (campo vNF). Devolução = nota de entrada com finalidade 4.']);
    const wsT=XLSX.utils.aoa_to_sheet(tot);
    for(let r=4;r<tot.length;r++){ const cel=wsT[XLSX.utils.encode_cell({r,c:2})]; if(cel&&cel.t==='n') cel.z=MOEDA; }
    wsT['!cols']=[{wch:58},{wch:13},{wch:22}];
    XLSX.utils.book_append_sheet(wb,wsT,'Totais');

    // --- aba Notas (uma linha por nota)
    const cab=['Situação','Classificação','Número','Série','Emissão','Destinatário','CPF/CNPJ','UF','CFOP','Natureza da operação',
               'Valor dos produtos','Frete','Desconto','Outras despesas','Valor da nota','Pedido da loja','Nota referenciada (chave)','Chave de acesso','Arquivos'];
    const linhas=[cab];
    for(const n of NOTAS){
      const x=n.dados||{};
      linhas.push([
        SITUACAO[n.situacao]||String(n.situacao),
        n.dados? ROTULO[classificar(n)] : (n.tipo===1?'Saída':'Entrada'),
        Number(x.nNF||n.numero)||String(n.numero),
        x.serie? Number(x.serie) : '',
        serialExcel(x.dhEmi||n.dataEmissao),
        x.destNome||'', x.destDoc||'', x.destUF||'',
        (x.cfops||[]).join(', '), x.natOp||'',
        n.dados? x.vProd:'', n.dados? x.vFrete:'', n.dados? x.vDesc:'', n.dados? x.vOutro:'', n.dados? x.vNF:'',
        n.pedidoLoja||'', (x.refs||[]).join(', '), x.chave||n.chave||'',
        n.estado==='ok'?'XML e PDF': n.estado==='parcial'? ((n.xml?'só XML':'só PDF')+' — '+(n.erro||'')) : ('faltando — '+(n.erro||'')),
      ]);
    }
    const ws=XLSX.utils.aoa_to_sheet(linhas);
    for(let r=1;r<linhas.length;r++){
      const e=ws[XLSX.utils.encode_cell({r,c:4})]; if(e&&e.t==='n') e.z='dd/mm/yyyy hh:mm';
      for(const col of [10,11,12,13,14]){ const m=ws[XLSX.utils.encode_cell({r,c:col})]; if(m&&m.t==='n') m.z=MOEDA; }
      // documento e chaves como TEXTO: número grande vira notação científica no Excel
      for(const col of [6,15,16,17]){ const t=ws[XLSX.utils.encode_cell({r,c:col})]; if(t){ t.t='s'; t.v=String(t.v); } }
    }
    ws['!cols']=[{wch:11},{wch:13},{wch:9},{wch:6},{wch:16},{wch:34},{wch:19},{wch:5},{wch:12},{wch:34},
                 {wch:14},{wch:10},{wch:10},{wch:12},{wch:14},{wch:20},{wch:47},{wch:47},{wch:24}];
    ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:linhas.length-1,c:cab.length-1}})};
    XLSX.utils.book_append_sheet(wb,ws,'Notas');

    return XLSX.write(wb,{bookType:'xlsx',type:'array'});
  }

  function leiaMe(){
    const c=contar();
    const L=[];
    L.push('ARQUIVOS CONTÁBEIS — '+(PERIODO.mesCheio?'mês '+PERIODO.rotulo:PERIODO.rotulo));
    L.push('Período: '+brData(PERIODO.inicio)+' a '+brData(PERIODO.fim));
    L.push('Gerado em '+new Date().toLocaleString('pt-BR')+(USER&&USER.nome?' por '+USER.nome:'')+', a partir do Bling.');
    L.push('');
    L.push('CONTEÚDO');
    L.push(`  ${PASTA.venda}: ${c.venda.q} autorizadas + ${NOTAS.filter(n=>cancelada(n.situacao)&&n.dados&&classificar(n)==='venda').length} canceladas`);
    L.push(`  ${PASTA.devolucao}: ${c.devolucao.q}`);
    if(c.outras.q) L.push(`  ${PASTA.outras}: ${c.outras.q}`);
    L.push('  Resumo das Notas (planilha): uma linha por nota, com os valores lidos de cada XML.');
    L.push('');
    const canc=NOTAS.filter(n=>cancelada(n.situacao));
    if(canc.length){
      L.push('NOTAS CANCELADAS — falta o XML do evento de cancelamento');
      L.push('  A API do Bling entrega o XML e o PDF da nota cancelada, mas não o evento.');
      canc.forEach(n=>L.push(`  Nota ${Number(n.numero)||n.numero} — chave ${n.chave||''}`));
      L.push('');
    }
    const falhas=NOTAS.filter(n=>n.estado!=='ok');
    if(falhas.length){
      L.push('NOTAS INCOMPLETAS NESTE PACOTE');
      falhas.forEach(n=>L.push(`  Nota ${Number(n.numero)||n.numero}: ${n.estado==='parcial'?(n.xml?'só o XML':'só o PDF'):'nenhum arquivo'} — ${n.erro||''}`));
      L.push('');
    }
    L.push('NÃO VÊM NESTE PACOTE');
    L.push('  - Cartas de correção: baixar no Bling.');
    L.push('  - CT-e do Mercado Envios: baixar no painel do Mercado Livre.');
    return L.join('\r\n');
  }

  function base64ParaBytes(b64){
    const bin=atob(b64); const u=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    return u;
  }

  async function montarZip(){
    if(typeof JSZip==='undefined') throw new Error('A biblioteca de .zip não carregou. Recarregue a página (Ctrl+F5).');
    const zip=new JSZip();
    const raiz=zip.folder('Arquivos Contábeis ('+PERIODO.rotulo+')');
    for(const n of NOTAS){
      const pasta=raiz.folder(PASTA[classificar(n)]);
      const chave=(n.dados&&n.dados.chave)||n.chave||('nota-'+n.numero);
      if(n.xml) pasta.folder('XML').file(chave+'-nfe.xml', n.xml, {compression:'DEFLATE'});
      if(n.pdf) pasta.folder('PDF').file(chave+'.pdf', base64ParaBytes(n.pdf), {compression:'STORE'});
    }
    raiz.file('Resumo das Notas ('+PERIODO.rotulo+').xlsx', montarPlanilha(), {compression:'STORE'});
    raiz.file('LEIA-ME.txt', leiaMe(), {compression:'DEFLATE'});
    const blob=await zip.generateAsync({type:'blob'},(meta)=>progresso(true,'Montando o arquivo .zip…',meta.percent));
    const nome='Arquivos_Contabeis_'+PERIODO.rotulo.replace(/ /g,'_')+'.zip';
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),60000);
  }

  // ---------------------------------------------------------------
  function bind(){
    f('mes').addEventListener('change',()=>{ aplicarMes(); });
    ['de','ate'].forEach(k=>f(k).addEventListener('change',()=>{ f('mes').value=''; }));
    f('consultar').addEventListener('click',consultar);
    f('gerar').addEventListener('click',gerar);
    // não deixa fechar a aba no meio do download por engano
    window.addEventListener('beforeunload',(e)=>{ if(OCUPADO){ e.preventDefault(); e.returnValue=''; } });
  }
  async function init(){ montarMeses(); bind(); renderTudo(false); }
  return { init };
})();

registrarTela('arquivos', ARQ);
