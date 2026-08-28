// =====================================================================
// CARRINHOS_NET — TELA: Controle de Valores
// Mesmo formato da tela de Custo de Frete: cada canal tem colunas
// Padrão | Mínimo | Fora | Conf. As células de valor mostram o valor +
// botão (✎ editar / + adicionar). Editar abre um drawer pequeno com os
// dois campos do canal (padrão e mínimo). Conferência por SKU+canal
// (checkbox). Controla vendas fora do intervalo [mínimo, padrão].
// Depende da base do index.html: $, rpc, USER, temPermissao, brl,
// registrarTela, atualizarBadges.
// =====================================================================
const VAL = (function(){
  let LINHAS=[], TOTAL=0, PAGINA=0; const POR=100;
  let EDIT=null;   // {sku, canal_logico, rotulo}
  const f=(id)=>$('val-'+id);
  // canais: [chave_json, rótulo, canal_logico_sql]
  const CANAIS=[['site','Site','site'],['mlc','ML Clássico','ml_classico'],['mlp','ML Premium','ml_premium'],['shopee','Shopee','shopee'],['amazon','Amazon','amazon']];

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_busca:f('busca').value.trim()||null,
    p_status:f('status').value||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      (r||[]).forEach(o=>{ if(o.tipo==='tipo_sku')addOpt('tipo',o.valor); });
    }catch(e){}
  }
  function addOpt(id,v){ const o=document.createElement('option'); o.value=v;o.textContent=v; f(id).appendChild(o); }

  async function carregar(reset){ if(reset)PAGINA=0;
    f('tbody').innerHTML='<tr><td colspan="26" class="loading">Carregando…</td></tr>';
    try{
      const [res,kpis]=await Promise.all([
        rpc('cn_listar_valores',{...filtros(),p_ordem:f('ordem').value||'sku',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_valores_kpis',{p_usuario_id:USER.id})
      ]);
      LINHAS=(res&&res.linhas)||[]; TOTAL=(res&&res.total)||0;
      renderKpis(kpis); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="26" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL);
    f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`;
    f('paginfo').textContent=`Página ${p} de ${tp}`;
    f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
  }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const n=(x)=>Number(x||0).toLocaleString('pt-BR');
    box.innerHTML=
      `<div class="kpi"><div class="lbl">Produtos</div><div class="val">${n(k.total)}</div></div>`+
      `<div class="kpi kpi-click" onclick="VAL.filtrarStatus('sem_valores')"><div class="lbl">Valores incompletos</div><div class="val">${n(k.sem_valores)}</div></div>`+
      `<div class="kpi kpi-click" onclick="VAL.filtrarStatus('pendentes')"><div class="lbl">Pendências de conferência</div><div class="val">${n(k.fora)}</div></div>`+
      `<div class="kpi"><div class="lbl">Conformidade</div><div class="val">${Number(k.pct_conforme||0).toLocaleString('pt-BR')}%</div></div>`;
  }
  function filtrarStatus(s){ f('status').value=s; carregar(true); }

  function moeda(v){ return (v==null) ? '<span style="color:var(--muted)">—</span>' : brl(Number(v)); }

  // célula de um canal = 4 colunas: Padrão | Mínimo | Fora | Conf.
  // Padrão e Mínimo têm o valor + botão (✎ se preenchido, + se vazio).
  function celCanal(l, ck, clog){
    const c=(l.canais&&l.canais[ck])||{};
    const podeEditar=temPermissao('valores.editar');
    const podeConf=temPermissao('valores.conferir');
    const temPadrao = c.padrao!=null, temMin = c.min!=null;
    const temAmbos = temPadrao && temMin;
    const btn = podeEditar
      ? `<button class="mini" onclick="event.stopPropagation();VAL.editar('${l.sku.replace(/'/g,"\\'")}','${clog}')">${temAmbos?'✎':'+'}</button>`
      : '';
    const fora=(Number(c.abaixo||0)+Number(c.acima||0));
    const pend = fora>0;
    // coluna Padrão (com o botão de editar do canal)
    const celPadrao = `<td class="frt-cel ${pend?'frt-pend':''} val-grp-start">${moeda(c.padrao)} ${btn}</td>`;
    const celMin    = `<td class="num ${pend?'frt-pend':''}">${moeda(c.min)}</td>`;
    // Fora
    let foraTxt='<span style="color:var(--muted)">—</span>';
    if(temAmbos){
      if(fora<=0) foraTxt='0';
      else{ const p=[]; if(c.abaixo>0)p.push(c.abaixo+'↓'); if(c.acima>0)p.push(c.acima+'↑'); foraTxt='<b style="color:var(--danger)">'+p.join(' ')+'</b>'; }
    }
    const celFora = `<td class="num ${pend?'frt-pend':''}">${foraTxt}</td>`;
    // Conf. (checkbox, só quando o canal tem os dois valores)
    let conf='<span style="color:var(--muted)">—</span>';
    if(temAmbos && podeConf){
      conf=`<input type="checkbox" class="frt-chk" ${pend?'':'checked'} `+
           `onclick="event.stopPropagation();VAL.conferir(this,'${l.sku.replace(/'/g,"\\'")}','${clog}',${pend})">`;
    }
    const celConf = `<td class="frt-conf ${pend?'frt-pend':''}">${conf}</td>`;
    return celPadrao+celMin+celFora+celConf;
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="26" class="empty">Nenhum produto encontrado.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>{
      const inc = l.sem_valores ? ' <span class="pill" style="border-color:var(--warn);color:var(--warn)">incompleto</span>' : '';
      return `<tr class="${l.pendente?'pendente':''}">`+
        `<td><span class="pill">${l.tipo||'—'}</span></td>`+
        `<td><b>${l.sku}</b>${inc}</td>`+
        `<td class="num">${l.qtd??'—'}</td>`+
        `<td>${l.un||'—'}</td>`+
        `<td>${l.descricao||'—'}</td>`+
        CANAIS.map(([ck,,clog])=>celCanal(l,ck,clog)).join('')+
      `</tr>`;
    }).join('');
  }

  // ---- editar Padrão + Mínimo de um SKU+canal (drawer pequeno) ----
  function editar(sku, clog){
    if(!temPermissao('valores.editar')) return;
    const l=LINHAS.find(x=>x.sku===sku); if(!l) return;
    const ck=(CANAIS.find(x=>x[2]===clog)||[])[0];
    const rot=(CANAIS.find(x=>x[2]===clog)||[])[1]||clog;
    const c=(l.canais&&l.canais[ck])||{};
    EDIT={sku, canal:clog, rotulo:rot};
    f('d-erro').textContent='';
    f('d-info').innerHTML=`<b>${sku}</b> · ${rot}`;
    f('d-padrao').value = (c.padrao!=null) ? String(c.padrao).replace('.',',') : '';
    f('d-min').value    = (c.min!=null)    ? String(c.min).replace('.',',')    : '';
    $('val-overlay').classList.add('open'); $('val-drawer').classList.add('open');
    setTimeout(()=>f('d-padrao').focus(),50);
  }
  function fecharDrawer(){ EDIT=null; $('val-drawer').classList.remove('open'); $('val-overlay').classList.remove('open'); }

  function parseVal(str){ str=String(str||'').trim(); if(str==='') return null;
    str=str.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.');
    const n=Number(str); return Number.isFinite(n)?n:null; }

  // Salva SÓ o canal em edição. Como cn_salvar_valores recebe TODOS os canais,
  // reenvia os demais com os valores atuais da linha (inalterados) e troca só este.
  async function salvar(){
    if(!EDIT) return;
    const l=LINHAS.find(x=>x.sku===EDIT.sku); if(!l){ fecharDrawer(); return; }
    const padrao=parseVal(f('d-padrao').value);
    const min=parseVal(f('d-min').value);
    if(padrao!=null && padrao<0){ f('d-erro').textContent='O valor padrão não pode ser negativo.'; return; }
    if(min!=null && min<0){ f('d-erro').textContent='O valor mínimo não pode ser negativo.'; return; }
    if(padrao!=null && min!=null && min>padrao){ f('d-erro').textContent='O mínimo (promoção) não pode ser maior que o valor padrão.'; return; }
    // monta o payload com todos os canais: mantém os outros, troca o editado
    const g=(ck,campo)=>{ const c=(l.canais&&l.canais[ck])||{}; return c[campo]!=null?c[campo]:null; };
    const map={site:'site',ml_classico:'mlc',ml_premium:'mlp',shopee:'shopee',amazon:'amazon'};
    const cur={}; // sufixo -> {venda,min}
    for(const ck of ['site','mlc','mlp','shopee','amazon']){ cur[ck]={venda:g(ck,'padrao'),min:g(ck,'min')}; }
    const ckEdit=map[EDIT.canal];
    cur[ckEdit]={venda:padrao, min:min};
    const payload={
      p_usuario_id:USER.id, p_sku:EDIT.sku,
      p_site_venda:cur.site.venda,     p_site_min:cur.site.min,
      p_mlc_venda:cur.mlc.venda,       p_mlc_min:cur.mlc.min,
      p_mlp_venda:cur.mlp.venda,       p_mlp_min:cur.mlp.min,
      p_shopee_venda:cur.shopee.venda, p_shopee_min:cur.shopee.min,
      p_amazon_venda:cur.amazon.venda, p_amazon_min:cur.amazon.min
    };
    const b=f('d-save'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      await rpc('cn_salvar_valores',payload);
      fecharDrawer(); carregar(); f('msg').textContent='Valores atualizados (ciclo do canal reiniciado).';
    }catch(e){ f('d-erro').textContent='Erro: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // ---- conferência por canal (checkbox, igual à frete) ----
  async function conferir(el, sku, canal, estavaPendente){
    if(!temPermissao('valores.conferir')){ el.checked=!el.checked; return; }
    if(!estavaPendente){ el.checked=true; return; }   // estava OK: desmarcar não faz nada
    el.disabled=true;
    try{
      await rpc('cn_conferir_valores',{p_usuario_id:USER.id, p_sku:sku, p_canal:canal});
      f('msg').textContent='Conferido — contagem reiniciada.';
      carregar();
    }catch(e){ el.checked=false; el.disabled=false; alert('Não foi possível conferir: '+(e.message||e)); }
  }

  function limparFiltros(){ f('tipo').value=''; f('busca').value=''; f('status').value=''; f('ordem').value='sku'; carregar(true); }

  function bind(){
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('busca').addEventListener('keydown',e=>{ if(e.key==='Enter')carregar(true); });
    f('tipo').addEventListener('change',()=>carregar(true));
    f('status').addEventListener('change',()=>carregar(true));
    f('ordem').addEventListener('change',()=>carregar(true));
    f('limpar').addEventListener('click',limparFiltros);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){PAGINA--;carregar();} });
    f('next').addEventListener('click',()=>{ if((PAGINA+1)*POR<TOTAL){PAGINA++;carregar();} });
    f('d-save').addEventListener('click',salvar);
    f('d-cancel').addEventListener('click',fecharDrawer);
    f('d-padrao').addEventListener('keydown',e=>{ if(e.key==='Enter')salvar(); });
    f('d-min').addEventListener('keydown',e=>{ if(e.key==='Enter')salvar(); });
    $('val-overlay').addEventListener('click',fecharDrawer);
  }

  return { init, editar, filtrarStatus, conferir };
})();
window.VAL = VAL;
registrarTela('valores', VAL);
