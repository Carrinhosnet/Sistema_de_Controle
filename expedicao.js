// =====================================================================
// CARRINHOS_NET — TELA: Lista do dia (grupo Expedição)
// Depende da base do index.html: $, USER, rpc, SUPABASE_KEY, FUNC_URL,
// verificarSessao, renovarSessao, temPermissao, registrarTela.
// Imprime pelo #print-area do index (mesmo mecanismo da Análise de
// Estoque): o navegador abre a janela de impressão e "Salvar como PDF".
//
// O QUE FAZ
//   "Gerar lista do dia" chama a Edge Function expedicao-lista, que junta
//   os envios que precisam sair hoje (e os atrasados) do Mercado Livre e
//   dos outros canais (Bling), grava a lista no histórico e devolve.
//   Qualquer lista do histórico pode ser reaberta e reimpressa: ela
//   mostra os envios como estavam na hora em que foi gerada.
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
//   metro"). "Copiar para WhatsApp" copia com *negrito* do WhatsApp;
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
  // organização da lista (uma fonte só para tela e PDF)
  // ---------------------------------------------------------------
  function skusDistintos(e){ return [...new Set((e.itens||[]).map(i=>i.sku||'(sem SKU)'))]; }
  function montar(lista){
    const envios=(lista.envios||[]).slice();
    const porDespacho=(a,b)=>String(a.despachar_ate||a.dia_despacho).localeCompare(String(b.despachar_ate||b.dia_despacho));
    const atrasados=envios.filter(e=>e.atrasado).sort((a,b)=>String(a.dia_despacho).localeCompare(String(b.dia_despacho)) || (skusDistintos(a)[0]||'').localeCompare(skusDistintos(b)[0]||''));
    const hoje=envios.filter(e=>!e.atrasado);
    const simples=hoje.filter(e=>skusDistintos(e).length<=1);
    const mistos=hoje.filter(e=>skusDistintos(e).length>1).sort(porDespacho);
    const grupos=new Map();
    for(const e of simples){
      const sku=skusDistintos(e)[0]||'(sem SKU)';
      if(!grupos.has(sku)) grupos.set(sku,[]);
      grupos.get(sku).push(e);
    }
    const produtos=[...grupos.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR',{numeric:true}))
      .map(([sku,lst])=>({sku, descricao:(lst[0].itens[0]||{}).descricao||'', envios:lst.sort(porDespacho)}));
    // resumo: pacotes e unidades por produto (todos os envios, inclusive atrasados e mistos)
    const resumo=new Map();
    for(const e of envios) for(const sku of skusDistintos(e)){
      const it=(e.itens||[]).filter(i=>(i.sku||'(sem SKU)')===sku);
      const r=resumo.get(sku)||{sku,descricao:(it[0]||{}).descricao||'',pacotes:0,unidades:0};
      r.pacotes++; r.unidades+=it.reduce((s,i)=>s+Number(i.qtd||0),0);
      resumo.set(sku,r);
    }
    return { atrasados, produtos, mistos, conferir:lista.conferir||[],
             resumo:[...resumo.values()].sort((a,b)=>a.sku.localeCompare(b.sku,'pt-BR',{numeric:true})) };
  }

  // envio: número inteiro com os 5 últimos em destaque (como na etiqueta)
  const envioHtml=(e)=> e.envio ? `${escH(e.envio.slice(0,-5))}<b class="ex-fim">${escH(e.envio.slice(-5))}</b>` : '—';
  function despacharHtml(e){
    if(e.despachar_ate) return `${diaSemana(e.dia_despacho)} ${ddmm(e.dia_despacho)} ${horaDe(e.despachar_ate)}`;
    return `${diaSemana(e.dia_despacho)} ${ddmm(e.dia_despacho)}`;
  }
  const corSituacao=(s)=> /^AGUARDANDO NF/.test(s)?'ex-s-nf' : /^ETIQUETA (LIBERADA|IMPRESSA)/.test(s)?'ex-s-ok' : /^ETIQUETA PRÓPRIA/.test(s)?'ex-s-propria' : 'ex-s-outra';

  // linhas de uma tabela de envios; n = contador compartilhado da lista
  function linhasEnvios(envios, cont, mostrarProduto){
    let h='';
    for(const e of envios){
      const itens=e.itens||[];
      itens.forEach((it,k)=>{
        const primeira=k===0, span=itens.length;
        const comp=(it.componentes&&it.componentes.length)
          ? `<div class="ex-comp">contém: ${it.componentes.map(c=>`${c.qtd}× ${escH(c.sku)}${c.descricao?' '+escH(c.descricao):''}`).join(' · ')}</div>` : '';
        const fora=it.cadastro===false? ' <span class="ex-fora">(fora do cadastro)</span>' : '';
        h+=`<tr class="${primeira?'ex-novo':''}">`+
          (primeira? `<td class="num ex-n" rowspan="${span}">${++cont.n}</td>` : '')+
          (mostrarProduto? `<td class="ex-sku">${escH(it.sku||'(sem SKU)')}</td><td class="pr-desc ex-desc">${escH(it.descricao)}${fora}${comp}</td>`
                         : `<td class="pr-desc ex-desc">${comp||'<span class="ex-mudo">—</span>'}</td>`)+
          `<td class="num ex-qtd">${escH(it.qtd)}</td>`+
          (primeira? `<td rowspan="${span}">${escH(e.canal)}${e.tipo_envio&&e.tipo_envio!=='—'?`<div class="ex-mudo">${escH(e.tipo_envio)}</div>`:''}</td>
            <td rowspan="${span}" class="ex-envio">${envioHtml(e)}</td>
            <td rowspan="${span}">${escH(e.pedido)}</td>
            <td rowspan="${span}" class="${e.atrasado?'ex-atraso':''}">${escH(despacharHtml(e))}</td>
            <td rowspan="${span}"><span class="ex-sit ${corSituacao(e.situacao)}">${escH(e.situacao)}</span></td>` : '')+
          `</tr>`;
      });
    }
    return h;
  }

  function cabecalhoTabela(mostrarProduto){
    return `<thead><tr><th class="num" style="width:4%">Nº</th>`+
      (mostrarProduto? `<th style="width:9%">SKU</th><th style="width:20%">Descrição</th>` : `<th style="width:29%">Conteúdo</th>`)+
      `<th class="num" style="width:4%">Qtd</th><th style="width:10%">Canal</th><th style="width:13%">Envio</th>`+
      `<th style="width:12%">Pedido</th><th style="width:12%">Despachar até</th><th style="width:16%">Situação</th></tr></thead>`;
  }

  function corpoLista(lista){
    const m=montar(lista); const cont={n:0}; let h='';
    if(m.atrasados.length){
      h+=`<div class="ex-bloco ex-bloco-atraso"><div class="ex-bt">ATRASADOS — ${m.atrasados.length} ${m.atrasados.length===1?'envio':'envios'} (despacho vencido)</div>
          <table class="ex-tab">${cabecalhoTabela(true)}<tbody>${linhasEnvios(m.atrasados,cont,true)}</tbody></table></div>`;
    }
    for(const g of m.produtos){
      const un=g.envios.reduce((s,e)=>s+e.itens.reduce((t,i)=>t+Number(i.qtd||0),0),0);
      const it0=g.envios[0].itens[0]||{};
      const comp=(it0.componentes&&it0.componentes.length)? ` <span class="ex-mudo">· ${escH(it0.tipo||'Kit')}</span>` : '';
      const fora=it0.cadastro===false? ` <span class="ex-fora">(fora do cadastro: descrição do canal)</span>` : '';
      h+=`<div class="ex-bloco"><div class="ex-bt"><span class="ex-bt-sku">${escH(g.sku)}</span> ${escH(g.descricao)}${comp}${fora}
            <span class="ex-bt-q">${g.envios.length} ${g.envios.length===1?'pacote':'pacotes'} · ${un} un.</span></div>
          <table class="ex-tab">${cabecalhoTabela(false)}<tbody>${linhasEnvios(g.envios,cont,false)}</tbody></table></div>`;
    }
    if(m.mistos.length){
      h+=`<div class="ex-bloco"><div class="ex-bt">PEDIDOS MISTOS — ${m.mistos.length} ${m.mistos.length===1?'envio':'envios'} com mais de um produto</div>
          <table class="ex-tab">${cabecalhoTabela(true)}<tbody>${linhasEnvios(m.mistos,cont,true)}</tbody></table></div>`;
    }
    if(!cont.n) h+=`<p class="ex-vazio">Nenhum envio para hoje.</p>`;
    if(m.conferir.length){
      h+=`<div class="ex-bloco ex-bloco-conf"><div class="ex-bt">CONFERIR — ${m.conferir.length} (não entram na contagem)</div>
          <table class="ex-tab"><thead><tr><th style="width:12%">Canal</th><th style="width:20%">Pedido</th><th style="width:16%">Envio</th><th>O que conferir</th></tr></thead><tbody>`+
          m.conferir.map(c=>`<tr><td>${escH(c.canal)}</td><td>${escH(c.pedido)}</td><td>${c.envio?envioHtml({envio:String(c.envio)}):'—'}</td><td class="pr-desc">${escH(c.motivo)}</td></tr>`).join('')+
          `</tbody></table></div>`;
    }
    if(m.resumo.length){
      h+=`<div class="ex-bloco ex-resumo"><div class="ex-bt">RESUMO PARA A EMBALAGEM — pacotes por produto</div>
          <table class="ex-tab"><thead><tr><th style="width:15%">SKU</th><th>Descrição</th><th class="num" style="width:10%">Pacotes</th><th class="num" style="width:10%">Unidades</th></tr></thead><tbody>`+
          m.resumo.map(r=>`<tr><td class="ex-sku">${escH(r.sku)}</td><td class="pr-desc">${escH(r.descricao)}</td><td class="num">${r.pacotes}</td><td class="num">${r.unidades}</td></tr>`).join('')+
          `</tbody></table></div>`;
    }
    return h;
  }

  function corpoAtualizacao(lista){
    const cont={n:0}; let h='';
    const novas=lista.novas||lista.envios||[], canc=lista.canceladas||[];
    h+=`<div class="ex-bloco"><div class="ex-bt">VENDAS NOVAS — ${novas.length} ${novas.length===1?'envio':'envios'} desde a lista das ${escH(horaDe(new Date(new Date(lista.base_gerada_em||lista.gerada_em).getTime()-3*3600e3).toISOString()))}</div>`+
       (novas.length? `<table class="ex-tab">${cabecalhoTabela(true)}<tbody>${linhasEnvios(novas,cont,true)}</tbody></table>` : `<p class="ex-vazio">Nenhuma venda nova para hoje.</p>`)+`</div>`;
    h+=`<div class="ex-bloco ex-bloco-atraso"><div class="ex-bt">CANCELADAS — NÃO ENVIAR — ${canc.length}</div>`+
       (canc.length? `<table class="ex-tab">${cabecalhoTabela(true)}<tbody>${linhasEnvios(canc,{n:0},true)}</tbody></table>` : `<p class="ex-vazio">Nenhum cancelamento.</p>`)+`</div>`;
    return h;
  }

  function caixas(lista){
    if(lista.tipo==='atualizacao'){
      const t=lista.totais||{};
      return [
        ['Vendas novas',t.novas??0,'Entraram depois da lista principal',''],
        ['Unidades novas',t.unidades_novas??0,'Soma das quantidades',''],
        ['Canceladas',t.canceladas??0,'Estavam na lista: NÃO enviar','ex-k-atraso'],
        ['Já saíram',t.ja_sairam??0,'Saíram da lista porque foram despachadas',''],
      ];
    }
    const t=lista.totais||{};
    const canais=Object.entries(t.por_canal||{}).map(([c,n])=>`${c}: ${n}`).join(' · ');
    return [
      ['Envios',t.envios??0,canais||'—',''],
      ['Unidades',t.unidades??0,'Soma das quantidades',''],
      ['Atrasados',t.atrasados??0,'Despacho já venceu','ex-k-atraso'],
      ['Aguardando NF',t.aguardando_nf??0,'Etiqueta ainda não liberada','ex-k-nf'],
      ['Conferir',t.conferir??0,'Bling e ML não batem','ex-k-conf'],
      ['Próximos dias',t.proximos_dias??0,'ML com despacho depois de hoje (fora da lista)',''],
    ];
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
  function itemTxt(i){
    if(i.base_sku) return `${i.base_sku} - ${num(i.medida)} ${unidadeTxt(i.unidade,i.medida)}`;
    return `${i.sku||'(sem SKU)'} - ${num(i.qtd)} ${Number(i.qtd)>=2?'unidades':'unidade'}`;
  }
  const ehFabricacao=(i)=> semAcento(i.origem)==='fabricacao propria';

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
    const ordemSku=(a,b)=>itemTxt((a.itens||[])[0]||{}).localeCompare(itemTxt((b.itens||[])[0]||{}),'pt-BR',{numeric:true});
    const atrasados=doGrupo.filter(e=>e.atrasado).sort((a,b)=>String(a.dia_despacho).localeCompare(String(b.dia_despacho))||ordemSku(a,b));
    const hoje=doGrupo.filter(e=>!e.atrasado).sort(ordemSku);
    let n=0;
    const at=atrasados.map(e=>({e,n:++n})), hj=hoje.map(e=>({e,n:++n}));
    return { atrasados:at, hoje:hj, ultimo:n, porChave:new Map([...at,...hj].map(x=>[x.e.chave,x.n])) };
  }
  const nPacote=(n)=>`PACOTE ${String(n).padStart(2,'0')}`;
  const conteudoPacote=(e)=>(e.itens||[]).map(itemTxt).join(' + ');

  // produção: só Fabricação Própria, somado por SKU (base, no fracionado)
  function producao(envios, via){
    const soma=new Map();
    for(const e of (envios||[]).filter(x=>viaDe(x)===via)) for(const i of (e.itens||[])){
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
  // produção). Mexer aqui muda o texto do WhatsApp E a impressão.
  const SEPARADOR='---------------------------------------------';
  function textoSimplificado(lista, negrito){
    if(lista.tipo==='atualizacao') return textoAtualizacao(lista, negrito);
    const B=(t)=> negrito? `*${t}*` : t;
    const envios=lista.envios||[];
    const hora=horarioAgencia(envios);
    const T_TRANSP='ENVIAR VIA TRANSPORTADORA:';
    const T_AGENCIA=`ENVIAR VIA AGÊNCIA DO MERCADO LIVRE ATÉ ÀS ${hora}:`;
    const L=[];
    L.push(B(`VENDAS ${diaExtenso(lista.dia)} (${ddmm(lista.dia)}):`));

    const secao=(titulo, via)=>{
      const num=numerar(envios, via);
      L.push(''); L.push(B(titulo));
      L.push(''); L.push(B('Envios Atrasados:')); L.push('');
      if(num.atrasados.length) num.atrasados.forEach(x=>L.push(`${nPacote(x.n)}: ${conteudoPacote(x.e)} (era para ${ddmm(x.e.dia_despacho)})`)); else L.push('-');
      L.push(''); L.push(B('Envios para Hoje:')); L.push('');
      if(num.hoje.length) num.hoje.forEach(x=>L.push(`${nPacote(x.n)}: ${conteudoPacote(x.e)}`)); else L.push('-');
    };
    secao(T_TRANSP,'transportadora');
    secao(T_AGENCIA,'agencia');

    L.push(''); L.push(SEPARADOR); L.push('');
    L.push(B('ITENS PARA PRODUÇÃO:'));
    L.push(''); L.push(B(T_TRANSP)); L.push(''); L.push(...producao(envios,'transportadora'));
    L.push(''); L.push(B(T_AGENCIA)); L.push(''); L.push(...producao(envios,'agencia'));
    if(!(lista.versao>=2)) { L.push(''); L.push('(Lista gerada antes da versão com origem dos produtos: itens para produção não disponíveis.)'); }
    const conf=(lista.conferir||[]).length;
    if(conf){ L.push(''); L.push(B(`CONFERIR: ${conf} ${conf===1?'pedido':'pedidos'} — ver a lista completa no sistema.`)); }
    return L.join('\n');
  }

  // ATUALIZAÇÃO (gerada depois do corte): só o que mudou desde a principal.
  //   Vendas novas: continuam a numeração da principal (PACOTE 09, 10…).
  //   Canceladas: com o MESMO número que tinham na principal, para achar
  //   o pacote na pilha.
  function textoAtualizacao(lista, negrito){
    const B=(t)=> negrito? `*${t}*` : t;
    const base=LISTA_BASE && LISTA_BASE.id===lista.base_id ? LISTA_BASE : null;
    const baseEnvios=base? (base.envios||[]) : [];
    const hora=horarioAgencia(baseEnvios.length? baseEnvios : (lista.novas||[])) !== '--:--'
      ? horarioAgencia(baseEnvios.length? baseEnvios : (lista.novas||[]))
      : ((lista.agenda&&lista.agenda.despacho)||'--:--');
    const T_TRANSP='ENVIAR VIA TRANSPORTADORA:';
    const T_AGENCIA=`ENVIAR VIA AGÊNCIA DO MERCADO LIVRE ATÉ ÀS ${hora}:`;
    const novas=lista.novas||lista.envios||[], canc=lista.canceladas||[];
    const L=[];
    L.push(B(`ATUALIZAÇÃO VENDAS ${diaExtenso(lista.dia)} (${ddmm(lista.dia)}) - ${horaDe(new Date(new Date(lista.gerada_em).getTime()-3*3600e3).toISOString())}:`));

    L.push(''); L.push(B('VENDAS NOVAS:'));
    for(const [titulo,via] of [[T_TRANSP,'transportadora'],[T_AGENCIA,'agencia']]){
      const ultimo=numerar(baseEnvios, via).ultimo;
      const num=numerar(novas, via);
      const linhas=[...num.atrasados,...num.hoje].map(x=>`${nPacote(ultimo+x.n)}: ${conteudoPacote(x.e)}`+(x.e.atrasado?` (era para ${ddmm(x.e.dia_despacho)})`:''));
      L.push(''); L.push(B(titulo)); L.push('');
      L.push(...(linhas.length? linhas : ['-']));
    }

    L.push(''); L.push(SEPARADOR); L.push('');
    L.push(B('VENDAS CANCELADAS (NÃO ENVIAR):'));
    for(const [titulo,via] of [[T_TRANSP,'transportadora'],[T_AGENCIA,'agencia']]){
      const nums=numerar(baseEnvios, via).porChave;
      const linhas=canc.filter(e=>viaDe(e)===via).map(e=>{
        const n=nums.get(e.chave);
        return `${n? nPacote(n) : 'PACOTE'}: ${conteudoPacote(e)}`;
      });
      L.push(''); L.push(B(titulo)); L.push('');
      L.push(...(linhas.length? linhas : ['-']));
    }

    L.push(''); L.push(SEPARADOR); L.push('');
    L.push(B('ITENS PARA PRODUÇÃO (VENDAS NOVAS):'));
    L.push(''); L.push(B(T_TRANSP)); L.push(''); L.push(...producao(novas,'transportadora'));
    L.push(''); L.push(B(T_AGENCIA)); L.push(''); L.push(...producao(novas,'agencia'));
    if(!base) { L.push(''); L.push('(Não consegui abrir a lista principal do dia: os números dos pacotes podem não bater.)'); }
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
    msg('Texto copiado. É só colar no WhatsApp.');
    marcarVista();
  }

  // lista automática: o aviso some quando alguém copia ou imprime
  async function marcarVista(){
    if(!LISTA || !LISTA_ID || LISTA.vista_em) return;
    try{
      await rpc('cn_expedicao_marcar_vista',{p_usuario_id:USER.id,p_id:LISTA_ID});
      LISTA.vista_em=new Date().toISOString();
      const h=HIST.find(x=>x.id===LISTA_ID); if(h) h.vista_em=LISTA.vista_em;
      montarHistorico(LISTA_ID); render();
      verificarPendentes(true);
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ /* sem permissão ou sem rede: o aviso continua, sem travar a tela */ }
  }

  // texto com *negrito* do WhatsApp → HTML com <b>
  const textoHtml=(t)=>escH(t).replace(/\*([^*\n]+)\*/g,'<b>$1</b>');

  // ---------------------------------------------------------------
  // tela
  // ---------------------------------------------------------------
  function msg(t,erro){ f('msg').textContent=t||''; f('msg').style.color=erro?'var(--danger)':'var(--muted)'; }

  function render(){
    if(!LISTA){
      f('kpis').innerHTML=''; f('avisos').style.display='none';
      f('corpo').innerHTML=`<p class="ex-vazio">Clique em <b>Gerar lista do dia</b>, ou escolha uma lista já gerada.</p>`;
      f('imprimir').disabled=true; f('copiar').disabled=true; f('imprimir-simples').disabled=true;
      f('simples').style.display='none'; f('titulo').textContent=''; f('nova').style.display='none'; return;
    }
    f('titulo').innerHTML=`${LISTA.tipo==='atualizacao'?'<b>Atualização</b> da ':''}Lista do dia <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.automatica?' · <b>automática</b>':(LISTA.gerada_por?' por '+escH(LISTA.gerada_por):'')}`;
    const nova=LISTA.automatica && !LISTA.vista_em;
    f('nova').style.display= nova ? '' : 'none';
    f('nova').innerHTML= nova ? `<b>${LISTA.tipo==='atualizacao'?'Atualização automática nova':'Lista automática nova'}.</b> Copie para o WhatsApp ou imprima: o aviso some quando alguém fizer isso.` : '';
    f('kpis').innerHTML=caixas(LISTA).map(([l,v,h,c])=>`<div class="kpi ${c}"><div class="lbl">${l}</div><div class="hint">${escH(h)}</div><div class="val">${v}</div></div>`).join('');
    const av=(LISTA.avisos||[]);
    f('avisos').innerHTML=av.map(a=>`<div>• ${escH(a)}</div>`).join('');
    f('avisos').style.display=av.length?'':'none';
    f('corpo').innerHTML= LISTA.tipo==='atualizacao' ? corpoAtualizacao(LISTA) : corpoLista(LISTA);
    f('simples-texto').innerHTML=textoHtml(textoSimplificado(LISTA,true));
    f('simples').style.display='';
    f('imprimir').disabled=false; f('copiar').disabled=false; f('imprimir-simples').disabled=false;
  }

  const hojeSP=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  function rotuloHist(l){
    const t=l.totais||{};
    const hora=horaDe(new Date(new Date(l.gerada_em).getTime()-3*3600e3).toISOString());
    const oque= l.tipo==='atualizacao' ? `Atualização: ${t.novas??0} novas, ${t.canceladas??0} canceladas` : `${t.envios??'?'} envios`;
    const quem= l.automatica ? 'automática' : (l.gerada_por||'');
    const nova= l.automatica && !l.vista_em && l.dia===hojeSP() ? '● NOVA — ' : '';
    return `${nova}${diaSemana(l.dia)} ${brData(l.dia)} ${hora} — ${oque}${quem?' — '+quem:''}`;
  }
  function montarHistorico(selecionar){
    f('hist').innerHTML='<option value="">Listas já geradas…</option>'+HIST.map(l=>`<option value="${l.id}">${escH(rotuloHist(l))}</option>`).join('');
    if(selecionar) f('hist').value=String(selecionar);
  }
  async function carregarHistorico(selecionar){
    try{
      HIST=(await rpc('cn_expedicao_listas',{p_usuario_id:USER.id,p_limite:60}))||[];
      montarHistorico(selecionar);
    }catch(e){ msg('Não consegui carregar o histórico: '+e.message,true); }
  }

  async function abrirLista(id){
    if(!id||OCUPADO) return;
    msg('Abrindo…');
    try{
      LISTA=await rpc('cn_expedicao_lista',{p_usuario_id:USER.id,p_id:Number(id)}); LISTA_ID=Number(id);
      LISTA_BASE=null;
      if(LISTA.tipo==='atualizacao' && LISTA.base_id){
        try{ LISTA_BASE=await rpc('cn_expedicao_lista',{p_usuario_id:USER.id,p_id:Number(LISTA.base_id)}); }catch(e){ LISTA_BASE=null; }
      }
      f('hist').value=String(id); msg('');
    }catch(e){ msg(e.message,true); }
    render();
  }
  async function abrirDoHistorico(){ await abrirLista(f('hist').value); }

  // ao entrar na tela: a lista automática nova de hoje; senão, a mais
  // recente de hoje; senão, nada aberto
  async function abrirMaisRelevante(){
    const hoje=hojeSP();
    const nova=HIST.find(l=>l.automatica && !l.vista_em && l.dia===hoje);
    const deHoje=HIST.find(l=>l.dia===hoje);
    const alvo=nova||deHoje;
    if(alvo) await abrirLista(alvo.id);
  }

  async function gerar(){
    if(OCUPADO) return;
    OCUPADO=true; f('gerar').disabled=true; f('hist').disabled=true;
    const t=f('gerar').textContent; f('gerar').textContent='Gerando…';
    msg('Consultando Mercado Livre e Bling… pode levar até 1 minuto.');
    try{
      const r=await chamar({acao:'gerar'});
      LISTA=Object.assign({},r.lista,{gerada_por:USER&&USER.nome, automatica:false, vista_em:new Date().toISOString()}); LISTA_ID=r.id; LISTA_BASE=null;
      await carregarHistorico(r.id);
      msg((LISTA.avisos||[]).length? 'Lista gerada com avisos — veja abaixo.' : 'Lista gerada e guardada no histórico.', !!(LISTA.avisos||[]).length);
    }catch(e){ msg(e.message,true); }
    finally{ OCUPADO=false; f('gerar').textContent=t; f('gerar').disabled=!temPermissao('expedicao.gerar'); f('hist').disabled=false; render(); }
  }

  // ---------------------------------------------------------------
  // impressão / PDF (A4 deitado, pelo #print-area do index)
  // ---------------------------------------------------------------
  const CSS_PRINT=`
    @media print{
      #print-area .ex-p{font-size:8.5pt}
      #print-area .ex-bloco{margin-bottom:7px;break-inside:auto}
      #print-area .ex-bt{font-size:9.5pt;font-weight:700;padding:4px 6px;background:#e9edf1;border-left:3px solid #0d5c37;margin-top:4px;break-after:avoid}
      #print-area .ex-bt-sku{font-family:monospace;font-size:10pt}
      #print-area .ex-bt-q{float:right;font-weight:600;color:#3a4049}
      #print-area .ex-bloco-atraso .ex-bt{border-left-color:#c81e1e;color:#c81e1e;background:#fdecec}
      #print-area .ex-bloco-conf .ex-bt{border-left-color:#7c3aed;background:#f3eefe}
      #print-area .ex-tab td{font-size:8.5pt;padding:3px 5px;white-space:normal;overflow:visible;text-overflow:clip}
      #print-area .ex-n{font-weight:700}
      #print-area .ex-qtd{font-weight:700;font-size:10pt !important}
      #print-area .ex-sku{font-family:monospace}
      #print-area .ex-fim{font-size:10pt}
      #print-area .ex-comp{font-size:7pt;color:#5b6472;margin-top:1px}
      #print-area .ex-mudo{font-size:7pt;color:#5b6472}
      #print-area .ex-fora{font-size:7pt;color:#b45309}
      #print-area .ex-atraso{color:#c81e1e;font-weight:700}
      #print-area .ex-sit{font-size:7pt;font-weight:700}
      #print-area .ex-s-nf{color:#b45309}
      #print-area .ex-s-ok{color:#0d5c37}
      #print-area tr.ex-novo td{border-top:1px solid #9aa3ad}
      #print-area .ex-vazio{font-size:10pt;padding:10px 0}
    }`;

  function imprimir(){
    if(!LISTA) return;
    const kp=caixas(LISTA).filter(k=>k[0]!=='Próximos dias');
    $('print-area').innerHTML=`<style>${CSS_PRINT}</style><div class="ex-p">
      <div class="pr-topo">
        <img src="logo-print.png" class="pr-logo" onerror="this.onerror=null;this.src='logo.png';this.className='pr-logo pr-logo-inv'">
        <div><p class="pr-tit">${LISTA.tipo==='atualizacao'?'Atualização da ':''}Lista do dia — ${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</p>
             <div class="pr-sub">${LISTA.tipo==='atualizacao'?'Vendas novas e canceladas desde a lista principal':'Envios a despachar hoje e atrasados · Mercado Livre e Bling'}</div></div>
        <div class="pr-quando">Gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.gerada_por?'<br>por '+escH(LISTA.gerada_por):''}${LISTA_ID?'<br>Lista nº '+LISTA_ID:''}</div>
      </div>
      <div class="pr-kpis">${kp.map(([l,v])=>`<div class="pr-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${(LISTA.avisos||[]).length? `<div class="pr-warn" style="margin-bottom:6px">${(LISTA.avisos||[]).map(a=>'• '+escH(a)).join('<br>')}</div>`:''}
      ${LISTA.tipo==='atualizacao' ? corpoAtualizacao(LISTA) : corpoLista(LISTA)}
      <div class="pr-rodape"><span>Carrinhos_Net — Sistema de Controle</span><span>Envios com despacho depois de hoje: ${(LISTA.totais||{}).proximos_dias??0}</span></div>
    </div>`;
    window.print();
    marcarVista();
  }

  const CSS_SIMPLES=`
    @media print{
      @page{size:A4 portrait;margin:14mm}
      #print-area .ex-s{font-size:11pt;line-height:1.45;white-space:pre-wrap;color:#1a1d23}
      #print-area .ex-s b{font-weight:700}
      #print-area .ex-s-rod{margin-top:10px;font-size:7pt;color:#5b6472;border-top:1px solid #d7dbe0;padding-top:4px}
    }`;
  function imprimirSimples(){
    if(!LISTA) return;
    $('print-area').innerHTML=`<style>${CSS_SIMPLES}</style><div class="ex-s">${textoHtml(textoSimplificado(LISTA,true))}</div>
      <div class="ex-s-rod">Carrinhos_Net — ${LISTA.tipo==='atualizacao'?'Atualização da ':''}Lista do dia ${escH(brData(LISTA.dia))} · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA_ID?' · lista nº '+LISTA_ID:''}</div>`;
    window.print();
    marcarVista();
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
      if(n>0) $('ex-toast-txt').textContent= n===1 ? 'Lista do dia automática nova' : `${n} listas do dia automáticas novas`;
    }catch(e){ t.style.display='none'; }
  }
  setInterval(()=>verificarPendentes(false), 30000);
  async function abrirPendente(){
    if(typeof mostrarTela==='function') mostrarTela('expedicao');
    await carregarHistorico();
    await abrirMaisRelevante();
  }

  function bind(){
    f('copiar').addEventListener('click',copiarWhatsApp);
    f('imprimir-simples').addEventListener('click',imprimirSimples);
    f('gerar').addEventListener('click',gerar);
    f('hist').addEventListener('change',abrirDoHistorico);
    f('imprimir').addEventListener('click',imprimir);
  }
  async function init(){
    f('gerar').disabled=!temPermissao('expedicao.gerar');
    if(!temPermissao('expedicao.gerar')) f('gerar').title='Seu perfil pode ver e reimprimir listas, mas não gerar uma nova.';
    bind(); render();
    await carregarHistorico();
    await abrirMaisRelevante();
  }
  // o aviso flutuante funciona mesmo antes de abrir a tela
  document.addEventListener('DOMContentLoaded',()=>{
    const b=$('ex-toast-abrir'); if(b) b.addEventListener('click',abrirPendente);
  });
  return { init, abrirPendente, verificarPendentes };
})();

registrarTela('expedicao', EXP);
