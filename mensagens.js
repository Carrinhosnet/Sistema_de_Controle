// =====================================================================
// CARRINHOS_NET — TELA: Mensagens Padrões e Informações
// Grupo do menu: Tarefas Diárias (arquivos 136 e 137)
// Depende da base do index.html: $, rpc, USER, temPermissao, copiar,
// registrarTela.
//
// O QUE É
//   Um lugar para guardar textos prontos:
//     MENSAGEM    → texto que vai para o cliente (ex.: aviso de compra ME1)
//     INFORMAÇÃO  → anotação interna da operação
//   Cada texto pertence a um CANAL (WhatsApp, Mercado Livre (ME1)...).
//   A lista mostra só os títulos. Clicar abre o texto inteiro, com o
//   botão "Copiar texto" (copia exatamente como foi escrito, com as
//   quebras de linha).
//
// FILTROS (16/10/2026 — arquivo 137): tipo (mensagens / informações /
//   os dois), canal e busca no título e no texto. Substituíram as abas.
//
// VÁRIOS CANAIS E ORDEM POR USO (16/10/2026 — arquivo 138): um texto
//   pode ter mais de um canal (lista de seleção com caixas de marcar). A lista sai na ordem
//   dos mais abertos: cada vez que alguém abre um texto, soma 1.
//   A ordem só muda quando a lista é carregada de novo (para a linha não
//   "pular" enquanto a pessoa usa a tela).
//
// CANAIS: lista própria (tabela textos_canais), editada pelo botão
//   "Canais": adicionar, renomear (vale para todos os textos do canal)
//   e excluir (só canal sem texto).
//
// PERMISSÕES
//   mensagens.ver     → abrir, filtrar, ler e copiar (texto só leitura)
//   mensagens.editar  → "Nova Mensagem", "Nova Informação", "Canais",
//                       editar e excluir
// =====================================================================
const MP = (function(){
  let LINHAS=[], CANAIS=[], EDIT=null;   // EDIT = texto aberto (null = novo)
  const f=(id)=>$('mp-'+id);
  const ROTULO={mensagem:'Mensagem', informacao:'Informação'};
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const podeEditar=()=>temPermissao('mensagens.editar');

  async function init(){
    bind();
    const ed=podeEditar();
    ['nova-msg','nova-info','canais'].forEach(id=>{ f(id).style.display = ed ? '' : 'none'; });
    await carregarCanais();
    await carregar();
  }

  // ---------- canais (filtro, drawer e modal) ----------
  async function carregarCanais(){
    try{ CANAIS=await rpc('cn_textos_canais_listar',{p_usuario_id:USER.id})||[]; }
    catch(e){ CANAIS=[]; f('msg').textContent='Não consegui carregar os canais: '+(e.message||e); }
    // filtro: mantém o que estava escolhido, se o canal ainda existir
    const sel=f('f-canal'), atual=sel.value;
    sel.innerHTML='<option value="">Todos os canais</option>'+
      CANAIS.map(c=>`<option value="${c.id}">${escH(c.nome)}</option>`).join('');
    sel.value = CANAIS.some(c=>String(c.id)===atual) ? atual : '';
  }
  // canais do texto aberto: lista de seleção com caixas de marcar.
  // O botão mostra o que está marcado; clicar abre a lista.
  function preencherCanaisDrawer(marcados){
    const set=new Set((marcados||[]).map(String));
    f('e-canais').innerHTML = CANAIS.length
      ? CANAIS.map(c=>`<label><input type="checkbox" value="${c.id}"${set.has(String(c.id))?' checked':''}> ${escH(c.nome)}</label>`).join('')
      : '<span style="color:var(--muted);font-size:12px">Nenhum canal cadastrado. Use o botão “Canais”.</span>';
    f('e-canaisbox').classList.remove('open');
    rotuloCanais();
  }
  const canaisMarcados=()=>[...f('e-canais').querySelectorAll('input:checked')].map(i=>Number(i.value));
  function rotuloCanais(){
    const nomes=CANAIS.filter(c=>canaisMarcados().includes(c.id)).map(c=>c.nome);
    const b=f('e-canaisbtn');
    b.textContent = !nomes.length ? 'Selecione os canais'
                  : nomes.length<=2 ? nomes.join(', ')
                  : `${nomes.length} canais: ${nomes.join(', ')}`;
    b.title = nomes.join(', ');
  }

  // ---------- lista ----------
  async function carregar(){
    f('tbody').innerHTML='<tr><td colspan="5" class="loading">Carregando…</td></tr>';
    try{
      LINHAS=await rpc('cn_textos_listar',{p_usuario_id:USER.id,
        p_tipo:f('f-tipo').value||null,
        p_canal_id:f('f-canal').value ? Number(f('f-canal').value) : null,
        p_busca:f('busca').value.trim()||null})||[];
      render();
    }catch(e){
      f('tbody').innerHTML='<tr><td colspan="5" class="empty">Erro: '+escH(e.message||e)+'</td></tr>';
    }
  }

  function quando(iso){
    if(!iso) return '—';
    const d=new Date(iso); if(isNaN(d)) return '—';
    const p=n=>String(n).padStart(2,'0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const temFiltro=()=> !!(f('busca').value.trim() || f('f-tipo').value || f('f-canal').value);

  function render(){
    const tb=f('tbody');
    const n=LINHAS.length;
    f('contagem').textContent = n ? `${n} ${n===1?'texto':'textos'}` : '';
    if(!n){
      tb.innerHTML=`<tr><td colspan="5" class="empty">${temFiltro()?'Nada encontrado com esses filtros.':
        (podeEditar()?'Nenhum texto salvo ainda. Use “Nova Mensagem” ou “Nova Informação”.':'Nenhum texto salvo ainda.')}</td></tr>`;
      return;
    }
    tb.innerHTML=LINHAS.map(l=>`<tr style="cursor:pointer" onclick="MP.abrir(${l.id})">
      <td><span class="pill mp-${l.tipo}">${ROTULO[l.tipo]||l.tipo}</span></td>
      <td>${l.canais?escH(l.canais):'<span style="color:var(--muted)">—</span>'}</td>
      <td><b>${escH(l.titulo)}</b></td>
      <td class="num">${Number(l.aberturas)||0}</td>
      <td style="color:var(--muted)">${quando(l.atualizado_em)}${l.atualizado_por_nome?' · '+escH(l.atualizado_por_nome):''}</td>
    </tr>`).join('');
  }

  function limparFiltros(){ f('busca').value=''; f('f-tipo').value=''; f('f-canal').value=''; carregar(); }

  // ---------- drawer ----------
  function abreDrawer(){
    f('erro').textContent='';
    const ed=podeEditar();
    // texto e título em "somente leitura" (e não desabilitados) para quem
    // só vê: assim ainda dá para selecionar um trecho com o mouse
    f('e-tipo').disabled=!ed;
    f('e-canaisbtn').disabled=!ed;   // quem só vê lê os canais no botão, sem abrir a lista
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
    // já vem com o canal do filtro marcado, se houver um escolhido
    preencherCanaisDrawer(f('f-canal').value ? [f('f-canal').value] : []);
    abreDrawer();
  }

  function abrir(id){
    const l=LINHAS.find(x=>x.id===id); if(!l) return;
    EDIT=l;
    const rot=ROTULO[l.tipo]||'Texto';
    f('titulo').firstChild.textContent=(podeEditar() ? 'Editar '+rot.toLowerCase() : rot)+' ';
    f('e-tipo').value=l.tipo; f('e-titulo').value=l.titulo; f('e-texto').value=l.texto;
    preencherCanaisDrawer(l.canal_ids);
    abreDrawer();
    registrarAbertura(l);
  }

  // soma 1 no contador do texto. Atualiza o número na linha, mas não
  // reordena agora: a ordem nova vale na próxima vez que a lista carregar.
  // Falhar aqui não atrapalha quem está lendo.
  async function registrarAbertura(l){
    try{
      const n=await rpc('cn_textos_registrar_abertura',{p_usuario_id:USER.id, p_id:l.id});
      l.aberturas=Number(n)||((Number(l.aberturas)||0)+1);
      render();
    }catch(e){}
  }

  async function salvar(){
    f('erro').textContent='';
    const titulo=f('e-titulo').value.trim(), texto=f('e-texto').value, canais=canaisMarcados();
    if(!canais.length){ f('erro').textContent='Marque pelo menos um canal.'; return; }
    if(!titulo){ f('erro').textContent='Informe o título.'; return; }
    if(!texto.trim()){ f('erro').textContent='Escreva o texto.'; return; }
    const b=f('save'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      await rpc('cn_textos_salvar',{p_usuario_id:USER.id, p_id:EDIT?EDIT.id:null,
        p_tipo:f('e-tipo').value, p_canal_ids:canais, p_titulo:titulo, p_texto:texto});
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

  // ---------- modal Canais ----------
  function renderCanais(){
    const tb=f('c-tbody');
    if(!CANAIS.length){ tb.innerHTML='<tr><td colspan="3" class="empty" style="padding:20px">Nenhum canal.</td></tr>'; return; }
    tb.innerHTML=CANAIS.map(c=>`<tr>
      <td><input class="mp-c-nome" data-id="${c.id}" value="${escH(c.nome)}" maxlength="60"></td>
      <td class="num">${Number(c.em_uso)||0}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="mini" onclick="MP.renomearCanal(${c.id})">Salvar nome</button>
        <button class="mini dg" onclick="MP.excluirCanal(${c.id})">Excluir</button>
      </td></tr>`).join('');
  }
  async function abrirCanais(){
    if(!podeEditar()) return;
    f('c-erro').textContent=''; f('c-novo').value='';
    await carregarCanais(); renderCanais();
    f('canais-modal').classList.add('open');
    setTimeout(()=>f('c-novo').focus(),60);
  }
  async function fecharCanais(){
    f('canais-modal').classList.remove('open');
    await carregar();   // nomes novos aparecem na lista
  }
  async function depoisDeMudarCanal(msg){
    await carregarCanais(); renderCanais();
    f('c-erro').style.color='var(--ok)'; f('c-erro').textContent=msg;
    setTimeout(()=>{ f('c-erro').textContent=''; f('c-erro').style.color=''; },2500);
  }
  function erroCanal(e){ f('c-erro').style.color=''; f('c-erro').textContent=(e.message||e); }

  async function adicionarCanal(){
    const nome=f('c-novo').value.trim();
    if(!nome){ erroCanal('Digite o nome do canal.'); return; }
    try{
      await rpc('cn_textos_canal_salvar',{p_usuario_id:USER.id, p_id:null, p_nome:nome});
      f('c-novo').value='';
      await depoisDeMudarCanal(`Canal "${nome}" adicionado.`);
    }catch(e){ erroCanal(e); }
  }
  async function renomearCanal(id){
    const inp=document.querySelector(`.mp-c-nome[data-id="${id}"]`); if(!inp) return;
    const c=CANAIS.find(x=>x.id===id); const nome=inp.value.trim();
    if(!nome){ erroCanal('O nome não pode ficar vazio.'); return; }
    if(c && c.nome===nome) return;
    try{
      await rpc('cn_textos_canal_salvar',{p_usuario_id:USER.id, p_id:id, p_nome:nome});
      await depoisDeMudarCanal('Nome salvo.');
    }catch(e){ erroCanal(e); }
  }
  async function excluirCanal(id){
    const c=CANAIS.find(x=>x.id===id); if(!c) return;
    if(Number(c.em_uso)>0){
      erroCanal(`"${c.nome}" tem ${c.em_uso} texto(s). Tire esse canal dos textos antes, ou só renomeie o canal.`);
      return;
    }
    if(!confirm(`Excluir o canal "${c.nome}"?`)) return;
    try{
      await rpc('cn_textos_canal_excluir',{p_usuario_id:USER.id, p_id:id});
      await depoisDeMudarCanal('Canal excluído.');
    }catch(e){ erroCanal(e); }
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(carregar,350); });
    f('f-tipo').addEventListener('change',carregar);
    f('f-canal').addEventListener('change',carregar);
    f('limpar').addEventListener('click',limparFiltros);
    f('nova-msg').addEventListener('click',()=>novo('mensagem'));
    f('nova-info').addEventListener('click',()=>novo('informacao'));
    f('canais').addEventListener('click',abrirCanais);
    f('x').addEventListener('click',fechar);
    f('overlay').addEventListener('click',fechar);
    f('cancel').addEventListener('click',fechar);
    f('fechar').addEventListener('click',fechar);
    f('save').addEventListener('click',salvar);
    f('excluir').addEventListener('click',excluir);
    f('copiar').addEventListener('click',copiarTexto);
    f('canais-x').addEventListener('click',fecharCanais);
    f('c-add').addEventListener('click',adicionarCanal);
    // lista de canais do texto: abre/fecha no botão; marcar atualiza o botão
    f('e-canaisbtn').addEventListener('click',(e)=>{ e.stopPropagation(); f('e-canaisbox').classList.toggle('open'); });
    f('e-canais').addEventListener('change',rotuloCanais);
    document.addEventListener('click',(e)=>{ const box=f('e-canaisbox'); if(box && !box.contains(e.target)) box.classList.remove('open'); });
    f('c-novo').addEventListener('keydown',(e)=>{ if(e.key==='Enter') adicionarCanal(); });
    f('c-tbody').addEventListener('keydown',(e)=>{
      if(e.key==='Enter' && e.target.classList.contains('mp-c-nome')) renomearCanal(Number(e.target.dataset.id));
    });
    document.addEventListener('keydown',(e)=>{
      if(e.key!=='Escape') return;
      if(f('e-canaisbox').classList.contains('open')) f('e-canaisbox').classList.remove('open');
      else if(f('canais-modal').classList.contains('open')) fecharCanais();
      else if(f('drawer').classList.contains('open')) fechar();
    });
  }

  return { init, abrir, renomearCanal, excluirCanal };
})();
window.MP = MP;
registrarTela('mensagens', MP);
