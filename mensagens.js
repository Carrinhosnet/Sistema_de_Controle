// =====================================================================
// CARRINHOS_NET — TELA: Mensagens Padrões e Informações
// Grupo do menu: Tarefas Diárias (16/10/2026 — arquivo 136)
// Depende da base do index.html: $, rpc, USER, temPermissao, copiar,
// registrarTela.
//
// O QUE É
//   Um lugar para guardar textos prontos:
//     MENSAGEM    → texto que vai para o cliente (ex.: aviso de compra ME1)
//     INFORMAÇÃO  → anotação interna da operação
//   A lista mostra só os títulos. Clicar abre o texto inteiro, com o
//   botão "Copiar texto" (copia exatamente como foi escrito, com as
//   quebras de linha).
//
// PERMISSÕES
//   mensagens.ver     → abrir, ler e copiar (o texto abre só para leitura)
//   mensagens.editar  → "Nova Mensagem", "Nova Informação", editar, excluir
// =====================================================================
const MP = (function(){
  let LINHAS=[], TIPO='', EDIT=null;   // EDIT = registro aberto (null = novo)
  const f=(id)=>$('mp-'+id);
  const ROTULO={mensagem:'Mensagem', informacao:'Informação'};
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const podeEditar=()=>temPermissao('mensagens.editar');

  async function init(){
    bind();
    const ed=podeEditar();
    f('nova-msg').style.display = ed ? '' : 'none';
    f('nova-info').style.display = ed ? '' : 'none';
    await carregar();
  }

  function subTab(t){
    TIPO=t;
    [['todas',''],['mensagem','mensagem'],['informacao','informacao']]
      .forEach(([id,v])=>f('tab-'+id).classList.toggle('active', v===t));
    carregar();
  }

  async function carregar(){
    f('tbody').innerHTML='<tr><td colspan="3" class="loading">Carregando…</td></tr>';
    try{
      LINHAS=await rpc('cn_textos_listar',{p_usuario_id:USER.id, p_tipo:TIPO||null,
                                            p_busca:f('busca').value.trim()||null})||[];
      render();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="3" class="empty">Erro: '+escH(e.message||e)+'</td></tr>';
    }
  }

  function quando(iso){
    if(!iso) return '—';
    const d=new Date(iso); if(isNaN(d)) return '—';
    const p=n=>String(n).padStart(2,'0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function render(){
    const tb=f('tbody');
    const n=LINHAS.length;
    f('contagem').textContent = n ? `${n} ${n===1?'texto':'textos'}` : '';
    if(!n){
      const busca=f('busca').value.trim();
      tb.innerHTML=`<tr><td colspan="3" class="empty">${busca?'Nada encontrado com essa busca.':
        (podeEditar()?'Nenhum texto salvo ainda. Use “Nova Mensagem” ou “Nova Informação”.':'Nenhum texto salvo ainda.')}</td></tr>`;
      return;
    }
    tb.innerHTML=LINHAS.map(l=>`<tr style="cursor:pointer" onclick="MP.abrir(${l.id})">
      <td><span class="pill mp-${l.tipo}">${ROTULO[l.tipo]||l.tipo}</span></td>
      <td><b>${escH(l.titulo)}</b></td>
      <td style="color:var(--muted)">${quando(l.atualizado_em)}${l.atualizado_por_nome?' · '+escH(l.atualizado_por_nome):''}</td>
    </tr>`).join('');
  }

  // ---------- drawer ----------
  function abreDrawer(){
    f('erro').textContent='';
    const ed=podeEditar();
    // quem só vê lê o texto, mas não consegue mudar
    // texto e título em "somente leitura" (e não desabilitados) para quem
    // só vê: assim ainda dá para selecionar um trecho com o mouse
    f('e-tipo').disabled=!ed;
    f('e-titulo').readOnly=!ed; f('e-texto').readOnly=!ed;
    f('linha-edicao').style.display = ed ? '' : 'none';
    f('excluir').style.display = (ed && EDIT) ? '' : 'none';
    f('fechar').style.display = ed ? 'none' : '';
    f('overlay').classList.add('open'); f('drawer').classList.add('open');
    if(ed) setTimeout(()=>f(EDIT?'e-texto':'e-titulo').focus(),60);
  }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT=null; }

  function novo(tipo){
    if(!podeEditar()) return;
    EDIT=null;
    f('titulo').firstChild.textContent=(tipo==='mensagem'?'Nova mensagem':'Nova informação')+' ';
    f('e-tipo').value=tipo; f('e-titulo').value=''; f('e-texto').value='';
    abreDrawer();
  }

  function abrir(id){
    const l=LINHAS.find(x=>x.id===id); if(!l) return;
    EDIT=l;
    const rot=ROTULO[l.tipo]||'Texto';
    f('titulo').firstChild.textContent=(podeEditar() ? 'Editar '+rot.toLowerCase() : rot)+' ';
    f('e-tipo').value=l.tipo; f('e-titulo').value=l.titulo; f('e-texto').value=l.texto;
    abreDrawer();
  }

  async function salvar(){
    f('erro').textContent='';
    const titulo=f('e-titulo').value.trim(), texto=f('e-texto').value;
    if(!titulo){ f('erro').textContent='Informe o título.'; return; }
    if(!texto.trim()){ f('erro').textContent='Escreva o texto.'; return; }
    const b=f('save'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      await rpc('cn_textos_salvar',{p_usuario_id:USER.id, p_id:EDIT?EDIT.id:null,
        p_tipo:f('e-tipo').value, p_titulo:titulo, p_texto:texto});
      const eraNovo=!EDIT;
      fechar(); await carregar();
      f('msg').textContent = eraNovo ? 'Texto salvo.' : 'Alterações salvas.';
    }catch(e){ f('erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  async function excluir(){
    if(!EDIT || !podeEditar()) return;
    if(!confirm(`Excluir "${EDIT.titulo}"?\n\nO texto é apagado de vez.`)) return;
    const b=f('excluir'); b.disabled=true;
    try{
      await rpc('cn_textos_excluir',{p_usuario_id:USER.id, p_id:EDIT.id});
      fechar(); await carregar();
      f('msg').textContent='Texto excluído.';
    }catch(e){ f('erro').textContent=(e.message||e); }
    finally{ b.disabled=false; }
  }

  // copia o que está no campo (inclusive uma edição ainda não salva)
  async function copiarTexto(){
    const texto=f('e-texto').value;
    if(!texto.trim()){ f('erro').textContent='Não há texto para copiar.'; return; }
    const b=f('copiar');
    await copiar(texto);
    const t=b.textContent; b.textContent='Copiado ✓';
    setTimeout(()=>{ b.textContent=t; },1400);
  }

  function bind(){
    f('tab-todas').addEventListener('click',()=>subTab(''));
    f('tab-mensagem').addEventListener('click',()=>subTab('mensagem'));
    f('tab-informacao').addEventListener('click',()=>subTab('informacao'));
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(carregar,350); });
    f('nova-msg').addEventListener('click',()=>novo('mensagem'));
    f('nova-info').addEventListener('click',()=>novo('informacao'));
    f('x').addEventListener('click',fechar);
    f('overlay').addEventListener('click',fechar);
    f('cancel').addEventListener('click',fechar);
    f('fechar').addEventListener('click',fechar);
    f('save').addEventListener('click',salvar);
    f('excluir').addEventListener('click',excluir);
    f('copiar').addEventListener('click',copiarTexto);
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && f('drawer').classList.contains('open')) fechar(); });
  }

  return { init, abrir };
})();
window.MP = MP;
registrarTela('mensagens', MP);
