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
  const f=(id)=>$('dev-'+id);

  // Os 11 status são fixos (CHECK no banco): a tela e o banco usam a
  // mesma lista, e cada box corresponde a um deles exatamente.
  const ST=['Aguardando despacho','Em trânsito','Devolução atrasada',
            'Entregue, com pendência para reclamação','Entregue, sem qualquer pendência',
            'Reclamação resolvida','Reclamação resolvida com prejuízo',
            'Reembolso ao cliente, com prejuízo ao vendedor',
            'Reembolso ao cliente e vendedor','Devolução cancelada'];
  // os sete de desfecho liberam a conferência; os três primeiros não
  const DESFECHO=ST.slice(3);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_mes_venda:f('mes-venda').value||null,
    p_canal:f('canal').value||null,
    p_tipo_envio:f('envio').value||null,
    p_uf:f('uf').value||null,
    p_motivo:f('motivo').value||null,
    p_status:f('status').value||null,
    p_solicitante:f('solicitante').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  // Espelha a cn_marcar_conferido_devolucao. Quem recusa de fato é o
  // banco; aqui só evita o clique que ia dar erro e explica o motivo.
  // Zero é valor válido — o que bloqueia é o campo em branco.
  function podeConferir(l){
    if(!DESFECHO.includes(l.status)) return 'Só é possível conferir uma devolução com desfecho';
    const falta=[];
    if(l.custo_prejuizo==null)  falta.push('custo do prejuízo');
    if(l.custo_devolucao==null) falta.push('custo de devolução');
    if(l.status!=='Devolução cancelada' && !String(l.nfd||'').trim()) falta.push('NFD');
    return falta.length ? 'Preencha antes de conferir: '+falta.join(', ') : null;
  }

  async function init(){
    // Devolução em trânsito cuja previsão já passou vira "atrasada".
    // A rotina diária faz isso de madrugada; aqui é para o caso que
    // vence hoje aparecer certo agora, sem esperar até amanhã.
    // Uma vez por abertura da tela, não a cada filtro — é escrita, e
    // repetir a cada busca digitada seria desperdício.
    try{
      const n = await rpc('cn_atualizar_atrasos_devolucoes',{p_usuario_id:USER.id});
      if(n>0) f('msg').textContent = n+' devolução(ões) passaram para atrasada.';
    }catch(e){}   // falhar aqui não pode impedir a tela de abrir
    await carregarOpcoes(); await carregarFiltros(); await carregar(); bind();
  }

  let MOTIVO_OPC=[];

  async function carregarOpcoes(){
    // o status deixou de vir de listas_opcoes: virou lista fixa no HTML
    // e no CHECK do banco
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

  // Seis listas numa chamada só. Status e solicitante não vêm daqui:
  // são fixos e já estão escritos no HTML.
  async function carregarFiltros(){
    try{
      const r=await rpc('cn_filtros_devolucoes',{p_usuario_id:USER.id}) || {};
      encherMeses('mes-venda', r.meses_venda);
      encherMeses('mes',       r.meses_chegada);
      encher('canal',  r.canais);
      encher('envio',  r.tipos_envio);
      encher('uf',     r.ufs);
      encher('motivo', r.motivos);
    }catch(e){}
  }
  function encher(id, lista){
    (lista||[]).forEach(v=>{ const o=document.createElement('option');
      o.value=v; o.textContent=v; f(id).appendChild(o); });
  }
  function encherMeses(id, lista){
    (lista||[]).forEach(v=>{ const o=document.createElement('option');
      o.value=v; o.textContent=mesLabel(v); f(id).appendChild(o); });
  }

  async function carregar(reset, opts){
    if(reset) PAGINA=0;
    const precisaKpis = !(opts && opts.kpis===false) || KPIS===null;
    f('tbody').innerHTML='<tr><td colspan="20" class="loading">Carregando devoluções…</td></tr>';
    const fl=filtros();
    try{
      const chamadas=[
        rpc('cn_listar_devolucoes',{...fl,p_ordem:f('ordem').value||'venda_nova',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_devolucoes',fl)
      ];
      if(precisaKpis) chamadas.push(rpc('cn_kpis_devolucoes',fl));
      const res=await Promise.all(chamadas);
      LINHAS=res[0]||[]; TOTAL=Number(res[1])||0;
      if(precisaKpis) KPIS=(res[2]&&res[2][0])||null;
      renderKpis(KPIS); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="20" class="empty">Erro: '+(e.message||e)+'</td></tr>';
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

  // Mesmo formato das outras telas: .kpi.click, número na cor e a tarja
  // "filtro ativo". Os quatro informativos ficam neutros — onze boxes
  // coloridos já bastam, e a cor precisa marcar o que é clicável.
  function cardFiltro(cls,status,titulo,valor,hint){
    const ativo = f('status').value===status;
    const arg = status.replace(/'/g,"\\'");
    return `<div class="kpi click ${cls} ${ativo?'on':''}" onclick="DEV.foco('${arg}')">`+
           `<div class="lbl">${titulo}</div><div class="hint">${hint}</div>`+
           `<div class="val">${valor}</div>`+
           `<div class="flag">filtro ativo · clique para remover</div></div>`;
  }

  function renderKpis(k){
    const box=f('kpis'); if(!k){box.innerHTML='';return;}
    box.innerHTML =
      // ---- agregados por grupo (informativos) ----
      cardHtml('Pedidos com devolução pendente', n0(k.ped_pendente),
        'Processo de devolução iniciado e ainda não concluído.') +
      cardHtml('Pedidos devolvidos', n0(k.ped_devolvido),
        'Devoluções concluídas no período e nos filtros aplicados.') +
      cardHtml('Pedidos com devolução cancelada', n0(k.ped_cancelada),
        'Processo iniciado, devolução cancelada e cliente ficou com o produto.') +
      cardHtml('Valor com reembolso pendente', brl(k.vlr_pendente),
        'Vendas em devolução ainda sem resultado financeiro definido.') +
      cardHtml('Valor reembolsado', brl(k.vlr_reembolsado),
        'Total restituído aos clientes em decorrência de devoluções.') +
      cardHtml('Valor mantido como faturamento', brl(k.vlr_mantido),
        'Devoluções que não geraram perda de faturamento, por cancelamento ou reembolso integral ao vendedor.') +
      cardHtml('Custo de devolução', brl(k.soma_custo_devolucao),
        'Frete de retorno dos produtos devolvidos.') +
      cardHtml('Prejuízo com devolução', brl(k.soma_prejuizo),
        'Perdas financeiras decorrentes das devoluções, sem contar o frete de retorno.') +
      // ---- um box por status (clicáveis) ----
      cardFiltro('dv-aguard', ST[0], 'Aguardando despacho', n0(k.st_aguardando),
        'Cliente orientado a devolver, produto ainda não despachado.') +
      cardFiltro('dv-transi', ST[1], 'Em trânsito', n0(k.st_transito),
        'Produto despachado pelo cliente, a caminho do vendedor.') +
      cardFiltro('dv-atras',  ST[2], 'Devolução atrasada', n0(k.st_atrasada),
        'Prazo de entrega ultrapassado. Acompanhar com a transportadora ou a plataforma.') +
      cardFiltro('dv-epend',  ST[3], 'Entregue, com pendência para reclamação', n0(k.st_ent_pend),
        'Recebida com divergência ou irregularidade que exige abertura de reclamação.') +
      cardFiltro('dv-eok',    ST[4], 'Entregue, sem qualquer pendência', n0(k.st_ent_ok),
        'Recebida e conferida, sem divergências nem reclamação a abrir.') +
      cardFiltro('dv-rok',    ST[5], 'Reclamação resolvida', n0(k.st_recl_ok),
        'Irregularidade solucionada de forma satisfatória, sem prejuízo financeiro.') +
      cardFiltro('dv-rprej',  ST[6], 'Reclamação resolvida com prejuízo', n0(k.st_recl_prej),
        'Irregularidade encerrada de forma insatisfatória, com prejuízo financeiro.') +
      cardFiltro('dv-rcli',   ST[7], 'Reembolso ao cliente, com prejuízo ao vendedor', n0(k.st_reemb_cliente),
        'Devolução não concluída; cliente reembolsado e prejuízo absorvido pelo vendedor.') +
      cardFiltro('dv-ramb',   ST[8], 'Reembolso ao cliente e vendedor', n0(k.st_reemb_ambos),
        'Devolução não concluída; plataforma ou transportadora reembolsou os dois lados.') +
      cardFiltro('dv-canc',   ST[9], 'Devolução cancelada', n0(k.st_cancelada),
        'Cancelada a pedido do cliente, que permaneceu com o produto. Sem prejuízo.');
  }

  // Clicar no box aplica o status; clicar de novo no mesmo desliga.
  function foco(status){
    f('status').value = (f('status').value===status) ? '' : status;
    KPIS=null; carregar(true);
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="20" class="empty">Nenhuma devolução encontrada.</td></tr>'; return; }
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
      <td>${l.solicitante||'—'}</td>
      <td>${l.motivo||'—'}</td>
      <td>${l.status?`<span class="pill">${l.status}</span>`:'—'}</td>
      <td>${dataBr(l.data_chegada)}</td>
      <td class="num">${brl(l.valor_devolvido)}</td>
      <td class="num">${brl(l.custo_devolucao)}</td>
      <td class="num">${brl(l.custo_prejuizo)}</td>
      <td class="conf" onclick="event.stopPropagation()">${(()=>{
        const impede=podeConferir(l);
        // já conferido pode sempre ser desmarcado: destravar um engano
        // não pode ficar bloqueado
        const trava = impede && !l.conferido;
        return `<input type="checkbox" class="chk" ${l.conferido?'checked':''} ${(podeConf&&!trava)?'':'disabled'} title="${trava?impede:''}" onchange="DEV.conf(${l.id},this.checked,this)">`+
               `<span class="conf-lbl" ${trava?`style="color:var(--muted)" title="${impede}"`:''}>${l.conferido?'Conferido':(trava?'—':'Pendente')}</span>`;
      })()}</td>
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

  function abrir(id){
    if(!temPermissao('devolucoes.editar'))return;
    const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id;
    f('drawer-erro').textContent='';
    f('e-dvenda').value=dataBr(l.data_venda); f('e-canal').value=l.canal||'';
    f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||'';
    f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    f('e-previsao').value=l.previsao_chegada||'';
    f('e-chegada').value=l.data_chegada||'';
    f('e-solicitante').value=l.solicitante||'';
    f('e-status').value=l.status||'';
    fillSelLista('e-motivo', MOTIVO_OPC, l.motivo);
    f('e-valortotal').value=l.valor_total??''; f('e-valordev').value=l.valor_devolvido??'';
    f('e-valornf').value=l.valor_nf??''; f('e-numnf').value=l.numero_nf||''; f('e-nfd').value=l.nfd||'';
    f('e-custodev').value=l.custo_devolucao??''; f('e-custoprej').value=l.custo_prejuizo??'';
    f('e-obs').value=l.observacoes||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open');
  }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }

  async function salvar(){
    if(EDIT_ID==null)return;
    f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{
      await rpc('cn_editar_devolucao',{p_usuario_id:USER.id,p_devolucao_id:EDIT_ID,
        p_data_chegada:f('e-chegada').value||null,
        p_previsao_chegada:f('e-previsao').value||null,
        p_solicitante:f('e-solicitante').value||null,
        p_motivo:f('e-motivo').value||null,p_status:f('e-status').value||null,
        p_valor_nf:num('e-valornf'),p_numero_nf:f('e-numnf').value||null,p_nfd:f('e-nfd').value||null,
        p_custo_devolucao:num('e-custodev'),p_custo_prejuizo:num('e-custoprej'),
        p_valor_total:num('e-valortotal'),p_valor_devolvido:num('e-valordev'),
        p_observacoes:f('e-obs').value||null});
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


  // ---- devolver para a fila de Mediações ----
  // O erro de classificação costuma ser percebido aqui, não na tela de
  // Mediações — onde o caso nem aparece mais, por ter saído da fila.
  // Este botão dispara a mesma ação de lá: apaga esta linha e devolve o
  // caso para triagem. Só funciona em registro que VEIO da triagem;
  // lançamento manual ou de rotina é recusado pelo banco.
  async function devolver(){
    if(EDIT_ID==null) return;
    if(!temPermissao('mediacoes.classificar')){
      alert('Você não tem permissão para devolver casos à triagem.'); return;
    }
    if(!confirm('Devolver este devolução para a fila de Mediações?\n\nA linha sai desta tela e o caso volta para a triagem.')) return;
    const b=f('devolver'); b.disabled=true; const t=b.textContent; b.textContent='Devolvendo…';
    try{
      await rpc('cn_devolver_para_mediacao',{p_usuario_id:USER.id,p_tipo:'devolucao',p_registro_id:EDIT_ID});
      fechar(); KPIS=null; await carregar(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Caso devolvido para a fila de Mediações.';
    }catch(e){ f('drawer-erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function limparFiltros(){
    ['busca','mes','mes-venda','canal','envio','uf','motivo','status','solicitante']
      .forEach(id=>{ f(id).value=''; });
    f('ordem').value='venda_nova';
    KPIS=null; carregar(true);
  }

  async function exportar(){
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const fl=filtros();
      const todas=await rpc('cn_listar_devolucoes',{...fl,p_ordem:f('ordem').value||'venda_nova',p_limite:100000,p_offset:0});
      if(!todas||!todas.length)return;
      const cols=['data_venda','previsao_chegada','canal','id_pedido','tipo_envio','modelo','quantidade',
                  'valor_total','numero_nf','cliente','uf','nfd','solicitante','motivo','status','data_chegada',
                  'valor_devolvido','custo_devolucao','custo_prejuizo',
                  'valor_nf','solicitante','observacoes','conferido'];
      const head=['Data da Venda','Previsao de Chegada','Canal','ID Pedido','Tipo de Envio','SKU','Quantidade',
                  'Valor Total','N NF','Cliente','UF','N NFD','Solicitante','Motivo','Status','Data da Chegada',
                  'Valor Devolvido','Custo para Devolucao','Prejuizo',
                  'Valor NF Devolucao','Solicitante','Observacoes','Conferido'];
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
    ['mes','mes-venda','canal','envio','uf','motivo','status','solicitante']
      .forEach(id=>f(id).addEventListener('change',()=>{ KPIS=null; carregar(true); }));
    f('ordem').addEventListener('change',()=>carregar(true,{kpis:false}));
    f('limpar').addEventListener('click',limparFiltros);
    f('lancar').addEventListener('click',abrirModal);
    f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(false,{kpis:false}); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(false,{kpis:false}); });
    f('devolver').addEventListener('click',devolver);
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar);
    f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal);
    let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar, devolver, foco };
})();
window.DEV = DEV;
registrarTela('devolucoes', DEV);
