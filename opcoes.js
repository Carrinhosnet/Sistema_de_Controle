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

  function bind(){
    TIPOS.forEach(t=>o('tab-'+t).addEventListener('click',()=>subTab(t)));
    o('novo').addEventListener('click',novo);
    o('normalizar').addEventListener('click',normalizar);
    o('diagnostico').addEventListener('click',diagnostico);
    $('opdiag-x').addEventListener('click',fecharDiag);
    o('x').addEventListener('click',fechar); o('cancel').addEventListener('click',fechar); o('overlay').addEventListener('click',fechar); o('save').addEventListener('click',salvar);
  }

  return { init, editar, excluir };
})();
window.OPO = OPO;
registrarTela('opcoes', OPO);
