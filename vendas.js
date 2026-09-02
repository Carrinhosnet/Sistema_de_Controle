// =====================================================================
// CARRINHOS_NET — TELA: Controle de Vendas
// Depende da base do index.html: $, rpc, chamarFuncao, USER, temPermissao,
// brl, pct, dataBr, mesLabel, registrarTela.
//
// FRETE (arquivo 69): vendas.frete passou a guardar o CUSTO REAL. Quando
// existe envio com valor lançado, o gatilho do banco grava esse valor na
// venda. Não há mais dois números para a mesma pergunta: a coluna e o
// campo do drawer mostram o mesmo. Quando o frete veio do envio, o campo
// fica somente leitura — corrigir na venda faria as duas telas divergirem
// de novo, porque o gatilho só empurra do envio para a venda.
//
// TRES NUMEROS (arquivo 70):
//   A Receber          = o que o marketplace deposita.
//                        NF − comissão − (frete e frete extra só quando
//                        NÃO há envio, porque aí o ML retém os dois).
//   Receita Líq. Canal = o que sobra após os custos diretos de venda,
//                        antes do CMV. É o A Receber menos o frete.
//   Receita comercial  = KPI do topo, base da comissão do vendedor.
//                        NF − frete − frete extra, com a comissão do
//                        marketplace dentro de propósito.
// Sem envio as duas colunas dão o mesmo número. O Lucro % saiu da tela;
// continua sendo devolvido pela função.
// =====================================================================
const VD = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  const f = (id)=>$('vd-'+id);

  function filtros(){ return { p_usuario_id:USER.id, p_mes:f('mes').value||null, p_canal:f('canal').value||null, p_editado:f('edit').value===''?null:(f('edit').value==='true'), p_tipo_envio_editado:f('envioedit').value===''?null:(f('envioedit').value==='true'), p_busca:f('busca').value.trim()||null }; }

  async function init(){ if(typeof carregarUltimaAuto==='function') await carregarUltimaAuto(); await carregarFiltros(); carregar(); bind(); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_vendas',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_vendas',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){
    if(reset) PAGINA=0;
    f('tbody').innerHTML='<tr><td colspan="21" class="loading">Carregando vendas…</td></tr>';
    const fl=filtros();
    try{
      const [linhas,total,kpis,kconf]=await Promise.all([
        rpc('cn_listar_vendas',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_vendas',fl),
        rpc('cn_kpis_vendas',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal}),
        rpc('cn_kpis_conferencia',{p_usuario_id:USER.id,p_mes:fl.p_mes,p_canal:fl.p_canal}),
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0;
      renderKpis(kpis&&kpis[0], kconf&&kconf[0]); renderTabela(); renderPag();
      msgAtualizado('vd-msg','vendas');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="21" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('vd',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  function renderKpis(k,kc){ const box=f('kpis'); if(!k){box.innerHTML='';return;} const cards=[['Faturamento bruto',brl(k.faturamento_bruto)],['Pedidos',Number(k.qtd_pedidos||0).toLocaleString('pt-BR')],['Ticket médio',brl(k.ticket_medio)],['Comissão total',brl(k.total_comissao)],['Receita comercial',brl(k.receita_comercial)]];
    // somas das duas colunas novas; só aparecem se o SQL 70 já estiver aplicado
    if(k.receita_liquida_total!=null) cards.push(['Receita líq. do canal',brl(k.receita_liquida_total)]);
    if(k.a_receber_total!=null) cards.push(['Total a receber',brl(k.a_receber_total)]); if(kc){ cards.push(['Faltam conferir',Number(kc.faltam||0).toLocaleString('pt-BR')]); cards.push(['Editados',Number(kc.editados||0).toLocaleString('pt-BR')]); cards.push(['Envio alterado',Number(kc.envio_alterado||0).toLocaleString('pt-BR')]); } box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join(''); }

  // Frete que vale para a linha. Depois do arquivo 69 a própria coluna
  // vendas.frete já é o custo real; frete_efetivo continua vindo da
  // função e fica aqui como reserva caso o SQL antigo ainda esteja no ar.
  function freteReal(l){
    const v = (l.frete_efetivo!=null) ? l.frete_efetivo : l.frete;
    return (v==null) ? null : Number(v);
  }

  // Dif. Frete = aguardado − frete real.
  // Sem frete aguardado cadastrado não há diferença a mostrar: devolve
  // null e a célula sai como travessão. Antes o aguardado nulo virava
  // zero e a linha exibia o frete inteiro como diferença negativa.
  function difFrete(l){
    if(l.frete_aguardado==null || l.frete_aguardado==='') return null;
    const fr=freteReal(l);
    if(fr==null) return null;
    // arredonda em centavos: sem isto o CSV sai com 4.100000000000001
    // (a tela não mostrava porque o brl() já formata).
    return Math.round((Number(l.frete_aguardado)-fr)*100)/100;
  }
  function celDif(l){ const d=difFrete(l); return (d==null) ? '<span style="color:var(--muted)">—</span>' : brl(d); }

  function renderTabela(){
    const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="21" class="empty">Nenhuma venda encontrada.</td></tr>'; return; }
    const podeConf=temPermissao('vendas.conferir');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.conferido?'':'pendente'}" onclick="VD.abrir(${l.id})">
      <td>${l.editado?'<span title="Editado" style="color:var(--warn)">✎ </span>':''}${dataBr(l.data_compra)}</td><td>${l.canal||'—'}</td><td>${l.tipo_envio||'—'}${l.tipo_envio_editado?' <span title="Tipo de envio alterado pelo sistema ao lançar o envio manualmente — o frete que vale é o do Controle de Envios" style="color:var(--warn)">✎</span>':''}</td><td>${l.id_pedido||'—'}</td><td>${l.modelo||'—'}</td>
      <td class="num">${l.quantidade??'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td class="num">${brl(l.valor_unitario)}</td><td class="num">${brl(l.valor_total)}</td><td class="num">${brl(l.valor_comissao)}</td><td class="num">${pct(l.pct_comissao_ml)}</td><td>${l.tipo_anuncio||'—'}</td>
      <td class="num">${brl(freteReal(l))}</td><td class="num">${l.frete_aguardado==null?'<span style="color:var(--muted)">—</span>':brl(l.frete_aguardado)}</td><td class="num">${celDif(l)}</td><td class="num">${brl(l.frete_extra)}</td>
      <td class="num">${brl(l.valor_total_nf)}</td><td class="num">${brl(l.receita_liquida_canal)}</td><td class="num">${brl(l.valor_a_receber)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="VD.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`).join('');
  }

  async function conf(id,valor,elem){ elem.disabled=true; try{ await rpc('cn_marcar_conferido',{p_usuario_id:USER.id,p_venda_id:id,p_conferido:valor}); const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente'; if(typeof atualizarBadges==='function') atualizarBadges(); }catch(e){ elem.checked=!valor; const m=String(e.message||e); alert(m.includes('envio pendente') ? m : 'Não foi possível marcar: '+m); } finally{ elem.disabled=false; } }

  let EDIT_TEM_ENVIO=false;        // venda tem envio? decide o frete extra na prévia
  let EDIT_FRETE_DO_ENVIO=false;   // frete veio do envio? decide a trava do campo

  // Aviso de origem do frete, criado ao lado do campo. Fica aqui e não no
  // index.html para a tela continuar funcionando sem alteração no HTML.
  function notaFrete(texto){
    let n=$('vd-e-frete-nota');
    if(!n){
      const inp=f('e-frete'); if(!inp) return;
      n=document.createElement('div');
      n.id='vd-e-frete-nota';
      n.style.cssText='font-size:11px;color:var(--muted);margin-top:4px';
      inp.parentNode.appendChild(n);
    }
    n.textContent=texto||'';
    n.style.display=texto?'block':'none';
  }

  // Frete vindo do envio não se edita aqui: o gatilho do banco só empurra
  // do envio para a venda, então uma correção feita neste campo faria as
  // duas telas divergirem. O cn_editar_venda ignora o parâmetro nesse
  // caso — a trava visual evita que o usuário perca o trabalho digitando.
  function aplicarTravaFrete(){
    const inp=f('e-frete'); if(!inp) return;
    if(EDIT_FRETE_DO_ENVIO){
      inp.readOnly=true;
      inp.style.opacity='0.65';
      inp.style.cursor='not-allowed';
      inp.title='Valor vindo do Controle de Envios. Para alterar, edite o envio.';
      notaFrete('Vem do Controle de Envios — altere por lá.');
    }else{
      inp.readOnly=false;
      inp.style.opacity='';
      inp.style.cursor='';
      inp.title='';
      notaFrete('');
    }
  }

  function abrir(id){ if(!temPermissao('vendas.editar')){ alert('Você não tem permissão para editar vendas (vendas.editar).'); return; } const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id;
    EDIT_TEM_ENVIO = (l.tem_envio===true) || (l.custo_frete_real!=null);
    EDIT_FRETE_DO_ENVIO = (l.custo_frete_real!=null);
    f('drawer-erro').textContent='';
    f('e-data').value=l.data_compra||''; f('e-databling').value=dataBr(l.data_bling); f('e-canal').value=l.canal||''; f('e-tenvio').value=l.tipo_envio||''; f('e-uf').value=l.uf||''; f('e-cliente').value=l.cliente||''; f('e-modelo').value=l.modelo||'';
    f('e-qtd').value=l.quantidade??''; f('e-vunit').value=l.valor_unitario??''; f('e-comissao').value=l.valor_comissao??''; f('e-anuncio').value=l.tipo_anuncio||'';
    // o campo mostra o mesmo número da coluna: o custo real
    const fr=freteReal(l);
    f('e-frete').value = (fr==null) ? '' : fr;
    f('e-fextra').value=l.frete_extra??''; f('e-faguard').value=l.frete_aguardado??'';
    aplicarTravaFrete();
    prev(); f('overlay').classList.add('open'); f('drawer').classList.add('open'); }

  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; EDIT_TEM_ENVIO=false; EDIT_FRETE_DO_ENVIO=false; notaFrete(''); }

  // Prévia. Reproduz a regra do cn_listar_vendas para não contradizer a
  // tabela: com envio, nem o frete nem o frete extra saem do "a receber",
  // porque não passam pelo marketplace.
  function prev(){
    const q=parseFloat(f('e-qtd').value)||0,
          vu=parseFloat(f('e-vunit').value)||0,
          co=parseFloat(f('e-comissao').value)||0,
          fe=parseFloat(f('e-fextra').value)||0,
          fr=parseFloat(f('e-frete').value)||0;
    const t=vu*q, nf=t+fe;
    const receber = nf - co - (EDIT_TEM_ENVIO ? 0 : (fr+fe));
    const liquida = receber - fr;
    f('c-total').value=brl(t); f('c-nf').value=brl(nf);
    f('c-receber').value=brl(receber);
    f('c-lucro').value=brl(liquida);
  }

  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...'; const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{ await rpc('cn_editar_venda',{p_usuario_id:USER.id,p_venda_id:EDIT_ID,p_data_compra:f('e-data').value||null,p_canal:f('e-canal').value||null,p_tipo_envio:f('e-tenvio').value||null,p_cliente:f('e-cliente').value||null,p_uf:f('e-uf').value.toUpperCase()||null,p_modelo:f('e-modelo').value||null,p_quantidade:num('e-qtd'),p_valor_unitario:num('e-vunit'),p_valor_comissao:num('e-comissao'),p_tipo_anuncio:f('e-anuncio').value||null,p_frete:num('e-frete'),p_frete_extra:num('e-fextra'),p_frete_aguardado:num('e-faguard')}); fechar(); carregar(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_vendas',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['data_compra','data_bling','canal','tipo_envio','id_pedido','modelo','quantidade','cliente','uf','valor_unitario','valor_total','valor_comissao','pct_comissao_ml','tipo_anuncio','_frete','frete_aguardado','_dif_frete','frete_extra','valor_total_nf','receita_liquida_canal','valor_a_receber','conferido','editado']; const head=['Data (import.)','Data Bling','Canal','Envio','ID Pedido','SKU','Qtd','Cliente','UF','Valor Unitario','Valor Total','Comissao','% Comissao','Anuncio','Frete','Frete Aguardado','Dif Frete','Frete Extra','Total NF','Receita Liq Canal','A Receber','Conferido','Editado']; const ls=todas.map(l=>cols.map(c=>{let v; if(c==='_dif_frete') v=difFrete(l); else if(c==='_frete') v=freteReal(l); else v=l[c]; if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='vendas_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  // ----- sync (Atualizar) -----
  function syncUI(msg,p){ f('syncbox').style.display='block'; f('syncmsg').textContent=msg; f('syncpct').textContent=p==null?'':Math.round(p)+'%'; f('syncbar').style.width=(p==null?0:p)+'%'; }
  async function atualizar(){ const b=f('atualizar'); if(b.disabled)return; b.disabled=true; const DIAS=30;
    try{
      syncUI('Buscando pedidos no Bling…',5); let g=0; while(true){ const r=await chamarFuncao('sync-bling',{dias:DIAS,limite:15}); g++; if(r.restantes>0){ syncUI(`Buscando no Bling… (faltam ~${r.restantes})`,Math.min(40,5+g*3)); } else break; if(g>200)break; }
      syncUI('Processando vendas do Bling…',44); await rpc('cn_processar_staging_bling',{p_usuario_id:USER.id});
      syncUI('Enriquecendo com Mercado Livre…',50); g=0; while(true){ const r=await chamarFuncao('sync-ml',{dias:DIAS,limite:15}); g++; if(r.restantes>0){ syncUI(`Buscando no Mercado Livre… (faltam ~${r.restantes})`,Math.min(80,50+g*3)); } else break; if(g>200)break; }
      syncUI('Aplicando dados do Mercado Livre…',85); await rpc('cn_processar_staging_ml',{p_usuario_id:USER.id});
      syncUI('Enriquecendo Shopify (Yever)…',90); g=0; while(true){ const r=await chamarFuncao('sync-yever',{dias:DIAS,limite:5}); g++; if(r.restantes>0){ syncUI(`Buscando na Yever… (faltam ~${r.restantes} pág.)`,Math.min(97,90+g*2)); } else break; if(g>200)break; }
      syncUI('Aplicando dados da Yever…',96); await rpc('cn_processar_staging_yever',{p_usuario_id:USER.id});
      // UF faltante: o Bling completa o endereço do contato instantes depois
      // de criar o pedido do ML. Se a importação passou nesse intervalo, a
      // venda entrou sem UF — e sem UF o envio não confere (e a venda também
      // não). Esta varredura rebusca o contato e preenche. Não interrompe a
      // atualização se falhar: é correção de dado, não parte da importação.
      syncUI('Preenchendo UF faltante…',98);
      try{ await chamarFuncao('bling-uf',{}); }catch(e){ console.warn('bling-uf:', e); }
      syncUI('Concluído!',100); await carregar(true); setTimeout(()=>{ f('syncbox').style.display='none'; },1500);
    }catch(e){ syncUI('Erro: '+(e.message||e),null); f('syncbar').style.background='var(--danger)'; setTimeout(()=>{ f('syncbox').style.display='none'; f('syncbar').style.background='var(--accent)'; },5000); }
    finally{ b.disabled=false; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('mes').addEventListener('change',()=>carregar(true)); f('canal').addEventListener('change',()=>carregar(true)); f('edit').addEventListener('change',()=>carregar(true)); f('envioedit').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('atualizar').addEventListener('click',atualizar); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    ['e-qtd','e-vunit','e-comissao','e-frete','e-fextra'].forEach(id=>f(id).addEventListener('input',prev));
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
  }

  return { init, abrir, conf };
})();
window.VD = VD;
registrarTela('vendas', VD);
