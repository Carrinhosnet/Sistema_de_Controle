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
  // a ordem não é mais digitada: guarda a da linha aberta para reenviar
  let ORDEM_EDIT=0;
  const o=(id)=>$('opc-'+id);

  // O status de reclamação saiu daqui em 08/09: passou a ser lista fixa
  // de três valores, garantida por CHECK no banco. No lugar entrou o
  // tipo de resolução, que descreve COMO o caso terminou. As opções
  // antigas de status continuam em listas_opcoes, sem uso.
  // O status de DEVOLUÇÃO saiu em 09/09, junto com o de reclamação:
  // ambos viraram listas fixas com CHECK no banco. Manter a aba
  // sugeriria que ainda dá para editar.
  const TIPOS=['motivo_cancelamento','motivo_devolucao','motivo_reclamacao',
               'tipo_resolucao_reclamacao'];
  const ROTULO={
    motivo_cancelamento:'Motivo de Cancelamento',
    motivo_devolucao:'Motivo de Devolução',
    motivo_reclamacao:'Motivo de Reclamação',
    tipo_resolucao_reclamacao:'Tipo de Resolução'
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
    // A coluna Ordem saiu: a posição na tabela É a ordem.
    tb.innerHTML=LINHAS.map(l=>`<tr class="ord-row" draggable="true"
      ondragstart="OPC.dragInicio(event,${l.id})" ondragover="OPC.dragSobre(event,${l.id})"
      ondrop="OPC.soltar(event,${l.id})" ondragend="OPC.dragFim()">
      <td class="ord-alca" title="Arraste para reordenar">⠿</td>
      <td><b>${l.valor}</b></td>
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
    ORDEM_EDIT=(LINHAS.length?Math.max(...LINHAS.map(x=>x.ordem))+1:1);
    o('e-ativo').value='true';
    abre();
  }

  function editar(id){
    const l=LINHAS.find(x=>x.id===id); if(!l)return;
    EDIT_ID=id; o('erro').textContent='';
    o('titulo').firstChild.textContent='Editar opção · '+ROTULO[TIPO]+' ';
    o('e-valor').value=l.valor; ORDEM_EDIT=l.ordem; o('e-ativo').value=String(l.ativo);
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
        p_ordem:ORDEM_EDIT,
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


  // ---- reordenar arrastando ----
  // A ordem deixou de ser digitada: ela é a posição da linha na tabela.
  // Arrastar a linha 8 para cima da 3 põe a 8 na posição 3 e empurra as
  // demais uma para baixo — é o que "tirar da lista e inserir na nova
  // posição" faz naturalmente, sem cálculo de índice caso a caso.
  let ARRASTA=null;   // id da linha sendo arrastada

  function dragInicio(ev, id){
    ARRASTA=id;
    ev.dataTransfer.effectAllowed='move';
    // Firefox só inicia o arrasto se algo for escrito no dataTransfer
    try{ ev.dataTransfer.setData('text/plain', String(id)); }catch(e){}
    ev.currentTarget.classList.add('ord-arrastando');
  }

  function dragSobre(ev, id){
    if(ARRASTA==null || ARRASTA===id) return;
    ev.preventDefault();                     // sem isso o soltar não dispara
    ev.dataTransfer.dropEffect='move';
    const tr=ev.currentTarget;
    // metade de cima da linha = cair antes dela; metade de baixo = depois
    const r=tr.getBoundingClientRect();
    const acima=(ev.clientY - r.top) < r.height/2;
    limparMarcas();
    tr.classList.add(acima?'ord-alvo-cima':'ord-alvo-baixo');
  }

  function limparMarcas(){
    [...document.querySelectorAll('.ord-alvo-cima,.ord-alvo-baixo')]
      .forEach(x=>x.classList.remove('ord-alvo-cima','ord-alvo-baixo'));
  }

  function dragFim(){
    ARRASTA=null; limparMarcas();
    [...document.querySelectorAll('.ord-arrastando')]
      .forEach(x=>x.classList.remove('ord-arrastando'));
  }

  async function soltar(ev, id){
    ev.preventDefault();
    const origem=ARRASTA;
    const tr=ev.currentTarget;
    const r=tr.getBoundingClientRect();
    const acima=(ev.clientY - r.top) < r.height/2;
    dragFim();
    if(origem==null || origem===id) return;

    const de=LINHAS.findIndex(x=>x.id===origem);
    if(de<0) return;
    const movida=LINHAS[de];
    const resto=LINHAS.filter(x=>x.id!==origem);
    let para=resto.findIndex(x=>x.id===id);
    if(para<0) return;
    if(!acima) para++;                       // soltou na metade de baixo
    resto.splice(para, 0, movida);

    const anterior=LINHAS;                   // para desfazer se o banco recusar
    LINHAS=resto; render();                  // move na hora, sem esperar a rede

    try{
      await rpc('cn_reordenar_opcoes_comerciais',{p_usuario_id:USER.id,p_tipo:TIPO,p_ids:LINHAS.map(x=>x.id)});
      o('msg').textContent='Ordem atualizada.';
    }catch(e){
      LINHAS=anterior; render();             // devolve a tela ao que o banco tem
      alert('Não foi possível salvar a ordem: '+(e.message||e));
    }
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

  return { init, editar, excluir, dragInicio, dragSobre, dragFim, soltar };
})();
window.OPC = OPC;
registrarTela('opcoes_comerciais', OPC);
