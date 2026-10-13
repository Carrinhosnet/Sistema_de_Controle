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
// =====================================================================
const EXP = (function(){
  const f=(id)=>$('ex-'+id);
  const FUNCAO='expedicao-lista';
  let LISTA=null;        // conteúdo da lista aberta
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

  function caixas(lista){
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
  // tela
  // ---------------------------------------------------------------
  function msg(t,erro){ f('msg').textContent=t||''; f('msg').style.color=erro?'var(--danger)':'var(--muted)'; }

  function render(){
    if(!LISTA){
      f('kpis').innerHTML=''; f('avisos').style.display='none';
      f('corpo').innerHTML=`<p class="ex-vazio">Clique em <b>Gerar lista do dia</b>, ou escolha uma lista já gerada.</p>`;
      f('imprimir').disabled=true; f('titulo').textContent=''; return;
    }
    f('titulo').innerHTML=`Lista do dia <b>${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</b> · gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.gerada_por?' por '+escH(LISTA.gerada_por):''}`;
    f('kpis').innerHTML=caixas(LISTA).map(([l,v,h,c])=>`<div class="kpi ${c}"><div class="lbl">${l}</div><div class="hint">${escH(h)}</div><div class="val">${v}</div></div>`).join('');
    const av=(LISTA.avisos||[]);
    f('avisos').innerHTML=av.map(a=>`<div>• ${escH(a)}</div>`).join('');
    f('avisos').style.display=av.length?'':'none';
    f('corpo').innerHTML=corpoLista(LISTA);
    f('imprimir').disabled=false;
  }

  async function carregarHistorico(selecionar){
    try{
      const r=await rpc('cn_expedicao_listas',{p_usuario_id:USER.id,p_limite:60});
      f('hist').innerHTML='<option value="">Listas já geradas…</option>'+(r||[]).map(l=>{
        const t=l.totais||{};
        return `<option value="${l.id}">${escH(diaSemana(l.dia))} ${escH(brData(l.dia))} ${escH(horaDe(new Date(new Date(l.gerada_em).getTime()-3*3600e3).toISOString()))} — ${t.envios??'?'} envios${l.gerada_por?' — '+escH(l.gerada_por):''}</option>`;
      }).join('');
      if(selecionar) f('hist').value=String(selecionar);
    }catch(e){ msg('Não consegui carregar o histórico: '+e.message,true); }
  }

  async function abrirDoHistorico(){
    const id=f('hist').value; if(!id||OCUPADO) return;
    msg('Abrindo…');
    try{ LISTA=await rpc('cn_expedicao_lista',{p_usuario_id:USER.id,p_id:Number(id)}); LISTA_ID=Number(id); msg(''); }
    catch(e){ msg(e.message,true); }
    render();
  }

  async function gerar(){
    if(OCUPADO) return;
    OCUPADO=true; f('gerar').disabled=true; f('hist').disabled=true;
    const t=f('gerar').textContent; f('gerar').textContent='Gerando…';
    msg('Consultando Mercado Livre e Bling… pode levar até 1 minuto.');
    try{
      const r=await chamar({acao:'gerar'});
      LISTA=Object.assign({},r.lista,{gerada_por:USER&&USER.nome}); LISTA_ID=r.id;
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
        <div><p class="pr-tit">Lista do dia — ${escH(diaSemana(LISTA.dia))} ${escH(brData(LISTA.dia))}</p>
             <div class="pr-sub">Envios a despachar hoje e atrasados · Mercado Livre e Bling</div></div>
        <div class="pr-quando">Gerada em ${escH(quando(LISTA.gerada_em))}${LISTA.gerada_por?'<br>por '+escH(LISTA.gerada_por):''}${LISTA_ID?'<br>Lista nº '+LISTA_ID:''}</div>
      </div>
      <div class="pr-kpis">${kp.map(([l,v])=>`<div class="pr-kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${(LISTA.avisos||[]).length? `<div class="pr-warn" style="margin-bottom:6px">${(LISTA.avisos||[]).map(a=>'• '+escH(a)).join('<br>')}</div>`:''}
      ${corpoLista(LISTA)}
      <div class="pr-rodape"><span>Carrinhos_Net — Sistema de Controle</span><span>Envios com despacho depois de hoje: ${(LISTA.totais||{}).proximos_dias??0}</span></div>
    </div>`;
    window.print();
  }

  function bind(){
    f('gerar').addEventListener('click',gerar);
    f('hist').addEventListener('change',abrirDoHistorico);
    f('imprimir').addEventListener('click',imprimir);
  }
  async function init(){
    f('gerar').disabled=!temPermissao('expedicao.gerar');
    if(!temPermissao('expedicao.gerar')) f('gerar').title='Seu perfil pode ver e reimprimir listas, mas não gerar uma nova.';
    bind(); render();
    await carregarHistorico();
  }
  return { init };
})();

registrarTela('expedicao', EXP);
