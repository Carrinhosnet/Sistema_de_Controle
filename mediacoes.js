// =====================================================================
// CARRINHOS_NET — TELA: Controle de Mediações
// Depende da base do index.html: $, rpc, chamarFuncao, USER, temPermissao, brl,
// dataBr, mesLabel, registrarTela, atualizarBadges, montarIrPara.
//
// O QUE É
//   A fila onde cai tudo que vem do Mercado Livre (claims) e do Bling
//   (cancelamentos). Aqui o caso é triado para uma das três telas
//   finais: Devoluções, Reclamações ou Cancelamentos.
//
// CLASSIFICAR E DESFAZER
//   Classificar cria o registro no destino copiando da venda — uma
//   linha por SKU, porque as tabelas finais têm chave (pedido, modelo).
//   Devolver à fila APAGA o que a triagem criou, e por isso pede
//   confirmação: o preenchimento feito na tela final se perde.
//
// A CLASSIFICAÇÃO DO MERCADO LIVRE NÃO APARECE AQUI. Tipo, fase, status
// e motivo continuam gravados e vão no CSV, mas saíram da tela: o ML
// classifica por critério próprio, diferente do de vocês, e mostrar as
// duas classificações lado a lado induzia a decisão errada.
//
// Isso resolve de quebra um problema de dado velho: a sync não revisita
// claim já gravado, então um caso que estivesse "em aberto" no ML
// continuaria assim para sempre na tela. Sem exibir, não há o que
// envelhecer.
// =====================================================================
const MED = (function(){
  let LINHAS=[], TOTAL=0, PAGINA=0, KPIS=null; const POR=100;
  const f=(id)=>$('med-'+id);

  const DESTINO={
    devolucao:'Devolução', reclamacao:'Reclamação', cancelamento:'Cancelamento'
  };

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_mes_venda:f('mesvenda').value||null,
    p_canal:f('canal').value||null,
    p_destino:f('destino').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  // os cartões não refletem o filtro de destino: é o que eles acionam
  function filtrosKpi(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_mes_venda:f('mesvenda').value||null,
    p_canal:f('canal').value||null
  }; }

  async function init(){ await carregarFiltros(); await carregar(); bind(); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_mediacoes',{p_usuario_id:USER.id});
      (meses||[]).forEach(m=>{ const o=document.createElement('option');
        o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); });
    }catch(e){}
    try{ const mv=await rpc('cn_meses_venda_mediacoes',{p_usuario_id:USER.id});
      (mv||[]).forEach(m=>{ const o=document.createElement('option');
        o.value=m.mes;o.textContent=mesLabel(m.mes); f('mesvenda').appendChild(o); });
    }catch(e){}
    try{ const canais=await rpc('cn_canais_mediacoes',{p_usuario_id:USER.id});
      (canais||[]).forEach(c=>{ const o=document.createElement('option');
        o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); });
    }catch(e){}
  }

  // opts.kpis=false quando a mudança não mexe nos cartões
  async function carregar(reset, opts){
    if(reset) PAGINA=0;
    const precisaKpis = !(opts && opts.kpis===false) || KPIS===null;
    f('tbody').innerHTML='<tr><td colspan="9" class="loading">Carregando mediações…</td></tr>';
    const fl=filtros();
    try{
      const chamadas=[ rpc('cn_listar_mediacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}) ];
      if(precisaKpis) chamadas.push(rpc('cn_kpis_mediacoes',filtrosKpi()));
      const res=await Promise.all(chamadas);
      const pacote=res[0]||{};
      LINHAS=pacote.linhas||[]; TOTAL=Number(pacote.total)||0;
      if(precisaKpis) KPIS=(res[1]&&res[1][0])||null;
      renderKpis(KPIS); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="9" class="empty">Erro: '+(e.message||e)+'</td></tr>';
    }
  }

  function renderPag(){
    const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,
          i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL);
    f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`;
    f('paginfo').textContent=`Página ${p} de ${tp}`;
    f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    if(typeof montarIrPara==='function') montarIrPara('med',p,tp,(n)=>{ PAGINA=n-1; carregar(false,{kpis:false}); });
  }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');

  function cardHtml(titulo,valor,hint){
    return `<div class="kpi"><div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div></div>`;
  }
  function cardClick(titulo,valor,cor,valorFiltro,hint){
    const ativo=(f('destino').value===valorFiltro);
    return `<div class="kpi click ${cor} ${ativo?'on':''}" onclick="MED.filtrarDestino('${valorFiltro}')">`+
           `<div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div>`+
           `<div class="flag">filtro ativo · clique para remover</div></div>`;
  }

  function renderKpis(k){
    const box=f('kpis');
    if(!k){ box.innerHTML=''; return; }
    // Ordem: o que falta decidir vem primeiro; depois os destinos na
    // sequência do ciclo da venda (problema, retorno, cancelamento); o
    // total fecha, sem cor, por ser leitura e não filtro de trabalho.
    box.innerHTML =
      cardClick('A triar', n0(k.pendentes), 'm-triar', 'pendentes',
                'Casos cuja análise ainda não foi realizada') +
      cardClick('Para reclamação', n0(k.para_reclamacao), 'm-recla', 'reclamacao',
                'Vendas que tiveram algum problema e precisaram de tratativa') +
      cardClick('Para devolução', n0(k.para_devolucao), 'm-devol', 'devolucao',
                'Vendas que foram enviadas, mas por algum motivo estão retornando à empresa') +
      cardClick('Para cancelamento', n0(k.para_cancelamento), 'm-canc', 'cancelamento',
                'Vendas canceladas antes mesmo de serem enviadas') +
      cardHtml('Total de casos', n0(k.total),
                'Todas as vendas importadas para esta tela, qualquer que seja o motivo ou a resolução');
  }

  function filtrarDestino(v){
    f('destino').value = (f('destino').value===v) ? '' : v;
    carregar(true,{kpis:false});
  }

  function acoesHtml(l){
    if(!temPermissao('mediacoes.classificar')) return '—';
    if(l.destino){
      return `<span class="pill" style="border-color:var(--ok);color:var(--ok)">${DESTINO[l.destino]||l.destino}</span> `+
             `<button class="mini dg" onclick="event.stopPropagation();MED.devolver(${l.id})">Devolver à fila</button>`;
    }
    return `<button class="mini" onclick="event.stopPropagation();MED.classificar(${l.id},'devolucao')">Devolução</button> `+
           `<button class="mini" onclick="event.stopPropagation();MED.classificar(${l.id},'reclamacao')">Reclamação</button> `+
           `<button class="mini" onclick="event.stopPropagation();MED.classificar(${l.id},'cancelamento')">Cancelamento</button>`;
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="9" class="empty">Nenhum caso encontrado.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>{
      const pend = !l.destino;
      const clicavel = pend && temPermissao('mediacoes.editar');
      return `<tr class="${pend?'pendente':''}"${clicavel?` style="cursor:pointer" onclick="MED.abrir(${l.id})"`:''}>
        <td>${dataBr(l.data_abertura)}</td>
        <td>${dataBr(l.data_venda)}</td>
        <td>${l.canal||'—'}</td>
        <td>${semVenda(l)?'<span title="Nenhuma venda com este número — clique na linha para corrigir antes de classificar" style="color:var(--warn)">⚠ </span>':''}<b>${semVenda(l)?'sem pedido':l.id_pedido||'—'}</b></td>
        <td>${l.cliente||'—'}</td>
        <td>${l.uf||'—'}</td>
        <td class="num">${l.qtd_itens??'—'}</td>
        <td class="num">${l.valor_pedido==null?'—':brl(l.valor_pedido)}</td>
        <td class="acoes" onclick="event.stopPropagation()">${acoesHtml(l)}</td>
      </tr>`;
    }).join('');
  }

  async function classificar(id, destino){
    const l=LINHAS.find(x=>x.id===id); if(!l) return;
    try{
      const r=await rpc('cn_classificar_mediacao',
        {p_usuario_id:USER.id, p_mediacao_id:id, p_destino:destino});
      KPIS=null; await carregar();
      // aviso quando nada foi criado: o pedido pode não estar em Vendas
      f('msg').textContent = (r && r.aviso)
        ? `Classificado, mas: ${r.aviso}`
        : `Enviado para ${DESTINO[destino]} — ${(r&&r.registros_criados)||0} registro(s).`;
    }catch(e){ alert('Não foi possível classificar: '+(e.message||e)); }
  }

  // Confirmação obrigatória: o registro criado no destino é apagado e o
  // preenchimento feito lá se perde. Foi decisão de projeto — melhor
  // refazer do que manter registro órfão escondido.
  async function devolver(id){
    const l=LINHAS.find(x=>x.id===id); if(!l) return;
    const alvo=DESTINO[l.destino]||l.destino;
    if(!confirm(
      `Devolver o pedido ${l.id_pedido} à fila de triagem?\n\n`+
      `O registro criado em ${alvo} será APAGADO, junto com tudo que foi `+
      `preenchido lá (custo, NF, observações, conferência).\n\n`+
      `Esta ação não pode ser desfeita.`)) return;
    try{
      const r=await rpc('cn_desclassificar_mediacao',{p_usuario_id:USER.id, p_mediacao_id:id});
      KPIS=null; await carregar();
      f('msg').textContent=`Devolvido à fila — ${(r&&r.registros_apagados)||0} registro(s) apagado(s).`;
    }catch(e){ alert('Não foi possível devolver: '+(e.message||e)); }
  }

  // Busca manual nas DUAS fontes, na mesma ordem da rotina automática:
  // Bling (cancelamentos) e depois Mercado Livre (claims). São APIs
  // diferentes e funções diferentes — buscar só uma deixaria metade dos
  // casos de fora.
  //
  // A ordem importa pouco, porque o processamento trata o encontro nos
  // dois sentidos, mas seguir a mesma da rotina evita comportamento
  // diferente entre o automático e o manual.
  async function buscar(){
    if(!temPermissao('sync.executar')){ alert('Você não tem permissão para atualizar.'); return; }
    const b=f('buscar'); if(b.disabled)return; b.disabled=true; const t=b.textContent;
    try{
      // ---- 1) cancelamentos no Bling ----
      f('msg').textContent='Buscando cancelamentos no Bling…';
      let g=0;
      while(true){
        const r=await chamarFuncao('sync-bling',{dias:90,limite:200,modo:'cancelamentos'});
        g++;
        if(r && r.restantes>0){ f('msg').textContent=`Buscando no Bling… (faltam ~${r.restantes})`; }
        else break;
        if(g>200) break;
      }
      f('msg').textContent='Processando cancelamentos…';
      await rpc('cn_processar_cancelamentos',{p_usuario_id:USER.id});

      // ---- 2) claims no Mercado Livre ----
      f('msg').textContent='Buscando no Mercado Livre…';
      g=0;
      while(true){
        const r=await chamarFuncao('sync-mediacoes',{dias:90,limite:20});
        g++;
        if(r && r.restantes>0){ f('msg').textContent=`Buscando no ML… (faltam ~${r.restantes})`; }
        else break;
        if(g>400) break;   // trava: 400 lotes de 20 cobre folgadamente a janela
      }
      f('msg').textContent='Processando…';
      await rpc('cn_processar_mediacoes',{p_usuario_id:USER.id});

      KPIS=null; await carregar(true);
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ alert('Erro ao atualizar: '+(e.message||e)); f('msg').textContent=''; }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // Caso que entrou sem casar com nenhuma venda: o id_pedido guarda o
  // claim como marcador. Classificar assim não cria nada no destino —
  // por isso o aviso na coluna e o botão de correção.
  function semVenda(l){ return String(l.id_pedido||'').startsWith('sem-pedido:'); }

  let EDIT_ID=null;

  function abrir(id){
    if(!temPermissao('mediacoes.editar')) return;
    const l=LINHAS.find(x=>x.id===id); if(!l) return;
    if(l.destino){ alert('Este caso já foi classificado. Devolva à fila antes de editar.'); return; }
    EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-claim').value=l.claim_id||'—';
    f('e-idped').value = semVenda(l) ? '' : (l.id_pedido||'');
    f('e-abertura').value=l.data_abertura||'';
    f('e-canal').value=l.canal||''; f('e-cliente').value=l.cliente||'';
    f('e-uf').value=l.uf||''; f('e-valor').value=l.valor_pedido??'';
    f('e-itens').value=l.qtd_itens??''; f('e-obs').value=l.observacao||'';
    $('med-overlay').classList.add('open'); $('med-drawer').classList.add('open');
    setTimeout(()=>f('e-idped').focus(),50);
  }
  function fecharDrawer(){
    $('med-overlay').classList.remove('open'); $('med-drawer').classList.remove('open'); EDIT_ID=null;
  }

  async function salvarEdicao(){
    if(EDIT_ID==null) return;
    f('drawer-erro').textContent='';
    const b=f('drawer-save'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{
      const r=await rpc('cn_editar_mediacao',{
        p_usuario_id:USER.id, p_mediacao_id:EDIT_ID,
        p_id_pedido:f('e-idped').value.trim()||null,
        p_data_abertura:f('e-abertura').value||null,
        p_canal:f('e-canal').value.trim()||null,
        p_cliente:f('e-cliente').value.trim()||null,
        p_uf:f('e-uf').value.trim().toUpperCase()||null,
        p_valor_pedido:num('e-valor'),
        p_qtd_itens:num('e-itens'),
        p_observacao:f('e-obs').value.trim()||null
      });
      fecharDrawer(); KPIS=null; await carregar();
      // avisa quando continua sem venda: classificar não criaria nada
      f('msg').textContent = (r && r.aviso) ? r.aviso : 'Dados corrigidos.';
    }catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function limparFiltros(){
    ['busca','mes','mesvenda','canal','destino'].forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    KPIS=null; carregar(true);
  }

  async function exportar(){
    if(!temPermissao('mediacoes.exportar')){ alert('Você não tem permissão para exportar.'); return; }
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const fl=filtros();
      const pacote=await rpc('cn_listar_mediacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0});
      const todas=(pacote&&pacote.linhas)||[]; if(!todas.length)return;
      const cols=['data_abertura','canal','id_pedido','claim_id','cliente','uf','qtd_itens',
                  'valor_pedido','tipo_ml','fase_ml','status_ml','motivo_ml','recurso_ml','destino','observacao'];
      const head=['Data','Canal','ID Pedido','Claim','Cliente','UF','Itens','Valor',
                  'Tipo','Fase','Status ML','Motivo','Recurso','Destino','Observacao'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='mediacoes_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>{ KPIS=null; carregar(true); },400); });
    // mês e canal mexem nos cartões; destino, tipo, status e ordem não
    ['mes','mesvenda','canal'].forEach(id=>f(id).addEventListener('change',()=>{ KPIS=null; carregar(true); }));
    ['destino','ordem'].forEach(id=>f(id).addEventListener('change',()=>carregar(true,{kpis:false})));
    f('limpar').addEventListener('click',limparFiltros);
    const bx=f('buscar');
    if(bx){ if(temPermissao('sync.executar')) bx.addEventListener('click',buscar); else bx.style.display='none'; }
    f('exportar').addEventListener('click',exportar);
    f('drawer-x').addEventListener('click',fecharDrawer);
    f('drawer-cancel').addEventListener('click',fecharDrawer);
    f('drawer-save').addEventListener('click',salvarEdicao);
    $('med-overlay').addEventListener('click',fecharDrawer);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(false,{kpis:false}); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(false,{kpis:false}); });
  }

  return { init, classificar, devolver, filtrarDestino, abrir };
})();
window.MED = MED;
registrarTela('mediacoes', MED);
