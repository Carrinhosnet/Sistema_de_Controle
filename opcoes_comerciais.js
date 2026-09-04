// =====================================================================
// CARRINHOS_NET — TELA: Opções Comerciais
// Depende da base do index.html: $, rpc, USER, temPermissao, registrarTela.
//
// Cadastro das listas usadas nas telas de Cancelamentos, Devoluções e
// Reclamações: os três motivos e os dois status. Mesmo formato da tela
// de Opções de Produtos — abas por tipo, edição em drawer.
//
// As listas são FECHADAS: os campos de motivo e status nas outras telas
// só aceitam o que estiver cadastrado aqui. Quem precisar de um valor
// novo cadastra nesta tela primeiro — é o que garante que o filtro por
// motivo devolva sempre o mesmo conjunto e que dois nomes diferentes
// não descrevam a mesma coisa.
//
// Renomear uma opção propaga para os registros que a usam. Excluir uma
// opção em uso é recusado pelo banco.
// =====================================================================
const OPC = (function(){
  let TIPO='motivo_cancelamento';
  let LINHAS=[], EDIT_ID=null;
  const o=(id)=>$('opc-'+id);

  const TIPOS=['motivo_cancelamento','motivo_devolucao','motivo_reclamacao',
               'status_devolucao','status_reclamacao'];
  const ROTULO={
    motivo_cancelamento:'Motivo de Cancelamento',
    motivo_devolucao:'Motivo de Devolução',
    motivo_reclamacao:'Motivo de Reclamação',
    status_devolucao:'Status de Devolução',
    status_reclamacao:'Status de Reclamação'
  };

  async function init(){ bind(); subTab('motivo_cancelamento'); }

  function subTab(t){
    TIPO=t;
    TIPOS.forEach(x=>o('tab-'+x).classList.toggle('active', x===t));
    carregar();
  }

  async function carregar(){
    o('tbody').innerHTML='<tr><td colspan="5" class="loading">Carregando…</td></tr>';
    try{
      LINHAS=await rpc('cn_listar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:TIPO})||[];
      render();
    }catch(e){
      o('tbody').innerHTML='<tr><td colspan="5" class="empty">Erro: '+(e.message||e)+'</td></tr>';
    }
  }

  function render(){
    const tb=o('tbody');
    if(!LINHAS.length){
      tb.innerHTML='<tr><td colspan="5" class="empty">Nenhuma opção cadastrada. Use o botão acima para criar a primeira.</td></tr>';
      return;
    }
    tb.innerHTML=LINHAS.map(l=>`<tr>
      <td><b>${l.valor}</b></td>
      <td class="num">${l.ordem}</td>
      <td>${l.ativo?'<span class="pill">Ativa</span>':'<span class="pill" style="color:var(--muted)">Inativa</span>'}</td>
      <td class="num">${l.em_uso||0}</td>
      <td class="acoes" style="text-align:right">
        <button class="mini" onclick="OPC.editar(${l.id})">Editar</button>
        <button class="mini dg" onclick="OPC.excluir(${l.id})">Excluir</button>
      </td>
    </tr>`).join('');
  }

  function novo(){
    EDIT_ID=null; o('erro').textContent='';
    o('titulo').firstChild.textContent='Nova opção · '+ROTULO[TIPO]+' ';
    o('e-valor').value='';
    o('e-ordem').value=(LINHAS.length?Math.max(...LINHAS.map(x=>x.ordem))+1:1);
    o('e-ativo').value='true';
    abre();
  }

  function editar(id){
    const l=LINHAS.find(x=>x.id===id); if(!l)return;
    EDIT_ID=id; o('erro').textContent='';
    o('titulo').firstChild.textContent='Editar opção · '+ROTULO[TIPO]+' ';
    o('e-valor').value=l.valor; o('e-ordem').value=l.ordem; o('e-ativo').value=String(l.ativo);
    abre();
  }

  function abre(){ o('overlay').classList.add('open'); o('drawer').classList.add('open'); setTimeout(()=>o('e-valor').focus(),50); }
  function fechar(){ o('overlay').classList.remove('open'); o('drawer').classList.remove('open'); EDIT_ID=null; }

  async function salvar(){
    o('erro').textContent='';
    const b=o('save'); b.disabled=true; b.textContent='Salvando...';
    try{
      if(!o('e-valor').value.trim()) throw new Error('Informe o valor.');
      await rpc('cn_salvar_opcao_comercial',{
        p_usuario_id:USER.id, p_id:EDIT_ID, p_tipo:TIPO,
        p_valor:o('e-valor').value.trim(),
        p_ordem:Number(o('e-ordem').value)||0,
        p_ativo:o('e-ativo').value==='true'
      });
      fechar(); await carregar();
      // renomear propaga para os registros: avisa quando isso aconteceu
      o('msg').textContent = EDIT_ID ? 'Opção salva. Registros que a usavam foram atualizados.' : 'Opção criada.';
    }catch(e){ o('erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  async function excluir(id){
    const l=LINHAS.find(x=>x.id===id); if(!l)return;
    if(l.em_uso>0){
      alert(`Não é possível excluir "${l.valor}": ${l.em_uso} registro(s) usam essa opção.\n\nReclassifique-os antes, ou renomeie a opção — renomear atualiza todos de uma vez.`);
      return;
    }
    if(!confirm(`Excluir a opção "${l.valor}"?`)) return;
    try{ await rpc('cn_excluir_opcao_comercial',{p_usuario_id:USER.id,p_id:id}); await carregar(); }
    catch(e){ alert(e.message||e); }
  }

  function bind(){
    TIPOS.forEach(t=>o('tab-'+t).addEventListener('click',()=>subTab(t)));
    o('novo').addEventListener('click',novo);
    o('x').addEventListener('click',fechar);
    o('cancel').addEventListener('click',fechar);
    o('overlay').addEventListener('click',fechar);
    o('save').addEventListener('click',salvar);
    o('e-valor').addEventListener('keydown',e=>{ if(e.key==='Enter')salvar(); });
  }

  return { init, editar, excluir };
})();
window.OPC = OPC;
registrarTela('opcoes_comerciais', OPC);
