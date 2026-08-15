// =====================================================================
// CARRINHOS_NET — TELA: Controle de Cancelamentos
// Espelha o Controle de Vendas (mesmas colunas/KPIs), com leitura +
// conferência (sem edição, sem sync — é alimentada pelo Atualizar/cron).
// Depende da base do index.html: $, rpc, USER, temPermissao,
// brl, pct, dataBr, mesLabel, registrarTela.
// =====================================================================
const CANC = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0; const POR=100;
  const f=(id)=>$('ca-'+id);

  function filtros(){ return { p_usuario_id:USER.id, p_mes:f('mes').value||null, p_canal:f('canal').value||null, p_busca:f('busca').value.trim()||null }; }

  async function init(){ await carregarFiltros(); carregar(); bind(); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_cancelamentos',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_cancelamentos',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="22" class="loading">Carregando cancelamentos…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_cancelamentos',{...fl,p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_cancelamentos',fl),
        rpc('cn_kpis_cancelamentos',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal})
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="22" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp; }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const cards=[
      ['Valor cancelado',brl(k.valor_cancelado)],
      ['Pedidos cancelados',Number(k.qtd_pedidos||0).toLocaleString('pt-BR')],
      ['Ticket médio',brl(k.ticket_medio)],
      ['Comissão',brl(k.total_comissao)],
      ['Faltam conferir',Number(k.faltam||0).toLocaleString('pt-BR')]
    ];
    box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
  }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="22" class="empty">Nenhum cancelamento encontrado.</td></tr>'; return; }
    const podeConf=temPermissao('cancelamentos.conferir');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}">
      <td>${dataBr(l.data_compra)}</td><td>${dataBr(l.data_venda)}</td><td>${l.canal||'—'}</td><td>${l.tipo_envio||'—'}</td><td>${l.id_pedido||'—'}</td><td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td class="num">${brl(l.valor_unitario)}</td><td class="num">${brl(l.valor_total)}</td><td class="num">${brl(l.valor_comissao)}</td><td class="num">${pct(l.pct_comissao_ml)}</td><td>${l.tipo_anuncio||'—'}</td>
      <td class="num">${brl(l.frete)}</td><td class="num">${brl(l.frete_aguardado)}</td><td class="num">${brl(l.diferenca_frete)}</td><td class="num">${brl(l.frete_extra)}</td>
      <td class="num">${brl(l.valor_total_nf)}</td><td class="num">${brl(l.valor_a_receber)}</td><td class="num">${pct(l.lucro_bruto_pct)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="CANC.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){ elem.disabled=true; try{ await rpc('cn_marcar_conferido_cancelamento',{p_usuario_id:USER.id,p_cancelamento_id:id,p_conferido:valor}); const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente'; if(typeof atualizarBadges==='function') atualizarBadges(); }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); } finally{ elem.disabled=false; } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_cancelamentos',{...fl,p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['data_compra','data_venda','data_bling','canal','tipo_envio','id_pedido','modelo','quantidade','cliente','uf','valor_unitario','valor_total','valor_comissao','pct_comissao_ml','tipo_anuncio','frete','frete_aguardado','diferenca_frete','frete_extra','valor_total_nf','valor_a_receber','lucro_bruto_pct','conferido']; const head=['Data cancelamento','Data venda','Data Bling','Canal','Envio','ID Pedido','SKU','Qtd','Cliente','UF','Valor Unitario','Valor Total','Comissao','% Comissao','Anuncio','Frete','Frete Aguardado','Dif Frete','Frete Extra','Total NF','A Receber','Lucro %','Conferido']; const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cancelamentos_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  // busca 180 dias de cancelados (reconciliação) sob demanda
  async function buscar(){ const b=f('buscar'); if(b.disabled)return; b.disabled=true; const t=b.textContent;
    try{
      f('msg').textContent='Buscando cancelados (180 dias)…'; let g=0;
      while(true){ const r=await chamarFuncao('sync-bling',{dias:180,limite:200,modo:'cancelamentos'}); g++;
        if(r.restantes>0){ f('msg').textContent=`Buscando cancelados… (faltam ~${r.restantes})`; } else break;
        if(g>500) break;
      }
      f('msg').textContent='Processando cancelamentos…'; await rpc('cn_processar_cancelamentos',{p_usuario_id:USER.id});
      await carregar(true); f('msg').textContent='Cancelamentos atualizados '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ alert('Erro ao buscar cancelamentos: '+(e.message||e)); f('msg').textContent=''; }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('mes').addEventListener('change',()=>carregar(true)); f('canal').addEventListener('change',()=>carregar(true));
    f('exportar').addEventListener('click',exportar);
    const bb=f('buscar'); if(bb){ if(temPermissao('sync.executar')){ bb.addEventListener('click',buscar); } else { bb.style.display='none'; } }
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
  }

  return { init, conf };
})();
window.CANC = CANC;
registrarTela('cancelamentos', CANC);
