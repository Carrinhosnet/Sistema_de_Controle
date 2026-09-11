// =====================================================================
// CARRINHOS_NET — TELA: Controle de Cancelamentos
// Depende da base do index.html: $, rpc, USER, temPermissao, brl,
// dataBr, mesLabel, registrarTela, atualizarBadges, montarIrPara.
//
// Separada da tela de Devoluções, que antes vinham juntas por UNION.
// São objetos diferentes: cancelamento espelha a venda (valor unitário,
// comissão, frete, lucro), devolução tem vida própria (NF, NFD, custo
// da devolução, prejuízo). Acompanhamentos e responsáveis diferentes.
//
// A ENTRADA VEM DA TRIAGEM: casos classificados no Controle de
// Mediações chegam aqui. A reconciliação do Bling continua existindo,
// mas quem decide o destino é a triagem.
//
// RESPONSÁVEL x MOTIVO (08/09/2026)
// São duas colunas independentes. `responsavel` diz QUEM originou o
// cancelamento (Cliente, Vendedor, Plataforma, Indireta) e é o que os
// boxes coloridos filtram; `motivo` continua sendo a lista aberta de
// Opções Comerciais. Separados porque a mesma origem tem vários
// motivos, e agrupar pelo texto do motivo seria frágil.
//
// FILTROS SÃO AUTOMÁTICOS: qualquer mudança recarrega, sem botão de
// aplicar. Só a busca espera, para não disparar a cada tecla.
// =====================================================================
const CAN = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, KPIS=null; const POR=100;
  // recortes dos boxes clicáveis. Ficam fora dos selects porque a
  // função de KPIs os trata diferente dos demais filtros: os contadores
  // por responsável precisam ignorá-los para continuarem clicáveis.
  let RESPONSAVEL=null;      // 'Cliente' | 'Vendedor' | 'Plataforma' | 'Indireta'
  let SO_PENDENTES=false;
  const f=(id)=>$('can-'+id);

  const RESPS=['Cliente','Vendedor','Plataforma','Indireta'];
  const classeResp=(r)=>'r-'+String(r||'').toLowerCase();

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_mes_venda:f('mes-venda').value||null,
    p_canal:f('canal').value||null,
    p_tipo_envio:f('envio').value||null,
    p_uf:f('uf').value||null,
    p_motivo:f('motivo').value||null,
    p_responsavel:RESPONSAVEL,
    p_conferido:SO_PENDENTES ? false : null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarMotivos(); await carregarFiltros(); await carregar(); bind(); }

  // Seis listas para os selects, numa chamada só. Seis funções seriam
  // seis idas ao servidor a cada abertura de tela; o excesso de chamadas
  // por tela já é pendência registrada no roteiro.
  async function carregarFiltros(){
    try{
      const r=await rpc('cn_filtros_cancelamentos',{p_usuario_id:USER.id}) || {};
      encherMeses('mes-venda', r.meses_venda);
      encherMeses('mes',       r.meses_cancel);
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
    f('tbody').innerHTML='<tr><td colspan="13" class="loading">Carregando cancelamentos…</td></tr>';
    const fl=filtros();
    try{
      const chamadas=[
        rpc('cn_listar_cancelamentos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_cancelamentos',fl)
      ];
      if(precisaKpis) chamadas.push(rpc('cn_kpis_cancelamentos',fl));
      const res=await Promise.all(chamadas);
      LINHAS=res[0]||[]; TOTAL=Number(res[1])||0;
      if(precisaKpis) KPIS=(res[2]&&res[2][0])||null;
      renderKpis(KPIS); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="13" class="empty">Erro: '+(e.message||e)+'</td></tr>';
    }
  }

  function renderPag(){
    const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,
          i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL);
    f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`;
    f('paginfo').textContent=`Página ${p} de ${tp}`;
    f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    if(typeof montarIrPara==='function') montarIrPara('can',p,tp,(n)=>{ PAGINA=n-1; carregar(false,{kpis:false}); });
  }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');
  function cardHtml(titulo,valor,hint,cls){
    return `<div class="kpi ${cls||''}"><div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div></div>`;
  }

  // Mesmo formato dos boxes clicáveis da tela de Vendas: classe
  // .kpi.click, número na cor e a tarja "filtro ativo · clique para
  // remover" que só aparece quando .on está presente. Um padrão só
  // para as duas telas.
  function cardFiltro(cls,acao,ativo,titulo,valor,hint){
    return `<div class="kpi click ${cls} ${ativo?'on':''}" onclick="CAN.foco('${acao}')">`+
           `<div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div>`+
           `<div class="flag">filtro ativo · clique para remover</div></div>`;
  }

  function renderKpis(k){
    const box=f('kpis'); if(!k){box.innerHTML='';return;}
    box.innerHTML =
      cardHtml('Valor cancelado', brl(k.valor_cancelado), 'Soma do valor das vendas canceladas') +
      cardHtml('Comissão cancelada', brl(k.total_comissao), 'Comissão que deixou de ser cobrada') +
      cardHtml('Pedidos cancelados', n0(k.qtd_pedidos), 'Pedidos distintos, não linhas') +
      // Registros é informativo: ele mostra quantas linhas a tela tem
      // agora. Como botão ele ficaria com a tarja "filtro ativo" ligada
      // o tempo todo que nenhum recorte estivesse aplicado, sugerindo
      // um filtro que não existe. Para limpar os recortes há o botão
      // Limpar filtros, e cada box desliga a si mesmo no segundo clique.
      cardHtml('Registros', n0(k.total), 'Uma linha por SKU', 'cn-todos') +
      cardFiltro('cn-pendentes','pendentes', SO_PENDENTES,
        'Faltam conferir', n0(k.faltam), 'Ainda não conferidos') +
      cardFiltro('cn-cliente','Cliente', RESPONSAVEL==='Cliente',
        'Cancelados pelo cliente', n0(k.por_cliente), 'Desistência ou erro do comprador') +
      cardFiltro('cn-vendedor','Vendedor', RESPONSAVEL==='Vendedor',
        'Cancelados pelo vendedor', n0(k.por_vendedor), 'Sem estoque, preço errado, não conseguimos entregar') +
      cardFiltro('cn-plataforma','Plataforma', RESPONSAVEL==='Plataforma',
        'Cancelados pela plataforma', n0(k.por_plataforma), 'Cancelado pelo próprio marketplace') +
      cardFiltro('cn-indireta','Indireta', RESPONSAVEL==='Indireta',
        'Cancelados indiretamente', n0(k.por_indireta), 'Refeitos por nós, como divisão em vários envios');
  }

  // Clique nos boxes. Combinam entre si: pendentes + cliente mostra os
  // pendentes do cliente. Clicar no box já ativo desliga aquele recorte,
  // então o próprio box serve de ida e volta.
  function foco(acao){
    if(acao==='pendentes'){ SO_PENDENTES=!SO_PENDENTES; }
    else { RESPONSAVEL = (RESPONSAVEL===acao) ? null : acao; }
    KPIS=null; carregar(true);
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="13" class="empty">Nenhum cancelamento encontrado.</td></tr>'; return; }
    const podeConf=temPermissao('cancelamentos.conferir');
    const editavel=temPermissao('cancelamentos.editar');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}"${editavel?` style="cursor:pointer" onclick="CAN.abrir(${l.id})"`:''}>
      <td>${dataBr(l.data_venda)}</td>
      <td>${dataBr(l.data_compra)}</td>
      <td>${l.canal||'—'}</td>
      <td>${celPedido(l.id_pedido)}</td>
      <td>${l.tipo_envio||'—'}</td>
      <td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td>
      <td class="num">${brl(l.valor_total)}</td>
      <td>${l.cliente||'—'}</td>
      <td>${l.uf||'—'}</td>
      <td>${l.responsavel?`<span class="resp ${classeResp(l.responsavel)}">${l.responsavel}</span>`:'<span style="color:var(--muted)">—</span>'}</td>
      <td>${l.motivo||'<span style="color:var(--muted)">—</span>'}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="CAN.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){
    elem.disabled=true;
    try{
      await rpc('cn_marcar_conferido_cancelamento',{p_usuario_id:USER.id,p_cancelamento_id:id,p_conferido:valor});
      const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor;
      const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor);
      tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente';
      // Antes aqui havia "KPIS=null; renderKpis(KPIS)", e renderKpis(null)
      // esvazia a caixa: os seis cartões sumiam, a página encolhia e a
      // barra de rolagem desaparecia junto. Conferir muda um número só —
      // atualiza esse e mantém o resto na tela.
      if(KPIS){ KPIS.faltam = Math.max(0, Number(KPIS.faltam||0) + (valor ? -1 : 1)); renderKpis(KPIS); }
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); }
    finally{ elem.disabled=false; }
  }

  // ---- edição do motivo ----
  // Só o motivo é editável: o resto vem da venda, e alterar aqui criaria
  // divergência silenciosa com o Controle de Vendas.
  let EDIT_ID=null, MOTIVOS=[];

  async function carregarMotivos(){
    try{
      const r=await rpc('cn_listar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:'motivo_cancelamento'});
      MOTIVOS=(r||[]).filter(o=>o.ativo).map(o=>o.valor);
    }catch(e){ MOTIVOS=[]; }
  }

  // Lista fechada: só o que estiver cadastrado em Opções Comerciais.
  // O valor atual entra na lista mesmo se tiver sido inativado depois,
  // senão abrir o registro apagaria silenciosamente o que já estava lá.
  function fillMotivo(atual){
    const sel=f('e-motivo'); sel.innerHTML='<option value="">—</option>';
    const opts=[...MOTIVOS];
    if(atual && !opts.includes(atual)) opts.unshift(atual);
    opts.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v;
      if(v===atual)o.selected=true; sel.appendChild(o); });
    sel.value=atual||'';
  }

  function abrir(id){
    if(!temPermissao('cancelamentos.editar'))return;
    const l=LINHAS.find(x=>x.id===id); if(!l)return;
    EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||'';
    f('e-cliente').value=l.cliente||''; f('e-data').value=dataBr(l.data_compra);
    f('e-responsavel').value = RESPS.includes(l.responsavel) ? l.responsavel : '';
    fillMotivo(l.motivo);
    f('overlay').classList.add('open'); f('drawer').classList.add('open');
    setTimeout(()=>f('e-responsavel').focus(),50);
  }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }

  async function salvar(){
    if(EDIT_ID==null)return;
    f('drawer-erro').textContent='';
    const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...';
    try{
      await rpc('cn_editar_cancelamento',{p_usuario_id:USER.id,p_cancelamento_id:EDIT_ID,
        p_motivo:f('e-motivo').value||null,
        p_responsavel:f('e-responsavel').value||null});
      fechar(); KPIS=null; carregar();
    }catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent='Salvar'; }
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
    if(!confirm('Devolver este cancelamento para a fila de Mediações?\n\nA linha sai desta tela e o caso volta para a triagem.')) return;
    const b=f('devolver'); b.disabled=true; const t=b.textContent; b.textContent='Devolvendo…';
    try{
      await rpc('cn_devolver_para_mediacao',{p_usuario_id:USER.id,p_tipo:'cancelamento',p_registro_id:EDIT_ID});
      fechar(); KPIS=null; await carregar(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
      f('msg').textContent='Caso devolvido para a fila de Mediações.';
    }catch(e){ f('drawer-erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function limparFiltros(){
    ['busca','mes','mes-venda','canal','envio','uf','motivo'].forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    RESPONSAVEL=null; SO_PENDENTES=false;
    KPIS=null; carregar(true);
  }

  async function exportar(){
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const fl=filtros();
      const todas=await rpc('cn_listar_cancelamentos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0});
      if(!todas||!todas.length)return;
      const cols=['data_venda','data_compra','canal','id_pedido','tipo_envio','modelo','quantidade',
                  'valor_total','cliente','uf','responsavel','motivo',
                  'valor_comissao','frete','frete_extra','conferido'];
      const head=['Data da Venda','Data de Cancelamento','Canal','ID Pedido','Tipo de Envio','SKU','Quantidade',
                  'Valor Total','Cliente','UF','Responsavel','Motivo do Cancelamento',
                  'Comissao','Frete','Frete Extra','Conferido'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='cancelamentos_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>{ KPIS=null; carregar(true); },400); });
    ['mes','mes-venda','canal','envio','uf','motivo'].forEach(id=>
      f(id).addEventListener('change',()=>{ KPIS=null; carregar(true); }));
    f('ordem').addEventListener('change',()=>carregar(true,{kpis:false}));
    f('limpar').addEventListener('click',limparFiltros);
    f('exportar').addEventListener('click',exportar);
    f('devolver').addEventListener('click',devolver);
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar);
    f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(false,{kpis:false}); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(false,{kpis:false}); });
  }

  return { init, conf, abrir, foco };
})();
window.CAN = CAN;
registrarTela('cancelamentos', CAN);
