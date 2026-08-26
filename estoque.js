// =====================================================================
// CARRINHOS_NET — TELA: Análise de Estoque
// Importa o relatório de estoque exportado do Bling (Excel) e completa a
// lista com os Simples/Kit cadastrados que NÃO vieram no arquivo (esses
// entram como "sem venda", com o estoque atual buscado no Bling via edge
// bling-estoque-saldos). Combos e Fracionados não são completados.
// Mostra estoque atual, vendas 120d, média diária, estoque mínimo,
// comprar/fabricar e dias restantes — igual à planilha do Vinicius.
// Depende de: $, rpc, chamarFuncao, USER, temPermissao, registrarTela.
// Usa SheetJS (XLSX) já carregado no index.
// =====================================================================
const EST = (function(){
  let LINHAS=[], TOTAL=0, PAGINA=0; const POR=50;
  const f=(id)=>$('est-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_origem:f('origem').value||null,
    p_busca:f('busca').value.trim()||null,
    p_status:f('status').value||null
  }; }

  async function init(){
    const be=f('enviar-bling'); if(be) be.style.display = temPermissao('estoque.enviar_bling') ? '' : 'none';
    await carregarOpcoes(); carregar(); bind();
  }

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
    const vencida = !!k.importacao_vencida && k.total>0;
    const dias = k.dias_desde_import;
    const cardImport = vencida
      ? `<div class="kpi" style="border-color:var(--danger)"><div class="lbl" style="color:var(--danger)">Última importação ⚠</div><div class="val" style="font-size:13px;color:var(--danger)">${dt}</div></div>`
      : `<div class="kpi"><div class="lbl">Última importação</div><div class="val" style="font-size:13px">${dt}</div></div>`;
    box.innerHTML=
      `<div class="kpi"><div class="lbl">SKUs na análise</div><div class="val">${Number(k.total||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="EST.filtrarStatus('comprar')"><div class="lbl">A comprar / fabricar</div><div class="val">${Number(k.a_comprar||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="EST.filtrarStatus('sem_venda')"><div class="lbl">Sem venda (120d)</div><div class="val">${Number(k.sem_venda||0).toLocaleString('pt-BR')}</div></div>`+
      cardImport;
    // faixa de aviso quando a importação está vencida (>3 dias) ou nunca houve
    const aviso=f('aviso'); if(aviso){
      if(vencida){
        const txt = k.importado_em
          ? `A última importação de estoque foi há ${dias} dia(s). Os dados podem estar desatualizados — importe um relatório novo do Bling.`
          : 'Nenhuma importação de estoque ainda. Importe o relatório do Bling para começar.';
        aviso.innerHTML=`<div class="est-aviso">⚠ ${txt}</div>`; aviso.style.display='';
      }else{ aviso.style.display='none'; aviso.innerHTML=''; }
    }
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

  let LINHAS_IMPORT=null;  // linhas finais (Excel + faltantes) prontas para importar

  // passo 1: ler o Excel, completar com Simples/Kit ausentes (sem venda) e
  // buscar o estoque desses ausentes no Bling.
  async function preparar(){ f('imp-erro').textContent=''; f('imp-res').innerHTML='';
    const b=f('imp-conferir'); b.disabled=true; const t=b.textContent; b.textContent='Lendo arquivo…';
    try{
      const doExcel=await lerExcel();
      const up=(s)=>String(s||'').trim().toUpperCase();
      const noExcel=new Set(doExcel.map(l=>up(l.sku)));

      // 1) descobre os Simples/Kit cadastrados que NÃO vieram no Excel
      b.textContent='Buscando itens sem venda…';
      const faltantes=await rpc('cn_estoque_skus_faltantes',{p_usuario_id:USER.id,p_skus_excel:doExcel.map(l=>l.sku)});
      // (a função já exclui Combos/Fracionados e os que estão no Excel)

      // 2) busca o estoque desses faltantes no Bling
      let semVenda=[]; let semSaldo=0;
      if(faltantes.length){
        b.textContent='Consultando estoque no Bling…';
        const resp=await chamarFuncao('bling-estoque-saldos',{skus:faltantes});
        if(resp && resp.ok===false) throw new Error('Bling: '+(resp.erro||'falha ao consultar estoque'));
        const saldos=(resp&&resp.saldos)||{};
        for(const sku of faltantes){
          const s=saldos[up(sku)];
          const est = s ? Number(s.fisico) : 0;   // sem saldo no Bling -> 0
          if(!s) semSaldo++;
          semVenda.push({ sku, estoque:est, saidas:0 });
        }
      }

      // 3) junta: Excel (com vendas) + faltantes (sem venda)
      LINHAS_IMPORT = doExcel.concat(semVenda);

      f('imp-res').innerHTML=
        `<div style="color:var(--ok);font-weight:600;margin:8px 0">✓ Pronto para importar.</div>`+
        '<table class="res"><tbody>'+
        `<tr><td>Do relatório (com vendas)</td><td class="num"><b>${doExcel.length}</b></td></tr>`+
        `<tr><td>Completados como “sem venda” (Simples/Kit)</td><td class="num"><b>${semVenda.length}</b></td></tr>`+
        (semSaldo?`<tr><td>— desses, sem saldo no Bling (entram com 0)</td><td class="num">${semSaldo}</td></tr>`:'')+
        `<tr><td><b>Total a importar</b></td><td class="num"><b>${LINHAS_IMPORT.length}</b></td></tr>`+
        '</tbody></table>';
      f('imp-confirmar').style.display='';
    }catch(e){ f('imp-erro').textContent='Erro: '+(e.message||e); f('imp-confirmar').style.display='none'; }
    finally{ b.disabled=false; b.textContent=t; }
  }

  // lê o Excel exportado do Bling e mapeia as colunas
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

  // importar de fato (lê direto do Excel, sem conferência com o Bling)
  async function importar(){ if(!LINHAS_IMPORT){ f('imp-erro').textContent='Leia o arquivo antes de importar.'; return; }
    const b=f('imp-confirmar'); b.disabled=true; const t=b.textContent; b.textContent='Importando…';
    try{
      const cobertura={ 'Importados':parseInt(f('imp-cob-imp').value)||120, 'Fabricação Própria':parseInt(f('imp-cob-fab').value)||30, 'Nacionais':parseInt(f('imp-cob-nac').value)||15 };
      const rep=await rpc('cn_importar_estoque',{p_usuario_id:USER.id,p_linhas:LINHAS_IMPORT,p_cobertura:cobertura});
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

  // ---------------- enviar estoque mínimo ao Bling ----------------
  async function enviarMinimo(){ if(!temPermissao('estoque.enviar_bling')){ alert('Você não tem permissão para enviar ao Bling.'); return; }
    if(!TOTAL){ alert('Importe o estoque antes de enviar ao Bling.'); return; }
    let itens;
    try{ itens=await rpc('cn_estoque_minimo_para_bling',{...filtros()}); }
    catch(e){ alert('Erro ao montar a lista: '+(e.message||e)); return; }
    if(!itens||!itens.length){ alert('Nenhum item corresponde aos filtros atuais. Ajuste os filtros e tente de novo.'); return; }
    const temFiltro = f('tipo').value||f('origem').value||f('busca').value.trim()||f('status').value;
    const escopo = temFiltro ? 'com os filtros atuais aplicados' : '(análise completa, sem filtros)';
    if(!confirm(`Enviar o estoque mínimo de ${itens.length} produto(s) ao Bling ${escopo}?\n\nIsso vai sobrescrever o estoque mínimo desses produtos no Bling com os valores calculados aqui (itens sem venda recebem mínimo 1). Confirmar?`)) return;

    const b=f('enviar-bling'); b.disabled=true; const t=b.textContent;
    const up=(s)=>String(s||'').trim().toUpperCase();
    const minPorSku={}; itens.forEach(i=>{ minPorSku[up(i.sku)]=i.minimo; });

    try{
      // 1) resolve SKU -> id do Bling (uma vez só, via edge de saldos)
      b.textContent='Localizando produtos no Bling…';
      f('msg').textContent='Localizando produtos no Bling…';
      const skus=itens.map(i=>i.sku);
      const resp=await chamarFuncao('bling-estoque-saldos',{skus});
      if(resp && resp.ok===false) throw new Error('Bling: '+(resp.erro||'falha ao localizar produtos'));
      const saldos=(resp&&resp.saldos)||{};
      const naoEnc=(resp&&resp.nao_encontrados)||[];

      // monta a lista {id, minimo, sku} só dos que têm id no Bling
      const paraEnviar=[];
      for(const sku of skus){ const s=saldos[up(sku)]; if(s&&s.id) paraEnviar.push({id:s.id, minimo:minPorSku[up(sku)], sku}); }
      if(!paraEnviar.length){ alert('Nenhum dos produtos foi encontrado no Bling.'); return; }

      // 2) envia em LOTES (cada lote é uma invocação curta -> não estoura o limite)
      const LOTE=30;
      let atualizados=0, falhas=0; const falhaDet=[];
      const totalLotes=Math.ceil(paraEnviar.length/LOTE);
      for(let i=0;i<paraEnviar.length;i+=LOTE){
        const parte=paraEnviar.slice(i,i+LOTE);
        const nLote=Math.floor(i/LOTE)+1;
        b.textContent=`Enviando ${nLote}/${totalLotes}…`;
        f('msg').textContent=`Enviando ao Bling: lote ${nLote} de ${totalLotes} (${atualizados} atualizados até agora)…`;
        const r=await chamarFuncao('bling-estoque-minimo',{itens:parte});
        if(r && r.ok===false){ falhas+=parte.length; parte.forEach(p=>falhaDet.push({sku:p.sku,motivo:r.erro||'falha no lote'})); continue; }
        atualizados+=(r.atualizados||0);
        falhas+=(r.falhas||0);
        (r.itens_falha||[]).forEach(x=>falhaDet.push(x));
      }

      let msg=`✓ Estoque mínimo enviado ao Bling.\n\nAtualizados: ${atualizados} de ${paraEnviar.length}`;
      if(naoEnc.length) msg+=`\nNão encontrados no Bling: ${naoEnc.length}`;
      if(falhas) msg+=`\nFalhas: ${falhas}`;
      if(falhaDet.length){ const amostra=falhaDet.slice(0,5).map(x=>x.sku||x.id).join(', '); msg+=`\n(ex.: ${amostra}${falhaDet.length>5?'…':''})`; }
      alert(msg);
      f('msg').textContent=`Estoque mínimo enviado: ${atualizados}/${paraEnviar.length} atualizados.`;
    }catch(e){ alert('Erro ao enviar ao Bling: '+(e.message||e)); f('msg').textContent='Falha ao enviar ao Bling.'; }
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
    const be=f('enviar-bling'); if(be) be.addEventListener('click',enviarMinimo);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } });
    f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    f('imp-x').addEventListener('click',fecharImport);
    f('imp-conferir').addEventListener('click',preparar);
    f('imp-confirmar').addEventListener('click',importar);
  }

  return { init, filtrarStatus };
})();
window.EST = EST;
registrarTela('estoque', EST);
