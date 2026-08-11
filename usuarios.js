// =====================================================================
// CARRINHOS_NET — TELA: Cadastros (Usuários + Perfis)
// Depende da base do index.html: $, rpc, USER, temPermissao, registrarTela.
// =====================================================================
const CAD = (function(){
  let USUARIOS=[], PERFIS=[], ACOES=[], EDIT_U=null, EDIT_P=null;
  const cad=(id)=>$('cad-'+id), cu=(id)=>$('cu-'+id), cp=(id)=>$('cp-'+id);

  async function init(){
    bind();
    try{ ACOES = await rpc('cn_listar_acoes',{p_ator:USER.id}) || []; }catch(e){ ACOES=[]; }
    await carregarPerfis();
    await carregarUsuarios();
    subTab('usuarios');
  }

  function subTab(w){
    cad('tab-usuarios').classList.toggle('active', w==='usuarios');
    cad('tab-perfis').classList.toggle('active', w==='perfis');
    cad('usuarios').style.display = w==='usuarios' ? '' : 'none';
    cad('perfis').style.display   = w==='perfis' ? '' : 'none';
  }

  // ---------------- USUÁRIOS ----------------
  async function carregarUsuarios(){
    cad('u-tbody').innerHTML='<tr><td colspan="5" class="loading">Carregando…</td></tr>';
    try{ USUARIOS = await rpc('cn_listar_usuarios',{p_ator:USER.id}) || []; renderUsuarios(); }
    catch(e){ cad('u-tbody').innerHTML='<tr><td colspan="5" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }
  function renderUsuarios(){
    const tb=cad('u-tbody');
    if(!USUARIOS.length){ tb.innerHTML='<tr><td colspan="5" class="empty">Nenhum usuário.</td></tr>'; return; }
    tb.innerHTML=USUARIOS.map(u=>`<tr>
      <td>${u.nome||'—'}</td><td>${u.login||'—'}</td><td>${u.perfil_nome||'—'}</td>
      <td>${u.ativo?'<span class="pill">Ativo</span>':'<span class="pill" style="color:var(--muted)">Inativo</span>'}</td>
      <td style="text-align:right"><button class="act" onclick="CAD.editUsuario(${u.id})" style="padding:4px 10px">Editar</button></td>
    </tr>`).join('');
  }
  function novoUsuario(){ EDIT_U=null; cu('erro').textContent=''; cu('titulo').textContent='Novo usuário';
    cu('nome').value=''; cu('login').value=''; cu('senha').value=''; cu('senha').placeholder='Mínimo 4 caracteres';
    fillPerfilSelect(null); cu('ativo').value='true'; abreCU(); }
  function editUsuario(id){ const u=USUARIOS.find(x=>x.id===id); if(!u)return; EDIT_U=id; cu('erro').textContent=''; cu('titulo').textContent='Editar usuário';
    cu('nome').value=u.nome||''; cu('login').value=u.login||''; cu('senha').value=''; cu('senha').placeholder='Deixe em branco para manter';
    fillPerfilSelect(u.perfil_id); cu('ativo').value=String(u.ativo); abreCU(); }
  function fillPerfilSelect(sel){ cu('perfil').innerHTML=PERFIS.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${p.nome}</option>`).join(''); }
  function abreCU(){ $('cu-overlay').classList.add('open'); $('cu-drawer').classList.add('open'); }
  function fechaCU(){ $('cu-overlay').classList.remove('open'); $('cu-drawer').classList.remove('open'); EDIT_U=null; }
  async function salvarUsuario(){ cu('erro').textContent=''; const b=cu('save'); b.disabled=true; b.textContent='Salvando...';
    try{
      if(!cu('nome').value.trim() || !cu('login').value.trim()) throw new Error('Preencha nome e login.');
      await rpc('cn_salvar_usuario',{ p_ator:USER.id, p_id:EDIT_U, p_nome:cu('nome').value.trim(), p_login:cu('login').value.trim(), p_senha:cu('senha').value||null, p_perfil_id:Number(cu('perfil').value), p_ativo:cu('ativo').value==='true' });
      fechaCU(); await carregarUsuarios();
    }catch(e){ cu('erro').textContent=(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  // ---------------- PERFIS ----------------
  async function carregarPerfis(){
    try{ PERFIS = await rpc('cn_listar_perfis',{p_ator:USER.id}) || []; renderPerfis(); }
    catch(e){ if(cad('p-tbody')) cad('p-tbody').innerHTML='<tr><td colspan="4" class="empty">Erro: '+(e.message||e)+'</td></tr>'; }
  }
  function renderPerfis(){
    const tb=cad('p-tbody'); if(!tb) return;
    if(!PERFIS.length){ tb.innerHTML='<tr><td colspan="4" class="empty">Nenhum perfil.</td></tr>'; return; }
    tb.innerHTML=PERFIS.map(p=>`<tr>
      <td>${p.nome} ${p.eh_adm?'<span class="badge-adm">ADM</span>':''}</td>
      <td style="color:var(--muted)">${p.descricao||'—'}</td>
      <td class="num">${p.qtd_usuarios}</td>
      <td style="text-align:right">${p.eh_adm
        ? '<span style="color:var(--muted);font-size:12px">acesso total</span>'
        : `<button class="act" onclick="CAD.editPerfil(${p.id})" style="padding:4px 10px">Editar</button>
           <button class="act" onclick="CAD.excluirPerfil(${p.id})" style="padding:4px 10px;color:var(--danger)">Excluir</button>`}</td>
    </tr>`).join('');
  }
  function renderAcoes(checkedSet){
    const grupos={}; ACOES.forEach(a=>{ (grupos[a.grupo]=grupos[a.grupo]||[]).push(a); });
    cp('acoes').innerHTML = Object.keys(grupos).map(g=>`<div class="acao-grupo"><div class="gt">${g}</div>`+
      grupos[g].map(a=>`<label class="acao-item"><input type="checkbox" value="${a.chave}" ${checkedSet.has(a.chave)?'checked':''}><span>${a.descricao} <span style="color:var(--muted)">(${a.chave})</span></span></label>`).join('')+
      `</div>`).join('');
  }
  function novoPerfil(){ EDIT_P=null; cp('erro').textContent=''; cp('titulo').textContent='Novo perfil'; cp('nome').value=''; cp('descricao').value=''; renderAcoes(new Set()); abreCP(); }
  async function editPerfil(id){ const p=PERFIS.find(x=>x.id===id); if(!p)return; if(p.eh_adm){ alert('O Administrador tem acesso total e não é editável.'); return; }
    EDIT_P=id; cp('erro').textContent=''; cp('titulo').textContent='Editar perfil'; cp('nome').value=p.nome||''; cp('descricao').value=p.descricao||'';
    let atuais=new Set(); try{ const r=await rpc('cn_perfil_acoes',{p_ator:USER.id,p_perfil_id:id}); atuais=new Set((r||[]).map(x=>x.acao)); }catch(e){}
    renderAcoes(atuais); abreCP(); }
  function abreCP(){ $('cp-overlay').classList.add('open'); $('cp-drawer').classList.add('open'); }
  function fechaCP(){ $('cp-overlay').classList.remove('open'); $('cp-drawer').classList.remove('open'); EDIT_P=null; }
  async function salvarPerfil(){ cp('erro').textContent=''; const b=cp('save'); b.disabled=true; b.textContent='Salvando...';
    try{
      if(!cp('nome').value.trim()) throw new Error('Preencha o nome do perfil.');
      const id = await rpc('cn_salvar_perfil',{ p_ator:USER.id, p_id:EDIT_P, p_nome:cp('nome').value.trim(), p_descricao:cp('descricao').value.trim()||null });
      const marcadas=[...cp('acoes').querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
      await rpc('cn_definir_perfil_acoes',{ p_ator:USER.id, p_perfil_id:id, p_acoes:marcadas });
      fechaCP(); await carregarPerfis();
    }catch(e){ cp('erro').textContent=(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; }
  }
  async function excluirPerfil(id){ const p=PERFIS.find(x=>x.id===id); if(!p)return; if(!confirm(`Excluir o perfil "${p.nome}"?`))return;
    try{ await rpc('cn_excluir_perfil',{p_ator:USER.id,p_perfil_id:id}); await carregarPerfis(); }catch(e){ alert(e.message||e); }
  }

  function bind(){
    cad('tab-usuarios').addEventListener('click',()=>subTab('usuarios'));
    cad('tab-perfis').addEventListener('click',()=>subTab('perfis'));
    cad('novo-usuario').addEventListener('click',novoUsuario);
    cad('novo-perfil').addEventListener('click',novoPerfil);
    $('cu-x').addEventListener('click',fechaCU); $('cu-cancel').addEventListener('click',fechaCU); $('cu-overlay').addEventListener('click',fechaCU); $('cu-save').addEventListener('click',salvarUsuario);
    $('cp-x').addEventListener('click',fechaCP); $('cp-cancel').addEventListener('click',fechaCP); $('cp-overlay').addEventListener('click',fechaCP); $('cp-save').addEventListener('click',salvarPerfil);
  }

  return { init, editUsuario, editPerfil, excluirPerfil };
})();
window.CAD = CAD;
registrarTela('cadastro', CAD);
