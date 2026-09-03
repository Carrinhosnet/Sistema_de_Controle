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
// =====================================================================
const CAN = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, KPIS=null; const POR=100;
  const f=(id)=>$('can-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_canal:f('canal').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarFiltros(); await carregar(); bind(); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_cancelamentos',{p_usuario_id:USER.id});
      (meses||[]).forEach(m=>{ const o=document.createElement('option');
        o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); });
    }catch(e){}
    try{ const canais=await rpc('cn_canais_cancelamentos',{p_usuario_id:USER.id});
      (canais||[]).forEach(c=>{ const o=document.createElement('option');
        o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); });
    }catch(e){}
  }

  async function carregar(reset, opts){
    if(reset) PAGINA=0;
    const precisaKpis = !(opts && opts.kpis===false) || KPIS===null;
    f('tbody').innerHTML='<tr><td colspan="12" class="loading">Carregando cancelamentos…</td></tr>';
    const fl=filtros();
    try{
      const chamadas=[
        rpc('cn_listar_cancelamentos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_cancelamentos',fl)
      ];
      if(precisaKpis) chamadas.push(rpc('cn_kpis_cancelamentos',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal}));
      const res=await Promise.all(chamadas);
      LINHAS=res[0]||[]; TOTAL=Number(res[1])||0;
      if(precisaKpis) KPIS=(res[2]&&res[2][0])||null;
      renderKpis(KPIS); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="12" class="empty">Erro: '+(e.message||e)+'</td></tr>';
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
  function cardHtml(titulo,valor,hint){
    return `<div class="kpi"><div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div></div>`;
  }

  function renderKpis(k){
    const box=f('kpis'); if(!k){box.innerHTML='';return;}
    box.innerHTML =
      cardHtml('Valor cancelado', brl(k.valor_cancelado), 'Soma do valor das vendas canceladas') +
      cardHtml('Pedidos', n0(k.qtd_pedidos), 'Pedidos distintos cancelados') +
      cardHtml('Ticket médio', brl(k.ticket_medio), 'Valor cancelado dividido pelos pedidos') +
      cardHtml('Comissão envolvida', brl(k.total_comissao), 'Comissão das vendas que caíram') +
      cardHtml('Registros', n0(k.total), 'Uma linha por SKU cancelado') +
      cardHtml('Faltam conferir', n0(k.faltam), 'Ainda não conferidos');
  }

  function renderTabela(){
    const tb=f('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="12" class="empty">Nenhum cancelamento encontrado.</td></tr>'; return; }
    const podeConf=temPermissao('cancelamentos.conferir');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}">
      <td>${dataBr(l.data_compra)}</td>
      <td>${dataBr(l.data_venda)}</td>
      <td>${l.canal||'—'}</td>
      <td>${l.id_pedido||'—'}</td>
      <td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td>
      <td>${l.cliente||'—'}</td>
      <td>${l.uf||'—'}</td>
      <td class="num">${brl(l.valor_total)}</td>
      <td class="num">${brl(l.valor_comissao)}</td>
      <td>${l.tipo_envio||'—'}</td>
      <td class="conf"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="CAN.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){
    elem.disabled=true;
    try{
      await rpc('cn_marcar_conferido_cancelamento',{p_usuario_id:USER.id,p_cancelamento_id:id,p_conferido:valor});
      const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor;
      const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor);
      tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente';
      KPIS=null; renderKpis(KPIS);
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ elem.checked=!valor; alert('Não foi possível marcar: '+(e.message||e)); }
    finally{ elem.disabled=false; }
  }

  function limparFiltros(){
    ['busca','mes','canal'].forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    KPIS=null; carregar(true);
  }

  async function exportar(){
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const fl=filtros();
      const todas=await rpc('cn_listar_cancelamentos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0});
      if(!todas||!todas.length)return;
      const cols=['data_compra','data_venda','canal','id_pedido','modelo','quantidade','cliente','uf',
                  'valor_total','valor_comissao','tipo_envio','frete','frete_extra','conferido'];
      const head=['Data Cancelamento','Data Venda','Canal','ID Pedido','SKU','Qtd','Cliente','UF',
                  'Valor','Comissao','Envio','Frete','Frete Extra','Conferido'];
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
    ['mes','canal'].forEach(id=>f(id).addEventListener('change',()=>{ KPIS=null; carregar(true); }));
    f('ordem').addEventListener('change',()=>carregar(true,{kpis:false}));
    f('limpar').addEventListener('click',limparFiltros);
    f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(false,{kpis:false}); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(false,{kpis:false}); });
  }

  return { init, conf };
})();
window.CAN = CAN;
registrarTela('cancelamentos', CAN);
