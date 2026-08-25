// =====================================================================
// CARRINHOS_NET — TELA: Custo (consulta)
// Somente leitura. Lista todos os SKUs com o custo vigente e a data da
// última entrada. Clicar num SKU abre o histórico (últimos 5 lançamentos).
// Depende da base do index.html: $, rpc, USER, temPermissao, brl, dataBr,
// registrarTela.
// =====================================================================
const CST = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0; const POR=100;
  const f=(id)=>$('cst-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarTipos(); carregar(); bind(); }

  async function carregarTipos(){
    try{ const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:'tipo_sku'});
      (r||[]).forEach(o=>{ const op=document.createElement('option'); op.value=o.valor; op.textContent=o.valor; f('tipo').appendChild(op); });
    }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="7" class="loading">Carregando custos…</td></tr>'; const fl=filtros();
    try{ const [linhas,total]=await Promise.all([
        rpc('cn_listar_custos',{...fl,p_ordem:f('ordem').value||'sku',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_custos',fl)
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="7" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp; }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="7" class="empty">Nenhum SKU encontrado.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>{
      const semCusto = l.custo_unitario==null;
      return `<tr style="cursor:pointer" onclick="CST.historico('${(l.sku||'').replace(/'/g,"\\'")}')">
        <td><span class="pill">${l.tipo_sku||'—'}</span></td>
        <td><b>${l.sku||'—'}</b></td>
        <td class="num">${l.quantidade??'—'}</td>
        <td>${l.unidade_medida||'—'}</td>
        <td>${l.descricao_curta||'—'}</td>
        <td class="num">${semCusto?'<span style="color:var(--muted)">sem entrada</span>':brl(l.custo_unitario)}</td>
        <td>${l.data_ultima_entrada?dataBr(l.data_ultima_entrada):'—'}</td>
      </tr>`;
    }).join('');
  }

  // ---- histórico (drawer, últimos 5) ----
  async function historico(sku){ f('h-titulo').innerHTML=`Histórico de custo — <b>${sku}</b>`;
    f('h-corpo').innerHTML='<p class="loading">Carregando…</p>';
    f('h-overlay').classList.add('open'); f('h-drawer').classList.add('open');
    try{ const r=await rpc('cn_historico_custo_sku',{p_usuario_id:USER.id,p_sku:sku,p_limite:5});
      if(!r||!r.length){ f('h-corpo').innerHTML='<p style="color:var(--muted)">Nenhum lançamento de custo para este SKU.</p>'; return; }
      f('h-corpo').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Tipo</th><th>Por</th><th class="num">Custo</th></tr></thead><tbody>'+
        r.map(h=>`<tr><td>${dataBr(h.registrado_em)}</td><td>${h.tipo_entrada||'—'}</td><td>${h.usuario_nome||'—'}</td><td class="num"><b>${brl(h.custo_unitario)}</b></td></tr>`).join('')+
        '</tbody></table><p style="color:var(--muted);font-size:11px;margin-top:8px">Exibindo os 5 lançamentos mais recentes.</p>';
    }catch(e){ f('h-corpo').innerHTML='<p class="empty">Erro: '+(e.message||e)+'</p>'; } }
  function fecharHist(){ f('h-overlay').classList.remove('open'); f('h-drawer').classList.remove('open'); }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const fl=filtros(); const todas=await rpc('cn_listar_custos',{...fl,p_ordem:f('ordem').value||'sku',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return;
      const cols=['tipo_sku','sku','quantidade','unidade_medida','descricao_curta','custo_unitario','data_ultima_entrada'];
      const head=['Tipo','SKU','Quantidade','Unidade','Descricao','Custo','Ultima Entrada'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='custos_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('tipo').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('h-x').addEventListener('click',fecharHist); f('h-overlay').addEventListener('click',fecharHist);
  }

  return { init, historico };
})();
window.CST = CST;
registrarTela('custos', CST);
