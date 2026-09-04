// =====================================================================
// CARRINHOS_NET — TELA: Controle de Reclamações
// Depende da base do index.html: $, rpc, chamarFuncao, USER, temPermissao,
// dataBr, mesLabel, registrarTela, atualizarBadges.
// =====================================================================
const REC = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let STATUS_OPC=[];
  const f=(id)=>$('rc-'+id);

  function filtros(){ return { p_usuario_id:USER.id, p_mes:f('mes').value||null, p_canal:f('canal').value||null, p_status:f('status').value||null, p_busca:f('busca').value.trim()||null }; }

  async function init(){ if(typeof carregarUltimaAuto==='function') await carregarUltimaAuto(); await carregarOpcoes(); await carregarFiltros(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes',{p_usuario_id:USER.id,p_tipo:'status_reclamacao'}); STATUS_OPC=(r||[]).map(o=>o.valor); }catch(e){ STATUS_OPC=[]; }
    STATUS_OPC.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; f('status').appendChild(o); });
  }
  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_reclamacoes',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_reclamacoes',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="14" class="loading">Carregando reclamações…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_reclamacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_reclamacoes',fl),
        rpc('cn_kpis_reclamacoes',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal,p_status:fl.p_status})
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      msgAtualizado('rc-msg','reclamacoes');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="14" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('rc',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const cards=[
      ['Total de reclamações',Number(k.total||0).toLocaleString('pt-BR')],
      ['Faltam conferir',Number(k.faltam||0).toLocaleString('pt-BR')],
      ['Resolvidas',Number(k.resolvidas||0).toLocaleString('pt-BR')],
      ['Em aberto',Number(k.em_aberto||0).toLocaleString('pt-BR')]
    ];
    box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
  }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="14" class="empty">Nenhuma reclamação encontrada.</td></tr>'; return; }
    const podeConf=temPermissao('reclamacoes.conferir');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}" onclick="REC.abrir(${l.id})">
      <td>${dataBr(l.data_abertura)}</td><td>${mesLabel(l.mes)||'—'}</td><td>${l.canal||'—'}</td><td>${celPedido(l.id_pedido)}</td><td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td>${l.numero_nf||'—'}</td><td>${l.motivo||'—'}</td><td><span class="pill">${l.status||'—'}</span></td><td>${dataBr(l.data_resolucao)}</td><td>${dataBr(l.data_venda)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="REC.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){ elem.disabled=true; try{ await rpc('cn_marcar_conferido_reclamacao',{p_usuario_id:USER.id,p_reclamacao_id:id,p_conferido:valor}); const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente'; if(typeof atualizarBadges==='function') atualizarBadges(); }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); } finally{ elem.disabled=false; } }

  function fillStatusSel(atual){ const sel=f('e-status'); sel.innerHTML='<option value="">—</option>'; const opts=[...STATUS_OPC]; if(atual&&!opts.includes(atual))opts.unshift(atual); opts.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; if(v===atual)o.selected=true; sel.appendChild(o); }); sel.value=atual||''; }

  function abrir(id){ if(!temPermissao('reclamacoes.editar'))return; const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-dvenda').value=dataBr(l.data_venda); f('e-canal').value=l.canal||''; f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||''; f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    f('e-abertura').value=l.data_abertura||''; fillStatusSel(l.status); f('e-motivo').value=l.motivo||''; f('e-resolucao').value=l.data_resolucao||''; f('e-numnf').value=l.numero_nf||''; f('e-obs').value=l.observacoes||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }
  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    try{ await rpc('cn_editar_reclamacao',{p_usuario_id:USER.id,p_reclamacao_id:EDIT_ID,p_data_abertura:f('e-abertura').value||null,p_motivo:f('e-motivo').value||null,p_status:f('e-status').value||null,p_data_resolucao:f('e-resolucao').value||null,p_numero_nf:f('e-numnf').value||null,p_observacoes:f('e-obs').value||null}); fechar(); carregar(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }

  // modal manual
  function abrirModal(){ if(!temPermissao('reclamacoes.lancar')){ alert('Você não tem permissão para lançar reclamações.'); return; } f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent=''; f('modal').classList.add('open'); f('m-busca').focus(); }
  function fecharModal(){ f('modal').classList.remove('open'); }
  async function buscarVendas(){ const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; } try{ const r=await rpc('cn_buscar_vendas_sem_reclamacao',{p_usuario_id:USER.id,p_busca:busca,p_limite:30}); if(!r||!r.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já está em Reclamações).</p>'; return; } f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID</th><th>SKU</th><th>Cliente</th><th></th></tr></thead><tbody>'+r.map(v=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.modelo||'—'}</td><td>${v.cliente||'—'}</td><td><button onclick="REC.lancar(${v.venda_id})">Lançar</button></td></tr>`).join('')+'</tbody></table>'; }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); } }
  async function lancar(vendaId){ f('m-erro').textContent=''; try{ await rpc('cn_lancar_reclamacao_manual',{p_usuario_id:USER.id,p_venda_id:vendaId}); fecharModal(); await carregar(true); if(typeof atualizarBadges==='function') atualizarBadges(); f('msg').textContent='Reclamação lançada.'; }catch(e){ f('m-erro').textContent=(e.message||e); } }

  // busca automática (ML) sob demanda
  async function buscar(){ const b=f('buscar'); if(b.disabled)return; b.disabled=true; const t=b.textContent;
    try{ f('msg').textContent='Buscando reclamações no Mercado Livre…'; let g=0;
      while(true){ const r=await chamarFuncao('sync-reclamacoes',{dias:180,limite:5}); g++; if(r.restantes>0){ f('msg').textContent=`Buscando reclamações… (faltam ~${r.restantes})`; } else break; if(g>800) break; }
      f('msg').textContent='Processando reclamações…'; await rpc('cn_processar_reclamacoes',{p_usuario_id:USER.id});
      await carregar(true); if(typeof atualizarBadges==='function') atualizarBadges(); f('msg').textContent='Reclamações atualizadas '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ alert('Erro ao buscar reclamações: '+(e.message||e)); f('msg').textContent=''; } finally{ b.disabled=false; b.textContent=t; } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_reclamacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['data_abertura','mes','canal','tipo_envio','id_pedido','modelo','quantidade','cliente','uf','numero_nf','motivo','status','data_resolucao','data_venda','observacoes','origem_lancamento','conferido']; const head=['Data Abertura','Mes','Canal','Envio','ID Pedido','SKU','Qtd','Cliente','UF','N NF','Motivo','Status','Data Resolucao','Data Venda','Observacoes','Origem','Conferido']; const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='reclamacoes_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('mes').addEventListener('change',()=>carregar(true)); f('canal').addEventListener('change',()=>carregar(true)); f('status').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    const bx=f('buscar'); if(bx){ if(temPermissao('sync.executar')){ bx.addEventListener('click',buscar); } else { bx.style.display='none'; } }
    f('lancar').addEventListener('click',abrirModal); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal); let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar };
})();
window.REC = REC;
registrarTela('reclamacoes', REC);
