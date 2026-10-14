// =====================================================================
// CARRINHOS_NET — TELA: Listagem de Envios (grupo Expedição)
// (até 14/10/2026 se chamava "Lista do dia")
// Depende da base do index.html: $, USER, rpc, SUPABASE_KEY, FUNC_URL,
// verificarSessao, renovarSessao, temPermissao, registrarTela.
// Imprime pelo #print-area do index (mesmo mecanismo da Análise de
// Estoque): o navegador abre a janela de impressão e "Salvar como PDF".
//
// O QUE FAZ
//   "Gerar listagem" chama a Edge Function expedicao-lista, que junta
//   os envios que precisam sair hoje (e os atrasados) do Mercado Livre e
//   dos outros canais (Bling), grava a lista no histórico e devolve.
//   Qualquer lista do histórico pode ser reaberta e reimpressa: ela
//   mostra os envios como estavam na hora em que foi gerada.
//
// FILTROS DO PAINEL: leitura (todas / não lidas / lidas) e período
//   (de / até — aplicado no banco, acha listas antigas também).
//
// TELA EM DOIS NÍVEIS (13/10/2026)
//   PAINEL (inicial): todas as listas geradas, por dia. As NÃO LIDAS —
//   automáticas de hoje que ainda contam no aviso — ficam destacadas e
//   no topo do dia; as lidas mostram quem leu e quando. Clicar numa linha
//   abre o DETALHE (texto do WhatsApp, impressões e lista completa), com
//   "← Voltar ao painel".
//
// COMO A LISTA É ORGANIZADA (tela e PDF iguais)
//   1. ATRASADOS — despacho vencido, qualquer produto. Sempre no topo.
//   2. Um bloco por PRODUTO (SKU), em ordem de SKU — envios de hoje que
//      levam um produto só. É a ordem de montar e etiquetar os pacotes.
//   3. PEDIDOS MISTOS — envios de hoje com mais de um produto.
//   4. CONFERIR — o que não bate entre Bling e ML (não entra na contagem).
//   5. Resumo: pacotes e unidades por produto.
//   A numeração (Nº) corre a lista inteira, para riscar no papel.
//   Kits e Combos: o SKU vendido e, abaixo e menor, o que vai dentro.
//
// LISTA SIMPLIFICADA (texto para o WhatsApp) — 13/10/2026
//   Mesmo conteúdo, no formato que a expedição já usa:
//     VENDAS <DIA> (dd/mm)
//     ENVIAR VIA TRANSPORTADORA (ME1, Venda Direta, Shopify)
//        Envios Atrasados / Envios para Hoje → PACOTE 01: SKU - N unidades
//     ENVIAR VIA AGÊNCIA DO MERCADO LIVRE ATÉ ÀS HH:MM
//        Envios Atrasados / Envios para Hoje
//     ---- separador ----
//     ITENS PARA PRODUÇÃO → só os de Origem "Fabricação Própria" no
//        cadastro, somados por SKU, separados por transportadora e agência
//   Fracionado aparece pelo SKU do produto base + medida ("CE8MM - 0,5
//   metro"). Combo aparece DESMONTADO: produto + quantidade total
//   ("R08M-KIT4" × 3 → "R08M - 12 unidades"). Kit fica pelo SKU do kit,
//   com a composição: "P20D-1ABA60 (Kit com 1 unidade do P20D + 1
//   unidade do 1ABA60) - 1 unidade do kit". "Copiar para WhatsApp" copia com *negrito* do WhatsApp;
//   "Imprimir simplificada" sai numa folha A4 em pé.
// =====================================================================
const EXP = (function(){
  const f=(id)=>$('ex-'+id);
  const FUNCAO='expedicao-lista';
  let LISTA=null;        // conteúdo da lista aberta
  let LISTA_BASE=null;   // na ATUALIZAÇÃO: a lista principal do dia (para a numeração dos pacotes)
  let HIST=[];           // histórico carregado (para abrir a lista nova sozinho)
  let LISTA_ID=null;
  let OCUPADO=false;

  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ddmm=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7) : '';
  const brData=(dia)=>dia? dia.slice(8,10)+'/'+dia.slice(5,7)+'/'+dia.slice(0,4) : '';
  const horaDe=(iso)=>{ const m=String(iso||'').match(/T(\d{2}):(\d{2})/); return m? m[1]+':'+m[2] : ''; };
  const quando=(iso)=>{ try{ return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso||''; } };
  const DIAS=['dom','seg','ter','qua','qui','sex','sáb'];
  const diaSemana=(dia)=>{ if(!dia) return ''; const [y,m,d]=dia.split('-').map(Number); return DIAS[new Date(y,m-1,d).getDay()]; };

  // ---------------------------------------------------------------
  // chamada à Edge Function, com o token de login (x-sessao)
  // ---------------------------------------------------------------
  async function chamar(corpo){
    if(USER && !verificarSessao()) throw new Error('Sessão expirada.');
    renovarSessao();
    let resp;
    try{
      resp=await fetch(FUNC_URL(FUNCAO),{method:'POST',
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
                 'Content-Type':'application/json','x-sessao':(USER&&USER.token)||''},
        body:JSON.stringify(corpo)});
    }catch(e){ throw new Error('Sem conexão com o servidor.'); }
    const txt=await resp.text(); let data; try{ data=JSON.parse(txt); }catch{ data=null; }
    if(resp.ok && data && data.ok) return data;
    throw new Error((data&&data.erro)||('HTTP '+resp.status+(txt?': '+txt.slice(0,150):'')));
  }

  // ---------------------------------------------------------------
  // FILTRO DOS BOXES (14/10/2026)
  //   Boxes clicáveis, que se combinam (menos "Listagem completa"):
  //     Envios para hoje · Atrasados · Próximos dias → somam entre si
  //     Itens para produzir → lente: só envios/itens de Fabricação Própria;
  //                           o texto mostra só ITENS PARA PRODUÇÃO
  //                           (sozinho = o que sai hoje: hoje + atrasados)
  //     Conferir            → acrescenta os pedidos a conferir
  //     Listagem completa   → tudo (é o que abre selecionado)
  //   O filtro vale para o texto copiado, os painéis, o resumo de
  //   produtos e as três impressões.
  // ---------------------------------------------------------------
  const FILTRO=new Set();                     // vazio = Listagem completa
  const STATUS=['atrasados','hoje','proximos'];
  function grupos(lista){
    const ehAtu=lista.tipo==='atualizacao';
    const base= ehAtu ? (lista.novas||lista.envios||[]) : (lista.envios||[]);
    return { atrasados: base.filter(e=>e.atrasado), hoje: base.filter(e=>!e.atrasado),
             proximos: Array.isArray(lista.proximos) ? lista.proximos : [],
             temProximos: Array.isArray(lista.proximos),
             conferir: lista.conferir||[], canceladas: ehAtu ? (lista.canceladas||[]) : [], ehAtu };
  }
  const itemProduz=(i)=>desmontar([i]).some(ehFabricacao);
  const temProducao=(e)=>(e.itens||[]).some(itemProduz);
  function visao(lista){
    const g=grupos(lista);
    const completa=!FILTRO.size;
    const produzir=FILTRO.has('produzir');
    let mostra= completa ? STATUS.slice() : STATUS.filter(s=>FILTRO.has(s));
    if(!completa && !mostra.length && produzir) mostra=['atrasados','hoje'];   // produzir sozinho: o que sai hoje
    const sel={};
    for(const s of STATUS){
      let l= mostra.includes(s) ? g[s] : [];
      // itens para produzir: só os envios com produção, e só os itens de produção
      if(produzir) l=l.filter(temProducao).map(e=>Object.assign({},e,{itens:(e.itens||[]).filter(itemProduz)}));
      sel[s]=l;
    }
    // produção do texto: na listagem completa, só o que sai hoje
    const prodStatus= completa ? ['atrasados','hoje'] : mostra;
    return { g, completa, produzir, conferir: completa || FILTRO.has('conferir'), mostra, sel, prodStatus,
             canceladas: (completa || mostra.some(s=>s!=='proximos')) && !produzir ? g.canceladas : [] };
  }
  const NOME_FILTRO={hoje:'Envios para hoje', atrasados:'Atrasados', proximos:'Próximos dias', produzir:'Itens para produzir', conferir:'Conferir'};
  const rotuloFiltro=()=> FILTRO.size ? [...FILTRO].map(k=>NOME_FILTRO[k]).join(' + ') : 'Listagem completa';

  // número do pacote (por via), igual ao texto: atualização continua a
  // numeração da listagem principal do dia
  function mapaPacotes(lista){
    const m=new Map();
    const ehAtu=lista.tipo==='atualizacao';
    const base= ehAtu && LISTA_BASE && LISTA_BASE.id===lista.base_id ? (LISTA_BASE.envios||[]) : [];
    const fonte= ehAtu ? (lista.novas||lista.envios||[]) : (lista.envios||[]);
    for(const via of ['transportadora','agencia']){
      const ini= ehAtu ? numerar(base,via).ultimo : 0;
      const nu=numerar(fonte,via);
      for(const x of [...nu.atrasados,...nu.hoje]) m.set(x.e.chave,{n:ini+x.n,via});
      if(ehAtu) for(const [ch,n] of numerar(base,via).porChave) if(!m.has(ch)) m.set(ch,{n,via});
    }
    return m;
  }

  // envio: número inteiro com os 5 últimos em destaque (como na etiqueta)
  const envioHtml=(e)=> e.envio ? `${escH(e.envio.slice(0,-5))}<b class="ex-fim">${escH(e.envio.slice(-5))}</b>` : '—';
  function despacharHtml(e){
    if(e.despachar_ate) return `${diaSemana(e.dia_despacho)} ${ddmm(e.dia_despacho)} ${horaDe(e.despachar_ate)}`;
    return `${diaSemana(e.dia_despacho)} ${ddmm(e.dia_despacho)}`;
  }
  const corSituacao=(s)=> /^AGUARDANDO NF/.test(s)?'ex-s-nf' : /^ETIQUETA (LIBERADA|IMPRESSA)/.test(s)?'ex-s-ok' : /^ETIQUETA PRÓPRIA/.test(s)?'ex-s-propria' : /^CANCELADO/.test(s)?'ex-s-canc' : 'ex-s-outra';
  const NOME_VIA={transportadora:'Via transportadora (ME1, Venda Direta, Shopify…)', agencia:'Via agência do Mercado Livre'};

  // linhas de uma tabela de envios: uma linha por item, dados do envio
  // agrupados (rowspan). Nº = número do pacote (o mesmo do texto)
  function linhasEnvios(envios, nPac){
    let h='';
    for(const e of envios){
      const itens=e.itens||[];
      const np=nPac(e);
      itens.forEach((it,k)=>{
        const primeira=k===0, span=itens.length;
        const comp=(it.componentes&&it.componentes.length)
          ? `<div class="ex-comp">contém: ${it.componentes.map(c=>`${c.qtd}× ${escH(c.sku)}${c.descricao?' '+escH(c.descricao):''}`).join(' · ')}</div>` : '';
        const fora=it.cadastro===false? ' <span class="ex-fora">(fora do cadastro)</span>' : '';
        h+=`<tr class="${primeira?'ex-novo':''}">`+
          (primeira? `<td class="num ex-n" rowspan="${span}">${np?String(np).padStart(2,'0'):'—'}</td>` : '')+
          `<td class="ex-sku">${escH(it.sku||'(sem SKU)')}</td><td class="pr-desc ex-desc">${escH(it.descricao)}${fora}${comp}</td>`+
          `<td class="num ex-qtd">${escH(it.qtd)}</td>`+
          (primeira? `<td rowspan="${span}">${escH(e.canal)}${e.tipo_envio&&e.tipo_envio!=='—'?`<div class="ex-mudo">${escH(e.tipo_envio)}</div>`:''}</td>
            <td rowspan="${span}" class="ex-envio">${envioHtml(e)}</td>
            <td rowspan="${span}">${escH(e.pedido)}</td>
            <td rowspan="${span}" class="${e.atrasado?'ex-atraso':''}">${escH(despacharHtml(e))}</td>
            <td rowspan="${span}"><span class="ex-sit ${corSituacao(e.situacao)}">${escH(e.situacao)}</span>${e._sitOriginal!==undefined?`<div class="ex-mudo">antes: ${escH(e._sitOriginal)}</div>`:''}</td>` : '')+
          `</tr>`;
      });
    }
    return h;
  }
  function cabecalhoTabela(){
    return `<thead><tr><th class="num" style="width:5%">Nº</th><th style="width:9%">SKU</th><th style="width:20%">Descrição</th>`+
      `<th class="num" style="width:4%">Qtd</th><th style="width:10%">Canal</th><th style="width:13%">Envio</th>`+
      `<th style="width:12%">Pedido</th><th style="width:11%">Despachar até</th><th style="width:16%">Situação</th></tr></thead>`;
  }
  const ordemSkuE=(a,b)=>itemTxt(desmontar(a.itens)[0]||{}).localeCompare(itemTxt(desmontar(b.itens)[0]||{}),'pt-BR',{numeric:true});

  // um painel por situação; dentro dele, separado por via, na ordem do pacote
  function painel(titulo, cls, envios, mapa, vazio){
    const n=envios.length, un=envios.reduce((s,e)=>s+(e.itens||[]).reduce((t,i)=>t+Number(i.qtd||0),0),0);
    let h=`<div class="ex-bloco ${cls}"><div class="ex-bt">${escH(titulo)}<span class="ex-bt-q">${n} ${n===1?'envio':'envios'}${n?` · ${num(un)} un.`:''}</span></div>`;
    if(!n) return h+`<p class="ex-vazio">${escH(vazio||'Nenhum envio.')}</p></div>`;
    h+=`<table class="ex-tab">${cabecalhoTabela()}<tbody>`;
    for(const via of ['transportadora','agencia']){
      let l=envios.filter(e=>viaDe(e)===via);
      if(!l.length) continue;
      const temNum=l.some(e=>mapa.has(e.chave));
      l=l.slice().sort((a,b)=> temNum
        ? ((mapa.get(a.chave)||{n:999}).n-(mapa.get(b.chave)||{n:999}).n)
        : (String(a.dia_despacho).localeCompare(String(b.dia_despacho))||ordemSkuE(a,b)));
      h+=`<tr class="ex-via"><td colspan="9">${escH(NOME_VIA[via])}</td></tr>`;
      h+=linhasEnvios(l, (e)=>(mapa.get(e.chave)||{}).n);
    }
    return h+`</tbody></table></div>`;
  }

  // resumo de produtos: pacotes e unidades por SKU vendido (segue o filtro)
  function resumoProdutos(lista){
    const v=visao(lista);
    const envios=STATUS.flatMap(s=>v.sel[s]);
    const resumo=new Map();
    for(const e of envios){
      const porSku=new Map();
      for(const i of (e.itens||[])){ const k=i.sku||'(sem SKU)'; porSku.set(k,(porSku.get(k)||[]).concat(i)); }
      for(const [sku,it] of porSku){
        const r=resumo.get(sku)||{sku,descricao:(it[0]||{}).descricao||'',pacotes:0,unidades:0};
        r.pacotes++; r.unidades+=it.reduce((s,i)=>s+Number(i.qtd||0),0);
        resumo.set(sku,r);
      }
    }
    return [...resumo.values()].sort((a,b)=>a.sku.localeCompare(b.sku,'pt-BR',{numeric:true}));
  }

  // semResumo: a impressão completa não leva o Resumo de Produtos (ele tem botão próprio)
  function corpoLista(lista, semResumo){
    const v=visao(lista), mapa=mapaPacotes(lista); let h='';
    if(v.mostra.includes('atrasados')) h+=painel('ATRASADOS','ex-bloco-atraso',v.sel.atrasados,mapa,'Nenhum envio atrasado.');
    if(v.mostra.includes('hoje'))      h+=painel(v.g.ehAtu?'PARA ENVIO HOJE — VENDAS NOVAS':'PARA ENVIO HOJE','ex-bloco-hoje',v.sel.hoje,mapa,'Nenhum envio para hoje.');
    if(v.mostra.includes('proximos'))  h+= v.g.temProximos
      ? painel('PARA ENVIO NOS PRÓXIMOS DIAS','ex-bloco-prox',v.sel.proximos,mapa,'Nenhum envio para os próximos dias.')
      : `<div class="ex-bloco ex-bloco-prox"><div class="ex-bt">PARA ENVIO NOS PRÓXIMOS DIAS</div><p class="ex-vazio">Esta listagem foi gerada antes de guardar os envios dos próximos dias.</p></div>`;
    if(v.canceladas.length) h+=painel('CANCELADAS — NÃO ENVIAR','ex-bloco-atraso',v.canceladas,mapa);
    if(v.conferir){
      const c=v.g.conferir;
      h+=`<div class="ex-bloco ex-bloco-conf"><div class="ex-bt">PARA CONFERIR<span class="ex-bt-q">${c.length} ${c.length===1?'pedido':'pedidos'}</span></div>`+
        (c.length ? `<table class="ex-tab"><thead><tr><th style="width:12%">Canal</th><th style="width:20%">Pedido</th><th style="width:16%">Envio</th><th>O que conferir</th></tr></thead><tbody>`+
          c.map(x=>`<tr><td>${escH(x.canal)}</td><td>${escH(x.pedido)}</td><td>${x.envio?envioHtml({envio:String(x.envio)}):'—'}</td><td class="pr-desc">${escH(x.motivo)}</td></tr>`).join('')+
          `</tbody></table>` : `<p class="ex-vazio">Nada para conferir.</p>`)+`</div>`;
    }
    const rs= semResumo ? [] : resumoProdutos(lista);
    if(rs.length){
      h+=`<div class="ex-bloco ex-resumo"><div class="ex-bt">RESUMO DE PRODUTOS<span class="ex-bt-q">${rs.length} ${rs.length===1?'produto':'produtos'}</span></div>
          <table class="ex-tab"><thead><tr><th style="width:15%">SKU</th><th>Descrição</th><th class="num" style="width:10%">Pacotes</th><th class="num" style="width:10%">Unidades</th></tr></thead><tbody>`+
          rs.map(r=>`<tr><td class="ex-sku">${escH(r.sku)}</td><td class="pr-desc">${escH(r.descricao)}</td><td class="num">${r.pacotes}</td><td class="num">${num(r.unidades)}</td></tr>`).join('')+
          `</tbody></table></div>`;
    }
    return h;
  }

  // boxes: cada um mostra só a sua contagem (não muda com a seleção)
  function boxes(lista){
    const g=grupos(lista);
    const prod=[...g.atrasados,...g.hoje].filter(temProducao).length;
    return [
      ['hoje','Envios para hoje',g.hoje.length,'Despacho hoje','ex-c-hoje'],
      ['atrasados','Atrasados',g.atrasados.length,'Despacho já venceu','ex-c-atraso'],
      ['proximos','Próximos dias',g.temProximos?g.proximos.length:'—',g.temProximos?'Despacho depois de hoje':'Listagem antiga: não guardou','ex-c-prox'],
      ['produzir','Itens para produzir',prod,'Envios com fabricação própria','ex-c-prod'],
      ['conferir','Conferir',g.conferir.length,'Bling e ML não batem','ex-c-conf2'],
      ['completa','Listagem completa',g.hoje.length+g.atrasados.length+g.proximos.length,'Mostra tudo','ex-c-todos'],
    ];
  }
  function htmlBoxes(lista){
    const g=grupos(lista);
    return boxes(lista).map(([k,l,val,hint,cor])=>{
      const on= k==='completa' ? !FILTRO.size : FILTRO.has(k);
      const off= k==='proximos' && !g.temProximos;
      return `<div class="kpi click ex-box ${cor}${on?' on':''}${off?' ex-box-off':''}" data-box="${k}" title="${off?'Esta listagem não guardou os próximos dias':(k==='completa'?'Mostra tudo (limpa os filtros)':'Clique para filtrar; combine com outros boxes')}">
        <div class="lbl">${escH(l)}</div><div class="hint">${escH(hint)}</div><div class="val">${val}</div><div class="flag">${k==='completa'?'MOSTRANDO TUDO':'FILTRANDO'}</div></div>`;
    }).join('');
  }
  // total da seleção, em texto, logo abaixo dos boxes
  function textoSelecao(lista){
    const v=visao(lista);
    const partes=STATUS.filter(s=>v.mostra.includes(s)&&(s!=='proximos'||v.g.temProximos)).map(s=>`${NOME_FILTRO[s]} ${v.sel[s].length}`);
    const tot=STATUS.reduce((s,k)=>s+v.sel[k].length,0);
    const un=STATUS.reduce((s,k)=>s+v.sel[k].reduce((a,e)=>a+(e.itens||[]).reduce((t,i)=>t+Number(i.qtd||0),0),0),0);
    let t= partes.length ? `Mostrando <b>${tot}</b> ${tot===1?'envio':'envios'} (${partes.join(' + ')}) · ${num(un)} un.` : 'Mostrando só os pedidos a conferir';
    if(v.produzir) t+=' · só itens de fabricação própria';
    if(v.conferir && partes.length) t+=` · ${v.g.conferir.length} a conferir`;
    if(v.canceladas.length) t+=` · ${v.canceladas.length} ${v.canceladas.length===1?'cancelada':'canceladas'}`;
    return t;
  }

  // ---------------------------------------------------------------
  // lista simplificada (texto do WhatsApp)
  // ---------------------------------------------------------------
  const DIA_EXTENSO=['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];
  const num=(v)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
  const semAcento=(t)=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  // via: listas antigas (antes da v2) não têm o campo; deduz pelo canal/tipo
  const viaDe=(e)=> e.via || ((e.tipo_envio==='ME1' || e.canal!=='Mercado Livre') ? 'transportadora' : 'agencia');
  function unidadeTxt(u,v){
    const n=semAcento(u), plural=Number(v)>=2;
    if(/^(m|mt|mts|metro|metros)$/.test(n)) return plural?'metros':'metro';
    if(/^(cm|centimetro|centimetros)$/.test(n)) return plural?'centímetros':'centímetro';
    if(/^(kg|quilo|quilos)$/.test(n)) return 'kg';
    if(!n || /^(un|und|unid|unidade|unidades|pc|pca|peca|pecas|pç)$/.test(n)) return plural?'unidades':'unidade';
    return String(u).toLowerCase();
  }
  // "CM65PP - 3 unidades" · fracionado: "CE8MM - 0,5 metro"
  // KIT (14/10/2026): mostra a composição, para quem monta não errar:
  //   "P20D-1ABA60 (Kit com 1 unidade do P20D + 1 unidade do 1ABA60) - 1 unidade do kit"
  //   _porKit = quanto vai de cada componente em UM kit (vem do desmontar)
  const un=(q)=>`${num(q)} ${Number(q)>=2?'unidades':'unidade'}`;
  function itemTxt(i){
    if(i.base_sku) return `${i.base_sku} - ${num(i.medida)} ${unidadeTxt(i.unidade,i.medida)}`;
    if(i._porKit && i._porKit.length)
      return `${i.sku||'(sem SKU)'} (Kit com ${i._porKit.map(c=>`${un(c.q)} do ${c.sku}`).join(' + ')}) - ${un(i.qtd)} do kit`;
    return `${i.sku||'(sem SKU)'} - ${num(i.qtd)} ${Number(i.qtd)>=2?'unidades':'unidade'}`;
  }
  const ehFabricacao=(i)=> semAcento(i.origem)==='fabricacao propria';

  // COMBO DESMONTADO (14/10/2026): no lugar do SKU do combo entra o
  // produto com a quantidade total (componente × quantidade comprada —
  // a função já manda multiplicado). R08M-KIT4 × 3 → R08M - 12 unidades.
  // KIT (produtos diferentes) continua como estava: SKU DO KIT - quantidade.
  // O mesmo SKU repetido dentro do pacote é somado (kit + avulso = 1 linha).
  // Origem do componente: a do cadastro dele; em lista antiga, a do kit.
  function desmontar(itens){
    const out=[], porChave=new Map();
    const add=(x)=>{
      const chave=(x.base_sku?'F:'+x.base_sku+'|'+semAcento(x.unidade):'S:'+(x.sku||''));
      const r=porChave.get(chave);
      if(r){ r.qtd+=Number(x.qtd||0); r.medida=Number(r.medida||0)+Number(x.medida||0); return; }
      const novo=Object.assign({},x,{qtd:Number(x.qtd||0)});
      if(x.base_sku) novo.medida=Number(x.medida||0);
      porChave.set(chave,novo); out.push(novo);
    };
    for(const i of (itens||[])){
      // só COMBO é desmontado; KIT continua pelo SKU do kit (decisão 14/10)
      if(semAcento(i.tipo)==='combo' && i.componentes && i.componentes.length && !i.base_sku){
        for(const c of i.componentes) add({sku:c.sku, descricao:c.descricao, qtd:c.qtd,
          origem:(c.origem!==undefined && c.origem!==null)? c.origem : i.origem});
      } else if(i.componentes && i.componentes.length && !i.base_sku){
        // KIT: fica pelo SKU do kit, com a composição de UM kit
        // (os componentes vêm multiplicados pela quantidade comprada)
        const q=Number(i.qtd)||1;
        add(Object.assign({},i,{_porKit:i.componentes.map(c=>({sku:c.sku, q:Number(c.qtd||0)/q}))}));
      } else add(i);
    }
    return out;
  }

  function horarioAgencia(envios){
    const ag=envios.filter(e=>viaDe(e)==='agencia' && e.despachar_ate);
    const hoje=ag.filter(e=>!e.atrasado);
    const horas=(hoje.length?hoje:ag).map(e=>horaDe(e.despachar_ate)).filter(Boolean).sort();
    return horas[0]||'--:--';
  }

  // ordem e número dos pacotes de uma seção (transportadora ou agência):
  // atrasados primeiro, depois os de hoje, em ordem de SKU. É a MESMA
  // numeração do texto da principal — a atualização usa para dizer qual
  // pacote foi cancelado e para continuar a contagem das vendas novas.
  function numerar(envios, via){
    const doGrupo=(envios||[]).filter(e=>viaDe(e)===via);
    const ordemSku=(a,b)=>itemTxt(desmontar(a.itens)[0]||{}).localeCompare(itemTxt(desmontar(b.itens)[0]||{}),'pt-BR',{numeric:true});
    const atrasados=doGrupo.filter(e=>e.atrasado).sort((a,b)=>String(a.dia_despacho).localeCompare(String(b.dia_despacho))||ordemSku(a,b));
    const hoje=doGrupo.filter(e=>!e.atrasado).sort(ordemSku);
    let n=0;
    const at=atrasados.map(e=>({e,n:++n})), hj=hoje.map(e=>({e,n:++n}));
    return { atrasados:at, hoje:hj, ultimo:n, porChave:new Map([...at,...hj].map(x=>[x.e.chave,x.n])) };
  }
  const nPacote=(n)=>`PACOTE ${String(n).padStart(2,'0')}`;
  const conteudoPacote=(e)=>desmontar(e.itens).map(itemTxt).join(' + ');

  // produção: só Fabricação Própria, somado por SKU (base, no fracionado)
  function producao(envios, via){
    const soma=new Map();
    for(const e of (envios||[]).filter(x=>viaDe(x)===via)) for(const i of desmontar(e.itens)){
      if(!ehFabricacao(i)) continue;
      const chave=i.base_sku||i.sku;
      const r=soma.get(chave)||Object.assign({},i,{qtd:0,medida:0});
      r.qtd+=Number(i.qtd||0); r.medida+=Number(i.medida||0);
      soma.set(chave,r);
    }
    const linhas=[...soma.values()].sort((a,b)=>itemTxt(a).localeCompare(itemTxt(b),'pt-BR',{numeric:true})).map(i=>`- ${itemTxt(i)};`);
    return linhas.length? linhas : ['-'];
  }
  const diaExtenso=(dia)=>{ const [y,m,d]=String(dia).split('-').map(Number); return DIA_EXTENSO[new Date(y,m-1,d).getDay()]; };

  // Formato aprovado pelo Vinicius em 13/10/2026 (linha em branco depois
  // de cada título, títulos de seção em MAIÚSCULAS, separador antes da
  // produção). 14/10: segue o FILTRO dos boxes; próximos dias por data e
  // via; conferir com cada pedido. Mexer aqui muda o texto copiado E a
  // impressão simplificada.
  const SEPARADOR='---------------------------------------------';
  function horaAgenciaLista(lista){
    const base= lista.tipo==='atualizacao' && LISTA_BASE && LISTA_BASE.id===lista.base_id ? (LISTA_BASE.envios||[]) : (lista.envios||[]);
    const h=horarioAgencia(base.length?base:(lista.novas||[]));
    return h!=='--:--' ? h : ((lista.agenda&&lista.agenda.despacho)||'--:--');
  }
  function textoSimplificado(lista, negrito){
    const B=(t)=> negrito? `*${t}*` : t;
    const v=visao(lista), mapa=mapaPacotes(lista), ehAtu=lista.tipo==='atualizacao';
    const T_TRANSP='ENVIAR VIA TRANSPORTADORA:';
    const T_AGENCIA=`ENVIAR VIA AGÊNCIA DO MERCADO LIVRE ATÉ ÀS ${horaAgenciaLista(lista)}:`;
    const VIAS=[[T_TRANSP,'transportadora'],[T_AGENCIA,'agencia']];
    const L=[];
    const pac=(e)=>{ const x=mapa.get(e.chave); return x? nPacote(x.n) : 'PACOTE'; };
    const ord=(l)=>l.slice().sort((a,b)=>((mapa.get(a.chave)||{n:999}).n-(mapa.get(b.chave)||{n:999}).n));
    L.push(B(ehAtu
      ? `ATUALIZAÇÃO VENDAS ${diaExtenso(lista.dia)} (${ddmm(lista.dia)}) - ${horaDe(new Date(new Date(lista.gerada_em).getTime()-3*3600e3).toISOString())}:`
      : `VENDAS ${diaExtenso(lista.dia)} (${ddmm(lista.dia)}):`));
    let blocos=0;
    const sep=()=>{ if(blocos++) { L.push(''); L.push(SEPARADOR); } };

    if(!v.produzir){
      // envios do dia (atrasados / hoje), por via
      const doDia=['atrasados','hoje'].filter(s=>v.mostra.includes(s));
      if(doDia.length){
        sep();
        if(ehAtu){ L.push(''); L.push(B('VENDAS NOVAS:')); }
        for(const [titulo,via] of VIAS){
          L.push(''); L.push(B(titulo));
          if(doDia.includes('atrasados')){
            const l=ord(v.sel.atrasados.filter(e=>viaDe(e)===via));
            L.push(''); L.push(B('Envios Atrasados:')); L.push('');
            if(l.length) l.forEach(e=>L.push(`${pac(e)}: ${conteudoPacote(e)} (era para ${ddmm(e.dia_despacho)})`)); else L.push('-');
          }
          if(doDia.includes('hoje')){
            const l=ord(v.sel.hoje.filter(e=>viaDe(e)===via));
            L.push(''); L.push(B('Envios para Hoje:')); L.push('');
            if(l.length) l.forEach(e=>L.push(`${pac(e)}: ${conteudoPacote(e)}`)); else L.push('-');
          }
        }
      }
      // próximos dias: por data e via, sem número de pacote
      if(v.mostra.includes('proximos') && v.g.temProximos){
        sep();
        L.push(''); L.push(B('ENVIOS PRÓXIMOS DIAS:'));
        const prox=v.sel.proximos;
        if(!prox.length){ L.push(''); L.push('-'); }
        const dias=[...new Set(prox.map(e=>e.dia_despacho))].sort();
        for(const d of dias) for(const [via,nome] of [['agencia','VIA AGÊNCIA'],['transportadora','VIA TRANSPORTADORA']]){
          const l=prox.filter(e=>e.dia_despacho===d && viaDe(e)===via).sort(ordemSkuE);
          if(!l.length) continue;
          L.push(''); L.push(B(`${diaExtenso(d)} (${ddmm(d)}) — ${nome}:`)); L.push('');
          l.forEach(e=>L.push(`- ${conteudoPacote(e)};`));
        }
      }
      // atualização: canceladas, com o número que tinham na principal
      if(v.canceladas.length){
        sep();
        L.push(''); L.push(B('VENDAS CANCELADAS (NÃO ENVIAR):'));
        for(const [titulo,via] of VIAS){
          const l=v.canceladas.filter(e=>viaDe(e)===via);
          L.push(''); L.push(B(titulo)); L.push('');
          L.push(...(l.length? l.map(e=>`${pac(e)}: ${conteudoPacote(e)}`) : ['-']));
        }
      }
    }

    // itens para produção (do que está filtrado; na completa, o que sai hoje)
    const prodEnvios=v.prodStatus.flatMap(s=>v.sel[s]);
    if(v.prodStatus.length && (v.produzir || v.completa || v.mostra.length)){
      sep();
      L.push(''); L.push(B(ehAtu?'ITENS PARA PRODUÇÃO (VENDAS NOVAS):':'ITENS PARA PRODUÇÃO:'));
      for(const [titulo,via] of VIAS){ L.push(''); L.push(B(titulo)); L.push(''); L.push(...producao(prodEnvios,via)); }
      if(!(lista.versao>=2)) { L.push(''); L.push('(Listagem gerada antes da versão com origem dos produtos: itens para produção não disponíveis.)'); }
    }

    // conferir: cada pedido com o motivo
    if(v.conferir && v.g.conferir.length){
      sep();
      L.push(''); L.push(B(`CONFERIR (${v.g.conferir.length} ${v.g.conferir.length===1?'PEDIDO':'PEDIDOS'}):`)); L.push('');
      v.g.conferir.forEach(c=>L.push(`- Pedido ${c.pedido}${c.canal?' ('+c.canal+')':''}: ${c.motivo}`));
    }
    if(ehAtu && !(LISTA_BASE && LISTA_BASE.id===lista.base_id)) { L.push(''); L.push('(Não consegui abrir a listagem principal do dia: os números dos pacotes podem não bater.)'); }
    return L.join('\n');
  }

  async function copiarWhatsApp(){
    if(!LISTA) return;
    const t=textoSimplificado(LISTA,true);
    try{ await navigator.clipboard.writeText(t); }
    catch(e){
      const ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }finally{ ta.remove(); }
    }
    msg(FILTRO.size ? `Listagem copiada (filtro: ${rotuloFiltro()}).` : 'Listagem copiada. É só colar no WhatsApp.');
    marcarVista();
  }

  // lista automática: o aviso some quando alguém copia ou imprime
  async function marcarVista(){
    if(!LISTA || !LISTA_ID || LISTA.vista_em) return;
    try{
      await rpc('cn_expedicao_marcar_vista',{p_usuario_id:USER.id,p_id:LISTA_ID});
      LISTA.vista_em=new Date().toISOString();
      const h=HIST.find(x=>x.id===LISTA_ID);
      if(h){ h.vista_em=LISTA.vista_em; h.vista_por_nome=USER&&USER.nome; h.nao_lida=false; }
      renderPainel(); render();
      verificarPendentes(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ /* sem permissão ou sem rede: o aviso continua, sem travar a tela */ }
  }

  // texto com *negrito* do WhatsApp → HTML com <b>
  const textoHtml=(t)=>escH(t).replace(/\*([^*\n]+)\*/g,'<b>$1</b>');

  // ---------------------------------------------------------------
  // tela
  // ---------------------------------------------------------------
  // mensagem aparece no painel e no detalhe (só um dos dois está visível)
  function msg(t,erro){
    for(const id of ['msg','msg2']){ const el=f(id); if(!el) continue; el.textContent=t||''; el.style.color=erro?'var(--danger)':'var(--muted)'; }
  }

  function render(){
    const bts=['imprimir','copiar','imprimir-simples','imprimir-resumo','status-etq'];
    if(!LISTA){
      f('kpis').innerHTML=''; f('avisos').style.display='none'; f('sel-total').innerHTML='';
      f('corpo').innerHTML='';
      bts.forEach(k=>{ if(f(k)) f(k).disabled=true; });
      f('simples').style.display='none'; f('titulo').textContent=''; f('nova').style.display='none'; return;
    }
    const ag=agendaTxt(LISTA);
    f('titulo').innerHTML=`${LISTA.tipo==='atualizacao'?'<b>Atualização</b> da ':''}Listagem de envios <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.automatica?' · <b>automática</b>':(LISTA.gerada_por?' por '+escH(LISTA.gerada_por):'')}`
      +(ag?`<div class="ex-agenda">${escH(ag)}</div>`:'');
    const nova=LISTA.automatica && !LISTA.vista_em;
    f('nova').style.display= nova ? '' : 'none';
    f('nova').innerHTML= nova ? `<b>${LISTA.tipo==='atualizacao'?'Atualização automática não lida':'Listagem automática não lida'}.</b> Copie ou imprima: o aviso some quando alguém fizer isso.` : '';
    f('kpis').innerHTML=htmlBoxes(LISTA);
    f('sel-total').innerHTML=textoSelecao(LISTA);
    const av=(LISTA.avisos||[]);
    f('avisos').innerHTML=av.map(a=>`<div>• ${escH(a)}</div>`).join('');
    f('avisos').style.display=av.length?'':'none';
    f('corpo').innerHTML=corpoLista(LISTA);
    f('simples-tit').innerHTML= FILTRO.size
      ? `Listagem simplificada <span>· filtrada: ${escH(rotuloFiltro())} — é o texto que vai ser copiado</span>`
      : `Listagem simplificada <span>· é o texto que vai ser copiado</span>`;
    f('simples-texto').innerHTML=textoHtml(textoSimplificado(LISTA,true));
    f('simples').style.display='';
    bts.forEach(k=>{ if(f(k)) f(k).disabled=false; });
  }
  // ---------------------------------------------------------------
  // ATUALIZAR STATUS DAS ETIQUETAS (14/10/2026)
  //   Consulta no Mercado Livre, AGORA, só a situação da etiqueta de cada
  //   envio do ML desta listagem (liberada, impressa, aguardando NF, já
  //   entregue na agência, cancelado…) e troca só a coluna "Situação".
  //   Nada mais muda: envios, pacotes, quantidades e o texto continuam a
  //   foto da hora em que a listagem foi gerada. Não fica gravado: ao
  //   reabrir a listagem, volta a situação daquela hora.
  //   ME1 (etiqueta própria) e os outros canais não entram.
  //   Usa a função expedicao-etiquetas (ação "situacao").
  // ---------------------------------------------------------------
  const ROTULOS_VIVOS=/^(ETIQUETA LIBERADA|ETIQUETA IMPRESSA|AGUARDANDO NF|JÁ ENTREGUE NA AGÊNCIA|JÁ SAIU|CANCELADO)$/;
  let STATUS_EM=null;
  async function atualizarStatusEtiquetas(){
    if(!LISTA || OCUPADO) return;
    const todos=[...(LISTA.envios||[]),...(LISTA.novas||[]),...(LISTA.proximos||[]),...(LISTA.canceladas||[])]
      .filter(e=>e.canal==='Mercado Livre' && e.envio && e.tipo_envio!=='ME1');
    const ids=[...new Set(todos.map(e=>String(e.envio)))];
    if(!ids.length){ msg('Esta listagem não tem envios do Mercado Livre com etiqueta do ML.'); return; }
    OCUPADO=true; const b=f('status-etq'); b.disabled=true; const t0=b.textContent; b.textContent='Consultando…';
    msg(`Consultando no Mercado Livre o status de ${ids.length} ${ids.length===1?'etiqueta':'etiquetas'}…`);
    try{
      if(USER && !verificarSessao()) throw new Error('Sessão expirada.');
      renovarSessao();
      let resp;
      try{
        resp=await fetch(FUNC_URL('expedicao-etiquetas'),{method:'POST',
          headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','x-sessao':(USER&&USER.token)||''},
          body:JSON.stringify({acao:'situacao', envios:ids})});
      }catch(e){ throw new Error('Sem conexão com o servidor.'); }
      const data=await resp.json().catch(()=>null);
      if(resp.status===401) throw new Error('Seu perfil precisa da permissão "Emitir etiquetas do Mercado Livre" para consultar o status.');
      if(!resp.ok || !data || !data.ok) throw new Error((data&&data.erro)||('HTTP '+resp.status));
      const sit=data.situacoes||{};
      let mudou=0;
      for(const e of todos){
        const s=sit[String(e.envio)];
        if(!s || !ROTULOS_VIVOS.test(s.rotulo)) continue;      // "ainda não liberada": mantém a data que já estava
        if(e.situacao!==s.rotulo){ if(e._sitOriginal===undefined) e._sitOriginal=e.situacao; e.situacao=s.rotulo; mudou++; }
      }
      STATUS_EM=new Date().toISOString();
      render();
      msg(`Status das etiquetas atualizado às ${horaSP(STATUS_EM)} · ${mudou} ${mudou===1?'mudou':'mudaram'} desde a geração.`);
    }catch(e){ msg('Status das etiquetas: '+e.message,true); }
    finally{ OCUPADO=false; b.textContent=t0; b.disabled=false; }
  }

  // clique nos boxes: liga/desliga o filtro; "Listagem completa" limpa tudo
  function clicarBox(k){
    if(!LISTA) return;
    if(k==='completa') FILTRO.clear();
    else if(k==='proximos' && !grupos(LISTA).temProximos) return;
    else if(FILTRO.has(k)) FILTRO.delete(k); else FILTRO.add(k);
    render();
  }

  const hojeSP=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const horaSP=(iso)=>horaDe(new Date(new Date(iso).getTime()-3*3600e3).toISOString());
  const DIAS_LONGOS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

  // ---------------------------------------------------------------
  // PAINEL: as listagens geradas (tela inicial) — 14/10/2026
  //   Paginado NO BANCO (30 por página): a tela só busca a página que
  //   mostra. Filtros: leitura, origem (automática/manual), busca por
  //   pedido/envio/SKU, período rápido (Hoje/Ontem/7/30 dias) e período.
  //   Agrupadas por dia, mais recente primeiro; dentro do dia as NÃO
  //   LIDAS vêm no topo. Não lida = automática que ninguém copiou nem
  //   imprimiu, DE QUALQUER DIA: conta no aviso da página até ser lida.
  //   Manual = lida na hora em que foi gerada.
  // ---------------------------------------------------------------
  const POR_PAGINA=30;
  let PAG=1, TOTAL=0;
  function resumoLinha(l){
    const t=l.totais||{};
    if(l.tipo==='atualizacao'){
      return `Atualização: ${t.novas??0} ${Number(t.novas)===1?'venda nova':'vendas novas'} · ${t.canceladas??0} ${Number(t.canceladas)===1?'cancelada':'canceladas'}`;
    }
    const partes=[`${t.envios??'?'} envios`, `${t.unidades??'?'} un.`];
    if(t.atrasados) partes.push(`${t.atrasados} ${t.atrasados===1?'atrasado':'atrasados'}`);
    if(t.aguardando_nf) partes.push(`${t.aguardando_nf} aguardando NF`);
    if(t.conferir) partes.push(`${t.conferir} a conferir`);
    return escH(partes.join(' · '));
  }
  // "às 10:42" no mesmo dia da listagem; "em 15/10 às 10:42" se foi em outro dia
  function quandoLeu(iso, dia){
    const sp=new Date(new Date(iso).getTime()-3*3600e3).toISOString();
    return sp.slice(0,10)===dia ? `às ${escH(horaDe(sp))}` : `em ${escH(ddmm(sp.slice(0,10)))} às ${escH(horaDe(sp))}`;
  }
  function renderPainel(){
    const tb=f('painel-tbody'); if(!tb) return;
    const temFiltro= !!(f('f-leitura').value || f('f-origem').value || f('f-busca').value.trim() || f('f-de').value || f('f-ate').value);
    marcarAtalho();
    if(!HIST.length){
      tb.innerHTML= temFiltro
        ? `<tr><td colspan="4" class="ex-vazio">Nenhuma listagem com esses filtros.</td></tr>`
        : `<tr><td colspan="4" class="ex-vazio">Nenhuma listagem gerada ainda. Clique em <b>Gerar listagem</b>.</td></tr>`;
      f('painel-cont').textContent= '0 listagens'; atualizarPaginacao(); return;
    }
    let h='', diaAnt=null;
    for(const l of HIST){
      if(l.dia!==diaAnt){
        const [y,m,d]=l.dia.split('-').map(Number);
        const rot= l.dia===hojeSP() ? 'Hoje' : DIAS_LONGOS[new Date(y,m-1,d).getDay()];
        h+=`<tr class="ex-dia"><td colspan="4">${escH(rot.charAt(0).toUpperCase()+rot.slice(1))} · ${escH(brData(l.dia))}</td></tr>`;
        diaAnt=l.dia;
      }
      const origem= l.automatica
        ? `<span class="ex-tag ex-tag-auto">Automática</span>`
        : `<span class="ex-tag ex-tag-manual">Manual</span>`;   // o nome aparece na coluna Leitura
      const leitura= l.nao_lida
        ? `<span class="ex-tag ex-tag-nl">NÃO LIDA</span>`
        : (l.automatica
            ? `<span class="ex-lida">Lida ${l.vista_em?quandoLeu(l.vista_em,l.dia):''}${l.vista_por_nome?' por '+escH(l.vista_por_nome):''}</span>`
            : `<span class="ex-lida">Gerada e lida ${quandoLeu(l.gerada_em,l.dia)}${l.gerada_por?' por '+escH(l.gerada_por):''}</span>`);
      const achado= l.achado ? `<div class="ex-achado">encontrado: ${escH(l.achado)}</div>` : '';
      h+=`<tr class="ex-linha${l.nao_lida?' ex-naolida':''}" data-id="${l.id}">
            <td><b>${escH(horaSP(l.gerada_em))}</b></td><td>${origem}</td>
            <td>${resumoLinha(l)}${achado}</td><td>${leitura}</td></tr>`;
    }
    tb.innerHTML=h;
    const ini=(PAG-1)*POR_PAGINA+1, fim=ini+HIST.length-1;
    f('painel-cont').textContent= TOTAL>HIST.length ? `${ini}–${fim} de ${TOTAL} listagens` : `${TOTAL} ${TOTAL===1?'listagem':'listagens'}`;
    atualizarPaginacao();
  }
  function atualizarPaginacao(){
    const paginas=Math.max(1,Math.ceil(TOTAL/POR_PAGINA));
    f('paginfo').textContent=`Página ${PAG} de ${paginas}`;
    f('prev').disabled= PAG<=1; f('next').disabled= PAG>=paginas;
  }
  async function resumoNaoLidas(){
    try{
      const n=Number(await rpc('cn_expedicao_pendencias',{p_usuario_id:USER.id}))||0;
      f('resumo').innerHTML= n
        ? `<span class="ex-tag ex-tag-nl">${n} NÃO ${n===1?'LIDA':'LIDAS'}</span>&nbsp; ${n===1?'Esta listagem automática está':'Estas listagens automáticas estão'} contando no aviso da página até alguém copiar para o WhatsApp ou imprimir.`
        : 'Todas as listagens automáticas já foram lidas.';
    }catch(e){ f('resumo').textContent=''; }
  }
  // aviso quando a rotina automática de hoje não rodou ou deu erro
  async function statusRotina(){
    const el=f('rotina'); if(!el) return;
    try{
      const s=await rpc('cn_expedicao_status_rotina',{p_usuario_id:USER.id})||{};
      let t='';
      if(s.erro) t=`<b>A rotina automática deu erro hoje${s.erro_em?' às '+escH(horaSP(s.erro_em)):''}.</b> ${escH(String(s.erro).slice(0,300))}<br>Se precisar, gere a listagem manualmente em <b>Gerar listagem</b>.`;
      else if(s.esperada && !s.gerada_em) t=`<b>A listagem automática das 07:30 de hoje não foi gerada.</b> Gere manualmente em <b>Gerar listagem</b> e avise o responsável pelo sistema.`;
      el.innerHTML=t; el.style.display= t ? '' : 'none';
    }catch(e){ el.style.display='none'; }
  }
  // período rápido (Hoje / Ontem / 7 dias / 30 dias): preenche as datas
  const diaMenos=(n)=>new Date(Date.now()-3*3600e3-n*86400e3).toISOString().slice(0,10);
  const PERIODOS={ hoje:()=>[hojeSP(),hojeSP()], ontem:()=>[diaMenos(1),diaMenos(1)],
                   '7':()=>[diaMenos(6),hojeSP()], '30':()=>[diaMenos(29),hojeSP()] };
  function aplicarPeriodo(v){
    if(PERIODOS[v]){ const [de,ate]=PERIODOS[v](); f('f-de').value=de; f('f-ate').value=ate; }
    else if(v===''){ f('f-de').value=''; f('f-ate').value=''; }
  }
  // datas digitadas à mão: mostra o período que bate, ou "personalizado"
  function marcarAtalho(){
    const de=f('f-de').value, ate=f('f-ate').value;
    let v= (!de && !ate) ? '' : 'custom';
    for(const k of Object.keys(PERIODOS)){ const [a,b]=PERIODOS[k](); if(de===a && ate===b){ v=k; break; } }
    f('f-periodo').value=v;
  }
  async function carregarPainel(){
    try{
      const de=f('f-de').value||null, ate=f('f-ate').value||null;
      if(de && ate && de>ate){ msg('A data inicial é depois da final.',true); return; }
      const r=(await rpc('cn_expedicao_listas',{p_usuario_id:USER.id, p_pagina:PAG, p_por_pagina:POR_PAGINA,
        p_de:de, p_ate:ate, p_leitura:f('f-leitura').value||null, p_origem:f('f-origem').value||null,
        p_busca:f('f-busca').value.trim()||null}))||[];
      HIST=r; TOTAL= r.length ? Number(r[0].total)||r.length : 0;
      // página além do fim (ex.: depois de um filtro): volta para a última
      if(!r.length && PAG>1){ PAG=1; return carregarPainel(); }
      renderPainel();
      resumoNaoLidas(); statusRotina();
    }catch(e){
      HIST=[]; TOTAL=0; renderPainel();
      msg(/cn_expedicao_listas|function/i.test(e.message) ? 'Falta rodar o arquivo 127 no banco (SQL Editor).' : 'Não consegui carregar as listagens: '+e.message, true);
    }
  }
  const recarregarDoInicio=async()=>{ PAG=1; msg(''); await carregarPainel(); };

  function mostrarPainel(){
    f('detalhe').style.display='none'; f('painel').style.display='';
    LISTA=null; LISTA_ID=null; LISTA_BASE=null; FILTRO.clear(); msg('');
    renderPainel();
  }
  function mostrarDetalhe(){
    f('painel').style.display='none'; f('detalhe').style.display='';
    window.scrollTo(0,0);
  }

  async function abrirLista(id){
    if(!id||OCUPADO) return;
    msg('Abrindo…');
    try{
      LISTA=await rpc('cn_expedicao_lista',{p_usuario_id:USER.id,p_id:Number(id)}); LISTA_ID=Number(id); FILTRO.clear(); STATUS_EM=null;
      LISTA_BASE=null;
      if(LISTA.tipo==='atualizacao' && LISTA.base_id){
        try{ LISTA_BASE=await rpc('cn_expedicao_lista',{p_usuario_id:USER.id,p_id:Number(LISTA.base_id)}); }catch(e){ LISTA_BASE=null; }
      }
      msg(''); render(); mostrarDetalhe();
    }catch(e){ msg(e.message,true); }
  }

  async function gerar(){
    if(OCUPADO) return;
    OCUPADO=true; f('gerar').disabled=true;
    const t=f('gerar').textContent; f('gerar').textContent='Gerando…';
    msg('Consultando Mercado Livre e Bling… pode levar até 1 minuto.');
    try{
      const r=await chamar({acao:'gerar'});
      LISTA=Object.assign({},r.lista,{gerada_por:USER&&USER.nome, automatica:false, vista_em:new Date().toISOString()}); LISTA_ID=r.id; LISTA_BASE=null; FILTRO.clear();
      await carregarPainel();
      render(); mostrarDetalhe();
      msg((LISTA.avisos||[]).length? 'Lista gerada com avisos — veja abaixo.' : 'Lista gerada e guardada no painel.', !!(LISTA.avisos||[]).length);
    }catch(e){ msg(e.message,true); }
    finally{ OCUPADO=false; f('gerar').textContent=t; f('gerar').disabled=!temPermissao('expedicao.gerar'); }
  }

  // ---------------------------------------------------------------
  // impressão / PDF (A4 deitado, pelo #print-area do index)
  // ---------------------------------------------------------------
  const CSS_PRINT=`
    @media print{
      #print-area .ex-p{font-size:8.5pt}
      #print-area .ex-bloco{margin-bottom:7px;break-inside:auto}
      #print-area .ex-bt{font-size:9.5pt;font-weight:700;padding:4px 6px;background:#e9edf1;border-left:3px solid #0d5c37;margin-top:4px;break-after:avoid}
      #print-area .ex-bt-q{float:right;font-weight:600;color:#3a4049}
      #print-area .ex-bloco-atraso .ex-bt{border-left-color:#991b1b;color:#991b1b;background:#fdecec}
      #print-area .ex-bloco-prox .ex-bt{border-left-color:#1d4ed8;background:#eaf0fd}
      #print-area .ex-bloco-conf .ex-bt{border-left-color:#7c3aed;background:#f3eefe}
      #print-area tr.ex-via td{font-size:7.5pt;font-weight:700;background:#f4f6f8;color:#3a4049}
      #print-area .ex-tab td{font-size:8.5pt;padding:3px 5px;white-space:normal;overflow:visible;text-overflow:clip}
      #print-area .ex-n{font-weight:700}
      #print-area .ex-qtd{font-weight:700;font-size:10pt !important}
      #print-area .ex-sku{font-family:monospace}
      #print-area .ex-fim{font-size:10pt}
      #print-area .ex-comp{font-size:7pt;color:#5b6472;margin-top:1px}
      #print-area .ex-mudo{font-size:7pt;color:#5b6472}
      #print-area .ex-fora{font-size:7pt;color:#b45309}
      #print-area .ex-atraso{color:#991b1b;font-weight:700}
      #print-area .ex-sit{font-size:7pt;font-weight:700}
      #print-area .ex-s-nf{color:#b45309}
      #print-area .ex-s-ok{color:#0d5c37}
      #print-area tr.ex-novo td{border-top:1px solid #9aa3ad}
      #print-area .ex-vazio{font-size:9pt;padding:6px 0;color:#5b6472}
    }`;

  function imprimir(){
    if(!LISTA) return;
    $('print-area').innerHTML=`<style>${CSS_PRINT}</style><div class="ex-p">
      <div class="pr-topo">
        <img src="logo-print.png" class="pr-logo" onerror="this.onerror=null;this.src='logo.png';this.className='pr-logo pr-logo-inv'">
        <div><p class="pr-tit">${LISTA.tipo==='atualizacao'?'Atualização da ':''}Listagem de envios — ${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</p>
             <div class="pr-sub">${escH(rotuloFiltro())} · ${textoSelecao(LISTA)}</div></div>
        <div class="pr-quando">Gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.gerada_por?'<br>por '+escH(LISTA.gerada_por):''}${LISTA_ID?'<br>Listagem nº '+LISTA_ID:''}</div>
      </div>
      ${(LISTA.avisos||[]).length? `<div class="pr-warn" style="margin-bottom:6px">${(LISTA.avisos||[]).map(a=>'• '+escH(a)).join('<br>')}</div>`:''}
      ${corpoLista(LISTA, true)}
      <div class="pr-rodape"><span>Carrinhos_Net — Sistema de Controle</span><span>${escH(agendaTxt(LISTA))}</span></div>
    </div>`;
    window.print();
    marcarVista();
  }

  // ---------------------------------------------------------------
  // MEIA FOLHA (14/10/2026): A4 EM PÉ dividida ao meio na VERTICAL
  // (metade da esquerda e metade da direita, duas tiras altas). O
  // conteúdo enche a metade da ESQUERDA e, se não couber, continua na da
  // DIREITA; só depois vai para outra folha. Linha tracejada no meio para
  // cortar.
  //   Cada bloco = {html, linhas}: "linhas" é quantas linhas de texto ele
  //   ocupa (texto longo quebra em mais de uma).
  // ---------------------------------------------------------------
  const MF_LINHAS=54;          // linhas por metade (10 pt, metade de A4 em pé)
  const MF_CHARS=44;           // caracteres por linha (aprox.)
  const CSS_MEIA=`
    @media print{
      @page{size:A4 portrait;margin:8mm}
      #print-area .mf-folha{display:grid;grid-template-columns:1fr 1fr;column-gap:12mm;height:278mm;position:relative;break-after:page;page-break-after:always}
      #print-area .mf-folha:last-child{break-after:auto;page-break-after:auto}
      #print-area .mf-folha::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #9aa3ad}
      #print-area .mf-metade{display:flex;flex-direction:column;height:278mm;overflow:hidden}
      #print-area .mf-txt{flex:1;font-size:10pt;line-height:1.35;color:#1a1d23}
      #print-area .mf-txt div{white-space:pre-wrap;word-break:break-word}
      #print-area .mf-txt b{font-weight:700}
      #print-area .mf-mudo{color:#5b6472;font-size:8.5pt}
      #print-area .mf-rod{font-size:7pt;color:#5b6472;border-top:1px solid #d7dbe0;padding-top:3px;display:flex;justify-content:space-between;gap:6px}
    }`;
  function meiaFolha(blocos, rodape){
    // reparte os blocos em metades de até MF_LINHAS linhas
    const metades=[[]]; let usadas=0;
    for(const b of blocos){
      if(usadas+b.linhas>MF_LINHAS && metades[metades.length-1].length){ metades.push([]); usadas=0; }
      metades[metades.length-1].push(b); usadas+=b.linhas;
    }
    const total=metades.length;
    const html=metades.map((m,i)=>`<div class="mf-metade"><div class="mf-txt">${m.map(b=>b.html).join('')}</div>
        <div class="mf-rod"><span>${escH(rodape)}</span><span>${total>1?`parte ${i+1} de ${total}`:''}</span></div></div>`);
    let folhas='';
    for(let i=0;i<html.length;i+=2) folhas+=`<div class="mf-folha">${html[i]}${html[i+1]||'<div></div>'}</div>`;
    return `<style>${CSS_MEIA}</style>${folhas}`;
  }
  const linhasDe=(t)=>Math.max(1,Math.ceil(String(t).length/MF_CHARS));
  function imprimirSimples(){
    if(!LISTA) return;
    const linhas=textoSimplificado(LISTA,true).split('\n');
    const blocos=linhas.map(l=>({html:`<div>${l?textoHtml(l):'&nbsp;'}</div>`, linhas:linhasDe(l.replace(/\*/g,''))}));
    $('print-area').innerHTML=meiaFolha(blocos,
      `Carrinhos_Net — ${LISTA.tipo==='atualizacao'?'Atualização · ':''}Listagem ${brData(LISTA.dia)} · ${horaSP(LISTA.gerada_em)}${FILTRO.size?' · '+rotuloFiltro():''}`);
    window.print();
    marcarVista();
  }
  function imprimirResumo(){
    if(!LISTA) return;
    const rs=resumoProdutos(LISTA);
    const blocos=[
      {html:`<div><b>RESUMO DE PRODUTOS — ${escH(diaExtenso(LISTA.dia))} (${escH(ddmm(LISTA.dia))})</b></div>`, linhas:1},
      {html:`<div class="mf-mudo">${escH(rotuloFiltro())} · ${rs.length} ${rs.length===1?'produto':'produtos'}</div>`, linhas:1},
      {html:'<div>&nbsp;</div>', linhas:1},
    ];
    if(!rs.length) blocos.push({html:'<div>Nenhum produto com esses filtros.</div>', linhas:1});
    for(const r of rs){
      const desc=String(r.descricao||'').slice(0,70);
      blocos.push({html:`<div><b>${escH(r.sku)}</b> — ${r.pacotes} ${r.pacotes===1?'pacote':'pacotes'} · ${escH(num(r.unidades))} un.</div>`+
                        (desc?`<div class="mf-mudo">${escH(desc)}</div>`:''), linhas: desc?2:1});
    }
    $('print-area').innerHTML=meiaFolha(blocos, `Carrinhos_Net — Resumo de produtos ${brData(LISTA.dia)} · listagem das ${horaSP(LISTA.gerada_em)}`);
    window.print();
    marcarVista();
  }

  // horário de corte e de despacho do ML guardados na listagem
  function agendaTxt(lista){
    const a=lista.agenda;
    if(!a) return '';
    if(a.trabalha===false) return 'Agência do ML: sem despacho neste dia';
    return `Corte do ML: ${a.corte||'--:--'} · despacho na agência até ${a.despacho||'--:--'}`;
  }

  // ---------------------------------------------------------------
  // AVISO: lista automática nova (em qualquer tela do sistema)
  //   Confere a cada 2 minutos. O aviso flutuante e a bolinha do menu
  //   ficam até alguém copiar para o WhatsApp ou imprimir a lista.
  // ---------------------------------------------------------------
  let ultimoCheck=0, ultimoUsuario=null;
  async function verificarPendentes(forcar){
    const t=$('ex-toast'); if(!t) return;
    if(!USER || !temPermissao('expedicao.ver')){ t.style.display='none'; return; }
    if(!forcar && Date.now()-ultimoCheck<120000 && ultimoUsuario===USER.id) return;
    ultimoCheck=Date.now(); ultimoUsuario=USER.id;
    try{
      const n=Number(await rpc('cn_expedicao_pendencias',{p_usuario_id:USER.id}))||0;
      t.style.display= n>0 ? '' : 'none';
      if(n>0) $('ex-toast-txt').textContent= n===1 ? 'Listagem de envios automática não lida' : `${n} listagens de envios automáticas não lidas`;
    }catch(e){ t.style.display='none'; }
  }
  setInterval(()=>verificarPendentes(false), 30000);
  // "Abrir" do aviso: leva ao PAINEL, onde as não lidas estão no topo
  async function abrirPendente(){
    if(typeof mostrarTela==='function') mostrarTela('expedicao');
    mostrarPainel();
    // mostra direto as não lidas (de qualquer dia)
    f('f-leitura').value='nao'; f('f-origem').value=''; f('f-busca').value=''; f('f-de').value=''; f('f-ate').value='';
    PAG=1;
    await carregarPainel();
  }

  function bind(){
    f('copiar').addEventListener('click',copiarWhatsApp);
    f('imprimir-simples').addEventListener('click',imprimirSimples);
    f('gerar').addEventListener('click',gerar);
    f('imprimir').addEventListener('click',imprimir);
    f('imprimir-resumo').addEventListener('click',imprimirResumo);
    f('status-etq').addEventListener('click',atualizarStatusEtiquetas);
    f('kpis').addEventListener('click',(ev)=>{ const b=ev.target.closest('[data-box]'); if(b) clicarBox(b.dataset.box); });
    f('voltar').addEventListener('click',async()=>{ mostrarPainel(); await carregarPainel(); });
    f('recarregar').addEventListener('click',async()=>{ msg('Atualizando…'); await carregarPainel(); msg(''); });
    ['f-leitura','f-origem','f-de','f-ate'].forEach(k=>f(k).addEventListener('change',recarregarDoInicio));
    f('f-periodo').addEventListener('change',async()=>{ aplicarPeriodo(f('f-periodo').value); await recarregarDoInicio(); });
    f('f-busca').addEventListener('keydown',(ev)=>{ if(ev.key==='Enter') recarregarDoInicio(); });
    f('f-busca').addEventListener('search',recarregarDoInicio);   // "x" do campo limpa a busca
    f('f-limpar').addEventListener('click',async()=>{
      f('f-leitura').value=''; f('f-origem').value=''; f('f-busca').value=''; f('f-de').value=''; f('f-ate').value='';
      await recarregarDoInicio();
    });
    f('prev').addEventListener('click',async()=>{ if(PAG>1){ PAG--; await carregarPainel(); window.scrollTo(0,0); } });
    f('next').addEventListener('click',async()=>{ PAG++; await carregarPainel(); window.scrollTo(0,0); });
    f('painel-tbody').addEventListener('click',(ev)=>{
      const tr=ev.target.closest('tr.ex-linha'); if(tr) abrirLista(tr.dataset.id);
    });
  }
  async function init(){
    f('gerar').disabled=!temPermissao('expedicao.gerar');
    if(!temPermissao('expedicao.gerar')) f('gerar').title='Seu perfil pode ver e reimprimir listas, mas não gerar uma nova.';
    bind(); render(); mostrarPainel();
    await carregarPainel();
  }
  // o aviso flutuante funciona mesmo antes de abrir a tela
  document.addEventListener('DOMContentLoaded',()=>{
    const b=$('ex-toast-abrir'); if(b) b.addEventListener('click',abrirPendente);
  });
  // usados também pela tela Emissão de Etiquetas (etiquetas.js): o texto
  // de cada pacote e a numeração saem IGUAIS aos da Listagem de Envios
  return { init, abrirPendente, verificarPendentes, abrirLista,
           util:{ desmontar, itemTxt, numerar, viaDe, conteudoPacote } };
})();

registrarTela('expedicao', EXP);
