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
// PAINEL: as listagens geradas na Listagem de Envios, com quantos envios do
//   Mercado Livre (ME2) cada uma tem e quantos já tiveram etiqueta
//   emitida (arquivo 126: cn_etiquetas_listas).
//
// DETALHE: três blocos com caixas de seleção — só ME2 (ME1 tem
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
  function renderPainel(){
    const tb=f('painel-tbody'); if(!tb) return;
    if(!HIST.length){
      const filtro=!!(f('f-de').value||f('f-ate').value);
      tb.innerHTML=`<tr><td colspan="6" class="ex-vazio">${filtro?'Nenhuma lista nesse período.':'Nenhuma listagem gerada ainda. As listagens são geradas na tela <b>Listagem de Envios</b>.'}</td></tr>`;
      f('painel-cont').textContent= filtro? '0 listas' : '—'; return;
    }
    const dias=[...new Set(HIST.map(l=>l.dia))];
    let h='';
    for(const dia of dias){
      const [y,m,d]=dia.split('-').map(Number);
      const rot= dia===hojeSP() ? 'Hoje' : DIAS_LONGOS[new Date(y,m-1,d).getDay()];
      h+=`<tr class="ex-dia"><td colspan="6">${escH(rot)} · ${escH(brData(dia))}</td></tr>`;
      for(const l of HIST.filter(x=>x.dia===dia)){
        const tipo= l.tipo==='atualizacao' ? `<span class="ex-tag ex-tag-atu">Atualização</span>` : `<span class="ex-tag ex-tag-pri">Listagem</span>`;
        const origem= l.automatica ? 'Automática' : escH(l.gerada_por||'—');
        const total=Number(l.envios_me2)||0, emit=Number(l.emitidas)||0;
        const env= `<b>${total}</b> ${total===1?'envio':'envios'}${l.tem_proximos?'':' <span class="ex-lida">· sem "próximos dias" (lista anterior a esta tela)</span>'}`;
        const et= !total ? '<span class="ex-lida">—</span>'
          : emit>=total ? `<span class="et-emit">✓ todas (${emit})</span>${l.ultima_emissao?` <span class="ex-lida">· última às ${escH(horaSP(l.ultima_emissao))}</span>`:''}`
          : emit ? `<b>${emit}</b> de ${total}${l.ultima_emissao?` <span class="ex-lida">· última às ${escH(horaSP(l.ultima_emissao))}</span>`:''}`
          : `<span class="ex-lida">nenhuma ainda</span>`;
        const leit= l.nao_lida ? `<span class="ex-tag ex-tag-nl">NÃO LIDA</span>`
          : l.vista_em ? `<span class="ex-lida">${diaSP(l.vista_em)===l.dia?'Lida às '+escH(horaSP(l.vista_em)):'Lida em '+escH(ddmm(diaSP(l.vista_em)))+' às '+escH(horaSP(l.vista_em))}${l.vista_por_nome?' por '+escH(l.vista_por_nome):''}</span>`
          : (('nao_lida' in l) && !total ? '<span class="ex-lida">sem envio ME2</span>' : '<span class="ex-lida">—</span>');
        h+=`<tr class="ex-linha${l.nao_lida?' ex-naolida':''}" data-id="${l.id}"><td><b>${escH(horaSP(l.gerada_em))}</b></td><td>${tipo}</td><td>${origem}</td><td>${env}</td><td>${et}</td><td>${leit}</td></tr>`;
      }
    }
    tb.innerHTML=h;
    const nl=HIST.filter(l=>l.nao_lida).length;
    f('painel-cont').textContent=`${HIST.length} ${HIST.length===1?'lista':'listas'} · ${dias.length} ${dias.length===1?'dia':'dias'}${nl?` · ${nl} não ${nl===1?'lida':'lidas'}`:''}`;
  }
  async function carregarPainel(){
    try{
      const de=f('f-de').value||null, ate=f('f-ate').value||null;
      if(de && ate && de>ate){ msg('A data inicial é depois da final.',true); return; }
      HIST=(await rpc('cn_etiquetas_listas',{p_usuario_id:USER.id,p_limite:(de||ate)?500:90,p_de:de,p_ate:ate}))||[];
      renderPainel();
      if(!de && !ate) renderMkt();
    }catch(e){
      HIST=[]; renderPainel();
      msg(/cn_etiquetas_listas/.test(e.message)||/function/i.test(e.message)
        ? 'Falta rodar o arquivo 126 no banco (SQL Editor).' : 'Não consegui carregar as listas: '+e.message, true);
    }
  }

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
    LISTA=null; LISTA_ID=null; BASE=null; SIT={}; SIT_CARREGADA=false; SEL.clear(); BLOCOS=[]; msg('');
    MKT=null; renderMkt();
  }
  async function escolher(id){
    const m=MARKETPLACES.find(x=>x.id===id); if(!m || !m.ativo) return;
    MKT=id;
    const chip=f('mkt-chip'); if(chip){ chip.textContent=m.nome; chip.style.setProperty('--cor',m.cor); }
    mostrarPainel();
    await carregarPainel();
  }

  function mostrarPainel(){
    f('mkt').style.display='none'; f('detalhe').style.display='none'; f('painel').style.display='';
    LISTA=null; LISTA_ID=null; BASE=null; SIT={}; SIT_CARREGADA=false; SEL.clear(); BLOCOS=[]; msg('');
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

  function render(){
    if(!LISTA){ f('corpo').innerHTML=''; return; }
    const u=U();
    f('titulo').innerHTML=`${LISTA.tipo==='atualizacao'?'<b>Atualização</b> da ':''}Listagem de envios <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.automatica?' · <b>automática</b>':(LISTA.gerada_por?' por '+escH(LISTA.gerada_por):'')} · só Mercado Livre ME2 (ME1 tem etiqueta própria)`;
    const av=[];
    if(LISTA.tipo==='atualizacao') av.push('Esta é uma ATUALIZAÇÃO: traz só as vendas novas desde a lista principal. Os demais envios estão na lista principal do dia.');
    f('avisos').innerHTML=av.map(a=>`<div>• ${escH(a)}</div>`).join(''); f('avisos').style.display=av.length?'':'none';
    const emis=LISTA.emissoes||{};
    let h='';
    for(const b of BLOCOS){
      const disp=b.linhas.filter(x=>disponivel(x.e.envio));
      const todosMarcados= disp.length>0 && disp.every(x=>SEL.has(String(x.e.envio)));
      h+=`<div class="et-bloco ${b.cls}"><div class="et-bt">
            <input type="checkbox" class="et-todos" data-bloco="${b.id}" ${disp.length?'':'disabled'} ${todosMarcados?'checked':''} title="Marca todos os envios deste bloco com etiqueta disponível">
            ${escH(b.titulo)} <span class="et-q">${b.linhas.length} ${b.linhas.length===1?'envio':'envios'}${SIT_CARREGADA?` · ${disp.length} com etiqueta disponível`:''}</span></div>`;
      if(b.semProximos){
        h+=`<div class="ex-vazio">Esta lista foi gerada antes da tela de etiquetas e não guardou os envios dos próximos dias. Gere uma listagem nova na Listagem de Envios para vê-los.</div></div>`; continue;
      }
      if(!b.linhas.length){ h+=`<div class="ex-vazio">Nenhum envio.</div></div>`; continue; }
      h+=`<table class="et-tab"><thead><tr><th class="et-cb" style="width:40px"></th><th style="width:76px">Pacote</th><th>Produtos (o que sai escrito na etiqueta)</th>
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
      SEL.clear(); SIT={}; SIT_CARREGADA=false;
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
    const escolhidos=BLOCOS.flatMap(b=>b.linhas).filter(x=>SEL.has(String(x.e.envio)));
    const emis=LISTA.emissoes||{};
    const repetidas=escolhidos.filter(x=>emis[String(x.e.envio)]).length;
    const novas=escolhidos.filter(x=>SIT[String(x.e.envio)] && SIT[String(x.e.envio)].rotulo==='ETIQUETA LIBERADA').length;
    let aviso=`Emitir ${escolhidos.length} ${escolhidos.length===1?'etiqueta':'etiquetas'} em ${f('formato').value==='termica'?'TÉRMICA 10x15':'A4'}?`;
    if(novas) aviso+=`\n\n${novas} ainda não ${novas===1?'foi impressa':'foram impressas'}: no Mercado Livre ${novas===1?'passa':'passam'} a constar como impressa${novas===1?'':'s'} (igual a baixar pelo painel).`;
    if(repetidas) aviso+=`\n\n${repetidas} já ${repetidas===1?'foi emitida':'foram emitidas'} antes por esta tela e ${repetidas===1?'sairá':'sairão'} de novo.`;
    if(!confirm(aviso)) return;
    const envios=escolhidos.map(x=>({envio:String(x.e.envio), pedido:String(x.e.pedido||''), linhas:u.desmontar(x.e.itens).map(u.itemTxt)}));
    const formato=f('formato').value==='termica'?'termica':'a4';
    OCUPADO=true; atualizarBarra(); f('emitir').textContent='Emitindo…';
    msg(`Baixando ${envios.length} ${envios.length===1?'etiqueta':'etiquetas'} do Mercado Livre e montando o PDF…`);
    try{
      const r=await chamar({acao:'etiquetas', lista_id:LISTA_ID, envios, formato, original:f('original').checked});
      const agora=new Date(Date.now()-3*3600e3).toISOString();
      const carimbo=`${agora.slice(8,10)}-${agora.slice(5,7)}-${agora.slice(0,4)} ${agora.slice(11,13)}h${agora.slice(14,16)}`;
      baixarArquivo(r.pdf, `Etiquetas ML ${formato==='termica'?'termica':'A4'} ${carimbo}.pdf`);
      try{ localStorage.setItem('cn_et_formato',formato); }catch(e){}
      if(r.original) setTimeout(()=>baixarArquivo(r.original, `Etiquetas ML original ${carimbo}.pdf`), 800);
      const info=r.info||[], falhas=info.filter(i=>!i.ok), oks=info.filter(i=>i.ok);
      for(const i of oks){ SEL.delete(String(i.envio)); if(SIT[i.envio]) SIT[i.envio]=Object.assign({},SIT[i.envio],{rotulo:'ETIQUETA IMPRESSA'}); }
      await recarregarEmissoes();
      render();
      const tam=[...new Set(oks.flatMap(i=>i.tamanhos||[]))];
      msg(`${oks.length} de ${envios.length} etiquetas no PDF${f('original').checked&&tam.length?` · páginas do ML: ${tam.join(', ')} pt`:''}`
        + (falhas.length? ` · NÃO SAÍRAM: ${falhas.map(i=>i.envio+' ('+i.erro+')').join('; ')}` : '')
        + (r.aviso? ' · '+r.aviso : ''), !!(falhas.length||r.aviso));
    }catch(e){ msg('Etiquetas: '+e.message,true); }
    finally{ OCUPADO=false; f('emitir').textContent='Emitir etiquetas selecionadas'; atualizarBarra(); }
  }

  // ---------------------------------------------------------------
  // DIAGNÓSTICO (14/10/2026): baixa a etiqueta de 1 envio em PDF e em
  // ZPL (térmica) e salva os arquivos + um resumo, para conferir o que
  // a API do ML devolve em cada formato. Usa o 1º envio marcado ou, sem
  // nenhum marcado, o 1º com etiqueta disponível.
  // ---------------------------------------------------------------
  function baixarBinario(base64, nome, tipo){
    const bin=atob(base64), u8=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
    const url=URL.createObjectURL(new Blob([u8],{type:tipo}));
    const a=document.createElement('a'); a.href=url; a.download=nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function diagnostico(){
    if(!LISTA || OCUPADO) return;
    const todos=BLOCOS.flatMap(b=>b.linhas).map(x=>String(x.e.envio));
    const envio=todos.find(id=>SEL.has(id)) || todos.find(id=>disponivel(id));
    if(!envio){ msg('Marque um envio com etiqueta disponível para o diagnóstico.',true); return; }
    if(!confirm(`Diagnóstico com o envio ${envio}.\n\nSe a etiqueta ainda não foi impressa, no Mercado Livre ela passa a constar como impressa.`)) return;
    OCUPADO=true; msg(`Diagnóstico do envio ${envio}: baixando PDF e ZPL…`);
    try{
      const r=await chamar({acao:'diagnostico', envio});
      const d=r.diagnostico||{};
      const resumo=JSON.parse(JSON.stringify(d));
      for(const t of ['pdf','zpl2']){
        const x=d[t]; if(!x||!x.arquivo) continue;
        const ext= x.inicio&&x.inicio.startsWith('%PDF') ? 'pdf' : (x.inicio&&x.inicio.startsWith('PK') ? 'zip' : 'txt');
        baixarBinario(x.arquivo, `diagnostico ${envio} ${t}.${ext}`, ext==='pdf'?'application/pdf':(ext==='zip'?'application/zip':'text/plain'));
        delete resumo[t].arquivo;
      }
      const txt=JSON.stringify(resumo,null,2);
      setTimeout(()=>baixarBinario(btoa(unescape(encodeURIComponent(txt))), `diagnostico ${envio} resumo.json`, 'application/json'), 900);
      msg(`Diagnóstico pronto: 3 arquivos baixados (PDF, ZPL e resumo). Mande os três.`);
    }catch(e){ msg('Diagnóstico: '+e.message,true); }
    finally{ OCUPADO=false; }
  }

  // ---------------------------------------------------------------
  function bind(){
    f('mkt-grade').addEventListener('click',(ev)=>{ const b=ev.target.closest('[data-mkt]'); if(b) escolher(b.dataset.mkt); });
    f('mkt-voltar').addEventListener('click',async()=>{ if(OCUPADO) return; f('f-de').value=''; f('f-ate').value=''; mostrarMkt(); await carregarPainel(); });
    if(f('diag')) f('diag').addEventListener('click',diagnostico);
    f('recarregar').addEventListener('click',async()=>{ msg('Atualizando…'); await carregarPainel(); msg(''); });
    ['f-de','f-ate'].forEach(k=>f(k).addEventListener('change',async()=>{ msg(''); await carregarPainel(); }));
    f('f-limpar').addEventListener('click',async()=>{ f('f-de').value=''; f('f-ate').value=''; msg(''); await carregarPainel(); });
    f('painel-tbody').addEventListener('click',(ev)=>{ const tr=ev.target.closest('tr.ex-linha'); if(tr) abrirLista(tr.dataset.id); });
    f('voltar').addEventListener('click',async()=>{ mostrarPainel(); await carregarPainel(); });
    f('situacao').addEventListener('click',()=>{ if(LISTA && !OCUPADO) carregarSituacao(); });
    f('emitir').addEventListener('click',emitir);
    try{ const fm=localStorage.getItem('cn_et_formato'); if(fm==='termica'||fm==='a4') f('formato').value=fm; }catch(e){}
    f('formato').addEventListener('change',atualizarBarra);
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
    f('f-de').value=''; f('f-ate').value='';
    mostrarMkt();
    await carregarPainel();
  }
  return { init, aoVoltar };
})();

registrarTela('etiquetas', ETQ);
