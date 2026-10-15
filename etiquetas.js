// =====================================================================
// CARRINHOS_NET — etiquetas.js — Tela "Emissão de Etiquetas" (Expedição)
// 14/10/2026
//
// 1º PASSO: ESCOLHA DO MARKETPLACE (14/10/2026). Quadrados no estilo da
//   tela inicial. Só o Mercado Livre está conectado; Shopee, TikTok Shop e
//   Temu aparecem apagados ("Em breve") até ganharem integração. Para ligar
//   um novo: ativo:true na lista MARKETPLACES e o fluxo dele no escolher().
//   Toda vez que a tela é aberta pelo menu ela volta para este passo.
//
// Depende da base do index.html: $, USER, rpc, SUPABASE_KEY, FUNC_URL,
// verificarSessao, renovarSessao, temPermissao, registrarTela — e do
// expedicao.js (EXP.util), para o texto dos pacotes e a numeração
// saírem IGUAIS aos da Listagem de Envios.
//
// PAINEL (15/10/2026 — arquivo 129): igual ao da Listagem de Envios.
//   Selo do marketplace no canto superior esquerdo; botões ← Marketplaces
//   e ↻ Atualizar; busca (pedido, envio ou SKU — Enter), filtros de
//   leitura, origem, período rápido e de/até; Limpar filtros.
//   Colunas: Gerada às · Origem (Automática / Manual) · Envios ME2 ·
//   Leitura. Paginação no banco, 30 por página. A limpeza de 180 dias é
//   a mesma da Listagem (arquivo 127).
//
// DETALHE (15/10/2026): no topo ← Voltar ao painel · selo do marketplace
//   · ↻ Atualizar Status das Etiquetas. Abaixo do título, o corte/despacho
//   do ML. BOXES iguais aos da Listagem de Envios (Envios para hoje ·
//   Atrasados · Próximos dias · Listagem completa), que se combinam e
//   FILTRAM os blocos — o que sai do filtro também sai da seleção.
//   Formato em dois botões (Impressão Folha A4 / Etiqueta Térmica 10x15).
//   Saíram o "baixar também o PDF original" e o "Diagnóstico de formatos"
//   (eram só para os testes).
//   Blocos com caixas de seleção — só ME2 (ME1 tem
//   etiqueta própria e não entra):
//     ATRASADOS · PARA HOJE · PRÓXIMOS DIAS
//   "Situação agora" é consultada AO VIVO no ML (a lista é uma foto da
//   hora em que foi gerada). A caixa só libera quando o ML já libera a
//   etiqueta (liberada ou já impressa).
//   "Emitir etiquetas selecionadas" → Edge Function expedicao-etiquetas:
//   baixa a etiqueta ORIGINAL de cada envio (com a NF simplificada) e
//   monta o PDF no formato escolhido, na ordem da tela:
//     A4      → igual à folha do painel do ML (identificação + etiqueta + NF)
//     Térmica → etiqueta 10x15 + NF 10x15 com o produto ("SKU - quantidade",
//               mesmo texto da Listagem de Envios) nos DADOS ADICIONAIS
//   O formato escolhido fica lembrado neste computador.
//
// NÃO LIDA (arquivo 128): toda listagem com envio ME2 nasce não lida
//   AQUI (leitura própria, separada da Listagem de Envios). Só deixa de
//   ser não lida quando alguém abre a lista nesta tela. Aparece como tag
//   no painel e na bolinha do menu "Emissão de Etiquetas".
//   Cada emissão fica registrada (quem, quando) e aparece na coluna
//   "Emitida".
//   Atenção: emitir uma etiqueta ainda não impressa faz o ML marcar como
//   impressa — igual a baixar pelo painel do ML.
// =====================================================================
const ETQ = (function(){
  const f=(id)=>$('et-'+id);
  const FUNCAO='expedicao-etiquetas';
  let HIST=[];          // listas do painel
  let LISTA=null;       // lista aberta (conteúdo + emissoes)
  let LISTA_ID=null;
  let BASE=null;        // atualização: a lista principal (numeração dos pacotes)
  let SIT={};           // situação ao vivo por envio
  let SIT_CARREGADA=false;
  const SEL=new Set();  // envios marcados
  const FILTRO=new Set(); // boxes ligados (vazio = Listagem completa)
  let BLOCOS=[];        // [{id, titulo, linhas:[{e, n}]}] na ordem da tela
  let OCUPADO=false;
  let MKT=null;         // marketplace escolhido ('ml')

  // marketplaces: só os ativos abrem; os demais ficam "Em breve"
  const ICO_SACOLA='<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>';
  const ICO_LOJA='<path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.9 2.9 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0"/><path d="M5 12.3v7.7h14v-7.7"/><path d="M10 20v-4.5h4V20"/>';
  const ICO_PLAY='<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M10.5 9.3v5.4l4.5-2.7z"/>';
  const ICO_CAIXA='<path d="M12 2.8 3.5 7.2v9.6L12 21.2l8.5-4.4V7.2z"/><path d="M3.5 7.2 12 11.6l8.5-4.4M12 11.6v9.6"/>';
  const MARKETPLACES=[
    {id:'ml',     nome:'Mercado Livre', cor:'#facc15', ico:ICO_SACOLA, ativo:true},
    {id:'shopee', nome:'Shopee',        cor:'#f97316', ico:ICO_LOJA,   ativo:false},
    {id:'tiktok', nome:'TikTok Shop',   cor:'#ec4899', ico:ICO_PLAY,   ativo:false},
    {id:'temu',   nome:'Temu',          cor:'#fb7185', ico:ICO_CAIXA,  ativo:false},
  ];

  const U=()=> (typeof EXP!=='undefined' && EXP.util) ? EXP.util : null;
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ddmm=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7) : '';
  const brData=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7)+'/'+dia.slice(0,4) : '';
  const hojeSP=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const diaSP=(iso)=>new Date(new Date(iso).getTime()-3*3600e3).toISOString().slice(0,10);
  const horaSP=(iso)=>{ const m=new Date(new Date(iso).getTime()-3*3600e3).toISOString().match(/T(\d{2}):(\d{2})/); return m? m[1]+':'+m[2] : ''; };
  const quando=(iso)=>{ try{ return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso||''; } };
  const DIAS=['dom','seg','ter','qua','qui','sex','sáb'];
  const DIAS_LONGOS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const diaSemana=(dia)=>{ if(!dia) return ''; const [y,m,d]=dia.split('-').map(Number); return DIAS[new Date(y,m-1,d).getDay()]; };
  const nPac=(n)=> n ? String(n).padStart(2,'0') : '—';

  function msg(t,erro){
    for(const id of ['msg','msg2']){ const el=f(id); if(!el) continue; el.textContent=t||''; el.style.color=erro?'var(--danger)':'var(--muted)'; }
  }

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
    }catch(e){ throw new Error('Sem conexão com o servidor (a função expedicao-etiquetas foi publicada?).'); }
    const txt=await resp.text(); let data; try{ data=JSON.parse(txt); }catch{ data=null; }
    if(resp.ok && data && data.ok) return data;
    const det=((data&&data.info)||[]).filter(i=>i&&!i.ok).map(i=>i.envio+': '+i.erro).join('; ');
    throw new Error(((data&&data.erro)||('HTTP '+resp.status+(txt?': '+txt.slice(0,150):'')))+(det?' — '+det:''));
  }

  function baixarArquivo(base64, nome){
    const bin=atob(base64), u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([u8],{type:'application/pdf'}));
    const a=document.createElement('a'); a.href=url; a.download=nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  // ---------------------------------------------------------------
  // PAINEL
  // ---------------------------------------------------------------
  const POR_PAGINA=30;
  let PAG=1, TOTAL=0;
  // "às 10:42" no mesmo dia da listagem; "em 15/10 às 10:42" se foi em outro dia
  const quandoLeu=(iso,dia)=> diaSP(iso)===dia ? `às ${escH(horaSP(iso))}` : `em ${escH(ddmm(diaSP(iso)))} às ${escH(horaSP(iso))}`;
  function renderPainel(){
    const tb=f('painel-tbody'); if(!tb) return;
    const temFiltro= !!(f('f-leitura').value || f('f-origem').value || f('f-busca').value.trim() || f('f-de').value || f('f-ate').value);
    marcarAtalho();
    if(!HIST.length){
      tb.innerHTML= temFiltro
        ? `<tr><td colspan="4" class="ex-vazio">Nenhuma listagem com esses filtros.</td></tr>`
        : `<tr><td colspan="4" class="ex-vazio">Nenhuma listagem gerada ainda. As listagens são geradas na tela <b>Listagem de Envios</b>.</td></tr>`;
      f('painel-cont').textContent='0 listagens'; atualizarPaginacao(); return;
    }
    let h='', diaAnt=null;
    for(const l of HIST){
      if(l.dia!==diaAnt){
        const [y,m,d]=l.dia.split('-').map(Number);
        const rot= l.dia===hojeSP() ? 'Hoje' : DIAS_LONGOS[new Date(y,m-1,d).getDay()];
        h+=`<tr class="ex-dia"><td colspan="4">${escH(rot.charAt(0).toUpperCase()+rot.slice(1))} · ${escH(brData(l.dia))}</td></tr>`;
        diaAnt=l.dia;
      }
      const origem= l.automatica
        ? `<span class="ex-tag ex-tag-auto">Automática</span>`
        : `<span class="ex-tag ex-tag-manual">Manual</span>`;
      const total=Number(l.envios_me2)||0;
      const env= `<b>${total}</b> ${total===1?'envio':'envios'}`
        + (l.tipo==='atualizacao' ? ' <span class="ex-lida">· atualização (só as vendas novas)</span>' : '')
        + (l.tem_proximos ? '' : ' <span class="ex-lida">· sem "próximos dias" (lista anterior a esta tela)</span>')
        + (l.achado ? `<div class="ex-achado">encontrado: ${escH(l.achado)}</div>` : '');
      const leit= l.nao_lida ? `<span class="ex-tag ex-tag-nl">NÃO LIDA</span>`
        : l.vista_em ? `<span class="ex-lida">Lida ${quandoLeu(l.vista_em,l.dia)}${l.vista_por_nome?' por '+escH(l.vista_por_nome):''}</span>`
        : `<span class="ex-lida">${total?'—':'sem envio ME2'}</span>`;
      h+=`<tr class="ex-linha${l.nao_lida?' ex-naolida':''}" data-id="${l.id}">
            <td><b>${escH(horaSP(l.gerada_em))}</b></td><td>${origem}</td><td>${env}</td><td>${leit}</td></tr>`;
    }
    tb.innerHTML=h;
    const ini=(PAG-1)*POR_PAGINA+1, fim=ini+HIST.length-1;
    f('painel-cont').textContent= TOTAL>HIST.length ? `${ini}–${fim} de ${TOTAL} listagens` : `${TOTAL} ${TOTAL===1?'listagem':'listagens'}`;
    atualizarPaginacao();
  }
  function atualizarPaginacao(){
    const paginas=Math.max(1,Math.ceil(TOTAL/POR_PAGINA));
    f('paginfo').textContent=`Página ${PAG} de ${paginas}`;
    f('prev').disabled= PAG<=1; f('next').disabled= PAG>=paginas;
  }
  // período rápido (Hoje / Ontem / 7 dias / 30 dias): preenche as datas
  const diaMenos=(n)=>new Date(Date.now()-3*3600e3-n*86400e3).toISOString().slice(0,10);
  const PERIODOS={ hoje:()=>[hojeSP(),hojeSP()], ontem:()=>[diaMenos(1),diaMenos(1)],
                   '7':()=>[diaMenos(6),hojeSP()], '30':()=>[diaMenos(29),hojeSP()] };
  function aplicarPeriodo(v){
    if(PERIODOS[v]){ const [de,ate]=PERIODOS[v](); f('f-de').value=de; f('f-ate').value=ate; }
    else if(v===''){ f('f-de').value=''; f('f-ate').value=''; }
  }
  // datas digitadas à mão: mostra o período que bate, ou "personalizado"
  function marcarAtalho(){
    const de=f('f-de').value, ate=f('f-ate').value;
    let v= (!de && !ate) ? '' : 'custom';
    for(const k of Object.keys(PERIODOS)){ const [a,b]=PERIODOS[k](); if(de===a && ate===b){ v=k; break; } }
    f('f-periodo').value=v;
  }
  function semFiltros(){ return !(f('f-leitura').value || f('f-origem').value || f('f-busca').value.trim() || f('f-de').value || f('f-ate').value); }
  function limparFiltros(){ f('f-leitura').value=''; f('f-origem').value=''; f('f-busca').value=''; f('f-de').value=''; f('f-ate').value=''; PAG=1; }
  async function carregarPainel(){
    try{
      const de=f('f-de').value||null, ate=f('f-ate').value||null;
      if(de && ate && de>ate){ msg('A data inicial é depois da final.',true); return; }
      const r=(await rpc('cn_etiquetas_listas',{p_usuario_id:USER.id, p_pagina:PAG, p_por_pagina:POR_PAGINA,
        p_de:de, p_ate:ate, p_leitura:f('f-leitura').value||null, p_origem:f('f-origem').value||null,
        p_busca:f('f-busca').value.trim()||null}))||[];
      HIST=r; TOTAL= r.length ? Number(r[0].total)||r.length : 0;
      // página além do fim (ex.: depois de um filtro): volta para a primeira
      if(!r.length && PAG>1){ PAG=1; return carregarPainel(); }
      renderPainel();
      if(PAG===1 && semFiltros()) renderMkt();   // resumo do quadrado do Mercado Livre
    }catch(e){
      HIST=[]; TOTAL=0; renderPainel();
      msg(/cn_etiquetas_listas|function/i.test(e.message)
        ? 'Falta rodar o arquivo 129 no banco (SQL Editor).' : 'Não consegui carregar as listagens: '+e.message, true);
    }
  }
  const recarregarDoInicio=async()=>{ PAG=1; msg(''); await carregarPainel(); };

  // ---------------------------------------------------------------
  // 1º PASSO — escolha do marketplace
  // ---------------------------------------------------------------
  function resumoML(){
    // listagem mais recente de hoje: quantas etiquetas ME2 já saíram
    const hoje=HIST.filter(l=>l.dia===hojeSP() && l.tipo!=='atualizacao');
    if(!hoje.length) return {txt:'Nenhuma listagem hoje', falta:0};
    const l=hoje.slice().sort((a,b)=>String(b.gerada_em).localeCompare(String(a.gerada_em)))[0];
    const total=Number(l.envios_me2)||0, emit=Math.min(Number(l.emitidas)||0,total);
    if(!total) return {txt:'Hoje: nenhum envio ME2', falta:0};
    return {txt: emit>=total ? `Hoje: todas emitidas (${total})` : `Hoje: ${emit} de ${total} emitidas`, falta: total-emit};
  }
  function renderMkt(){
    const g=f('mkt-grade'); if(!g) return;
    g.innerHTML=MARKETPLACES.map(m=>{
      let sub, bad='';
      if(m.ativo){
        const r= m.id==='ml' ? resumoML() : {txt:'',falta:0};
        sub=r.txt||'Etiquetas'; if(r.falta>0) bad=`<span class="ini-gbad" title="Envios ME2 da listagem de hoje ainda sem etiqueta emitida">${r.falta>99?'99+':r.falta}</span>`;
      }else sub='Ainda não conectado';
      return `<button class="ini-grupo${m.ativo?'':' et-mkt-off'}" style="--cor:${m.cor}" data-mkt="${m.id}" ${m.ativo?`title="Emitir etiquetas do ${escH(m.nome)}"`:'title="Integração ainda não feita" aria-disabled="true"'}>
          <span class="ini-gico"><svg viewBox="0 0 24 24">${m.ico}</svg></span>
          ${m.ativo?bad:'<span class="et-mkt-breve">Em breve</span>'}
          <span class="ini-gtx"><b>${escH(m.nome)}</b><span>${escH(sub)}</span></span>
        </button>`;
    }).join('');
  }
  function mostrarMkt(){
    f('detalhe').style.display='none'; f('painel').style.display='none'; f('mkt').style.display='';
    LISTA=null; LISTA_ID=null; BASE=null; SIT={}; SIT_CARREGADA=false; SEL.clear(); FILTRO.clear(); BLOCOS=[]; msg('');
    MKT=null; renderMkt();
  }
  async function escolher(id){
    const m=MARKETPLACES.find(x=>x.id===id); if(!m || !m.ativo) return;
    MKT=id;
    for(const c of [f('mkt-chip'),f('mkt-chip2')]) if(c){ c.textContent=m.nome; c.style.setProperty('--cor',m.cor); }
    mostrarPainel();
    await carregarPainel();
  }

  function mostrarPainel(){
    f('mkt').style.display='none'; f('detalhe').style.display='none'; f('painel').style.display='';
    LISTA=null; LISTA_ID=null; BASE=null; SIT={}; SIT_CARREGADA=false; SEL.clear(); FILTRO.clear(); BLOCOS=[]; msg('');
  }
  function mostrarDetalhe(){
    f('mkt').style.display='none'; f('painel').style.display='none'; f('detalhe').style.display='';
    window.scrollTo(0,0);
  }

  // ---------------------------------------------------------------
  // DETALHE
  // ---------------------------------------------------------------
  function montarBlocos(){
    const u=U(); if(!u) throw new Error('A tela Listagem de Envios (expedicao.js) não carregou — recarregue a página.');
    const ehAtu = LISTA.tipo==='atualizacao';
    const fonte = ehAtu ? (LISTA.novas||LISTA.envios||[]) : (LISTA.envios||[]);
    // na atualização a numeração continua a da lista principal (igual ao texto do WhatsApp)
    const offset = (ehAtu && BASE) ? u.numerar(BASE.envios||[],'agencia').ultimo : 0;
    const num=u.numerar(fonte,'agencia');
    const comEnvio=(x)=>x.e && x.e.envio;
    const prox=(LISTA.proximos||[]).filter(e=>u.viaDe(e)==='agencia' && e.envio)
      .sort((a,b)=>String(a.dia_despacho).localeCompare(String(b.dia_despacho))
        || u.itemTxt(u.desmontar(a.itens)[0]||{}).localeCompare(u.itemTxt(u.desmontar(b.itens)[0]||{}),'pt-BR',{numeric:true}));
    BLOCOS=[
      {id:'atrasados', titulo:'Envios atrasados', cls:'et-bloco-atraso', linhas:num.atrasados.filter(comEnvio).map(x=>({e:x.e,n:x.n+offset}))},
      {id:'hoje',      titulo:'Envios para hoje', cls:'',                linhas:num.hoje.filter(comEnvio).map(x=>({e:x.e,n:x.n+offset}))},
      {id:'proximos',  titulo:'Envios para os próximos dias', cls:'et-bloco-prox', linhas:prox.map(e=>({e,n:null})), semProximos:!('proximos' in LISTA)},
    ];
  }

  function sitHtml(envio){
    if(!SIT_CARREGADA) return '<span class="et-mudo">consultando…</span>';
    const s=SIT[envio];
    if(!s) return '<span class="et-sit et-s-fora">sem resposta</span>';
    const cls= s.disponivel ? 'et-s-ok' : (/AGUARDANDO|AINDA/.test(s.rotulo) ? 'et-s-nao' : 'et-s-fora');
    return `<span class="et-sit ${cls}">${escH(s.rotulo)}</span>`;
  }
  const disponivel=(envio)=> SIT_CARREGADA && SIT[envio] && SIT[envio].disponivel;

  // ---------------------------------------------------------------
  // BOXES — mesmos da Listagem de Envios (cores, layout, combinação)
  // ---------------------------------------------------------------
  const NOME_BOX={hoje:'Envios para hoje', atrasados:'Atrasados', proximos:'Próximos dias'};
  const bloco=(id)=>BLOCOS.find(b=>b.id===id)||{linhas:[]};
  const temProx=()=>!bloco('proximos').semProximos;
  function blocosVisiveis(){ return FILTRO.size ? BLOCOS.filter(b=>FILTRO.has(b.id)) : BLOCOS; }
  function htmlBoxes(){
    const n=(id)=>bloco(id).linhas.length;
    const L=[
      ['hoje','Envios para hoje',n('hoje'),'Despacho hoje','ex-c-hoje'],
      ['atrasados','Atrasados',n('atrasados'),'Despacho já venceu','ex-c-atraso'],
      ['proximos','Próximos dias',temProx()?n('proximos'):'—',temProx()?'Despacho depois de hoje':'Listagem antiga: não guardou','ex-c-prox'],
      ['completa','Listagem completa',n('hoje')+n('atrasados')+(temProx()?n('proximos'):0),'Mostra tudo','ex-c-todos'],
    ];
    return L.map(([k,l,val,hint,cor])=>{
      const on= k==='completa' ? !FILTRO.size : FILTRO.has(k);
      const off= k==='proximos' && !temProx();
      return `<div class="kpi click ex-box ${cor}${on?' on':''}${off?' ex-box-off':''}" data-box="${k}" title="${off?'Esta listagem não guardou os próximos dias':(k==='completa'?'Mostra tudo (limpa os filtros)':'Clique para filtrar; combine com outros boxes')}">
        <div class="lbl">${escH(l)}</div><div class="hint">${escH(hint)}</div><div class="val">${val}</div><div class="flag">${k==='completa'?'MOSTRANDO TUDO':'FILTRANDO'}</div></div>`;
    }).join('');
  }
  function textoSelecao(){
    const vis=blocosVisiveis().filter(b=>!b.semProximos);
    const ordem=['atrasados','hoje','proximos'];
    const partes=ordem.map(id=>vis.find(b=>b.id===id)).filter(Boolean).map(b=>`${NOME_BOX[b.id]} ${b.linhas.length}`);
    const tot=vis.reduce((s,b)=>s+b.linhas.length,0);
    const disp=SIT_CARREGADA ? vis.reduce((s,b)=>s+b.linhas.filter(x=>disponivel(x.e.envio)).length,0) : null;
    return `Mostrando <b>${tot}</b> ${tot===1?'envio':'envios'}${partes.length?` (${partes.join(' + ')})`:''}${disp!==null?` · ${disp} com etiqueta disponível`:''}`;
  }
  function clicarBox(k){
    if(!LISTA || OCUPADO) return;
    if(k==='completa') FILTRO.clear();
    else if(k==='proximos' && !temProx()) return;
    else if(FILTRO.has(k)) FILTRO.delete(k); else FILTRO.add(k);
    // o que saiu do filtro sai também da seleção (para não emitir o que não está na tela)
    const vis=new Set(blocosVisiveis().flatMap(b=>b.linhas.map(x=>String(x.e.envio))));
    for(const id of [...SEL]) if(!vis.has(id)) SEL.delete(id);
    render();
  }
  // horário de corte e de despacho do ML guardados na listagem
  function agendaTxt(lista){
    const a=lista && lista.agenda; if(!a) return '';
    if(a.trabalha===false) return 'Agência do ML: sem despacho neste dia';
    return `Corte do ML: ${a.corte||'--:--'} · despacho na agência até ${a.despacho||'--:--'}`;
  }

  function render(){
    if(!LISTA){ f('corpo').innerHTML=''; f('kpis').innerHTML=''; f('sel-total').innerHTML=''; return; }
    const u=U();
    const ag=agendaTxt(LISTA);
    f('titulo').innerHTML=`${LISTA.tipo==='atualizacao'?'<b>Atualização</b> da ':''}Listagem de envios <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.automatica?' · <b>automática</b>':(LISTA.gerada_por?' por '+escH(LISTA.gerada_por):'')} · Somente envios por agência`
      + (ag ? `<div class="ex-agenda">${escH(ag)}</div>` : '');
    f('kpis').innerHTML=htmlBoxes();
    f('sel-total').innerHTML=textoSelecao();
    const av=[];
    if(LISTA.tipo==='atualizacao') av.push('Esta é uma ATUALIZAÇÃO: traz só as vendas novas desde a lista principal. Os demais envios estão na lista principal do dia.');
    f('avisos').innerHTML=av.map(a=>`<div>• ${escH(a)}</div>`).join(''); f('avisos').style.display=av.length?'':'none';
    const emis=LISTA.emissoes||{};
    let h='';
    for(const b of blocosVisiveis()){
      const disp=b.linhas.filter(x=>disponivel(x.e.envio));
      const todosMarcados= disp.length>0 && disp.every(x=>SEL.has(String(x.e.envio)));
      h+=`<div class="et-bloco ${b.cls}"><div class="et-bt">
            <input type="checkbox" class="et-todos" data-bloco="${b.id}" ${disp.length?'':'disabled'} ${todosMarcados?'checked':''} title="Marca todos os envios deste bloco com etiqueta disponível">
            ${escH(b.titulo)} <span class="et-q">${b.linhas.length} ${b.linhas.length===1?'envio':'envios'}${SIT_CARREGADA?` · ${disp.length} com etiqueta disponível`:''}</span></div>`;
      if(b.semProximos){
        h+=`<div class="ex-vazio">Esta lista foi gerada antes da tela de etiquetas e não guardou os envios dos próximos dias. Gere uma listagem nova na Listagem de Envios para vê-los.</div></div>`; continue;
      }
      if(!b.linhas.length){ h+=`<div class="ex-vazio">Nenhum envio.</div></div>`; continue; }
      h+=`<table class="et-tab"><thead><tr><th class="et-cb" style="width:40px"></th><th style="width:76px">Pacote</th><th>Produtos</th>
            <th style="width:15%">Envio / pedido</th><th style="width:9%">Despacho</th><th style="width:15%">Situação agora</th><th style="width:13%">Emitida</th></tr></thead><tbody>`;
      for(const x of b.linhas){
        const e=x.e, id=String(e.envio), ok=disponivel(id), em=emis[id];
        const linhas=u.desmontar(e.itens).map(u.itemTxt);
        const desp= e.atrasado ? `<span style="color:var(--danger);font-weight:600">${escH(ddmm(e.dia_despacho))}</span>` : escH(ddmm(e.dia_despacho)) + ` <span class="et-mudo">${escH(diaSemana(e.dia_despacho))}</span>`;
        h+=`<tr><td class="et-cb"><input type="checkbox" class="et-um" data-envio="${escH(id)}" ${ok?'':'disabled'} ${ok&&SEL.has(id)?'checked':''}></td>
              <td class="et-n">${nPac(x.n)}</td>
              <td class="et-prod">${linhas.map(escH).join('<br>')||'<span class="et-mudo">(sem itens)</span>'}</td>
              <td>${escH(id)}<div class="et-mudo">pedido ${escH(e.pedido||'')}</div></td>
              <td>${desp}</td>
              <td>${sitHtml(id)}</td>
              <td>${em?`<span class="et-emit">✓ ${em.vezes>1?em.vezes+'× · ':''}${escH(quando(em.ultima_em))}</span>${em.ultima_por?`<div class="et-mudo">${escH(em.ultima_por)}</div>`:''}`:'<span class="et-mudo">—</span>'}</td></tr>`;
      }
      h+=`</tbody></table></div>`;
    }
    f('corpo').innerHTML=h;
    atualizarBarra();
  }

  function atualizarBarra(){
    const n=SEL.size;
    const term=f('formato') && f('formato').value==='termica';
    f('sel-txt').innerHTML= n ? `<b>${n}</b> ${n===1?'envio selecionado':'envios selecionados'} · ${term? (2*n)+' etiquetas 10x15 (etiqueta + NF)' : n+' '+(n===1?'folha':'folhas')+' A4'}` : 'Nenhum envio selecionado';
    f('emitir').disabled= !n || OCUPADO;
  }

  async function carregarSituacao(){
    const ids=[...new Set(BLOCOS.flatMap(b=>b.linhas.map(x=>String(x.e.envio))))];
    SIT_CARREGADA=false; render();
    if(!ids.length){ SIT={}; SIT_CARREGADA=true; render(); return; }
    msg('Consultando a situação de cada envio no Mercado Livre…');
    try{
      const r=await chamar({acao:'situacao', envios:ids});
      SIT=r.situacoes||{}; SIT_CARREGADA=true;
      // tira da seleção o que deixou de estar disponível
      for(const id of [...SEL]) if(!disponivel(id)) SEL.delete(id);
      msg('');
    }catch(e){ SIT={}; SIT_CARREGADA=true; msg('Situação no ML: '+e.message,true); }
    render();
  }

  async function abrirLista(id){
    if(!id||OCUPADO) return;
    msg('Abrindo…');
    try{
      LISTA=await rpc('cn_etiquetas_lista',{p_usuario_id:USER.id,p_id:Number(id)}); LISTA_ID=Number(id);
      BASE=null;
      if(LISTA.tipo==='atualizacao' && LISTA.base_id){
        try{ BASE=await rpc('cn_etiquetas_lista',{p_usuario_id:USER.id,p_id:Number(LISTA.base_id)}); }catch(e){ BASE=null; }
      }
      SEL.clear(); FILTRO.clear(); SIT={}; SIT_CARREGADA=false;
      montarBlocos(); msg(''); mostrarDetalhe(); render();
      marcarLida(Number(id));
      await carregarSituacao();
    }catch(e){ msg(e.message,true); }
  }

  // abriu a lista aqui: deixa de ser NÃO LIDA na Emissão (arquivo 128).
  // Sem o 128 rodado a chamada falha em silêncio e nada muda.
  async function marcarLida(id){
    const l=HIST.find(x=>Number(x.id)===id);
    if(l && !l.nao_lida) return;
    try{
      await rpc('cn_etiquetas_marcar_vista',{p_usuario_id:USER.id,p_id:id});
      if(l){ l.nao_lida=false; l.vista_em=new Date().toISOString(); l.vista_por_nome=USER.nome; }
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ /* sem o arquivo 128: ignora */ }
  }

  async function recarregarEmissoes(){
    try{
      const l=await rpc('cn_etiquetas_lista',{p_usuario_id:USER.id,p_id:LISTA_ID});
      LISTA.emissoes=l.emissoes||{};
    }catch(e){ /* mantém o que tinha */ }
  }

  async function emitir(){
    if(!LISTA || OCUPADO || !SEL.size) return;
    const u=U();
    // ordem da tela: atrasados, hoje, próximos dias
    const escolhidos=blocosVisiveis().flatMap(b=>b.linhas).filter(x=>SEL.has(String(x.e.envio)));
    const emis=LISTA.emissoes||{};
    const repetidas=escolhidos.filter(x=>emis[String(x.e.envio)]).length;
    const novas=escolhidos.filter(x=>SIT[String(x.e.envio)] && SIT[String(x.e.envio)].rotulo==='ETIQUETA LIBERADA').length;
    let aviso=`Emitir ${escolhidos.length} ${escolhidos.length===1?'etiqueta':'etiquetas'} em ${f('formato').value==='termica'?'TÉRMICA 10x15':'A4'}?`;
    if(novas) aviso+=`\n\n${novas} ainda não ${novas===1?'foi impressa':'foram impressas'}: no Mercado Livre ${novas===1?'passa':'passam'} a constar como impressa${novas===1?'':'s'} (igual a baixar pelo painel).`;
    if(repetidas) aviso+=`\n\n${repetidas} já ${repetidas===1?'foi emitida':'foram emitidas'} antes por esta tela e ${repetidas===1?'sairá':'sairão'} de novo.`;
    if(!confirm(aviso)) return;
    const envios=escolhidos.map(x=>({envio:String(x.e.envio), pedido:String(x.e.pedido||''), linhas:u.desmontar(x.e.itens).map(u.itemTxt)}));
    const formato=f('formato').value==='termica'?'termica':'a4';
    OCUPADO=true; atualizarBarra(); f('emitir-txt').textContent='Emitindo…';
    msg(`Baixando ${envios.length} ${envios.length===1?'etiqueta':'etiquetas'} do Mercado Livre e montando o PDF…`);
    try{
      const r=await chamar({acao:'etiquetas', lista_id:LISTA_ID, envios, formato, original:false});
      const agora=new Date(Date.now()-3*3600e3).toISOString();
      const carimbo=`${agora.slice(8,10)}-${agora.slice(5,7)}-${agora.slice(0,4)} ${agora.slice(11,13)}h${agora.slice(14,16)}`;
      baixarArquivo(r.pdf, `Etiquetas ML ${formato==='termica'?'termica':'A4'} ${carimbo}.pdf`);
      try{ localStorage.setItem('cn_et_formato',formato); }catch(e){}
      const info=r.info||[], falhas=info.filter(i=>!i.ok), oks=info.filter(i=>i.ok);
      for(const i of oks){ SEL.delete(String(i.envio)); if(SIT[i.envio]) SIT[i.envio]=Object.assign({},SIT[i.envio],{rotulo:'ETIQUETA IMPRESSA'}); }
      await recarregarEmissoes();
      render();
      msg(`${oks.length} de ${envios.length} etiquetas no PDF`
        + (falhas.length? ` · NÃO SAÍRAM: ${falhas.map(i=>i.envio+' ('+i.erro+')').join('; ')}` : '')
        + (r.aviso? ' · '+r.aviso : ''), !!(falhas.length||r.aviso));
    }catch(e){ msg('Etiquetas: '+e.message,true); }
    finally{ OCUPADO=false; f('emitir-txt').textContent='Emitir etiquetas selecionadas'; atualizarBarra(); }
  }

  // ---------------------------------------------------------------
  function bind(){
    f('mkt-grade').addEventListener('click',(ev)=>{ const b=ev.target.closest('[data-mkt]'); if(b) escolher(b.dataset.mkt); });
    f('mkt-voltar').addEventListener('click',async()=>{ if(OCUPADO) return; limparFiltros(); mostrarMkt(); await carregarPainel(); });
    f('recarregar').addEventListener('click',async()=>{ msg('Atualizando…'); await carregarPainel(); msg(''); });
    ['f-leitura','f-origem','f-de','f-ate'].forEach(k=>f(k).addEventListener('change',recarregarDoInicio));
    f('f-periodo').addEventListener('change',async()=>{ aplicarPeriodo(f('f-periodo').value); await recarregarDoInicio(); });
    f('f-busca').addEventListener('keydown',(ev)=>{ if(ev.key==='Enter') recarregarDoInicio(); });
    f('f-busca').addEventListener('search',recarregarDoInicio);   // "x" do campo limpa a busca
    f('f-limpar').addEventListener('click',async()=>{ limparFiltros(); await recarregarDoInicio(); });
    f('prev').addEventListener('click',async()=>{ if(PAG>1){ PAG--; await carregarPainel(); window.scrollTo(0,0); } });
    f('next').addEventListener('click',async()=>{ PAG++; await carregarPainel(); window.scrollTo(0,0); });
    f('painel-tbody').addEventListener('click',(ev)=>{ const tr=ev.target.closest('tr.ex-linha'); if(tr) abrirLista(tr.dataset.id); });
    f('voltar').addEventListener('click',async()=>{ mostrarPainel(); await carregarPainel(); });
    f('situacao').addEventListener('click',()=>{ if(LISTA && !OCUPADO) carregarSituacao(); });
    f('emitir').addEventListener('click',emitir);
    // formato: dois botões; o select escondido guarda o valor
    const marcarFormato=(v)=>{ f('formato').value=v; document.querySelectorAll('#scr-etiquetas .et-fmt-op').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.fmt===v))); atualizarBarra(); };
    try{ const fm=localStorage.getItem('cn_et_formato'); if(fm==='termica'||fm==='a4') f('formato').value=fm; }catch(e){}
    marcarFormato(f('formato').value);
    document.querySelector('#scr-etiquetas .et-fmt').addEventListener('click',(ev)=>{ const b=ev.target.closest('.et-fmt-op'); if(b && !OCUPADO) marcarFormato(b.dataset.fmt); });
    f('kpis').addEventListener('click',(ev)=>{ const b=ev.target.closest('[data-box]'); if(b) clicarBox(b.dataset.box); });
    f('corpo').addEventListener('change',(ev)=>{
      const t=ev.target;
      if(t.classList.contains('et-um')){
        const id=t.dataset.envio; if(t.checked) SEL.add(id); else SEL.delete(id);
        render();
      }else if(t.classList.contains('et-todos')){
        const b=BLOCOS.find(x=>x.id===t.dataset.bloco); if(!b) return;
        for(const x of b.linhas){ const id=String(x.e.envio); if(!disponivel(id)) continue; if(t.checked) SEL.add(id); else SEL.delete(id); }
        render();
      }
    });
  }
  async function init(){
    bind(); mostrarMkt();
    await carregarPainel();     // traz as listas para o resumo do quadrado do Mercado Livre
  }
  // aberta de novo pelo menu ou pela tela inicial: volta à escolha do
  // marketplace (menos no meio de uma emissão)
  async function aoVoltar(){
    if(OCUPADO) return;
    limparFiltros();
    mostrarMkt();
    await carregarPainel();
  }
  return { init, aoVoltar };
})();

registrarTela('etiquetas', ETQ);
