// =====================================================================
// CARRINHOS_NET — TELA: Análise de Estoque
// Importa o relatório de estoque do Bling (Excel), CONFERE o estoque de
// cada SKU contra a API do Bling (edge bling-estoque-saldos) e, se tudo
// bate, grava a análise. Mostra estoque atual, vendas 120d, média diária,
// estoque mínimo, comprar/fabricar e dias restantes — igual à planilha.
// Depende de: $, rpc, chamarFuncao, USER, temPermissao, registrarTela,
// atualizarBadges. Usa SheetJS (XLSX) já carregado no index.
// =====================================================================
const EST = (function(){
  let LINHAS=[], TOTAL=0, PAGINA=0; const POR=100;
  const f=(id)=>$('est-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_origem:f('origem').value||null,
    p_busca:f('busca').value.trim()||null,
    p_status:f('status').value||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      (r||[]).forEach(o=>{ if(o.tipo==='tipo_sku')addOpt('tipo',o.valor); if(o.tipo==='origem_produto')addOpt('origem',o.valor); });
    }catch(e){}
  }
  function addOpt(id,v){ const o=document.createElement('option'); o.value=v;o.textContent=v; f(id).appendChild(o); }

  // ---------------- listagem ----------------
  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="12" class="loading">Carregando…</td></tr>';
    try{
      const [res,kpis]=await Promise.all([
        rpc('cn_listar_estoque',{...filtros(),p_ordem:f('ordem').value||'comprar',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_estoque_kpis',{p_usuario_id:USER.id})
      ]);
      LINHAS=(res&&res.linhas)||[]; TOTAL=(res&&res.total)||0;
      renderKpis(kpis); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="12" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL);
    f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`;
    f('paginfo').textContent=`Página ${p} de ${tp}`;
    f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
  }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const dt = k.importado_em ? new Date(k.importado_em).toLocaleString('pt-BR') : '—';
    box.innerHTML=
      `<div class="kpi"><div class="lbl">SKUs na análise</div><div class="val">${Number(k.total||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="EST.filtrarStatus('comprar')"><div class="lbl">A comprar / fabricar</div><div class="val">${Number(k.a_comprar||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="EST.filtrarStatus('sem_venda')"><div class="lbl">Sem venda (120d)</div><div class="val">${Number(k.sem_venda||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi"><div class="lbl">Última importação</div><div class="val" style="font-size:13px">${dt}</div></div>`;
  }
  function filtrarStatus(s){ f('status').value=s; carregar(true); }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="12" class="empty">Nenhum dado. Importe o relatório de estoque do Bling.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>{
      const dias = l.dias_restantes==null ? '<span style="color:var(--muted)">Sem venda</span>'
                 : (Number(l.dias_restantes) <= Number(l.dias_cobertura) ? `<b style="color:var(--danger)">${l.dias_restantes}</b>` : l.dias_restantes);
      const comprar = Number(l.comprar)>0 ? `<b style="color:var(--warn)">${fmt(l.comprar)}</b>` : '0';
      return `<tr>
        <td><span class="pill">${l.tipo_sku||'—'}</span></td>
        <td><b>${l.sku}</b></td>
        <td class="num">${l.quantidade??'—'}</td>
        <td>${l.unidade_medida||'—'}</td>
        <td>${l.descricao_curta||'—'}</td>
        <td class="num">${fmt(l.estoque_atual)}</td>
        <td class="num">${fmt(l.vendas_120d)}</td>
        <td class="num">${fmt(l.media_diaria)}</td>
        <td class="num">${l.dias_cobertura}</td>
        <td class="num">${fmt(l.estoque_minimo)}</td>
        <td class="num">${comprar}</td>
        <td class="num">${dias}</td>
      </tr>`;
    }).join('');
  }
  function fmt(v){ if(v==null)return '—'; const n=Number(v); return Number.isInteger(n)?n.toLocaleString('pt-BR'):n.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:4}); }

  // ---------------- importação ----------------
  function abrirImport(){ if(!temPermissao('estoque.importar')){ alert('Você não tem permissão para importar.'); return; }
    f('imp-erro').textContent=''; f('imp-res').innerHTML=''; f('imp-file').value='';
    // preenche dias de cobertura padrão
    f('imp-cob-imp').value=120; f('imp-cob-fab').value=30; f('imp-cob-nac').value=15;
    f('imp-confirmar').style.display='none';
    LINHAS_IMPORT=null;
    f('imp-modal').classList.add('open');
  }
  function fecharImport(){ f('imp-modal').classList.remove('open'); }

  let LINHAS_IMPORT=null;  // linhas lidas do Excel, guardadas entre conferir e importar
  let SALDOS_OK=null;      // saldos por SKU confirmados no Bling (só esses entram no import)

  // lê o Excel e mapeia colunas do relatório do Bling
  async function lerExcel(){
    const file=f('imp-file').files[0];
    if(!file) throw new Error('Escolha o arquivo .xls/.xlsx exportado do Bling.');
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    const norm=(s)=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    // detecta as colunas: codigo -> sku; "saldo em" (último saldo) -> estoque; "saidas" -> vendas
    const linhas=[];
    for(const r of rows){
      let sku=null, estoque=null, saidas=null, saldoFinalKey=null;
      for(const k in r){ const nk=norm(k);
        if(nk==='codigo'||nk==='sku') sku=String(r[k]).trim();
        else if(nk.startsWith('saldoem')) { saldoFinalKey=k; }            // "Saldo em DD/MM/AAAA" = saldo final
        else if(nk==='saidas') saidas=r[k];
      }
      if(saldoFinalKey!=null) estoque=r[saldoFinalKey];
      if(!sku) continue;
      linhas.push({ sku, estoque:numBr(estoque), saidas:numBr(saidas) });
    }
    if(!linhas.length) throw new Error('Não encontrei linhas com Código/SKU. Confirme que é o relatório de estoque do Bling.');
    return linhas;
  }
  function numBr(v){ if(v==null||v==='')return 0; if(typeof v==='number')return v;
    const s=String(v).replace(/\./g,'').replace(',','.').replace(/[^0-9.\-]/g,''); const n=parseFloat(s); return isNaN(n)?0:n; }

  // passo 1: ler + conferir contra o Bling
  async function conferir(){ f('imp-erro').textContent=''; f('imp-res').innerHTML='';
    const b=f('imp-conferir'); b.disabled=true; const t=b.textContent; b.textContent='Conferindo com o Bling…';
    try{
      const linhas=await lerExcel();
      LINHAS_IMPORT=linhas;
      const skus=linhas.map(l=>l.sku);
      // busca saldos no Bling via edge (a edge resolve SKU->id do Bling ao vivo)
      const resp=await chamarFuncao('bling-estoque-saldos',{skus});
      if(resp && resp.ok===false){ f('imp-erro').textContent='Bling: '+(resp.erro||'falha ao consultar'); f('imp-confirmar').style.display='none'; return; }
      const saldos=(resp&&resp.saldos)||{};
      const naoEnc=new Set((resp&&resp.nao_encontrados)||[]);
      const up=(s)=>String(s||'').trim().toUpperCase();
      // compara: estoque do Excel vs saldo Bling (fisico), por SKU
      const diverg=[]; let conferidos=0;
      for(const l of linhas){
        const s=saldos[up(l.sku)];
        if(!s){ continue; } // SKU não existe no Bling: ignorado da conferência (e do import depois)
        conferidos++;
        if(Number(l.estoque)!==Number(s.fisico)){ diverg.push({sku:l.sku, excel:l.estoque, bling:s.fisico}); }
      }
      if(conferidos===0){
        f('imp-erro').textContent='Nenhum dos SKUs do arquivo foi encontrado no Bling. Verifique se os códigos batem com o cadastro do Bling.';
        f('imp-confirmar').style.display='none'; return;
      }
      // guarda só as linhas que existem no Bling (regra: só itens do Bling entram)
      SALDOS_OK = saldos;
      if(diverg.length){
        f('imp-res').innerHTML=`<div style="color:var(--danger);font-weight:600;margin:8px 0">⚠ ${diverg.length} SKU(s) divergem entre o Excel e o Bling. A importação está bloqueada até o estoque bater.</div>`+
          '<table class="res"><thead><tr><th>SKU</th><th class="num">Estoque no Excel</th><th class="num">Estoque no Bling (agora)</th></tr></thead><tbody>'+
          diverg.map(d=>`<tr><td><b>${d.sku}</b></td><td class="num">${fmt(d.excel)}</td><td class="num" style="color:var(--danger)">${d.bling}</td></tr>`).join('')+'</tbody></table>'+
          '<p style="color:var(--muted);font-size:12px;margin-top:8px">Gere um relatório novo no Bling e tente de novo, ou confira esses SKUs.</p>';
        f('imp-confirmar').style.display='none';
      }else{
        let ignBloco='';
        if(naoEnc.size){
          const lista=[...naoEnc].sort();
          ignBloco='<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--warn)">'+
            `${naoEnc.size} SKU(s) do arquivo não existem no Bling — serão ignorados (clique para ver)</summary>`+
            '<table class="res" style="margin-top:6px"><thead><tr><th>SKU ignorado</th></tr></thead><tbody>'+
            lista.map(s=>`<tr><td>${s}</td></tr>`).join('')+'</tbody></table></details>';
        }
        f('imp-res').innerHTML=`<div style="color:var(--ok);font-weight:600;margin:8px 0">✓ Estoque confere com o Bling (${conferidos} SKU(s) verificados). Pronto para importar.</div>`+ignBloco;
        f('imp-confirmar').style.display='';
      }
    }catch(e){ f('imp-erro').textContent='Erro: '+(e.message||e); f('imp-confirmar').style.display='none'; }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // passo 2: importar de fato (só habilita se conferência passou)
  async function importar(){ if(!LINHAS_IMPORT){ f('imp-erro').textContent='Confira o arquivo antes de importar.'; return; }
    const b=f('imp-confirmar'); b.disabled=true; const t=b.textContent; b.textContent='Importando…';
    try{
      const up=(s)=>String(s||'').trim().toUpperCase();
      // só importa SKUs que existem no Bling (confirmados na conferência)
      const linhasImp = SALDOS_OK ? LINHAS_IMPORT.filter(l=>SALDOS_OK[up(l.sku)]) : LINHAS_IMPORT;
      const cobertura={ 'Importados':parseInt(f('imp-cob-imp').value)||120, 'Fabricação Própria':parseInt(f('imp-cob-fab').value)||30, 'Nacionais':parseInt(f('imp-cob-nac').value)||15 };
      const rep=await rpc('cn_importar_estoque',{p_usuario_id:USER.id,p_linhas:linhasImp,p_cobertura:cobertura});
      const ign=(rep.itens_ignorados||[]);
      f('imp-res').innerHTML=`<div class="kpis" style="margin:10px 0">
          <div class="kpi"><div class="lbl">Linhas</div><div class="val">${rep.total}</div></div>
          <div class="kpi"><div class="lbl">Importados</div><div class="val">${rep.importados}</div></div>
          <div class="kpi"><div class="lbl">Ignorados</div><div class="val">${rep.ignorados}</div></div>
        </div>`+
        (ign.length?'<details><summary style="cursor:pointer;color:var(--muted)">Ver ignorados</summary><table class="res"><thead><tr><th>Linha</th><th>SKU</th><th>Motivo</th></tr></thead><tbody>'+
          ign.map(i=>`<tr><td>${i.linha}</td><td>${i.sku||'—'}</td><td>${i.motivo}</td></tr>`).join('')+'</tbody></table></details>':'');
      f('imp-confirmar').style.display='none';
      await carregar(true);
    }catch(e){ f('imp-erro').textContent='Erro ao importar: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // ---------------- export CSV ----------------
  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const res=await rpc('cn_listar_estoque',{...filtros(),p_ordem:f('ordem').value||'comprar',p_limite:100000,p_offset:0}); const all=(res&&res.linhas)||[];
      const head=['Tipo','SKU','Qtd','Unidade','Descricao','Estoque Atual','Vendas 120d','Media Diaria','Dias Cobertura','Estoque Minimo','Comprar/Fabricar','Dias Restantes'];
      const cols=['tipo_sku','sku','quantidade','unidade_medida','descricao_curta','estoque_atual','vendas_120d','media_diaria','dias_cobertura','estoque_minimo','comprar','dias_restantes'];
      const ls=all.map(l=>cols.map(c=>{let v=l[c];if(v==null)v=(c==='dias_restantes'?'Sem Venda':'');v=String(v).replace('.',',').replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='analise_estoque_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    f('tipo').addEventListener('change',()=>carregar(true)); f('origem').addEventListener('change',()=>carregar(true));
    f('status').addEventListener('change',()=>carregar(true)); f('ordem').addEventListener('change',()=>carregar(true));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('importar').addEventListener('click',abrirImport); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('imp-x').addEventListener('click',fecharImport);
    f('imp-conferir').addEventListener('click',conferir);
    f('imp-confirmar').addEventListener('click',importar);
  }

  return { init, filtrarStatus };
})();
window.EST = EST;
registrarTela('estoque', EST);
