// =====================================================================
// CARRINHOS_NET — TELA: Controle de Boletos
// Depende da base do index.html: $, rpc, USER, temPermissao,
// brl, dataBr, mesLabel, registrarTela, atualizarBadgeBoletos.
// =====================================================================
const BO = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let RESULTS=[], SELPED=null;   // seletor de lançamento
  const f=(id)=>$('bo-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_canal:f('canal').value||null,
    p_status:f('status').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarFiltros(); carregar(); bind(); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_boletos',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_boletos',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="12" class="loading">Carregando boletos…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_boletos',{...fl,p_ordem:f('ordem').value||'prioridade',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_boletos',fl),
        rpc('cn_kpis_boletos',fl)
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadgeBoletos==='function') atualizarBadgeBoletos();
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="12" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('bo',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const cards=[
      ['Total de boletos',Number(k.total||0).toLocaleString('pt-BR')],
      ['Aguardando Pagamento',brl(k.soma_aguardando)],
      ['Pago',brl(k.soma_pago)],
      ['Em Atraso',brl(k.soma_atraso)],
      ['Em Protesto',brl(k.soma_protesto)]
    ];
    box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
  }

  function getStatusClass(st){ switch((st||'').trim()){
    case 'Aguardando Pagamento': return 'bo-aguardando';
    case 'Pago': return 'bo-pago';
    case 'Pagamento Atrasado': return 'bo-atrasado';
    case 'Cobrança Realizada': return 'bo-cobranca';
    case 'Protestado': return 'bo-protestado';
    default: return ''; } }

  function acoesHtml(l){ if(!temPermissao('boletos.baixar')) return '—';
    const st=(l.status_efetivo||'').trim(); const btns=[];
    const B=(fn,txt,cls)=>`<button class="mini ${cls||''}" onclick="event.stopPropagation();BO.${fn}(${l.id})">${txt}</button>`;
    if(st==='Aguardando Pagamento'){ btns.push(B('pago','Pago','ok')); }
    else if(st==='Pagamento Atrasado'){ btns.push(B('pago','Pago','ok')); btns.push(B('cobranca','Cobrança')); btns.push(B('protestar','Protestar','dg')); }
    else if(st==='Cobrança Realizada'){ btns.push(B('pago','Pago','ok')); btns.push(B('protestar','Protestar','dg')); }
    else if(st==='Pago'){ btns.push(B('reabrir','Reabrir')); }
    else if(st==='Protestado'){ btns.push(B('reabrir','Reabrir')); }
    return btns.join(' '); }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="12" class="empty">Nenhum boleto encontrado.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>{ const cls=getStatusClass(l.status_efetivo);
      return `<tr class="${cls}" onclick="BO.abrir(${l.id})">
      <td>${dataBr(l.data_compra)}</td><td>${mesLabel(l.mes_vencimento)||'—'}</td><td>${l.canal||'—'}</td><td>${l.id_pedido||'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td class="num">${l.parcela}/${l.total_parcelas}</td><td class="num">${brl(l.valor)}</td><td>${dataBr(l.vencimento)}</td>
      <td><span class="pill">${l.status_efetivo||'—'}</span></td><td>${l.documento_boleto||'—'}</td>
      <td class="acoes" onclick="event.stopPropagation()">${acoesHtml(l)}</td>
    </tr>`; }).join(''); }

  // -------- ações de status --------
  async function acao(fn,id,args){ try{ await rpc(fn,{p_usuario_id:USER.id,p_boleto_id:id,...(args||{})}); await carregar(); }catch(e){ alert(e.message||e); } }
  function pago(id){ acao('cn_boleto_marcar_pago',id); }
  function cobranca(id){ acao('cn_boleto_registrar_cobranca',id); }
  function protestar(id){ if(confirm('Marcar este boleto como Protestado?')) acao('cn_boleto_marcar_protestado',id); }
  function reabrir(id){ if(confirm('Reabrir este boleto (volta para Aguardando Pagamento)?')) acao('cn_boleto_reabrir',id); }

  // -------- drawer de edição --------
  function abrir(id){ if(!temPermissao('boletos.editar'))return; const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-data').value=dataBr(l.data_compra); f('e-canal').value=l.canal||''; f('e-idped').value=l.id_pedido||''; f('e-cliente').value=l.cliente||''; f('e-parcela').value=`${l.parcela}/${l.total_parcelas}`;
    f('e-valor').value=l.valor??''; f('e-venc').value=l.vencimento||''; f('e-doc').value=l.documento_boleto||''; f('e-obs').value=l.observacao||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }
  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    try{ if(!f('e-venc').value) throw new Error('Informe o vencimento.');
      await rpc('cn_editar_boleto',{p_usuario_id:USER.id,p_boleto_id:EDIT_ID,p_valor:f('e-valor').value===''?null:Number(f('e-valor').value),p_vencimento:f('e-venc').value,p_documento:f('e-doc').value||null,p_observacao:f('e-obs').value||null});
      fechar(); carregar(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }

  // -------- modal de lançamento --------
  function abrirModal(){ if(!temPermissao('boletos.lancar')){ alert('Você não tem permissão para lançar boletos.'); return; }
    SELPED=null; RESULTS=[]; f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent=''; f('m-sel').style.display='none'; f('m-step1').style.display='block'; f('modal').classList.add('open'); f('m-busca').focus(); }
  function fecharModal(){ f('modal').classList.remove('open'); }

  async function buscarVendas(){ const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; }
    try{ const r=await rpc('cn_buscar_vendas_sem_boleto',{p_usuario_id:USER.id,p_busca:busca,p_limite:30}); RESULTS=r||[];
      if(!RESULTS.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já possui boletos).</p>'; return; }
      f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID Pedido</th><th>Cliente</th><th class="num">Valor</th><th></th></tr></thead><tbody>'+
        RESULTS.map((v,i)=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.cliente||'—'}</td><td class="num">${brl(v.valor_pedido)}</td><td><button onclick="BO.selecionar(${i})">Selecionar</button></td></tr>`).join('')+'</tbody></table>';
    }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); } }

  function selecionar(i){ const v=RESULTS[i]; if(!v)return; SELPED=v;
    f('m-step1').style.display='none'; f('m-sel').style.display='block'; f('m-erro2').textContent='';
    f('m-pedinfo').innerHTML=`<b>${v.id_pedido}</b> · ${v.cliente||'—'} · ${v.canal||'—'} · Total do pedido: <b>${brl(v.valor_pedido)}</b>`;
    f('m-nparc').value=1; f('m-total').value=Number(v.valor_pedido||0).toFixed(2); f('m-primeirovenc').value=''; f('m-parcelas').innerHTML=''; }

  function voltarBusca(){ f('m-sel').style.display='none'; f('m-step1').style.display='block'; SELPED=null; }

  function addMeses(iso,k){ if(!iso)return ''; const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,(m-1)+k,d); const yy=dt.getFullYear(),mm=String(dt.getMonth()+1).padStart(2,'0'),dd=String(dt.getDate()).padStart(2,'0'); return `${yy}-${mm}-${dd}`; }

  function gerarParcelas(){ const n=Math.max(1,parseInt(f('m-nparc').value)||1); const total=parseFloat(f('m-total').value)||0; const primeiro=f('m-primeirovenc').value;
    const cent=Math.round(total*100); const base=Math.floor(cent/n); const resto=cent-base*n; const valores=[];
    for(let i=0;i<n;i++){ let c=base+(i===n-1?resto:0); valores.push((c/100).toFixed(2)); }
    let html='<table class="res"><thead><tr><th>Parc.</th><th>Valor (R$)</th><th>Vencimento</th><th>Documento</th><th>Observação</th></tr></thead><tbody>';
    for(let i=0;i<n;i++){ const venc=primeiro?addMeses(primeiro,i):'';
      html+=`<tr>
        <td class="num">${i+1}/${n}</td>
        <td><input type="number" step="0.01" class="pcv" value="${valores[i]}" style="width:110px"></td>
        <td><input type="date" class="pcd" value="${venc}"></td>
        <td><input type="text" class="pcdoc" placeholder="opcional" style="width:120px"></td>
        <td><input type="text" class="pcobs" placeholder="opcional" style="width:160px"></td>
      </tr>`; }
    html+='</tbody></table>';
    f('m-parcelas').innerHTML=html; }

  async function salvarBoletos(){ if(!SELPED)return; f('m-erro2').textContent=''; const rows=[...f('m-parcelas').querySelectorAll('tbody tr')];
    if(!rows.length){ f('m-erro2').textContent='Clique em “Gerar parcelas” primeiro.'; return; }
    const parcelas=[]; for(let i=0;i<rows.length;i++){ const r=rows[i];
      const valor=r.querySelector('.pcv').value; const venc=r.querySelector('.pcd').value;
      if(!venc){ f('m-erro2').textContent=`Parcela ${i+1}: informe o vencimento.`; return; }
      parcelas.push({ parcela:i+1, valor:valor===''?null:Number(valor), vencimento:venc, documento:r.querySelector('.pcdoc').value||'', observacao:r.querySelector('.pcobs').value||'' }); }
    const b=f('m-salvar'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{ const n=await rpc('cn_lancar_boletos',{p_usuario_id:USER.id,p_id_pedido:SELPED.id_pedido,p_parcelas:parcelas});
      fecharModal(); await carregar(true); f('msg').textContent=`${n} boleto(s) lançado(s).`; }
    catch(e){ f('m-erro2').textContent=(e.message||e); } finally{ b.disabled=false; b.textContent=t; } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const fl=filtros(); const todas=await rpc('cn_listar_boletos',{...fl,p_ordem:f('ordem').value||'prioridade',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return;
      const cols=['data_compra','mes_vencimento','canal','id_pedido','cliente','uf','parcela','total_parcelas','valor','vencimento','status_efetivo','documento_boleto','observacao'];
      const head=['Data Compra','Mes Vencimento','Canal','ID Pedido','Cliente','UF','Parcela','Total Parcelas','Valor','Vencimento','Status','Documento','Observacao'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='boletos_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('mes').addEventListener('change',()=>carregar(true)); f('canal').addEventListener('change',()=>carregar(true)); f('status').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('lancar').addEventListener('click',abrirModal); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal); let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
    f('m-voltar').addEventListener('click',voltarBusca); f('m-gerar').addEventListener('click',gerarParcelas); f('m-salvar').addEventListener('click',salvarBoletos);
  }

  return { init, abrir, pago, cobranca, protestar, reabrir, selecionar };
})();
window.BO = BO;
registrarTela('boletos', BO);
