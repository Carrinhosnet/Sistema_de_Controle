// =====================================================================
// CARRINHOS_NET — TELA: Custo de Frete
// Cadastra o frete aguardado por SKU + canal (Site, ML Clássico, ML
// Premium) e cruza com o Controle de Vendas para contar casos dentro/
// fora do padrão. Pendência por SKU+canal reinicia ao alterar valor ou
// ao conferir. Importação por Excel reutiliza o padrão do sistema.
// Depende da base do index.html: $, rpc, USER, temPermissao, brl,
// registrarTela, atualizarBadges.
// =====================================================================
const FRT = (function(){
  let LINHAS=[], TOTAL=0;
  let EDIT=null;   // {sku, canal, valorAtual}
  const f=(id)=>$('frt-'+id);
  const CANAIS=[['site','Site / Venda Direta'],['ml_classico','ML Clássico'],['ml_premium','ML Premium']];

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_categoria:f('categoria').value||null,
    p_busca:f('busca').value.trim()||null,
    p_status:f('status').value||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  async function carregarOpcoes(){
    try{ const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      const tipos=[],cats=[];
      (r||[]).forEach(o=>{ if(o.tipo==='tipo_sku')tipos.push(o.valor); if(o.tipo==='categoria_produto')cats.push(o.valor); });
      tipos.forEach(v=>addOpt('tipo',v)); cats.forEach(v=>addOpt('categoria',v));
    }catch(e){}
  }
  function addOpt(id,v){ const o=document.createElement('option'); o.value=v;o.textContent=v; f(id).appendChild(o); }

  async function carregar(){ f('tbody').innerHTML='<tr><td colspan="17" class="loading">Carregando…</td></tr>';
    try{
      const [res,kpis]=await Promise.all([
        rpc('cn_listar_fretes',{...filtros(),p_ordem:'pendencia',p_limite:100000,p_offset:0}),
        rpc('cn_frete_kpis',{p_usuario_id:USER.id})
      ]);
      LINHAS=(res&&res.linhas)||[]; TOTAL=(res&&res.total)||0;
      ordenar();
      renderKpis(kpis); renderTabela();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="17" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }

  function ordenar(){ const o=f('ordem').value;
    const foraTotal=(l)=>CANAIS.reduce((s,[c])=>s+((l.canais[c]&&l.canais[c].fora)||0),0);
    LINHAS.sort((a,b)=>{
      switch(o){
        case 'sku': return a.sku.localeCompare(b.sku);
        case 'sku_desc': return b.sku.localeCompare(a.sku);
        case 'categoria': return (a.categoria||'').localeCompare(b.categoria||'')||a.sku.localeCompare(b.sku);
        case 'tipo': return (a.tipo_sku||'').localeCompare(b.tipo_sku||'')||a.sku.localeCompare(b.sku);
        case 'mais_fora': return foraTotal(b)-foraTotal(a)||a.sku.localeCompare(b.sku);
        default: // pendencia: pendentes, depois incompletos, depois sku
          const pa=(a.tem_pendencia?0:1), pb=(b.tem_pendencia?0:1);
          if(pa!==pb) return pa-pb;
          const ia=(a.incompleto?0:1), ib=(b.incompleto?0:1);
          if(ia!==ib) return ia-ib;
          return a.sku.localeCompare(b.sku);
      }
    });
  }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    box.innerHTML=
      `<div class="kpi"><div class="lbl">Produtos</div><div class="val">${Number(k.total||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="FRT.filtrarStatus('incompletos')"><div class="lbl">Frete incompleto</div><div class="val">${Number(k.incompletos||0).toLocaleString('pt-BR')}</div></div>`+
      `<div class="kpi kpi-click" onclick="FRT.filtrarStatus('pendentes')"><div class="lbl">Pendências de conferência</div><div class="val">${Number(k.pendentes||0).toLocaleString('pt-BR')}</div></div>`;
  }
  function filtrarStatus(s){ f('status').value=s; carregar(); }

  function celCanal(l,canalCod){ const d=l.canais[canalCod]||{};
    const podeEditar=temPermissao('frete.editar');
    const podeConf=temPermissao('frete.conferir');
    const temValor = d.valor!=null;
    const valorTxt = temValor ? brl(d.valor) : '<span style="color:var(--muted)">—</span>';
    const editBtn = podeEditar ? `<button class="mini" onclick="event.stopPropagation();FRT.editar('${l.sku.replace(/'/g,"\\'")}','${canalCod}',${temValor?d.valor:'null'})">${temValor?'✎':'+'}</button>` : '';
    if(!temValor){
      return `<td class="frt-cel frt-vazio">${valorTxt} ${editBtn}</td><td class="num">—</td><td class="num">—</td><td class="frt-conf">—</td>`;
    }
    const dentro=d.dentro||0, fora=d.fora||0, pend=d.pendente;
    const confBtn = pend
      ? (podeConf?`<button class="mini dg" onclick="event.stopPropagation();FRT.conferir('${l.sku.replace(/'/g,"\\'")}','${canalCod}')">Conferir</button>`:'<span class="pill" style="border-color:var(--warn);color:var(--warn)">Pendente</span>')
      : '<span class="pill" style="border-color:var(--ok);color:var(--ok)">✓</span>';
    return `<td class="frt-cel ${pend?'frt-pend':''}">${valorTxt} ${editBtn}</td>`+
           `<td class="num frt-dentro">${dentro}</td>`+
           `<td class="num frt-fora">${fora>0?'<b style=\"color:var(--danger)\">'+fora+'</b>':fora}</td>`+
           `<td class="frt-conf">${confBtn}</td>`;
  }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="17" class="empty">Nenhum produto encontrado.</td></tr>'; f('contagem').textContent='0 registros'; return; }
    tb.innerHTML=LINHAS.map(l=>{
      const inc = l.incompleto ? ' <span class="pill" style="border-color:var(--warn);color:var(--warn)">incompleto</span>' : '';
      return `<tr class="${l.tem_pendencia?'pendente':''}">
        <td><span class="pill">${l.tipo_sku||'—'}</span></td>
        <td><b>${l.sku}</b>${inc}</td>
        <td class="num">${l.quantidade??'—'}</td>
        <td>${l.unidade_medida||'—'}</td>
        <td>${l.descricao_curta||'—'}</td>
        ${CANAIS.map(([c])=>celCanal(l,c)).join('')}
      </tr>`;
    }).join('');
    f('contagem').textContent=`${LINHAS.length} de ${TOTAL} registro(s)`;
  }

  // ---- editar frete de um SKU+canal (drawer simples) ----
  function editar(sku,canal,valorAtual){ if(!temPermissao('frete.editar'))return;
    EDIT={sku,canal}; f('d-erro').textContent='';
    const rot=(CANAIS.find(x=>x[0]===canal)||[])[1]||canal;
    f('d-titulo').textContent='Frete aguardado';
    f('d-info').innerHTML=`<b>${sku}</b> · ${rot}`;
    f('d-valor').value = (valorAtual!=null&&valorAtual!=='null') ? valorAtual : '';
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); f('d-valor').focus();
  }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT=null; }
  async function salvar(){ if(!EDIT)return; f('d-erro').textContent='';
    const v=parseFloat(f('d-valor').value);
    if(isNaN(v)||v<0){ f('d-erro').textContent='Informe um valor de frete válido.'; return; }
    const b=f('d-save'); b.disabled=true; b.textContent='Salvando…';
    try{ await rpc('cn_salvar_frete',{p_usuario_id:USER.id,p_sku:EDIT.sku,p_canal:EDIT.canal,p_valor:v});
      fechar(); await carregar(); f('msg').textContent='Frete atualizado (ciclo reiniciado).';
    }catch(e){ f('d-erro').textContent='Erro: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  async function conferir(sku,canal){ if(!temPermissao('frete.conferir'))return;
    if(!confirm('Marcar como conferido?\n\nA pendência atual some. Se surgirem novas vendas fora do padrão depois de agora, a pendência volta.')) return;
    try{ await rpc('cn_conferir_frete',{p_usuario_id:USER.id,p_sku:sku,p_canal:canal}); await carregar(); f('msg').textContent='Conferido.'; }
    catch(e){ alert('Não foi possível conferir: '+(e.message||e)); }
  }

  // ---- importação Excel ----
  function abrirImport(){ if(!temPermissao('frete.importar')){ alert('Você não tem permissão para importar.'); return; }
    f('imp-erro').textContent=''; f('imp-res').innerHTML=''; f('imp-file').value=''; f('imp-modal').classList.add('open');
  }
  function fecharImport(){ f('imp-modal').classList.remove('open'); }
  async function processarImport(){ f('imp-erro').textContent=''; const file=f('imp-file').files[0];
    if(!file){ f('imp-erro').textContent='Escolha um arquivo .xlsx.'; return; }
    const b=f('imp-processar'); b.disabled=true; const t=b.textContent; b.textContent='Processando…';
    try{
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      // normaliza cabeçalhos: aceita SKU, Site, ML Clássico/Classico, ML Premium
      const norm=(s)=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
      const linhas=rows.map(r=>{ const o={}; for(const k in r){ const nk=norm(k);
        if(nk==='sku') o.sku=r[k];
        else if(nk==='site'||nk==='vendadireta'||nk==='sitevendadireta') o.site=r[k];
        else if(nk==='mlclassico'||nk==='classico'||nk==='mercadolivreclassico') o.ml_classico=r[k];
        else if(nk==='mlpremium'||nk==='premium'||nk==='mercadolivrepremium') o.ml_premium=r[k];
      } return o; }).filter(o=>o.sku);
      if(!linhas.length){ f('imp-erro').textContent='Nenhuma linha com SKU encontrada. Cabeçalhos esperados: SKU, Site, ML Clássico, ML Premium.'; return; }
      const rep=await rpc('cn_importar_fretes',{p_usuario_id:USER.id,p_linhas:linhas});
      const erros=(rep.itens||[]).filter(i=>i.erro);
      f('imp-res').innerHTML=`<div class="kpis" style="margin:10px 0">
          <div class="kpi"><div class="lbl">Linhas</div><div class="val">${rep.total}</div></div>
          <div class="kpi"><div class="lbl">Importadas</div><div class="val">${rep.ok}</div></div>
          <div class="kpi"><div class="lbl">Erros</div><div class="val">${rep.erros}</div></div>
        </div>`+
        (erros.length?'<table class="res"><thead><tr><th>Linha</th><th>SKU</th><th>Erro</th></tr></thead><tbody>'+
          erros.map(e=>`<tr><td>${e.linha}</td><td>${e.sku||'—'}</td><td style="color:var(--danger)">${e.erro}</td></tr>`).join('')+'</tbody></table>':'<p style="color:var(--ok)">Sem erros.</p>');
      await carregar();
    }catch(e){ f('imp-erro').textContent='Erro ao processar: '+(e.message||e); } finally{ b.disabled=false; b.textContent=t; }
  }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const cols=['tipo_sku','sku','quantidade','unidade_medida','descricao_curta'];
      const head=['Tipo','SKU','Quantidade','Unidade','Descricao','Site','Site Dentro','Site Fora','ML Classico','MLC Dentro','MLC Fora','ML Premium','MLP Dentro','MLP Fora'];
      const ls=LINHAS.map(l=>{
        const base=cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;});
        CANAIS.forEach(([c])=>{ const d=l.canais[c]||{}; base.push(d.valor==null?'':String(d.valor).replace('.',',')); base.push(d.dentro||0); base.push(d.fora||0); });
        return base.join(';');
      });
      const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='custo_frete_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(carregar,400); });
    f('tipo').addEventListener('change',carregar); f('categoria').addEventListener('change',carregar);
    f('status').addEventListener('change',carregar); f('ordem').addEventListener('change',()=>{ ordenar(); renderTabela(); });
    f('btn-filtrar').addEventListener('click',carregar);
    f('importar').addEventListener('click',abrirImport); f('exportar').addEventListener('click',exportar);
    f('drawer-x').addEventListener('click',fechar); f('d-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('d-save').addEventListener('click',salvar);
    f('imp-x').addEventListener('click',fecharImport); f('imp-processar').addEventListener('click',processarImport);
  }

  return { init, editar, conferir, filtrarStatus };
})();
window.FRT = FRT;
registrarTela('frete', FRT);
