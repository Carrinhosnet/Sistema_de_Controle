// =====================================================================
// CARRINHOS_NET — TELA: Lançamento de Entradas
// Depende da base do index.html: $, rpc, USER, temPermissao,
// brl, dataBr, registrarTela.
//
// FLUXO:
//   1. A tela mostra o HISTÓRICO (lista) de lançamentos já feitos.
//   2. "+ Novo lançamento" abre um modal: escolhe o tipo de entrada,
//      preenche NF (se não for Pedido de Fabricação) e vai adicionando
//      SKUs. Para cada SKU, o sistema mostra os dados atuais de cadastro
//      para CONFERÊNCIA (o usuário marca "Sem alterações" ou edita cada
//      campo), depois informa custo de chegada, IPI, ICMS e (se importação)
//      o fator de importação. O sistema calcula o custo total e pede
//      confirmação.
//   3. Ao confirmar o lançamento, tudo é gravado de uma vez e a lista
//      é atualizada (a tela NÃO redireciona).
//   4. Um lançamento pode ser excluído só nas primeiras 24h.
// =====================================================================
const ENT = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0; const POR=100;
  let ITENS=[];           // itens do lançamento em construção
  let SKU_ATUAL=null;     // dados do SKU sendo conferido no modal de item
  const f=(id)=>$('ent-'+id);

  // Opcoes cadastradas no sistema (tela "Opcoes de Produtos").
  // A conferencia NAO pode criar opcao nova: os campos abaixo viram
  // <select> preenchido com o que ja existe, nunca campo livre.
  let OPC={ categoria_produto:[], origem_produto:[], unidade_medida:[] };
  // campo do cadastro -> tipo de opcao que o alimenta
  // (unidade_fracionamento usa a MESMA lista de unidade_medida, igual ao
  //  Cadastro de Produtos, onde e-unidfrac e preenchido com OPC.unidade_medida)
  const CAMPO_OPCAO={
    categoria:              'categoria_produto',
    origem:                 'origem_produto',
    unidade_medida:         'unidade_medida',
    unidade_fracionamento:  'unidade_medida'
  };

  async function carregarOpcoes(){
    try{
      const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      OPC={ categoria_produto:[], origem_produto:[], unidade_medida:[] };
      (r||[]).forEach(o=>{ if(!OPC[o.tipo])OPC[o.tipo]=[]; OPC[o.tipo].push(o.valor); });
    }catch(e){}
  }

  // Monta o <select> de um campo de opcao.
  // O valor ATUAL do produto entra na lista mesmo que nao esteja mais nas
  // opcoes (cadastro antigo com grafia diferente, opcao desativada). Sem
  // isso o select cairia na primeira opcao e "Sem alteracao" mentiria,
  // alterando o cadastro sem ninguem pedir. O valor fora da lista aparece
  // marcado, e qualquer troca so pode ser para uma opcao valida.
  function selectOpcao(campo, valorAtual){
    const lista = OPC[CAMPO_OPCAO[campo]] || [];
    const atual = (valorAtual==null || valorAtual==='') ? '' : String(valorAtual);
    const esc = (v)=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    let html = `<option value=""${atual===''?' selected':''}>—</option>`;
    if(atual!=='' && !lista.includes(atual)){
      html += `<option value="${esc(atual)}" selected>${esc(atual)} (fora das opções)</option>`;
    }
    html += lista.map(v=>`<option value="${esc(v)}"${v===atual?' selected':''}>${esc(v)}</option>`).join('');
    return `<select class="conf-input" id="cf-${campo}" disabled>${html}</select>`;
  }

  // formata timestamp ISO (com hora) em dd/mm/aaaa hh:mm; aceita também data pura
  function dataHora(v){ if(!v) return '—';
    const dt=new Date(v); if(isNaN(dt)) return '—';
    const p=n=>String(n).padStart(2,'0');
    return `${p(dt.getDate())}/${p(dt.getMonth()+1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
  }

  // Campos do cadastro que entram na conferência (chave -> rótulo)
  const CAMPOS_CONF=[
    ['categoria','Categoria'],
    ['origem','Origem'],
    ['descricao','Descrição'],
    ['ncm','NCM'],
    ['unidade_medida','Unidade de Medida'],
    ['quantidade','Quantidade'],
    ['ean','EAN'],
    ['peso','Peso (kg)'],
    ['dim_altura','Altura (cm)'],
    ['dim_largura','Largura (cm)'],
    ['dim_comprimento','Comprimento (cm)'],
    ['caracteristicas','Características']
  ];
  // Campos extras que aparecem só quando o SKU é master fracionável
  const CAMPOS_FRAC=[
    ['unidade_fracionamento','Unidade de fracionamento'],
    ['rendimento','Rendimento (quanto rende)']
  ];

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('ftipo').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  // ---------------- HISTÓRICO (lista) ----------------
  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="7" class="loading">Carregando lançamentos…</td></tr>'; const fl=filtros();
    try{ const [linhas,total]=await Promise.all([
        rpc('cn_listar_entradas',{...fl,p_data_inicio:null,p_data_fim:null,p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_entradas',{...fl,p_data_inicio:null,p_data_fim:null})
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="7" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('ent',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="7" class="empty">Nenhum lançamento ainda.</td></tr>'; return; }
    const podeExcluir=temPermissao('entradas.excluir');
    tb.innerHTML=LINHAS.map(l=>{
      const btnExcluir = (podeExcluir && l.pode_excluir)
        ? `<button class="mini dg" onclick="event.stopPropagation();ENT.excluir(${l.id})">Excluir</button>`
        : `<span style="color:var(--muted);font-size:11px">${l.pode_excluir?'':'fixado'}</span>`;
      return `<tr style="cursor:pointer" onclick="ENT.detalhar(${l.id})">
        <td>${dataHora(l.data_lancamento)}</td>
        <td><span class="pill">${l.tipo_entrada}</span></td>
        <td>${l.numero_nf||'—'}</td>
        <td>${l.data_emissao_nf?dataBr(l.data_emissao_nf):'—'}</td>
        <td>${l.usuario_nome||'—'}</td>
        <td>${l.resumo_texto||('—')}</td>
        <td class="acoes" onclick="event.stopPropagation()">${btnExcluir}</td>
      </tr>`;
    }).join('');
  }

  async function excluir(id){ if(!confirm('Excluir este lançamento?\n\nOs custos dos SKUs afetados voltam ao valor anterior registrado (ou ficam sem custo, se este era o único).\n\nA exclusão só é possível nas primeiras 24h.')) return;
    try{ await rpc('cn_excluir_entrada',{p_usuario_id:USER.id,p_entrada_id:id}); await carregar(true); f('msg').textContent='Lançamento excluído.'; }
    catch(e){ alert('Não foi possível excluir: '+(e.message||e)); } }

  // ---------------- DETALHE (drawer somente leitura) ----------------
  async function detalhar(id){ f('det-corpo').innerHTML='<p class="loading">Carregando…</p>';
    f('det-overlay').classList.add('open'); f('det-drawer').classList.add('open');
    try{ const d=await rpc('cn_detalhar_entrada',{p_usuario_id:USER.id,p_entrada_id:id});
      const cab=`<div class="det-cab">
        <div><span class="lbl">Tipo</span><b>${d.tipo_entrada}</b></div>
        <div><span class="lbl">NF</span><b>${d.numero_nf||'—'}</b></div>
        <div><span class="lbl">Emissão NF</span><b>${d.data_emissao_nf?dataBr(d.data_emissao_nf):'—'}</b></div>
        <div><span class="lbl">Lançado em</span><b>${dataHora(d.data_lancamento)}</b></div>
        <div><span class="lbl">Por</span><b>${d.usuario_nome||'—'}</b></div>
      </div>`;
      const itens=(d.itens||[]).map(it=>{
        const mods=it.modificacoes&&Object.keys(it.modificacoes).length
          ? '<div class="det-mods"><b>Alterações no cadastro:</b><ul>'+Object.entries(it.modificacoes).map(([k,v])=>`<li>${k}: <s>${v.anterior??'—'}</s> → <b>${v.novo??'—'}</b></li>`).join('')+'</ul></div>'
          : '<div class="det-mods" style="color:var(--muted)">Sem alterações no cadastro.</div>';
        return `<div class="det-item">
          <div class="det-item-top"><b>${it.sku}</b><span class="pill">Custo total ${brl(it.custo_total)}</span></div>
          <div class="det-item-grid">
            <span>Custo de chegada: <b>${brl(it.custo_chegada)}</b></span>
            <span>IPI: <b>${it.ipi_aliquota}%</b></span>
            <span>ICMS: <b>${it.icms_aliquota}%</b></span>
            <span>Fator import.: <b>${it.fator_importacao}</b></span>
          </div>
          ${mods}
        </div>`;
      }).join('');
      f('det-corpo').innerHTML=cab+'<h4 style="margin:14px 0 8px">Itens lançados</h4>'+(itens||'<p style="color:var(--muted)">Nenhum item.</p>');
    }catch(e){ f('det-corpo').innerHTML='<p class="empty">Erro: '+(e.message||e)+'</p>'; } }
  function fecharDet(){ f('det-overlay').classList.remove('open'); f('det-drawer').classList.remove('open'); }

  // ---------------- NOVO LANÇAMENTO (modal) ----------------
  function abrirModal(){ if(!temPermissao('entradas.lancar')){ alert('Você não tem permissão para lançar entradas.'); return; }
    ITENS=[]; f('m-erro').textContent='';
    f('m-tipo').value='Importação'; ajustarNF();
    f('m-nf').value=''; f('m-nfdata').value='';
    renderItens();
    f('modal').classList.add('open');
  }
  function fecharModal(){ f('modal').classList.remove('open'); }

  function ajustarNF(){ const t=f('m-tipo').value; const precisa = t!=='Pedido de Fabricação';
    f('m-bloco-nf-num').style.display = precisa ? '' : 'none';
    f('m-bloco-nf-data').style.display = precisa ? '' : 'none';
  }

  function renderItens(){ const box=f('m-itens');
    if(!ITENS.length){ box.innerHTML='<p style="color:var(--muted);font-size:13px;padding:8px 0">Nenhum SKU adicionado ainda. Clique em “+ Adicionar SKU”.</p>'; f('m-confirmar').disabled=true; return; }
    f('m-confirmar').disabled=false;
    box.innerHTML='<table class="res"><thead><tr><th>SKU</th><th class="num">Custo chegada</th><th class="num">IPI%</th><th class="num">ICMS%</th><th class="num">Fator</th><th class="num">Custo total</th><th></th></tr></thead><tbody>'+
      ITENS.map((it,i)=>`<tr>
        <td><b>${it.sku}</b>${Object.keys(it.modificacoes).length?' <span class="pill" style="border-color:var(--warn);color:var(--warn)">editado</span>':''}</td>
        <td class="num">${brl(it.custo_chegada)}</td>
        <td class="num">${it.ipi_aliquota}</td>
        <td class="num">${it.icms_aliquota}</td>
        <td class="num">${it.fator_importacao}</td>
        <td class="num"><b>${brl(it.custo_total)}</b></td>
        <td><button class="mini dg" onclick="ENT.removerItem(${i})">remover</button></td>
      </tr>`).join('')+'</tbody></table>';
  }
  function removerItem(i){ ITENS.splice(i,1); renderItens(); }

  async function confirmarLancamento(){ f('m-erro').textContent='';
    const tipo=f('m-tipo').value;
    if(tipo!=='Pedido de Fabricação'){
      if(!f('m-nf').value.trim()){ f('m-erro').textContent='Informe o número da NF.'; return; }
      if(!f('m-nfdata').value){ f('m-erro').textContent='Informe a data de emissão da NF.'; return; }
    }
    if(!ITENS.length){ f('m-erro').textContent='Adicione ao menos um SKU.'; return; }
    const b=f('m-confirmar'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      const itens=ITENS.map(it=>({
        sku:it.sku, custo_chegada:it.custo_chegada, ipi_aliquota:it.ipi_aliquota,
        icms_aliquota:it.icms_aliquota, fator_importacao:it.fator_importacao,
        dados_conferidos:it.dados_conferidos, modificacoes:it.modificacoes
      }));
      await rpc('cn_registrar_entrada',{
        p_usuario_id:USER.id, p_tipo_entrada:tipo,
        p_numero_nf:tipo==='Pedido de Fabricação'?null:f('m-nf').value.trim(),
        p_data_emissao:tipo==='Pedido de Fabricação'?null:f('m-nfdata').value,
        p_itens:itens
      });
      fecharModal(); await carregar(true); f('msg').textContent='Lançamento registrado com sucesso.';
    }catch(e){ f('m-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent=t; }
  }

  // ---------------- ADICIONAR ITEM (sub-modal de conferência) ----------------
  function abrirItem(){ SKU_ATUAL=null; f('i-erro').textContent='';
    f('i-titulo').textContent='Adicionar SKU';
    f('i-busca').value=''; f('i-res').innerHTML=''; f('i-conf').style.display='none';
    f('i-step-busca').style.display='block';
    f('item-modal').classList.add('open'); f('i-busca').focus();
  }
  function fecharItem(){ f('item-modal').classList.remove('open'); }

  async function buscarSku(){ const q=f('i-busca').value.trim(); if(!q){ f('i-res').innerHTML=''; return; }
    try{ const r=await rpc('cn_listar_skus_para_entrada',{p_usuario_id:USER.id,p_busca:q,p_limite:30});
      if(!r||!r.length){ f('i-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum SKU encontrado.</p>'; return; }
      f('i-res').innerHTML='<table class="res"><thead><tr><th>SKU</th><th>Tipo</th><th>Descrição</th><th></th></tr></thead><tbody>'+
        r.map(v=>`<tr><td><b>${v.sku}</b></td><td>${v.tipo_sku}</td><td>${v.descricao||'—'}</td><td><button onclick="ENT.selecionarSku('${v.sku.replace(/'/g,"\\'")}')">Selecionar</button></td></tr>`).join('')+'</tbody></table>';
    }catch(e){ f('i-erro').textContent='Erro na busca: '+(e.message||e); } }

  async function selecionarSku(sku){ f('i-erro').textContent='';
    try{ const d=await rpc('cn_dados_sku_conferencia',{p_usuario_id:USER.id,p_sku:sku}); SKU_ATUAL=d;
      // já existe esse SKU no lançamento?
      if(ITENS.some(x=>x.sku===sku)){ f('i-erro').textContent='Este SKU já está no lançamento.'; return; }
      montarConferencia(d);
      f('i-step-busca').style.display='none'; f('i-conf').style.display='block';
    }catch(e){ f('i-erro').textContent=(e.message||e); } }

  function ehMasterFracionavel(d){ return d.tipo_sku==='Simples' && d.eh_fracionavel===true; }

  function montarConferencia(d){
    f('i-titulo').innerHTML=`Conferir <b>${d.sku}</b> <span class="pill">${d.tipo_sku}</span>`;
    // linhas de conferência
    let campos=[...CAMPOS_CONF];
    if(ehMasterFracionavel(d)) campos=campos.concat(CAMPOS_FRAC);
    f('i-campos').innerHTML=campos.map(([k,rot])=>{
      const val=d[k]==null?'':d[k];
      const controle = CAMPO_OPCAO[k]
        ? selectOpcao(k, val)
        : `<input class="conf-input" id="cf-${k}" value="${String(val).replace(/"/g,'&quot;')}" disabled>`;
      return `<div class="conf-row" data-campo="${k}">
        <div class="conf-lbl">${rot}</div>
        <div class="conf-val">
          ${controle}
        </div>
        <div class="conf-tog">
          <label><input type="radio" name="tog-${k}" value="sem" checked onclick="ENT.togCampo('${k}','sem')"> Sem alteração</label>
          <label><input type="radio" name="tog-${k}" value="edit" onclick="ENT.togCampo('${k}','edit')"> Editar</label>
        </div>
      </div>`;
    }).join('');
    // custo
    f('i-fator-bloco').style.display = (f('m-tipo').value==='Importação') ? '' : 'none';
    f('i-custo').value=''; f('i-ipi').value='0'; f('i-icms').value='0'; f('i-fator').value='1';
    calcCusto();
  }

  function togCampo(k,modo){ const inp=$('cf-'+k); if(!inp)return; inp.disabled = (modo!=='edit'); if(modo==='edit') inp.focus(); }

  function calcCusto(){ const c=parseFloat(f('i-custo').value)||0, ipi=parseFloat(f('i-ipi').value)||0, icms=parseFloat(f('i-icms').value)||0;
    let fator=parseFloat(f('i-fator').value)||1; if(fator<=0)fator=1;
    const total=(c*(1+ipi/100+icms/100))/fator;
    f('i-custototal').textContent=brl(total);
    f('i-obs').textContent=`Cálculo: (${brl(c)} × (1 + ${ipi}% + ${icms}%)) ÷ ${fator} = ${brl(total)}`;
    return total;
  }

  function confirmarItem(){ if(!SKU_ATUAL)return; f('i-erro').textContent='';
    const c=parseFloat(f('i-custo').value);
    if(isNaN(c)||c<0){ f('i-erro').textContent='Informe um custo de chegada válido.'; return; }
    const ipi=parseFloat(f('i-ipi').value)||0, icms=parseFloat(f('i-icms').value)||0;
    let fator=parseFloat(f('i-fator').value)||1; if(fator<=0)fator=1;

    // coletar modificações
    const dados_conferidos={}, modificacoes={};
    let campos=[...CAMPOS_CONF]; if(ehMasterFracionavel(SKU_ATUAL)) campos=campos.concat(CAMPOS_FRAC);
    for(const [k] of campos){
      const modo=(document.querySelector(`input[name="tog-${k}"]:checked`)||{}).value||'sem';
      if(modo==='edit'){
        const novo=$('cf-'+k).value;
        const anterior=SKU_ATUAL[k]==null?'':String(SKU_ATUAL[k]);
        if(String(novo)!==anterior){ modificacoes[k]={anterior:SKU_ATUAL[k]??null,novo:novo===''?null:novo}; dados_conferidos[k]='alterado'; }
        else dados_conferidos[k]='sem alteracao';
      } else dados_conferidos[k]='sem alteracao';
    }
    const total=(c*(1+ipi/100+icms/100))/fator;
    ITENS.push({ sku:SKU_ATUAL.sku, custo_chegada:c, ipi_aliquota:ipi, icms_aliquota:icms, fator_importacao:fator, custo_total:Math.round(total*10000)/10000, dados_conferidos, modificacoes });
    renderItens(); fecharItem();
  }
  function voltarBuscaItem(){ f('i-conf').style.display='none'; f('i-step-busca').style.display='block'; f('i-titulo').textContent='Adicionar SKU'; SKU_ATUAL=null; }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('ftipo').addEventListener('change',()=>carregar(true));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('novo').addEventListener('click',abrirModal);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    // modal principal
    f('modal-x').addEventListener('click',fecharModal); f('m-cancelar').addEventListener('click',fecharModal);
    f('m-tipo').addEventListener('change',ajustarNF);
    f('m-add').addEventListener('click',abrirItem);
    f('m-confirmar').addEventListener('click',confirmarLancamento);
    // sub-modal de item
    f('item-x').addEventListener('click',fecharItem);
    let it; f('i-busca').addEventListener('input',()=>{ clearTimeout(it); it=setTimeout(buscarSku,400); });
    f('i-voltar').addEventListener('click',voltarBuscaItem);
    ['i-custo','i-ipi','i-icms','i-fator'].forEach(id=>f(id).addEventListener('input',calcCusto));
    f('i-confirmar').addEventListener('click',confirmarItem);
    // detalhe
    f('det-x').addEventListener('click',fecharDet); f('det-overlay').addEventListener('click',fecharDet);
  }

  return { init, excluir, detalhar, removerItem, selecionarSku, togCampo };
})();
window.ENT = ENT;
registrarTela('entradas', ENT);
