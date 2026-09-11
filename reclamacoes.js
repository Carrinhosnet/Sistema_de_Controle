// =====================================================================
// CARRINHOS_NET — TELA: Controle de Reclamações
// Depende da base do index.html: $, rpc, chamarFuncao, USER, temPermissao,
// dataBr, mesLabel, registrarTela, atualizarBadges.
// =====================================================================
const REC = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let RESOL_OPC=[];
  const f=(id)=>$('rc-'+id);

  // recorte dos boxes clicáveis; fica fora dos selects porque a função
  // de KPIs o trata diferente — os contadores precisam ignorá-lo para
  // continuarem clicáveis depois de aplicados
  let SO_PENDENTES=false;

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_mes_venda:f('mes-venda').value||null,
    p_canal:f('canal').value||null,
    p_tipo_envio:f('envio').value||null,
    p_uf:f('uf').value||null,
    p_motivo:f('motivo').value||null,
    p_status:f('status').value||null,
    p_tipo_resolucao:f('resolucao').value||null,
    p_conferido:SO_PENDENTES ? false : null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ if(typeof carregarUltimaAuto==='function') await carregarUltimaAuto(); await carregarOpcoes(); await carregarFiltros(); carregar(); bind(); }

  let MOTIVO_OPC=[];
  // tipo de resolução só faz sentido em caso resolvido; o banco limpa o
  // campo quando o status é outro, e a tela acompanha
  const RESOLVIDA='Reclamação resolvida';
  const ANDAMENTO='Reclamação em andamento';

  // Espelha a regra da cn_marcar_conferido_reclamacao. Quem recusa de
  // fato é o banco — aqui só evita o clique que ia dar erro, e explica
  // o porquê no title do checkbox.
  function podeConferir(l){
    if(l.status!==RESOLVIDA) return 'Só é possível conferir uma reclamação resolvida';
    return null;   // null = pode
  }

  // O status virou lista FIXA de três valores, escritos direto no HTML
  // (filtro e drawer) e garantidos por CHECK no banco. Não vem mais de
  // listas_opcoes. O que veio do banco agora é o tipo de resolução.
  async function carregarOpcoes(){
    // lista do DRAWER (só as ativas). O select do filtro é preenchido
    // pelo carregarFiltros, que inclui também valores já gravados que
    // saíram da lista — lá o objetivo é alcançar linhas existentes.
    try{ const r=await rpc('cn_listar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:'tipo_resolucao_reclamacao'});
      RESOL_OPC=(r||[]).filter(o=>o.ativo).map(o=>o.valor);
    }catch(e){ RESOL_OPC=[]; }
    // motivos vêm da tela de Opções Comerciais; lista fechada
    try{ const r=await rpc('cn_listar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:'motivo_reclamacao'});
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
  // Sete listas numa chamada só. Sete idas ao servidor por abertura de
  // tela seriam desperdício — o excesso de chamadas já é pendência no
  // roteiro. O status não vem daqui: é lista fixa, escrita no HTML.
  async function carregarFiltros(){
    try{
      const r=await rpc('cn_filtros_reclamacoes',{p_usuario_id:USER.id}) || {};
      encherMeses('mes-venda', r.meses_venda);
      encherMeses('mes',       r.meses_abertura);
      encher('canal',     r.canais);
      encher('envio',     r.tipos_envio);
      encher('uf',        r.ufs);
      encher('motivo',    r.motivos);
      encher('resolucao', r.resolucoes);
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

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="18" class="loading">Carregando reclamações…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_reclamacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_reclamacoes',fl),
        rpc('cn_kpis_reclamacoes',fl)
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      msgAtualizado('rc-msg','reclamacoes');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="18" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('rc',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');
  function cardHtml(cls,titulo,valor,hint){
    return `<div class="kpi ${cls}"><div class="lbl">${titulo}</div>`+
           `<div class="hint">${hint}</div><div class="val">${valor}</div></div>`;
  }
  // Mesmo formato dos boxes clicáveis de Vendas e Cancelamentos: classe
  // .kpi.click, número na cor e a tarja "filtro ativo · clique para
  // remover" que só aparece com .on. Um padrão para todas as telas.
  function cardFiltro(cls,acao,ativo,titulo,valor,hint){
    return `<div class="kpi click ${cls} ${ativo?'on':''}" onclick="REC.foco('${acao}')">`+
           `<div class="lbl">${titulo}</div><div class="hint">${hint}</div>`+
           `<div class="val">${valor}</div>`+
           `<div class="flag">filtro ativo · clique para remover</div></div>`;
  }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const st=f('status').value;
    box.innerHTML =
      cardHtml('rc-total','Total de reclamações', n0(k.total),
               'Reclamações que atendem aos filtros acima') +
      cardHtml('rc-prej','Prejuízo', brl(k.soma_prejuizo),
               'Soma do que se perdeu e não se recupera') +
      cardFiltro('rc-conf','pendentes', SO_PENDENTES,
               'Faltam conferir', n0(k.faltam), 'Ainda não conferidas') +
      cardFiltro('rc-resolv', RESOLVIDA, st===RESOLVIDA,
               'Resolvidas', n0(k.resolvidas), 'Caso encerrado, com ou sem prejuízo') +
      cardFiltro('rc-andam', ANDAMENTO, st===ANDAMENTO,
               'Em andamento', n0(k.em_aberto), 'Ainda em tratativa com o cliente');
  }

  // Clique nos boxes. Combinam entre si: pendentes + em andamento mostra
  // as que faltam conferir e ainda não terminaram. Clicar no box já
  // ativo desliga aquele recorte, então ele serve de ida e volta.
  function foco(acao){
    if(acao==='pendentes'){ SO_PENDENTES=!SO_PENDENTES; }
    else { f('status').value = (f('status').value===acao) ? '' : acao; }
    carregar(true);
  }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="18" class="empty">Nenhuma reclamação encontrada.</td></tr>'; return; }
    const podeConf=temPermissao('reclamacoes.conferir');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}" onclick="REC.abrir(${l.id})">
      <td>${dataBr(l.data_venda)}</td>
      <td>${dataBr(l.data_abertura)}</td>
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
      <td>${l.tipo_resolucao||'<span style="color:var(--muted)">—</span>'}</td>
      <td>${dataBr(l.data_resolucao)}</td>
      <td class="num">${l.custo_prejuizo==null?'<span style="color:var(--muted)">—</span>':brl(l.custo_prejuizo)}</td>
      <td class="conf" onclick="event.stopPropagation()">${(()=>{
        const impede=podeConferir(l);
        // já conferido pode sempre ser desmarcado, mesmo que hoje não
        // atenda à regra: destravar um engano não pode ficar bloqueado
        const trava = impede && !l.conferido;
        return `<input type="checkbox" class="chk" ${l.conferido?'checked':''} ${(podeConf&&!trava)?'':'disabled'} title="${trava?impede:''}" onchange="REC.conf(${l.id},this.checked,this)">`+
               `<span class="conf-lbl" ${trava?`style="color:var(--muted)" title="${impede}"`:''}>${l.conferido?'Conferido':(trava?'—':'Pendente')}</span>`;
      })()}</td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){ elem.disabled=true; try{ await rpc('cn_marcar_conferido_reclamacao',{p_usuario_id:USER.id,p_reclamacao_id:id,p_conferido:valor}); const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente'; if(typeof atualizarBadges==='function') atualizarBadges(); }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); } finally{ elem.disabled=false; } }

  // o select de status é fixo no HTML: aqui só marca o valor atual
  function fillStatusSel(atual){ f('e-status').value = atual||''; }
  // habilita o tipo de resolução apenas quando o status é "resolvida"
  function sincResolucao(){
    const resolvida = f('e-status').value===RESOLVIDA;
    f('e-tiporesol').disabled = !resolvida;
    if(!resolvida) f('e-tiporesol').value='';
    f('e-tiporesol').title = resolvida ? '' : 'Só se aplica quando a reclamação está resolvida';
  }

  function abrir(id){ if(!temPermissao('reclamacoes.editar'))return; const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-dvenda').value=dataBr(l.data_venda); f('e-canal').value=l.canal||''; f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||''; f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    f('e-abertura').value=l.data_abertura||''; fillStatusSel(l.status);
    fillSelLista('e-tiporesol', RESOL_OPC, l.tipo_resolucao); sincResolucao();
    fillSelLista('e-motivo', MOTIVO_OPC, l.motivo);
    f('e-resolucao').value=l.data_resolucao||''; f('e-numnf').value=l.numero_nf||'';
    f('e-nfd').value=l.nfd||''; f('e-valortotal').value=l.valor_total??'';
    f('e-prejuizo').value=l.custo_prejuizo??'';
    f('e-obs').value=l.observacoes||'';
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }
  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    try{ await rpc('cn_editar_reclamacao',{p_usuario_id:USER.id,p_reclamacao_id:EDIT_ID,
      p_data_abertura:f('e-abertura').value||null,p_motivo:f('e-motivo').value||null,
      p_status:f('e-status').value||null,
      p_tipo_resolucao:f('e-tiporesol').value||null,
      p_data_resolucao:f('e-resolucao').value||null,
      p_numero_nf:f('e-numnf').value||null,p_observacoes:f('e-obs').value||null,
      p_nfd:f('e-nfd').value||null,
      p_valor_total:f('e-valortotal').value===''?null:Number(f('e-valortotal').value),
      p_custo_prejuizo:f('e-prejuizo').value===''?null:Number(f('e-prejuizo').value)});
      fechar(); carregar(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }


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
    if(!confirm('Devolver este reclamação para a fila de Mediações?\n\nA linha sai desta tela e o caso volta para a triagem.')) return;
    const b=f('devolver'); b.disabled=true; const t=b.textContent; b.textContent='Devolvendo…';
    try{
      await rpc('cn_devolver_para_mediacao',{p_usuario_id:USER.id,p_tipo:'reclamacao',p_registro_id:EDIT_ID});
      fechar(); await carregar(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Caso devolvido para a fila de Mediações.';
    }catch(e){ f('drawer-erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // ---- a reclamação virou devolução ----
  // MOVE a linha: cria o registro em Devoluções e apaga daqui. A
  // reclamação deixa de contar nas métricas desta tela porque o caso
  // passou a pertencer à outra — contar nas duas seria contar duas
  // vezes o mesmo acontecimento.
  async function paraDevolucao(){
    if(EDIT_ID==null) return;
    const l=LINHAS.find(x=>x.id===EDIT_ID);
    if(!temPermissao('devolucoes.lancar')){
      alert('Você não tem permissão para lançar devoluções.'); return;
    }
    if(!confirm('Enviar esta reclamação para o Controle de Devoluções?\n\n'+
                'A linha sai desta tela. Os dados preenchidos vão junto; o motivo da '+
                'reclamação fica registrado nas observações da devolução, porque as '+
                'duas telas usam listas de motivo diferentes.')) return;
    const b=f('para-devolucao'); b.disabled=true; const t=b.textContent; b.textContent='Enviando…';
    try{
      await rpc('cn_reclamacao_para_devolucao',{p_usuario_id:USER.id,p_reclamacao_id:EDIT_ID});
      fechar(); await carregar(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Reclamação enviada para o Controle de Devoluções.';
    }catch(e){ f('drawer-erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // modal manual
  function abrirModal(){ if(!temPermissao('reclamacoes.lancar')){ alert('Você não tem permissão para lançar reclamações.'); return; } f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent=''; f('modal').classList.add('open'); f('m-busca').focus(); }
  function fecharModal(){ f('modal').classList.remove('open'); }
  async function buscarVendas(){ const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; } try{ const r=await rpc('cn_buscar_vendas_sem_reclamacao',{p_usuario_id:USER.id,p_busca:busca,p_limite:30}); if(!r||!r.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já está em Reclamações).</p>'; return; } f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID</th><th>SKU</th><th>Cliente</th><th></th></tr></thead><tbody>'+r.map(v=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.modelo||'—'}</td><td>${v.cliente||'—'}</td><td><button onclick="REC.lancar(${v.venda_id})">Lançar</button></td></tr>`).join('')+'</tbody></table>'; }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); } }
  async function lancar(vendaId){ f('m-erro').textContent=''; try{ await rpc('cn_lancar_reclamacao_manual',{p_usuario_id:USER.id,p_venda_id:vendaId}); fecharModal(); await carregar(true); if(typeof atualizarBadges==='function') atualizarBadges(); f('msg').textContent='Reclamação lançada.'; }catch(e){ f('m-erro').textContent=(e.message||e); } }

  // A busca no Mercado Livre saiu daqui em 09/09: quem traz e atualiza
  // os casos é a rotina que alimenta a tela de Mediações, e de lá eles
  // chegam pela triagem. Um botão de buscar nesta tela sugeriria uma
  // segunda porta de entrada que não existe mais.


  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_reclamacoes',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['data_venda','data_abertura','canal','id_pedido','tipo_envio','modelo','quantidade','valor_total','numero_nf','cliente','uf','nfd','motivo','status','tipo_resolucao','data_resolucao','custo_prejuizo','observacoes','origem_lancamento','conferido']; const head=['Data da Venda','Data de Abertura','Canal','ID Pedido','Tipo de Envio','SKU','Quantidade','Valor Total','N NF','Cliente','UF','N NFD','Motivo','Status','Tipo de Resolucao','Data da Resolucao','Prejuizo','Observacoes','Origem','Conferido']; const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='reclamacoes_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  function limparFiltros(){
    ['busca','mes','mes-venda','canal','envio','uf','motivo','status','resolucao']
      .forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    SO_PENDENTES=false;
    carregar(true);
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    // filtros automáticos: nenhum botão de aplicar
    ['mes','mes-venda','canal','envio','uf','motivo','status','resolucao','ordem']
      .forEach(id=>f(id).addEventListener('change',()=>carregar(true)));
    f('limpar').addEventListener('click',limparFiltros);
    f('lancar').addEventListener('click',abrirModal); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('devolver').addEventListener('click',devolver);
    f('para-devolucao').addEventListener('click',paraDevolucao);
    f('e-status').addEventListener('change',sincResolucao);
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal); let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar, foco };
})();
window.REC = REC;
registrarTela('reclamacoes', REC);
