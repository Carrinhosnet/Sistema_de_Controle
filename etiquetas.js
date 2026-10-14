// =====================================================================
// CARRINHOS_NET — etiquetas.js — Tela "Emissão de Etiquetas" (Expedição)
// 14/10/2026
//
// Depende da base do index.html: $, USER, rpc, SUPABASE_KEY, FUNC_URL,
// verificarSessao, renovarSessao, temPermissao, registrarTela — e do
// expedicao.js (EXP.util), para o texto dos pacotes e a numeração
// saírem IGUAIS aos da Lista do dia.
//
// PAINEL: as listas geradas na Lista do dia, com quantos envios do
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
//   baixa a etiqueta ORIGINAL de cada envio e monta um PDF A4 com 3 por
//   folha, com "SKU - quantidade" embaixo de cada uma, na ordem da tela.
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

  const U=()=> (typeof EXP!=='undefined' && EXP.util) ? EXP.util : null;
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ddmm=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7) : '';
  const brData=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7)+'/'+dia.slice(0,4) : '';
  const hojeSP=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
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
      tb.innerHTML=`<tr><td colspan="5" class="ex-vazio">${filtro?'Nenhuma lista nesse período.':'Nenhuma lista gerada ainda. As listas são geradas na tela <b>Lista do dia</b>.'}</td></tr>`;
      f('painel-cont').textContent= filtro? '0 listas' : '—'; return;
    }
    const dias=[...new Set(HIST.map(l=>l.dia))];
    let h='';
    for(const dia of dias){
      const [y,m,d]=dia.split('-').map(Number);
      const rot= dia===hojeSP() ? 'Hoje' : DIAS_LONGOS[new Date(y,m-1,d).getDay()];
      h+=`<tr class="ex-dia"><td colspan="5">${escH(rot)} · ${escH(brData(dia))}</td></tr>`;
      for(const l of HIST.filter(x=>x.dia===dia)){
        const tipo= l.tipo==='atualizacao' ? `<span class="ex-tag ex-tag-atu">Atualização</span>` : `<span class="ex-tag ex-tag-pri">Lista do dia</span>`;
        const origem= l.automatica ? 'Automática' : escH(l.gerada_por||'—');
        const total=Number(l.envios_me2)||0, emit=Number(l.emitidas)||0;
        const env= `<b>${total}</b> ${total===1?'envio':'envios'}${l.tem_proximos?'':' <span class="ex-lida">· sem "próximos dias" (lista anterior a esta tela)</span>'}`;
        const et= !total ? '<span class="ex-lida">—</span>'
          : emit>=total ? `<span class="et-emit">✓ todas (${emit})</span>${l.ultima_emissao?` <span class="ex-lida">· última às ${escH(horaSP(l.ultima_emissao))}</span>`:''}`
          : emit ? `<b>${emit}</b> de ${total}${l.ultima_emissao?` <span class="ex-lida">· última às ${escH(horaSP(l.ultima_emissao))}</span>`:''}`
          : `<span class="ex-lida">nenhuma ainda</span>`;
        h+=`<tr class="ex-linha" data-id="${l.id}"><td><b>${escH(horaSP(l.gerada_em))}</b></td><td>${tipo}</td><td>${origem}</td><td>${env}</td><td>${et}</td></tr>`;
      }
    }
    tb.innerHTML=h;
    f('painel-cont').textContent=`${HIST.length} ${HIST.length===1?'lista':'listas'} · ${dias.length} ${dias.length===1?'dia':'dias'}`;
  }
  async function carregarPainel(){
    try{
      const de=f('f-de').value||null, ate=f('f-ate').value||null;
      if(de && ate && de>ate){ msg('A data inicial é depois da final.',true); return; }
      HIST=(await rpc('cn_etiquetas_listas',{p_usuario_id:USER.id,p_limite:(de||ate)?500:90,p_de:de,p_ate:ate}))||[];
      renderPainel();
    }catch(e){
      HIST=[]; renderPainel();
      msg(/cn_etiquetas_listas/.test(e.message)||/function/i.test(e.message)
        ? 'Falta rodar o arquivo 126 no banco (SQL Editor).' : 'Não consegui carregar as listas: '+e.message, true);
    }
  }

  function mostrarPainel(){
    f('detalhe').style.display='none'; f('painel').style.display='';
    LISTA=null; LISTA_ID=null; BASE=null; SIT={}; SIT_CARREGADA=false; SEL.clear(); BLOCOS=[]; msg('');
  }
  function mostrarDetalhe(){
    f('painel').style.display='none'; f('detalhe').style.display='';
    window.scrollTo(0,0);
  }

  // ---------------------------------------------------------------
  // DETALHE
  // ---------------------------------------------------------------
  function montarBlocos(){
    const u=U(); if(!u) throw new Error('A tela Lista do dia (expedicao.js) não carregou — recarregue a página.');
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
    f('titulo').innerHTML=`${LISTA.tipo==='atualizacao'?'<b>Atualização</b> da ':''}Lista do dia <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.automatica?' · <b>automática</b>':(LISTA.gerada_por?' por '+escH(LISTA.gerada_por):'')} · só Mercado Livre ME2 (ME1 tem etiqueta própria)`;
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
        h+=`<div class="ex-vazio">Esta lista foi gerada antes da tela de etiquetas e não guardou os envios dos próximos dias. Gere uma lista nova na Lista do dia para vê-los.</div></div>`; continue;
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
    f('sel-txt').innerHTML= n ? `<b>${n}</b> ${n===1?'envio selecionado':'envios selecionados'} · ${Math.ceil(n/3)} ${Math.ceil(n/3)===1?'folha':'folhas'} A4` : 'Nenhum envio selecionado';
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
      await carregarSituacao();
    }catch(e){ msg(e.message,true); }
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
    let aviso=`Emitir ${escolhidos.length} ${escolhidos.length===1?'etiqueta':'etiquetas'}?`;
    if(novas) aviso+=`\n\n${novas} ainda não ${novas===1?'foi impressa':'foram impressas'}: no Mercado Livre ${novas===1?'passa':'passam'} a constar como impressa${novas===1?'':'s'} (igual a baixar pelo painel).`;
    if(repetidas) aviso+=`\n\n${repetidas} já ${repetidas===1?'foi emitida':'foram emitidas'} antes por esta tela e ${repetidas===1?'sairá':'sairão'} de novo.`;
    if(!confirm(aviso)) return;
    const envios=escolhidos.map(x=>({envio:String(x.e.envio), linhas:u.desmontar(x.e.itens).map(u.itemTxt)}));
    OCUPADO=true; atualizarBarra(); f('emitir').textContent='Emitindo…';
    msg(`Baixando ${envios.length} ${envios.length===1?'etiqueta':'etiquetas'} do Mercado Livre e montando o PDF…`);
    try{
      const r=await chamar({acao:'etiquetas', lista_id:LISTA_ID, envios, original:f('original').checked});
      const agora=new Date(Date.now()-3*3600e3).toISOString();
      const carimbo=`${agora.slice(8,10)}-${agora.slice(5,7)}-${agora.slice(0,4)} ${agora.slice(11,13)}h${agora.slice(14,16)}`;
      baixarArquivo(r.pdf, `Etiquetas ML ${carimbo}.pdf`);
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
  function bind(){
    f('recarregar').addEventListener('click',async()=>{ msg('Atualizando…'); await carregarPainel(); msg(''); });
    ['f-de','f-ate'].forEach(k=>f(k).addEventListener('change',async()=>{ msg(''); await carregarPainel(); }));
    f('f-limpar').addEventListener('click',async()=>{ f('f-de').value=''; f('f-ate').value=''; msg(''); await carregarPainel(); });
    f('painel-tbody').addEventListener('click',(ev)=>{ const tr=ev.target.closest('tr.ex-linha'); if(tr) abrirLista(tr.dataset.id); });
    f('voltar').addEventListener('click',async()=>{ mostrarPainel(); await carregarPainel(); });
    f('situacao').addEventListener('click',()=>{ if(LISTA && !OCUPADO) carregarSituacao(); });
    f('emitir').addEventListener('click',emitir);
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
    bind(); mostrarPainel();
    await carregarPainel();
  }
  return { init };
})();

registrarTela('etiquetas', ETQ);
