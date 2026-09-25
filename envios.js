// =====================================================================
// CARRINHOS_NET — TELA: Controle de Envios
// Depende da base do index.html: $, rpc, USER, temPermissao,
// brl, dataBr, mesLabel, registrarTela.
//
// MUDANÇA DE 24/09/2026 — UM BOX POR STATUS
//   Os boxes de status eram 5, fixos no código. Agora vêm de
//   cn_kpis_envios_status (arquivo 115): um box por status cadastrado,
//   na ordem do cadastro. Status novo ganha box sozinho; mudar a ordem
//   no cadastro reordena os boxes. Aqui fica só a APARÊNCIA de cada um
//   (título, dica, cor) — status sem entrada em STATUS_INFO usa o
//   próprio nome e a cor neutra.
//   O select "Todos os status" da barra existia mas não fazia nada.
//   Agora ele e os boxes são o mesmo filtro: um muda o outro.
// =====================================================================
const EN = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let OPC={ transportadora:[], pagamento_frete:[], tempo_entrega:[], status_envio:[] };
  const f=(id)=>$('en-'+id);

  // Estados ligados pelos cartões de contagem. O status também tem o
  // select da barra, sempre espelhado em FSTATUS; a conferência só tem
  // o cartão. O "Limpar filtros" zera os dois.
  let FSTATUS=null, FCONF=null;

  // Aparência dos boxes de status. A ORDEM não fica aqui: vem do cadastro.
  // Cores = as da linha na tabela (getStatusClass), para o box e a linha
  // falarem a mesma língua. Status fora desta lista: nome dele, cor neutra.
  const STATUS_INFO={
    'Aguardando Conferência':           {titulo:'Aguardando conferência', hint:'Status inicial de todo envio gerado', cls:'k-agconf'},
    'Aguardando Pagamento do Frete':    {titulo:'Aguardando pagamento do frete', hint:'Status Aguardando Pagamento do Frete', cls:'k-agpgto'},
    'Aguardando Cotação do Frete':      {titulo:'Aguardando cotação do frete', hint:'Status Aguardando Cotação do Frete', cls:'k-agcot'},
    'Em Produção':                      {titulo:'Aguardando produção', hint:'Status Em Produção', cls:'k-prod'},
    'Aguardando Emissão da Nota Fiscal':{titulo:'Aguardando nota fiscal', hint:'Status Aguardando Emissão da Nota Fiscal', cls:'k-agnf'},
    'Aguardando Transportadora':        {titulo:'Aguardando transportadora', hint:'Status Aguardando Transportadora', cls:'k-agtransp'},
    'À Caminho':                        {titulo:'A caminho', hint:'Status À Caminho', cls:'k-caminho'},
    'A caminho':                        {titulo:'A caminho (grafia antiga)', hint:'Status A caminho', cls:'k-caminho'},
    'Atrasado':                         {titulo:'Atrasados', hint:'Entrega prometida já venceu', cls:'k-atraso'},
    'Entregue':                         {titulo:'Entregues', hint:'Status Entregue', cls:'k-entregue'},
    'Em processo de devolução':         {titulo:'Em devolução', hint:'Status Em processo de devolução', cls:'k-devol'},
    'Devolução Concluída':              {titulo:'Devolução concluída', hint:'Status Devolução Concluída', cls:'k-devconcl'},
    'Devolvido':                        {titulo:'Devolvido', hint:'Status Devolvido', cls:'k-devconcl'},
    'Cancelado':                        {titulo:'Cancelados', hint:'Status Cancelado', cls:'k-cancel'}
  };

  function difSelecionadas(){
    return [...document.querySelectorAll('.en-dif:checked')].map(c=>c.value);
  }

  function filtros(){ const d=difSelecionadas(); return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_canal:f('canal').value||null,
    p_status:FSTATUS,
    p_transportadora:f('transp').value||null,
    p_pagamento_frete:f('pgto').value||null,
    p_conferido:FCONF,
    p_uf:f('uf').value||null,
    p_diferenca:d.length?d:null,
    p_busca:f('busca').value.trim()||null
  }; }

  // Os cartões refletem os filtros da barra, mas não o status nem a
  // conferência — são justamente o que eles acionam. Se refletissem,
  // clicar em "Entregues" zeraria os outros cartões.
  function filtrosKpi(){ const d=difSelecionadas(); return {
    p_usuario_id:USER.id,
    p_mes:f('mes').value||null,
    p_canal:f('canal').value||null,
    p_transportadora:f('transp').value||null,
    p_pagamento_frete:f('pgto').value||null,
    p_uf:f('uf').value||null,
    p_diferenca:d.length?d:null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await verTrava(); if(typeof carregarUltimaAuto==='function') await carregarUltimaAuto(); await carregarOpcoes(); await carregarFiltros(); selecionarMesAtual(); carregar(); bind(); }

  // Abre no mês corrente: é o recorte que quase sempre interessa e evita
  // varrer o histórico inteiro na primeira carga. Sem envio no mês, cai
  // para "todos os meses" — melhor com dados do que vazia.
  function selecionarMesAtual(){
    const hoje=new Date();
    const alvo=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const sel=f('mes');
    const op=[...sel.options].find(o=>o.value && String(o.value).startsWith(alvo));
    if(op) sel.value=op.value;
  }

  async function carregarOpcoes(){ OPC={transportadora:[],pagamento_frete:[],tempo_entrega:[],status_envio:[]}; try{ const r=await rpc('cn_listar_opcoes',{p_usuario_id:USER.id,p_tipo:null}); (r||[]).forEach(o=>{ if(!OPC[o.tipo])OPC[o.tipo]=[]; OPC[o.tipo].push(o.valor); }); }catch(e){} OPC.status_envio.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; f('status').appendChild(o); }); OPC.transportadora.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; f('transp').appendChild(o); }); OPC.pagamento_frete.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; f('pgto').appendChild(o); }); }

  async function carregarFiltros(){
    try{ const meses=await rpc('cn_meses_envios',{p_usuario_id:USER.id}); (meses||[]).forEach(m=>{ const o=document.createElement('option'); o.value=m.mes;o.textContent=mesLabel(m.mes); f('mes').appendChild(o); }); }catch(e){}
    try{ const canais=await rpc('cn_canais_envios',{p_usuario_id:USER.id}); (canais||[]).forEach(c=>{ const o=document.createElement('option'); o.value=c.canal;o.textContent=c.canal; f('canal').appendChild(o); }); }catch(e){}
    try{ const ufs=await rpc('cn_ufs_envios',{p_usuario_id:USER.id}); (ufs||[]).forEach(u=>{ const o=document.createElement('option'); o.value=u.uf;o.textContent=u.uf; f('uf').appendChild(o); }); }catch(e){}
  }

  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="19" class="loading">Carregando envios…</td></tr>';
    try{ await rpc('cn_promover_envios_atrasados',{p_usuario_id:USER.id}); }catch(e){}   // À Caminho vencido -> Atrasado (não bloqueia a listagem)
    const fl=filtros();
    const fk=filtrosKpi();
    try{ const [linhas,total,kpis,porStatus]=await Promise.all([ rpc('cn_listar_envios',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}), rpc('cn_contar_envios',fl), rpc('cn_kpis_envios',fk), rpc('cn_kpis_envios_status',fk)]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0], porStatus||[]); renderTabela(); renderPag(); msgAtualizado('en-msg','envios');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="19" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp;
    // campo "Ir para a pagina" (helper global do index.html)
    if(typeof montarIrPara==='function') montarIrPara('en',p,tp,(n)=>{ PAGINA=n-1; carregar(); }); }

  const n0=(x)=>Number(x||0).toLocaleString('pt-BR');

  function cardHtml(titulo,valor,hint){
    return `<div class="kpi"><div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div></div>`;
  }
  // cartão de status: clicável, com a mesma cor que a linha tem na tabela
  function cardStatus(titulo,valor,cor,arg,hint,ativo){
    const a=String(arg).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    return `<div class="kpi click ${cor} ${ativo?'on':''}" onclick="EN.filtrarStatus('${a}')">`+
           `<div class="lbl">${titulo}</div>`+
           (hint?`<div class="hint">${hint}</div>`:'')+
           `<div class="val">${valor}</div>`+
           `<div class="flag">filtro ativo · clique para remover</div></div>`;
  }

  function renderKpis(k, porStatus){
    const box=f('kpis'), box2=f('kpis2');
    if(!k){ box.innerHTML=''; if(box2) box2.innerHTML=''; return; }

    // Linha 1: o dinheiro do frete, na ordem da conta —
    // aguardado + extra − custo = saldo.
    box.innerHTML =
      cardHtml('Valor aguardado de frete', brl(k.soma_aguardado),
               'Soma do valor de frete incluído na venda') +
      cardHtml('Valor frete extra total', brl(k.soma_frete_extra),
               'Soma do frete extra cobrado do cliente') +
      cardHtml('Custo total de frete', brl(k.soma_transporte),
               'Soma do valor pago à transportadora') +
      cardHtml('Saldo final de frete', brl(k.soma_diferenca),
               'Aguardado mais extra, menos o custo do transporte') +
      cardHtml('Total de envios', n0(k.total),
               'Envios no recorte dos filtros');

    if(!box2) return;
    // Linha 2: contagens por situação. Cada uma filtra a tabela.
    // Primeiro a conferência (não é status); depois um box por status,
    // na ordem que o banco devolve — a do cadastro.
    box2.innerHTML =
      cardStatus('Envios sem conferência', n0(k.faltam), 'k-conf', 'pendentes',
                 'Ainda não conferidos', FCONF===false) +
      (porStatus||[]).map(s=>{
        const info=STATUS_INFO[s.status]||{titulo:s.status, hint:'Status '+s.status, cls:'k-outro'};
        // status em envios mas fora do cadastro: avisa na dica
        const hint = s.cadastrado ? info.hint : 'Não está no cadastro de status';
        return cardStatus(info.titulo, n0(s.qtd), info.cls, s.status, hint, FSTATUS===s.status);
      }).join('');
  }

  // O select espelha FSTATUS. Se o status não estiver na lista (ex.:
  // existe em envios mas não no cadastro), entra como opção na hora,
  // senão o select mostraria "Todos" com um filtro ligado.
  function sincronizarSelectStatus(){
    const sel=f('status'); if(!sel) return;
    const v=FSTATUS||'';
    if(v && ![...sel.options].some(o=>o.value===v)){
      const o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
    }
    sel.value=v;
  }

  // Um cartão liga e desliga o próprio filtro. Clicar de novo remove.
  // "pendentes" é conferência, não status — por isso o caso à parte.
  function filtrarStatus(valor){
    if(valor==='pendentes'){
      FCONF = (FCONF===false) ? null : false;
    }else{
      FSTATUS = (FSTATUS===valor) ? null : valor;
      sincronizarSelectStatus();
    }
    carregar(true);
  }

  // Zera tudo: selects, busca, ordem, caixas de diferença e cartões.
  function limparFiltros(){
    ['busca','mes','canal','transp','pgto','uf'].forEach(id=>{ f(id).value=''; });
    f('ordem').value='recentes';
    document.querySelectorAll('.en-dif').forEach(c=>{ c.checked=false; });
    rotuloDif();
    FSTATUS=null; FCONF=null; sincronizarSelectStatus();
    carregar(true);
  }

  // rótulo do seletor de diferença reflete o que está marcado
  function rotuloDif(){
    const d=difSelecionadas();
    const b=f('difbtn'); if(!b) return;
    b.textContent = d.length===0 ? 'Diferença: todas'
                  : 'Diferença: ' + d.join(', ');
  }

  function getStatusClass(st) {
    if(!st) return '';
    switch(st.trim()) {
      case 'Aguardando Pagamento do Frete': return 'st-ag-pgto';
      case 'Aguardando Cotação do Frete': return 'st-ag-cot';
      case 'Em Produção': return 'st-prod';
      case 'Aguardando Emissão da Nota Fiscal': return 'st-ag-nf';
      case 'Aguardando Transportadora': return 'st-ag-transp';
      case 'À Caminho':
      case 'A caminho': return 'st-caminho';
      case 'Atrasado': return 'st-atrasado';
      case 'Entregue': return 'st-entregue';
      case 'Em processo de devolução': return 'st-proc-dev';
      case 'Devolução Concluída': 
      case 'Devolvido': return 'st-devolvido';
      case 'Cancelado': return 'st-cancelado';
      default: return '';
    }
  }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="19" class="empty">Nenhum envio encontrado.</td></tr>'; return; } const podeConf=temPermissao('envios.conferir');
    tb.innerHTML=LINHAS.map(l=>{ 
      const dif=Number(l.diferenca||0); 
      const colorDif = dif < 0 ? 'neg' : (dif > 0 ? 'pos' : '');
      const stClass = getStatusClass(l.status);
      
      return `<tr class="${l.conferido?'':'pendente'} ${stClass}" onclick="EN.abrir(${l.id})">
      <td>${dataBr(l.data_compra)}</td><td>${l.canal||'—'}</td><td>${celPedido(l.id_pedido)}</td><td>${l.modelo||'—'}</td><td class="num">${l.quantidade??'—'}</td><td>${l.cliente||'—'}</td><td>${l.uf||'—'}</td>
      <td>${l.transportadora||'—'}</td><td>${l.protocolo||'—'}</td><td>${l.pagamento_frete||'—'}</td><td>${l.tempo_entrega||'—'}</td><td>${dataBr(l.entrega_prometida)}</td><td>${dataBr(l.entrega_concluida)}</td><td><span class="pill">${l.status||'—'}</span></td>
      <td class="num">${brl(l.valor_transporte)}</td><td class="num">${brl(l.valor_incluso_frete)}</td><td class="num">${brl(l.valor_extra)}</td><td class="num ${colorDif}">${brl(l.diferenca)}</td>
      <td class="conf" onclick="event.stopPropagation()"><input type="checkbox" class="chk" ${l.conferido?'checked':''} ${podeConf?'':'disabled'} onchange="EN.conf(${l.id},this.checked,this)"><span class="conf-lbl">${l.conferido?'Conferido':'Pendente'}</span></td>
    </tr>`; }).join(''); }

  async function conf(id,valor,elem){ elem.disabled=true; try{ await rpc('cn_marcar_conferido_envio',{p_usuario_id:USER.id,p_envio_id:id,p_conferido:valor}); const l=LINHAS.find(x=>x.id===id); if(l)l.conferido=valor; const tr=elem.closest('tr'); tr.classList.toggle('pendente',!valor); tr.querySelector('.conf-lbl').textContent=valor?'Conferido':'Pendente'; if(typeof atualizarBadges==='function') atualizarBadges(); }catch(e){ elem.checked=!valor; alert(e.message||e); } finally{ elem.disabled=false; } }

  function fillSel(id,tipo,atual){ const sel=f(id); sel.innerHTML='<option value="">—</option>'; const opts=[...(OPC[tipo]||[])]; if(atual&&!opts.includes(atual))opts.unshift(atual); opts.forEach(v=>{ const o=document.createElement('option'); o.value=v;o.textContent=v; if(v===atual)o.selected=true; sel.appendChild(o); }); sel.value=atual||''; }

  function abrir(id){ if(!temPermissao('envios.editar'))return; const l=LINHAS.find(x=>x.id===id); if(!l)return; EDIT_ID=id; f('drawer-erro').textContent='';
    f('e-data').value=dataBr(l.data_compra); f('e-canal').value=l.canal||''; f('e-idped').value=l.id_pedido||''; f('e-modelo').value=l.modelo||''; f('e-cliente').value=l.cliente||''; f('e-uf').value=l.uf||'';
    fillSel('e-transp','transportadora',l.transportadora); fillSel('e-pgto','pagamento_frete',l.pagamento_frete); fillSel('e-tempo','tempo_entrega',l.tempo_entrega); fillSel('e-status','status_envio',l.status);
    f('e-protocolo').value=l.protocolo||''; f('e-prometida').value=l.entrega_prometida||''; f('e-concluida').value=l.entrega_concluida||''; f('e-transporte').value=l.valor_transporte??''; f('e-incluso').value=l.valor_incluso_frete??''; f('e-extra').value=brl(l.valor_extra); f('e-extra').dataset.raw=l.valor_extra??0; recalc();
    f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }
  function recalc(){ const inc=parseFloat(f('e-incluso').value)||0,tr=parseFloat(f('e-transporte').value)||0,ex=parseFloat(f('e-extra').dataset.raw)||0; f('e-dif').value=brl(inc+ex-tr); }
  async function salvar(){ if(EDIT_ID==null)return; f('drawer-erro').textContent=''; const b=f('drawer-save'); b.disabled=true; b.textContent='Salvando...'; const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{ await rpc('cn_editar_envio',{p_usuario_id:USER.id,p_envio_id:EDIT_ID,p_transportadora:f('e-transp').value||null,p_pagamento_frete:f('e-pgto').value||null,p_tempo_entrega:f('e-tempo').value||null,p_status:f('e-status').value||null,p_protocolo:f('e-protocolo').value||null,p_entrega_prometida:f('e-prometida').value||null,p_entrega_concluida:f('e-concluida').value||null,p_valor_transporte:num('e-transporte'),p_valor_incluso_frete:num('e-incluso')}); fechar(); carregar(); }
    catch(e){ f('drawer-erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; } }

  // ---- trava de 90 segundos após a atualização de vendas ----
  // Quem recusa de fato é o banco (cn_gerar_envios). Aqui o botão
  // desabilita e mostra a contagem, para a espera ficar visível em vez
  // de virar um erro no meio do clique.
  let TRAVA=null;
  async function verTrava(){
    try{ TRAVA = await rpc('cn_estado_trava_envios',{p_usuario_id:USER.id}); }
    catch(e){ TRAVA=null; }
    pintarTrava();
  }
  function pintarTrava(){
    const b=f('gerar'); if(!b) return;
    if(TRAVA && TRAVA.travado){
      b.disabled=true;
      b.title='Atualização de vendas em andamento'+(TRAVA.por?' (por '+TRAVA.por+')':'')+
              '. O tipo de envio ainda está sendo preenchido.';
      b.textContent='Aguarde '+TRAVA.segundos+'s';
      // decrementa na tela e libera sozinho ao chegar a zero
      clearTimeout(pintarTrava._t);
      pintarTrava._t=setTimeout(()=>{
        if(!TRAVA||!TRAVA.travado) return;
        TRAVA.segundos--;
        if(TRAVA.segundos<=0){ TRAVA=null; b.disabled=false; b.title=''; b.textContent='↻ Gerar envios'; }
        else pintarTrava();
      },1000);
    } else {
      b.disabled=false; b.title=''; b.textContent='↻ Gerar envios';
    }
  }

  async function gerar(){ const b=f('gerar'); if(b.disabled)return; b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const r=await rpc('cn_gerar_envios',{p_usuario_id:USER.id}); const n=(r&&r[0]&&r[0].gerados)||0; f('msg').textContent=n>0?`${n} novo(s) envio(s).`:'Nada novo a gerar.'; await carregar(true); }
    catch(e){ alert('Erro ao gerar: '+(e.message||e)); await verTrava(); }
    finally{ if(!(TRAVA&&TRAVA.travado)){ b.disabled=false; b.textContent=t; } } }

  // modal manual
  function abrirModal(){ if(!temPermissao('envios.lancar')){ alert('Você não tem permissão para lançar itens.'); return; } f('m-busca').value=''; f('m-res').innerHTML=''; f('m-erro').textContent=''; f('modal').classList.add('open'); f('m-busca').focus(); }
  function fecharModal(){ f('modal').classList.remove('open'); }
  async function buscarVendas(){ const busca=f('m-busca').value.trim(); if(!busca){ f('m-res').innerHTML=''; return; } try{ const r=await rpc('cn_buscar_vendas_sem_envio',{p_usuario_id:USER.id,p_busca:busca,p_limite:30}); if(!r||!r.length){ f('m-res').innerHTML='<p style="color:var(--muted);font-size:13px">Nenhum pedido encontrado (ou já está em Envios).</p>'; return; } f('m-res').innerHTML='<table class="res"><thead><tr><th>Data</th><th>Canal</th><th>ID</th><th>SKU</th><th>Cliente</th><th>Envio</th><th></th></tr></thead><tbody>'+r.map(v=>`<tr><td>${dataBr(v.data_compra)}</td><td>${v.canal||'—'}</td><td>${v.id_pedido||'—'}</td><td>${v.modelo||'—'}</td><td>${v.cliente||'—'}</td><td>${v.tipo_envio||'—'}</td><td><button onclick="EN.lancar(${v.venda_id})">Lançar</button></td></tr>`).join('')+'</tbody></table>'; }catch(e){ f('m-erro').textContent='Erro na busca: '+(e.message||e); } }
  async function lancar(vendaId){ f('m-erro').textContent=''; try{ await rpc('cn_lancar_envio_manual',{p_usuario_id:USER.id,p_venda_id:vendaId}); fecharModal(); await carregar(true); f('msg').textContent='Item lançado com sucesso.'; }catch(e){ f('m-erro').textContent=(e.message||e); } }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…'; try{ const fl=filtros(); const todas=await rpc('cn_listar_envios',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return; const cols=['data_compra','canal','id_pedido','modelo','quantidade','cliente','uf','transportadora','protocolo','pagamento_frete','tempo_entrega','entrega_prometida','entrega_concluida','status','valor_transporte','valor_incluso_frete','valor_extra','diferenca','conferido']; const head=['Data','Canal','ID Pedido','SKU','Qtd','Cliente','UF','Transportadora','Protocolo','Pgto Frete','Tempo','Ent Prometida','Ent Concluida','Status','Vlr Transporte','Vlr Incluso','Vlr Extra','Diferenca','Conferido']; const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';')); const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='envios_carrinhos_net.csv'; a.click(); }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    // filtros aplicam sozinhos, como na tela de Vendas
    ['mes','canal','transp','pgto','uf','ordem'].forEach(id=>f(id).addEventListener('change',()=>carregar(true)));
    // select de status = mesmo filtro dos boxes de status
    f('status').addEventListener('change',()=>{ FSTATUS=f('status').value||null; carregar(true); });
    f('limpar').addEventListener('click',limparFiltros);
    // seletor de diferença: abre/fecha e recarrega ao marcar
    const dbox=f('difbox'), dbtn=f('difbtn');
    if(dbtn) dbtn.addEventListener('click',(e)=>{ e.stopPropagation(); dbox.classList.toggle('open'); });
    document.addEventListener('click',(e)=>{ if(dbox && !dbox.contains(e.target)) dbox.classList.remove('open'); });
    document.querySelectorAll('.en-dif').forEach(c=>c.addEventListener('change',()=>{ rotuloDif(); carregar(true); }));
    f('gerar').addEventListener('click',gerar); f('lancar').addEventListener('click',abrirModal); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    ['e-incluso','e-transporte'].forEach(id=>f(id).addEventListener('input',recalc));
    f('drawer-x').addEventListener('click',fechar); f('drawer-cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('drawer-save').addEventListener('click',salvar);
    f('modal-x').addEventListener('click',fecharModal); let mt; f('m-busca').addEventListener('input',()=>{ clearTimeout(mt); mt=setTimeout(buscarVendas,400); });
  }

  return { init, abrir, conf, lancar, filtrarStatus, limparFiltros };
})();
window.EN = EN;
registrarTela('envios', EN);