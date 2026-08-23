// =====================================================================
// CARRINHOS_NET — TELA: Opções de Produtos (Categorias, Origens,
// Unidades de Medida, Tipos de SKU). CRUD de listas_opcoes com
// propagação no rename + botão de normalização retroativa.
// Depende da base do index.html: $, rpc, USER, temPermissao, registrarTela.
// =====================================================================
const OPO = (function(){
  let TIPO='categoria_produto';   // aba atual
  let LINHAS=[], EDIT_ID=null;
  const o=(id)=>$('op-'+id);
  const TIPOS=['categoria_produto','origem_produto','unidade_medida','tipo_sku'];
  const ROTULO={categoria_produto:'Categoria',origem_produto:'Origem',unidade_medida:'Unidade de Medida',tipo_sku:'Tipo de SKU'};

  async function init(){ bind(); subTab('categoria_produto'); }

  function subTab(t){ TIPO=t;
    TIPOS.forEach(x=>o('tab-'+x).classList.toggle('active', x===t));
    carregar();
  }

  async function carregar(){ o('tbody').innerHTML='<tr><td colspan="5" class="loading">Carregando…</td></tr>';
    try{ LINHAS=await rpc('cn_listar_opcoes_admin',{p_usuario_id:USER.id,p_tipo:TIPO})||[]; render(); }
    catch(e){ o('tbody').innerHTML='<tr><td colspan="5" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }

  function render(){ const tb=o('tbody');
    if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="5" class="empty">Nenhuma opção cadastrada.</td></tr>'; return; }
    tb.innerHTML=LINHAS.map(l=>`<tr>
      <td><b>${l.valor}</b></td>
      <td class="num">${l.ordem}</td>
      <td>${l.ativo?'<span class="pill">Ativa</span>':'<span class="pill" style="color:var(--muted)">Inativa</span>'}</td>
      <td class="num">${l.em_uso||0}</td>
      <td class="acoes" style="text-align:right">
        <button class="mini" onclick="OPO.editar(${l.id})">Editar</button>
        <button class="mini dg" onclick="OPO.excluir(${l.id})">Excluir</button>
      </td>
    </tr>`).join('');
  }
  function novo(){ EDIT_ID=null; o('erro').textContent=''; o('titulo').firstChild.textContent='Nova '+ROTULO[TIPO]+' ';
    o('e-valor').value=''; o('e-ordem').value=(LINHAS.length?Math.max(...LINHAS.map(x=>x.ordem))+1:1); o('e-ativo').value='true'; abre();
  }
  function editar(id){ const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id; o('erro').textContent=''; o('titulo').firstChild.textContent='Editar '+ROTULO[TIPO]+' ';
    o('e-valor').value=l.valor; o('e-ordem').value=l.ordem; o('e-ativo').value=String(l.ativo); abre();
  }
  function abre(){ o('overlay').classList.add('open'); o('drawer').classList.add('open'); }
  function fechar(){ o('overlay').classList.remove('open'); o('drawer').classList.remove('open'); EDIT_ID=null; }

  async function salvar(){ o('erro').textContent=''; const b=o('save'); b.disabled=true; b.textContent='Salvando...';
    try{
      if(!o('e-valor').value.trim()) throw new Error('Informe o valor.');
      await rpc('cn_salvar_opcao',{p_usuario_id:USER.id,p_id:EDIT_ID,p_tipo:TIPO,p_valor:o('e-valor').value.trim(),p_ordem:Number(o('e-ordem').value)||0,p_ativo:o('e-ativo').value==='true'});
      fechar(); await carregar();
    }catch(e){ o('erro').textContent=(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  async function excluir(id){ const l=LINHAS.find(x=>x.id===id); if(!l)return;
    if(l.em_uso>0){ alert(`Não é possível excluir "${l.valor}": ${l.em_uso} produto(s) usam essa opção. Reclassifique-os antes (ou renomeie a opção).`); return; }
    if(!confirm(`Excluir a opção "${l.valor}"?`)) return;
    try{ await rpc('cn_excluir_opcao',{p_usuario_id:USER.id,p_id:id}); await carregar(); }
    catch(e){ alert(e.message||e); }
  }

  async function normalizar(){ if(!confirm('Corrigir os produtos já cadastrados cuja grafia difere das opções (ex.: "RODAS" → "Rodas")?\n\nSó ajusta os que têm correspondência exata ignorando maiúsculas.')) return;
    const b=o('normalizar'); b.disabled=true; const t=b.textContent; b.textContent='Corrigindo…';
    try{ const r=await rpc('cn_normalizar_produtos_existentes',{p_usuario_id:USER.id});
      o('msg').textContent=`Correção concluída: ${r.total||0} campo(s) ajustado(s) (categorias ${r.categoria_corrigidos||0}, origens ${r.origem_corrigidos||0}, unidades ${r.unidade_corrigidos||0}, tipos ${r.tipo_sku_corrigidos||0}).`;
      await carregar();
    }catch(e){ alert('Erro ao normalizar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; }
  }

  // ---- diagnóstico de categorias (o "teste" de sanidade) ----
  const d=(id)=>$('opdiag-'+id);
  async function diagnostico(){ d('erro').textContent=''; d('kpis').innerHTML=''; d('conferencia').innerHTML=''; d('invalidas-wrap').style.display='none';
    $('opdiag-modal').classList.add('open');
    try{
      const r=await rpc('cn_diagnostico_categorias',{p_usuario_id:USER.id});
      const cards=[
        ['Total de produtos', r.total||0],
        ['Em categorias válidas', r.em_categorias_validas||0],
        ['Em categorias inválidas', r.em_categorias_invalidas||0],
        ['Sem categoria', r.sem_categoria||0]
      ];
      d('kpis').innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${Number(c[1]).toLocaleString('pt-BR')}</div></div>`).join('');
      // mensagem de conferência
      const problemas=(r.em_categorias_invalidas||0)+(r.sem_categoria||0);
      if(r.soma_confere && problemas===0){
        d('conferencia').innerHTML='<span style="color:#22c55e;font-weight:600">✓ Tudo certo!</span> Todos os '+(r.total||0)+' produtos estão em categorias válidas.';
      } else {
        d('conferencia').innerHTML='<span style="color:#f59e0b;font-weight:600">⚠ Atenção:</span> '+problemas+' produto(s) estão sem categoria ou em categoria que não existe nas opções. Veja abaixo.';
        const inv=r.categorias_invalidas||[];
        if(inv.length){
          d('invalidas-wrap').style.display='block';
          d('invalidas').innerHTML=inv.map(x=>`<tr><td><b>${x.categoria}</b></td><td class="num">${x.quantidade}</td></tr>`).join('');
        }
      }
    }catch(e){ d('erro').textContent='Erro: '+(e.message||e); }
  }
  function fecharDiag(){ $('opdiag-modal').classList.remove('open'); }

  // ---- auditoria de cadastro (6 verificações) ----
  let AUD_ALERTAS=[], AUD_DISPENSADOS=new Set();
  const a=(id)=>$('opaud-'+id);
  async function auditar(){ a('erro').textContent=''; a('kpis').innerHTML=''; a('itens').innerHTML='<tr><td colspan="5" class="loading">Analisando…</td></tr>';
    AUD_DISPENSADOS=new Set(); $('opaud-modal').classList.add('open');
    try{
      const r=await rpc('cn_auditar_cadastro',{p_usuario_id:USER.id});
      AUD_ALERTAS=r.alertas||[];
      // popular filtro de tipos de problema
      const tipos=[...new Set(AUD_ALERTAS.map(x=>x.problema))].sort();
      a('filtro').innerHTML='<option value="">Todos os tipos de alerta</option>'+tipos.map(t=>`<option>${t}</option>`).join('');
      renderAudKpis(); renderAud();
    }catch(e){ a('erro').textContent='Erro: '+(e.message||e); a('itens').innerHTML=''; }
  }
  function renderAudKpis(){
    const total=AUD_ALERTAS.length;
    // conta por tipo de problema
    const porTipo={}; AUD_ALERTAS.forEach(x=>{ porTipo[x.problema]=(porTipo[x.problema]||0)+1; });
    const cards=[['Total de alertas',total], ...Object.entries(porTipo)];
    a('kpis').innerHTML=cards.slice(0,6).map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${Number(c[1]).toLocaleString('pt-BR')}</div></div>`).join('');
  }
  function chaveAlerta(x,i){ return i+'|'+x.sku+'|'+x.problema; }
  function renderAud(){
    const filtro=a('filtro').value;
    const tb=a('itens');
    const visiveis=AUD_ALERTAS.map((x,i)=>({x,i})).filter(({x,i})=> !AUD_DISPENSADOS.has(chaveAlerta(x,i)) && (!filtro || x.problema===filtro));
    if(!AUD_ALERTAS.length){ tb.innerHTML='<tr><td colspan="5" class="empty" style="color:#22c55e">✓ Nenhuma inconsistência encontrada!</td></tr>'; a('restantes').textContent=''; return; }
    if(!visiveis.length){ tb.innerHTML='<tr><td colspan="5" class="empty">Nenhum alerta nesta visão (todos dispensados ou filtrados).</td></tr>'; }
    else{
      tb.innerHTML=visiveis.map(({x,i})=>`<tr>
        <td><b>${x.sku||'—'}</b></td><td>${x.tipo||'—'}</td>
        <td><span class="pill" style="border-color:#f59e0b;color:#f59e0b">${x.problema}</span></td>
        <td style="font-size:12px">${x.detalhe||''}${x.sugestao?`<br><span style="color:var(--muted)">→ ${x.sugestao}</span>`:''}</td>
        <td style="text-align:center"><input type="checkbox" onchange="OPO.dispensar('${chaveAlerta(x,i).replace(/'/g,"\\'")}')"></td>
      </tr>`).join('');
    }
    const totalVisiveis=AUD_ALERTAS.filter((x,i)=>!AUD_DISPENSADOS.has(chaveAlerta(x,i))).length;
    a('restantes').textContent=`${totalVisiveis} de ${AUD_ALERTAS.length} alerta(s) pendente(s)`;
  }
  function dispensar(chave){ AUD_DISPENSADOS.add(chave); renderAud(); }
  function exportarAud(){ if(!AUD_ALERTAS.length)return;
    const filtro=a('filtro').value;
    const lista=AUD_ALERTAS.filter((x,i)=>!AUD_DISPENSADOS.has(chaveAlerta(x,i)) && (!filtro||x.problema===filtro));
    const head=['SKU','Tipo','Problema','Detalhe','Sugestao'];
    const ls=lista.map(x=>[x.sku||'',x.tipo||'',x.problema||'',x.detalhe||'',x.sugestao||''].map(v=>{v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
    const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const dl=document.createElement('a'); dl.href=URL.createObjectURL(blob); dl.download='auditoria_cadastro_carrinhos_net.csv'; dl.click();
  }
  function fecharAud(){ $('opaud-modal').classList.remove('open'); }

  function bind(){
    TIPOS.forEach(t=>o('tab-'+t).addEventListener('click',()=>subTab(t)));
    o('novo').addEventListener('click',novo);
    o('normalizar').addEventListener('click',normalizar);
    o('diagnostico').addEventListener('click',diagnostico);
    $('opdiag-x').addEventListener('click',fecharDiag);
    o('auditar').addEventListener('click',auditar);
    $('opaud-x').addEventListener('click',fecharAud);
    a('filtro').addEventListener('change',renderAud);
    a('exportar').addEventListener('click',exportarAud);
    o('x').addEventListener('click',fechar); o('cancel').addEventListener('click',fechar); o('overlay').addEventListener('click',fechar); o('save').addEventListener('click',salvar);
  }

  return { init, editar, excluir, dispensar };
})();
window.OPO = OPO;
registrarTela('opcoes', OPO);
