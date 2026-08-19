// =====================================================================
// CARRINHOS_NET — TELA: Cancelamentos e Devoluções (unificada)
// Lê da camada unificada (cn_listar_ocorrencias / cn_kpis_ocorrencias),
// que faz UNION de cancelamentos + devolucoes. NÃO altera dados: as
// tabelas e a ingestão continuam iguais. Conferência/edição/lançamento
// continuam usando as funções específicas de cada origem.
// Depende da base do index.html: $, rpc, chamarFuncao, USER, temPermissao,
// brl, dataBr, mesLabel, registrarTela, atualizarBadges.
// =====================================================================
const OC = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let STATUS_OPC=[];
  const f=(id)=>$('oc-'+id);

  function filtros(){ return { p_usuario_id:USER.id, p_mes:f('mes').value||null, p_canal:f('canal').value||null, p_tipo:f('tipo').value||null, p_busca:f('busca').value.trim()||null }; }

  async function init(){ await carregarOpcoes(); await carregarFiltros(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes',{p_usuario_id:USER.id,p_tipo:'status_devolucao'}); STATUS_OPC=(r||[]).map(o=>o.valor); }catch(e){ STATUS_OPC=[]; }
  }
  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_ocorrencias',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_ocorrencias',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="16" class="loading">Carregando…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_ocorrencias',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_ocorrencias',fl),
        rpc('cn_kpis_ocorrencias',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal,p_tipo:fl.p_tipo})
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="16" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp; }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const cards=[
      ['Total de ocorrências',Number(k.total||0).toLocaleString('pt-BR')],
      ['Cancelamentos',Number(k.qtd_cancelamentos||0).toLocaleString('pt-BR')],
      ['Devoluções',Number(k.qtd_devolucoes||0).toLocaleString('pt-BR')],
      ['Valor cancelado',brl(k.valor_cancelado)],
      ['Custo devolução',brl(k.soma_custo_devolucao)],
      ['Custo prejuízo',brl(k.soma_prejuizo)],
      ['Faltam conferir',Number(k.faltam||0).toLocaleString('pt-BR')]
    ];
    box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
  }

  function tipoPill(t){ const dev=t==='Devolução'; return `<span class="pill" style="background:${dev?'rgba(245,158,11,.15)':'rgba(239,68,68,.15)'};color:${dev?'#f59e0b':'#ef4444'}">${t}</span>`; }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="16" class="empty">Nenhuma ocorrência encontrada.</td></tr>'; return; }
    const podeConfCanc=temPermissao('cancelamentos.conferir'), podeConfDev=temPermissao('devolucoes.conferir');
    tb.innerHTML=LINHAS.map((l,ix)=>{ const podeConf=l.tipo==='Devolução'?podeConfDev:podeConfCanc; const editavel=l.tipo==='Devolução'&&temPermissao('devolucoes.editar');
      return `<tr class="${l.conferido?'':'pendente'}"${editavel?` style="cursor:pointer" onclick="OC.abrir(${ix})"`:''}>
      <td>${tipoPill(l.tipo)}</td><td>${dataBr(l.data_ref)}</td><td>${mesLabel(l.mes_ref)||'—'}</td><td>${l.canal||'—'}</td><td>${l.id_pedido||'—'}</td><td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td class="num">${brl(l.valor)}</td><td>${l.detalhe||'—'}</td><td>${l.status?`<span class="pill">${l.status}</span>`:'—'}</td>
      <td class="num">${brl(l.custo_devolucao)}</td><td class="num">${brl(l.custo_prejuizo)}</td><td>${dataBr(l.data_venda)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="OC.conf(${ix},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`; }).join('');
  }

  async function conf(ix,valor,elem){ const l=LINHAS[ix]; if(!l)return; elem.disabled=true;
    try{
      if(l.tipo==='Devolução') await rpc('cn_marcar_conferido_devolucao',{p_usuario_id:USER.id,p_devolucao_id:l.origem_id,p_conferido:valor});
      else                     await rpc('cn_marcar_conferido_cancelamento',{p_usuario_id:USER.id,p_cancelamento_id:l.origem_id,p_conferido:valor});
      l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente';
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); } finally{ elem.disabled=false; } }

  // ===== edição (só devoluções) =====
  function fillStatusSel(atual){ const sel=f('e-status'); sel.innerHTML='<option value="">—</option>'; const opts=[...STATUS_OPC]; if(atual&&!opts.includes(atual))opts.unshift(atual); opts.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; if(v===atual)o.selected=true; sel.appendChild(o); }); sel.value=atual||''; }

  function abrir(ix){ const l=LINHAS[ix]; if(!l||l.tipo!=='Devolução')return; if(!temPermissao('devolucoes.editar'))return; EDIT_ID=l.origem_id; f('drawer-erro').textContent='';
    f('e-dvenda').value=dataBr(l.data_venda); f('e-canal').value=l.canal||''; f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||''; f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    f('e-chegada').value=l.data_ref||''; f('e-tipo').value=l.detalhe||''; fillStatusSel(l.status); f('e-motivo').value=l.motivo||'';
    f('e-valornf').value=l.valor??''; f('e-numnf').value=l.numero_nf||''; f('e-nfd').value=l.nfd||'';
    f('e-custodev').value=l.custo_devolucao??''; f('e-custoprej').value=l.custo_prejuizo??''; f('e-incluidas').value=l.incluidas||''; f('e-obs').value=l.observacoes||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }
  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...'; const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{ await rpc('cn_editar_devolucao',{p_usuario_id:USER.id,p_devolucao_id:EDIT_ID,p_data_chegada:f('e-chegada').value||null,p_tipo_devolucao:f('e-tipo').value||null,p_motivo:f('e-motivo').value||null,p_status:f('e-status').value||null,p_valor_nf:num('e-valornf'),p_numero_nf:f('e-numnf').value||null,p_nfd:f('e-nfd').value||null,p_custo_devolucao:num('e-custodev'),p_custo_prejuizo:num('e-custoprej'),p_incluidas:f('e-incluidas').value||null,p_observacoes:f('e-obs').value||null}); fechar(); carregar(); if(typeof atualizarBadges==='function') atualizarBadges(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }

  // ===== lançamento manual de devolução =====
  function abrirModal(){ if(!temPermissao('devolucoes.lancar')){ alert('Você não tem permissão para lançar devoluções.'); return; } f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent=''; f('modal').classList.add('open'); f('m-busca').focus(); }
  function fecharModal(){ f('modal').classList.remove('open'); }
  async function buscarVendas(){ const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; } try{ const r=await rpc('cn_buscar_vendas_sem_devolucao',{p_usuario_id:USER.id,p_busca:busca,p_limite:30}); if(!r||!r.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já está em Devoluções).</p>'; return; } f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID</th><th>SKU</th><th>Cliente</th><th></th></tr></thead><tbody>'+r.map(v=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.modelo||'—'}</td><td>${v.cliente||'—'}</td><td><button onclick="OC.lancar(${v.venda_id})">Lançar</button></td></tr>`).join('')+'</tbody></table>'; }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); } }
  async function lancar(vendaId){ f('m-erro').textContent=''; try{ await rpc('cn_lancar_devolucao_manual',{p_usuario_id:USER.id,p_venda_id:vendaId}); fecharModal(); await carregar(true); if(typeof atualizarBadges==='function') atualizarBadges(); f('msg').textContent='Devolução lançada.'; }catch(e){ f('m-erro').textContent=(e.message||e); } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_ocorrencias',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['tipo','data_ref','mes_ref','canal','id_pedido','modelo','quantidade','cliente','uf','valor','detalhe','status','custo_devolucao','custo_prejuizo','numero_nf','motivo','nfd','incluidas','data_venda','observacoes','conferido']; const head=['Tipo','Data','Mes','Canal','ID Pedido','SKU','Qtd','Cliente','UF','Valor','Detalhe','Status','Custo Devolucao','Custo Prejuizo','N NF','Motivo','NFD','Incluidas','Data Venda','Observacoes','Conferido']; const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cancelamentos_devolucoes_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  // ===== buscar (reconciliação): roda cancelamentos E devoluções =====
  async function buscar(){ const b=f('buscar'); if(b.disabled)return; b.disabled=true; const t=b.textContent;
    try{
      // 1) cancelados do Bling (180d)
      f('msg').textContent='Buscando cancelados (180 dias)…'; let g=0;
      while(true){ const r=await chamarFuncao('sync-bling',{dias:180,limite:200,modo:'cancelamentos'}); g++;
        if(r.restantes>0){ f('msg').textContent=`Buscando cancelados… (faltam ~${r.restantes})`; } else break;
        if(g>500) break; }
      f('msg').textContent='Processando cancelamentos…'; await rpc('cn_processar_cancelamentos',{p_usuario_id:USER.id});
      // 2) devoluções do Mercado Livre (180d)
      f('msg').textContent='Buscando devoluções no Mercado Livre…'; g=0;
      while(true){ const r=await chamarFuncao('sync-devolucoes',{dias:180,limite:5}); g++;
        if(r.restantes>0){ f('msg').textContent=`Buscando devoluções… (faltam ~${r.restantes})`; } else break;
        if(g>800) break; }
      f('msg').textContent='Processando devoluções…'; await rpc('cn_processar_devolucoes',{p_usuario_id:USER.id});
      await carregar(true); if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ alert('Erro ao buscar: '+(e.message||e)); f('msg').textContent=''; }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('mes').addEventListener('change',()=>carregar(true)); f('canal').addEventListener('change',()=>carregar(true)); f('tipo').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('lancar').addEventListener('click',abrirModal); f('exportar').addEventListener('click',exportar);
    const bx=f('buscar'); if(bx){ if(temPermissao('sync.executar')){ bx.addEventListener('click',buscar); } else { bx.style.display='none'; } }
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal); let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar };
})();
window.OC = OC;
registrarTela('ocorrencias', OC);
