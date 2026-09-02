// =====================================================================
// CARRINHOS_NET — TELA: Controle de Métricas Financeiras
// Depende da base do index.html: $, rpc, USER, temPermissao, brl, pct,
// mesLabel, registrarTela.
//
// ESTRUTURA: uma faixa por métrica, com cinco caixas — Total, ME1, ME2,
// Site e Venda Direta. Cada caixa traz o valor e, logo abaixo, o
// percentual, para comparar bruto e proporção sem trocar de tela.
//
// O QUE CADA PERCENTUAL SIGNIFICA
//   Faturamento e pedidos → quanto o canal representa do total.
//   Demais métricas       → quanto aquilo consome do faturamento DO
//                           PRÓPRIO canal. É o que responde "o frete
//                           come mais no ME2 ou no ME1?".
//   Ticket médio          → sem percentual: é uma média, não uma parte.
//
// Todos os percentuais são calculados aqui, a partir dos valores que a
// função devolve. Não existe percentual vindo do banco — uma fonte só
// para cada número.
//
// CANAIS: ME1 é venda do Mercado Livre COM envio; ME2, sem envio.
// Mesmo critério do frete desde o arquivo 69, e não o rótulo ME1/ME2.
// =====================================================================
const MET = (function(){
  let DADOS=[], MES=null;
  const f=(id)=>$('met-'+id);

  // Vendas anteriores a 01/08/2026 são de teste e têm frete zerado:
  // qualquer mês antes disso mostra custo irreal e receita inflada.
  const CORTE='2026-08';

  const CANAIS=[
    ['total','Total'],
    ['me1','ME1 — ML com envio'],
    ['me2','ME2 — ML sem envio'],
    ['site','Site'],
    ['vd','Venda Direta']
  ];

  // [chave, rótulo, formato, tipo de percentual, explicação]
  //   'parte'   = quanto o canal representa do total
  //   'consumo' = quanto consome do faturamento do próprio canal
  //   null      = sem percentual
  const METRICAS=[
    ['faturamento','Faturamento bruto','brl','parte',
     'Total das notas, com frete extra'],
    ['qtd_pedidos','Quantidade de pedidos','num','parte',
     'Pedidos distintos no mês'],
    ['ticket_medio','Ticket médio','brl',null,
     'Faturamento dividido pelos pedidos'],
    ['comissao','Comissão da plataforma','brl','consumo',
     'O que o canal cobrou pela venda'],
    ['gasto_frete','Gasto com frete','brl','consumo',
     'Custo real do transporte'],
    ['previsao_frete','Previsão de gasto com frete','brl','consumo',
     'Frete esperado, do Controle de Custo de Frete'],
    ['diferenca_frete','Diferença do frete','brl','consumo',
     'Previsão menos gasto real'],
    ['frete_extra','Pagamento extra de frete','brl','consumo',
     'Frete cobrado do cliente'],
    ['receita_comercial','Receita comercial','brl','consumo',
     'Faturamento menos frete e frete extra']
  ];

  async function init(){ await carregarMeses(); await carregar(); bind(); }

  async function carregarMeses(){
    try{
      const meses=await rpc('cn_meses_metricas',{p_usuario_id:USER.id});
      (meses||[]).forEach(m=>{
        const o=document.createElement('option');
        o.value=m.mes; o.textContent=mesLabel(m.mes);
        f('mes').appendChild(o);
      });
      // abre no mês mais recente que tenha venda
      if(meses && meses.length){ f('mes').value=meses[0].mes; MES=meses[0].mes; }
    }catch(e){}
  }

  async function carregar(){
    f('corpo').innerHTML='<p class="loading">Carregando métricas…</p>';
    MES=f('mes').value||null;
    try{
      const r=await rpc('cn_metricas_financeiras',{p_usuario_id:USER.id,p_mes:MES});
      DADOS=r||[];
      render();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){
      f('corpo').innerHTML='<p class="empty">Erro: '+(e.message||e)+'</p>';
    }
  }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');
  function fmt(v,tipo){ return tipo==='num' ? n0(v) : brl(Number(v||0)); }

  // percentual só existe quando há base: sem faturamento não há
  // proporção a mostrar, e escrever 0% sugeriria medição.
  function calcPct(valor, base){
    const b=Number(base||0);
    if(!b) return null;
    return (Number(valor||0)/b)*100;
  }
  function txtPct(p){
    if(p===null) return '<span style="color:var(--muted)">—</span>';
    const cor = p<0 ? 'var(--danger)' : 'var(--muted)';
    return `<span style="color:${cor}">${p.toFixed(1).replace('.',',')}%</span>`;
  }

  function caixa(mesObj, ck, rotulo, met){
    const [chave, , formato, tipoPct] = met;
    const c=(mesObj.canais&&mesObj.canais[ck])||{};
    const valor=c[chave];

    let pctHtml='';
    if(tipoPct==='parte'){
      const total=(mesObj.canais&&mesObj.canais.total)||{};
      const p = (ck==='total') ? 100 : calcPct(valor, total[chave]);
      pctHtml=`<div class="met-pct">${txtPct(p)} do total</div>`;
    }else if(tipoPct==='consumo'){
      const p=calcPct(valor, c.faturamento);
      pctHtml=`<div class="met-pct">${txtPct(p)} do faturamento</div>`;
    }

    const negativo = Number(valor||0) < 0;
    return `<div class="kpi met-cx${ck==='total'?' met-cx-total':''}">`+
           `<div class="lbl">${rotulo}</div>`+
           `<div class="val"${negativo?' style="color:var(--danger)"':''}>${fmt(valor,formato)}</div>`+
           pctHtml+
           `</div>`;
  }

  function render(){
    const box=f('corpo');
    if(!DADOS.length){
      box.innerHTML='<p class="empty">Nenhuma venda no período selecionado.</p>';
      return;
    }
    box.innerHTML=DADOS.map(m=>{
      const incompleto = String(m.mes||'') < CORTE;
      const aviso = incompleto
        ? `<div class="met-aviso">Mês anterior a agosto/2026: as vendas desse período são de teste e têm frete zerado, então o custo aparece menor e a receita, maior do que foi.</div>`
        : '';
      const faixas=METRICAS.map(met=>{
        const [ ,rotulo, , ,hint]=met;
        return `<div class="met-faixa">`+
               `<div class="met-titulo">${rotulo}<span class="met-hint">${hint}</span></div>`+
               `<div class="met-grid">`+
               CANAIS.map(([ck,rot])=>caixa(m,ck,rot,met)).join('')+
               `</div></div>`;
      }).join('');
      return `<div class="met-mes"><h3 class="met-mes-tit">${mesLabel(m.mes)}</h3>${aviso}${faixas}</div>`;
    }).join('');
  }

  async function exportar(){
    const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      if(!DADOS.length) return;
      const head=['Mes','Metrica','Total','ME1','ME2','Site','Venda Direta'];
      const ls=[];
      DADOS.forEach(m=>{
        METRICAS.forEach(([chave,rotulo])=>{
          const linha=[mesLabel(m.mes), rotulo];
          CANAIS.forEach(([ck])=>{
            const c=(m.canais&&m.canais[ck])||{};
            const v=c[chave];
            linha.push(v==null?'':String(v).replace('.',','));
          });
          ls.push(linha.map(v=>{v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
        });
      });
      const csv=[head.join(';'),...ls].join('\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='metricas_financeiras_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    f('mes').addEventListener('change',carregar);
    f('atualizar').addEventListener('click',carregar);
    f('exportar').addEventListener('click',exportar);
  }

  return { init };
})();
window.MET = MET;
registrarTela('metricas', MET);
