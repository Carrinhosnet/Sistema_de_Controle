// =====================================================================
// CARRINHOS_NET — TELA: Controle de Devoluções
// Depende da base do index.html: $, rpc, USER, temPermissao, brl,
// dataBr, mesLabel, registrarTela, atualizarBadges, montarIrPara.
//
// Separada da tela de Cancelamentos, que antes vinham juntas por UNION.
// Devolução tem vida própria: NF, NFD, tipo, motivo, custo do retorno e
// prejuízo — nada disso existe em cancelamento.
//
// A ENTRADA VEM DA TRIAGEM: casos classificados no Controle de
// Mediações chegam aqui. O lançamento manual continua disponível para
// devolução que não passou por processo no Mercado Livre.
// =====================================================================
const DEV = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null, KPIS=null; const POR=100;
  let STATUS_OPC=[];
  const f=(id)=>$('dev-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_canal:f('canal').value||null,
    p_status:f('status').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarOpcoes(); await carregarFiltros(); await carregar(); bind(); }

  let MOTIVO_OPC=[];

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes',{p_usuario_id:USER.id,p_tipo:'status_devolucao'});
      STATUS_OPC=(r||[]).map(o=>o.valor);
    }catch(e){ STATUS_OPC=[]; }
    STATUS_OPC.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; f('status').appendChild(o); });
    // motivos vêm da tela de Opções Comerciais; lista fechada
    try{ const r=await rpc('cn_listar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:'motivo_devolucao'});
      MOTIVO_OPC=(r||[]).filter(o=>o.ativo).map(o=>o.valor);
    }catch(e){ MOTIVO_OPC=[]; }
  }

  // o valor atual entra na lista mesmo se foi inativado depois: abrir o
  // registro não pode apagar em silêncio o que já estava gravado
  function fillSelLista(id, opcoes, atual){
    const sel=f(id); sel.innerHTML='<option value="">—</option>';
    const opts=[...opcoes]; if(atual && !opts.includes(atual)) opts.unshift(atual);
    opts.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v;
      if(v===atual)o.selected=true; sel.appendChild(o); });
    sel.value=atual||'';
  }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_devolucoes',{p_usuario_id:USER.id});
      (meses||[]).forEach(m=>{ const o=document.createElement('option');
        o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); });
    }catch(e){}
    try{ const canais=await rpc('cn_canais_devolucoes',{p_usuario_id:USER.id});
      (canais||[]).forEach(c=>{ const o=document.createElement('option');
        o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); });
    }catch(e){}
  }

  async function carregar(reset, opts){
    if(reset) PAGINA=0;
    const precisaKpis = !(opts && opts.kpis===false) || KPIS===null;
    f('tbody').innerHTML='<tr><td colspan="19" class="loading">Carregando devoluções…</td></tr>';
    const fl=filtros();
    try{
      const chamadas=[
        rpc('cn_listar_devolucoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_devolucoes',fl)
      ];
      if(precisaKpis) chamadas.push(rpc('cn_kpis_devolucoes',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal,p_status:fl.p_status}));
      const res=await Promise.all(chamadas);
      LINHAS=res[0]||[]; TOTAL=Number(res[1])||0;
      if(precisaKpis) KPIS=(res[2]&&res[2][0])||null;
      renderKpis(KPIS); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="19" class="empty">Erro: '+(e.message||e)+'</td></tr>';
    }
  }

  function renderPag(){
    const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,
          i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL);
    f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`;
    f('paginfo').textContent=`Página ${p} de ${tp}`;
    f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    if(typeof montarIrPara==='function') montarIrPara('dev',p,tp,(n)=>{ PAGINA=n-1; carregar(false,{kpis:false}); });
  }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');
  function cardHtml(titulo,valor,hint){
    return `<div class="kpi"><div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div></div>`;
  }

  function renderKpis(k){
    const box=f('kpis'); if(!k){box.innerHTML='';return;}
    box.innerHTML =
      cardHtml('Devoluções', n0(k.total), 'Uma linha por SKU devolvido') +
      cardHtml('Valor devolvido', brl(k.soma_valor_nf), 'Soma do valor das notas') +
      cardHtml('Custo do retorno', brl(k.soma_custo_devolucao), 'Frete pago para o produto voltar') +
      cardHtml('Prejuízo', brl(k.soma_prejuizo), 'Perda que não se recupera') +
      cardHtml('Faltam conferir', n0(k.faltam), 'Ainda não conferidas');
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="19" class="empty">Nenhuma devolução encontrada.</td></tr>'; return; }
    const podeConf=temPermissao('devolucoes.conferir');
    const editavel=temPermissao('devolucoes.editar');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}"${editavel?` style="cursor:pointer" onclick="DEV.abrir(${l.id})"`:''}>
      <td>${dataBr(l.data_venda)}</td>
      <td>${dataBr(l.previsao_chegada)}</td>
      <td>${l.canal||'—'}</td>
      <td>${celPedido(l.id_pedido)}</td>
      <td>${l.tipo_envio||'—'}</td>
      <td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td>
      <td class="num">${brl(l.valor_total)}</td>
      <td>${l.numero_nf||'—'}</td>
      <td>${l.cliente||'—'}</td>
      <td>${l.uf||'—'}</td>
      <td>${l.nfd||'—'}</td>
      <td>${l.motivo||'—'}</td>
      <td>${l.status?`<span class="pill">${l.status}</span>`:'—'}</td>
      <td>${dataBr(l.data_chegada)}</td>
      <td class="num">${brl(l.valor_devolvido)}</td>
      <td class="num">${brl(l.custo_devolucao)}</td>
      <td class="num">${brl(l.custo_prejuizo)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="DEV.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){
    elem.disabled=true;
    try{
      await rpc('cn_marcar_conferido_devolucao',{p_usuario_id:USER.id,p_devolucao_id:id,p_conferido:valor});
      const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor;
      const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor);
      tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente';
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); }
    finally{ elem.disabled=false; }
  }

  // ---- edição ----
  function fillStatusSel(atual){
    const sel=f('e-status'); sel.innerHTML='<option value="">—</option>';
    const opts=[...STATUS_OPC]; if(atual&&!opts.includes(atual))opts.unshift(atual);
    opts.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; if(v===atual)o.selected=true; sel.appendChild(o); });
    sel.value=atual||'';
  }

  function abrir(id){
    if(!temPermissao('devolucoes.editar'))return;
    const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id;
    f('drawer-erro').textContent='';
    f('e-dvenda').value=dataBr(l.data_venda); f('e-canal').value=l.canal||'';
    f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||'';
    f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    f('e-previsao').value=l.previsao_chegada||'';
    f('e-chegada').value=l.data_chegada||''; f('e-tipo').value=l.tipo_devolucao||'';
    fillStatusSel(l.status);
    fillSelLista('e-motivo', MOTIVO_OPC, l.motivo);
    f('e-valortotal').value=l.valor_total??''; f('e-valordev').value=l.valor_devolvido??'';
    f('e-valornf').value=l.valor_nf??''; f('e-numnf').value=l.numero_nf||''; f('e-nfd').value=l.nfd||'';
    f('e-custodev').value=l.custo_devolucao??''; f('e-custoprej').value=l.custo_prejuizo??'';
    f('e-incluidas').value=l.incluidas||''; f('e-obs').value=l.observacoes||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open');
  }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }

  async function salvar(){
    if(EDIT_ID==null)return;
    f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{
      await rpc('cn_editar_devolucao',{p_usuario_id:USER.id,p_devolucao_id:EDIT_ID,
        p_data_chegada:f('e-chegada').value||null,p_tipo_devolucao:f('e-tipo').value||null,
        p_motivo:f('e-motivo').value||null,p_status:f('e-status').value||null,
        p_valor_nf:num('e-valornf'),p_numero_nf:f('e-numnf').value||null,p_nfd:f('e-nfd').value||null,
        p_custo_devolucao:num('e-custodev'),p_custo_prejuizo:num('e-custoprej'),
        p_incluidas:f('e-incluidas').value||null,p_observacoes:f('e-obs').value||null,
        p_previsao_chegada:f('e-previsao').value||null,
        p_valor_total:num('e-valortotal'),
        p_valor_devolvido:num('e-valordev')});
      fechar(); KPIS=null; carregar();
    }catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  // ---- lançamento manual ----
  function abrirModal(){
    if(!temPermissao('devolucoes.lancar')){ alert('Você não tem permissão para lançar devoluções.'); return; }
    f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent='';
    f('modal').classList.add('open'); f('m-busca').focus();
  }
  function fecharModal(){ f('modal').classList.remove('open'); }

  async function buscarVendas(){
    const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; }
    try{
      const r=await rpc('cn_buscar_vendas_sem_devolucao',{p_usuario_id:USER.id,p_busca:busca,p_limite:30});
      if(!r||!r.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já está em Devoluções).</p>'; return; }
      f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID</th><th>SKU</th><th>Cliente</th><th></th></tr></thead><tbody>'+
        r.map(v=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.modelo||'—'}</td><td>${v.cliente||'—'}</td><td><button onclick="DEV.lancar(${v.venda_id})">Lançar</button></td></tr>`).join('')+
        '</tbody></table>';
    }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); }
  }

  async function lancar(vendaId){
    f('m-erro').textContent='';
    try{
      await rpc('cn_lancar_devolucao_manual',{p_usuario_id:USER.id,p_venda_id:vendaId});
      fecharModal(); KPIS=null; await carregar(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Devolução lançada.';
    }catch(e){ f('m-erro').textContent=(e.message||e); }
  }

  function limparFiltros(){
    ['busca','mes','canal','status'].forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    KPIS=null; carregar(true);
  }

  async function exportar(){
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const fl=filtros();
      const todas=await rpc('cn_listar_devolucoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0});
      if(!todas||!todas.length)return;
      const cols=['data_venda','previsao_chegada','canal','id_pedido','tipo_envio','modelo','quantidade',
                  'valor_total','numero_nf','cliente','uf','nfd','motivo','status','data_chegada',
                  'valor_devolvido','custo_devolucao','custo_prejuizo',
                  'valor_nf','tipo_devolucao','incluidas','observacoes','conferido'];
      const head=['Data da Venda','Previsao de Chegada','Canal','ID Pedido','Tipo de Envio','SKU','Quantidade',
                  'Valor Total','N NF','Cliente','UF','N NFD','Motivo','Status','Data da Chegada',
                  'Valor Devolvido','Custo para Devolucao','Prejuizo',
                  'Valor NF Devolucao','Tipo de Devolucao','Incluidas','Observacoes','Conferido'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='devolucoes_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>{ KPIS=null; carregar(true); },400); });
    ['mes','canal','status'].forEach(id=>f(id).addEventListener('change',()=>{ KPIS=null; carregar(true); }));
    f('ordem').addEventListener('change',()=>carregar(true,{kpis:false}));
    f('limpar').addEventListener('click',limparFiltros);
    f('lancar').addEventListener('click',abrirModal);
    f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(false,{kpis:false}); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(false,{kpis:false}); });
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar);
    f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal);
    let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar };
})();
window.DEV = DEV;
registrarTela('devolucoes', DEV);
