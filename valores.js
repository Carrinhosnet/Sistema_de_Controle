// =====================================================================
// CARRINHOS_NET — TELA: Controle de Valores
// Valores de venda por canal (Site, ML Clássico, ML Premium, Shopee,
// Amazon), cada um com valor PADRÃO + valor MÍNIMO (promoção). Além do
// cadastro manual, controla vendas fora do intervalo [mínimo, padrão]:
// conta dentro/abaixo/acima, gera notificações e permite conferir
// (zera o ciclo), no mesmo espírito da tela de Custo de Frete.
// Colunas de identificação fixas à esquerda; cabeçalho de 2 níveis.
// Depende da base do index.html: $, rpc, USER, temPermissao, brl,
// registrarTela, atualizarBadges.
// =====================================================================
const VAL = (function(){
  let LINHAS=[], TOTAL=0, PAGINA=0; const POR=100;
  let EDIT=null;   // sku em edição
  const f=(id)=>$('val-'+id);
  // canais: [chave_json, rótulo]. chave_json bate com o objeto retornado pelo SQL.
  const CANAIS=[['site','Site'],['mlc','ML Clássico'],['mlp','ML Premium'],['shopee','Shopee'],['amazon','Amazon']];

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_busca:f('busca').value.trim()||null,
    p_status:f('status').value||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      const tipos=[];
      (r||[]).forEach(o=>{ if(o.tipo==='tipo_sku')tipos.push(o.valor); });
      tipos.forEach(v=>addOpt('tipo',v));
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
      `<div class="kpi kpi-click" onclick="VAL.filtrarStatus('sem_valores')"><div class="lbl">Sem valores</div><div class="val">${n(k.sem_valores)}</div></div>`+
      `<div class="kpi"><div class="lbl">Vendas analisadas</div><div class="val">${n(k.analisadas)}</div></div>`+
      `<div class="kpi kpi-click" onclick="VAL.filtrarStatus('pendentes')"><div class="lbl">Vendas fora do padrão</div><div class="val">${n(k.fora)}</div></div>`+
      `<div class="kpi"><div class="lbl">Conformidade</div><div class="val">${Number(k.pct_conforme||0).toLocaleString('pt-BR')}%</div></div>`;
  }
  function filtrarStatus(s){ f('status').value=s; carregar(true); }

  // número -> "R$ 0,00" ou travessão
  function moeda(v){ if(v==null||v==='') return '<span class="val-vazio">—</span>'; return brl(Number(v)); }

  // célula de "fora" do canal: mostra abaixo+acima com destaque se >0
  function celFora(c){
    const fora=(Number(c.abaixo||0)+Number(c.acima||0));
    if(fora<=0) return '<span class="val-vazio">0</span>';
    const partes=[];
    if(Number(c.abaixo||0)>0) partes.push(`${c.abaixo}↓`);
    if(Number(c.acima||0)>0)  partes.push(`${c.acima}↑`);
    return `<b class="val-fora">${partes.join(' ')}</b>`;
  }

  function renderTabela(){
    if(!LINHAS.length){ f('tbody').innerHTML='<tr><td colspan="26" class="empty">Nenhum produto encontrado.</td></tr>'; return; }
    const podeConf=temPermissao('valores.conferir');
    const podeEditar=temPermissao('valores.editar');
    let html='';
    for(const l of LINHAS){
      const ch=l.canais||{};
      const semTag = l.sem_valores ? '<span class="val-badge-sem">sem valores</span>' : '';
      let cels='';
      for(const [ck,] of CANAIS){
        const c=ch[ck]||{};
        const temValores = (c.padrao!=null && c.min!=null);
        const fora=(Number(c.abaixo||0)+Number(c.acima||0));
        // Padrão | Mínimo | Fora | Conf
        cels+=
          `<td class="num val-grp-start">${moeda(c.padrao)}</td>`+
          `<td class="num">${moeda(c.min)}</td>`+
          `<td class="num val-cfora">${celFora(c)}</td>`+
          `<td class="val-conf">`+
            (temValores && podeConf
              ? `<input type="checkbox" class="val-chk" ${fora===0?'checked':''} onclick="VAL.conferir(event,'${l.sku}',${fora})">`
              : '<span class="val-vazio">—</span>')+
          `</td>`;
      }
      html+=`<tr>`+
        `<td class="val-fix val-fix1">${l.tipo||'—'}</td>`+
        `<td class="val-fix val-fix2"><b>${l.sku}</b> ${semTag}</td>`+
        `<td class="val-fix val-fix3 num">${l.qtd??'—'}</td>`+
        `<td class="val-fix val-fix4">${l.un||'—'}</td>`+
        `<td class="val-fix val-fix5" title="${(l.descricao||'').replace(/"/g,'&quot;')}">${l.descricao||'—'}</td>`+
        cels+
        `<td class="val-fix-r">${podeEditar?`<button class="act" onclick="VAL.editar('${l.sku}')">Editar</button>`:''}</td>`+
      `</tr>`;
    }
    f('tbody').innerHTML=html;
  }

  // conferir: marca o SKU como conferido (zera ciclo). Só age quando havia pendência.
  async function conferir(ev, sku, foraAtual){
    const el=ev.target;
    if(foraAtual===0){ el.checked=true; return; }   // já estava OK: não faz nada
    el.disabled=true;
    try{
      await rpc('cn_conferir_valores',{p_usuario_id:USER.id, p_sku:sku});
      carregar();
    }catch(e){ el.checked=false; el.disabled=false; alert('Erro ao conferir: '+(e.message||e)); }
  }

  // ------- edição via drawer -------
  function editar(sku){
    const l=LINHAS.find(x=>x.sku===sku); if(!l) return;
    EDIT=sku; const ch=l.canais||{};
    f('ed-titulo').textContent=`Valores — ${l.sku}`;
    f('ed-sub').textContent=(l.descricao||'');
    const set=(id,val)=>{ f(id).value = (val==null||val==='') ? '' : String(val).replace('.',','); };
    // preenche a partir de canais.<c>.padrao / .min
    const g=(ck)=>ch[ck]||{};
    set('site_venda',g('site').padrao);   set('site_min',g('site').min);
    set('mlc_venda',g('mlc').padrao);     set('mlc_min',g('mlc').min);
    set('mlp_venda',g('mlp').padrao);     set('mlp_min',g('mlp').min);
    set('shopee_venda',g('shopee').padrao); set('shopee_min',g('shopee').min);
    set('amazon_venda',g('amazon').padrao); set('amazon_min',g('amazon').min);
    f('ed-erro').textContent='';
    $('val-drawer').classList.add('open'); $('val-overlay').classList.add('open');
  }
  function fecharDrawer(){ EDIT=null; $('val-drawer').classList.remove('open'); $('val-overlay').classList.remove('open'); }

  // "1.234,56" | "1234,56" | "1234.56" -> número; vazio -> null
  function parseVal(str){ str=String(str||'').trim(); if(str==='') return null;
    str=str.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.');
    const n=Number(str); return Number.isFinite(n)?n:null; }

  async function salvar(){
    if(!EDIT) return;
    const g=(id)=>parseVal(f(id).value);
    const payload={
      p_usuario_id:USER.id, p_sku:EDIT,
      p_site_venda:g('site_venda'),   p_site_min:g('site_min'),
      p_mlc_venda:g('mlc_venda'),     p_mlc_min:g('mlc_min'),
      p_mlp_venda:g('mlp_venda'),     p_mlp_min:g('mlp_min'),
      p_shopee_venda:g('shopee_venda'), p_shopee_min:g('shopee_min'),
      p_amazon_venda:g('amazon_venda'), p_amazon_min:g('amazon_min')
    };
    for(const k in payload){ if(k.startsWith('p_') && typeof payload[k]==='number' && payload[k]<0){ f('ed-erro').textContent='Valores não podem ser negativos.'; return; } }
    // aviso leve: mínimo > padrão no mesmo canal
    const chk=[['site'],['mlc'],['mlp'],['shopee'],['amazon']];
    for(const [c] of chk){ const pv=payload['p_'+c+'_venda'], pm=payload['p_'+c+'_min'];
      if(pv!=null && pm!=null && pm>pv){ f('ed-erro').textContent=`No canal ${c.toUpperCase()}, o mínimo (promoção) está maior que o valor padrão. Verifique.`; return; } }
    const b=f('ed-salvar'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      await rpc('cn_salvar_valores',payload);
      fecharDrawer(); carregar();
    }catch(e){ f('ed-erro').textContent='Erro: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // ------- painel de notificações (ocorrências) -------
  async function abrirNotif(sku){
    $('val-notif-overlay').classList.add('open'); $('val-notif').classList.add('open');
    f('notif-corpo').innerHTML='<p class="val-vazio">Carregando…</p>';
    f('notif-titulo').textContent = sku ? `Vendas fora do padrão — ${sku}` : 'Vendas fora do padrão';
    try{
      const oc=await rpc('cn_valores_ocorrencias',{p_usuario_id:USER.id, p_sku:sku||null, p_limite:200});
      renderNotif(oc||[]);
    }catch(e){ f('notif-corpo').innerHTML='<p class="val-fora">Erro: '+(e.message||e)+'</p>'; }
  }
  function fecharNotif(){ $('val-notif-overlay').classList.remove('open'); $('val-notif').classList.remove('open'); }
  function renderNotif(oc){
    if(!oc.length){ f('notif-corpo').innerHTML='<p class="val-vazio">Nenhuma venda fora do padrão no ciclo atual. 🎉</p>'; return; }
    let html='';
    for(const o of oc){
      const dt=o.data? new Date(o.data+'T00:00:00').toLocaleDateString('pt-BR') : '—';
      const abaixo=o.tipo==='abaixo';
      const faixa=`${brl(o.min)} a ${brl(o.padrao)}`;
      const frase=abaixo
        ? `Vendido por <b>${brl(o.valor)}</b> — <b class="val-fora">${brl(o.diferenca)} abaixo do mínimo</b>.`
        : `Vendido por <b>${brl(o.valor)}</b> — <b class="val-fora">${brl(o.diferenca)} acima do padrão</b>.`;
      html+=`<div class="val-notif-item ${abaixo?'nabaixo':'nacima'}">`+
        `<div class="val-notif-h"><b>${o.sku}</b> · ${o.canal} <span class="val-notif-dt">${dt}${o.id_pedido?' · Pedido '+o.id_pedido:''}</span></div>`+
        `<div class="val-notif-desc">${o.descricao||''}</div>`+
        `<div>${frase} Intervalo permitido: ${faixa}.</div>`+
      `</div>`;
    }
    f('notif-corpo').innerHTML=html;
  }

  function limparFiltros(){ f('tipo').value=''; f('busca').value=''; f('status').value=''; f('ordem').value='sku'; carregar(true); }

  function bind(){
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('busca').addEventListener('keydown',e=>{ if(e.key==='Enter')carregar(true); });
    f('tipo').addEventListener('change',()=>carregar(true));
    f('status').addEventListener('change',()=>carregar(true));
    f('ordem').addEventListener('change',()=>carregar(true));
    f('limpar').addEventListener('click',limparFiltros);
    f('notificacoes').addEventListener('click',()=>abrirNotif(null));
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){PAGINA--;carregar();} });
    f('next').addEventListener('click',()=>{ if((PAGINA+1)*POR<TOTAL){PAGINA++;carregar();} });
    f('ed-salvar').addEventListener('click',salvar);
    f('ed-cancelar').addEventListener('click',fecharDrawer);
    $('val-overlay').addEventListener('click',fecharDrawer);
    $('val-notif-overlay').addEventListener('click',fecharNotif);
    f('notif-x').addEventListener('click',fecharNotif);
  }

  return { init, editar, filtrarStatus, conferir, abrirNotif };
})();
window.VAL = VAL;
registrarTela('valores', VAL);
