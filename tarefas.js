// =====================================================================
// CARRINHOS_NET — TELAS: Demandas Diárias · Demandas Extras · Painel do Gestor
// Grupo do menu: Tarefas Diárias (16/10/2026 — arquivo 140)
// Depende da base do index.html: $, rpc, USER, temPermissao,
// registrarTela, atualizarBadges.
//
// UM QUADRO, TRÊS TELAS
//   As três telas usam o mesmo quadro (montado por criarQuadro abaixo):
//   colunas A fazer · Em andamento · Concluído, cartões com lista de
//   itens (marcar risca a linha) e arrastar o cartão entre colunas.
//     Demandas Diárias → quadro 'diaria', cartões que se renovam
//     Demandas Extras  → quadro 'extra', com urgência e prazo
//     Painel do Gestor → os dois quadros, de todas as pessoas, com um
//                        resumo por pessoa no topo (permissão tarefas.gestor)
//   O drawer de criar/editar é um só, compartilhado (ids "tq-").
//
// REGRAS (quem garante é o banco — arquivo 140)
//   - Marcar o 1º item → Em andamento; marcar todos → Concluído;
//     desmarcar um item de um concluído → volta para Em andamento.
//   - Demandas Diárias e Demandas Extras mostram SÓ os cartões em que a
//     pessoa é a responsável (inclusive para o gestor). Dá para criar
//     demanda para outra pessoa, mas ela sai da tela ao salvar: as
//     demandas de terceiros só aparecem no Painel do Gestor (18/10/2026).
//   - Editar: quem criou, o responsável ou o gestor. Excluir: quem criou
//     ou o gestor.
//   - Ordem dos itens: no drawer, arrastando pela alça ⠿.
//   - Diárias se renovam nos dias em que valem, no horário escolhido no
//     cartão (vazio = começo do dia; arquivo 141) (a tela
//     também pede a renovação ao abrir, caso a rotina não tenha passado).
//   - Extras concluídas somem da tela 7 dias depois.
// =====================================================================
(function(){
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const COLUNAS=[['a_fazer','A fazer'],['andamento','Em andamento'],['concluido','Concluído']];
  const URG={normal:'Normal', alta:'Alta', urgente:'Urgente'};
  const DIAS_CURTO=['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];          // isodow 1..7
  const DIAS_LONGO=['','segunda','terça','quarta','quinta','sexta','sábado','domingo'];
  const hojeSP=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const ddmm=(d)=>d? String(d).slice(8,10)+'/'+String(d).slice(5,7) : '';
  const diaSemanaIso=(d)=>{ const [y,m,dd]=String(d).split('-').map(Number); const w=new Date(y,m-1,dd).getDay(); return w===0?7:w; };
  const inicial=(n)=>(String(n||'?').trim().charAt(0)||'?').toUpperCase();
  const quando=(iso)=>{ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return '';
    const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // texto da renovação de uma diária
  function textoRenovacao(c){
    switch(c.recorrencia){
      case 'dias_semana': return (c.dias_semana||[]).map(d=>DIAS_CURTO[d]).join(', ');
      case 'semanal':     return 'Toda '+(DIAS_LONGO[(c.dias_semana||[])[0]]||'semana');
      case 'mensal':      return 'Todo dia '+(c.dia_mes||'?');
      default:            return 'Dias úteis';
    }
  }

  // ---------------------------------------------------------------
  // USUÁRIOS (campo Responsável e filtro do gestor) — carregados 1 vez
  // ---------------------------------------------------------------
  let USUARIOS=null;
  async function usuarios(){
    if(USUARIOS) return USUARIOS;
    try{ USUARIOS=await rpc('cn_tarefas_usuarios',{p_usuario_id:USER.id})||[]; }catch(e){ USUARIOS=[]; }
    return USUARIOS;
  }

  // ---------------------------------------------------------------
  // DRAWER COMPARTILHADO (criar / editar)
  // ---------------------------------------------------------------
  const d=(id)=>$('tq-'+id);
  let ED=null;   // { quadro, cartao (null = novo), aoSalvar }

  function itemLinha(it){
    return `<div class="tq-it-ed" data-id="${it&&it.id?it.id:''}">
      <span class="tq-it-alca" title="Arraste para mudar a ordem">⠿</span>
      <input class="tq-it-txt" value="${escH(it?it.texto:'')}" placeholder="Descreva o item" maxlength="300">
      <button type="button" class="tq-it-rm" title="Remover item">×</button></div>`;
  }
  function addItem(foco){
    d('itens').insertAdjacentHTML('beforeend', itemLinha(null));
    if(foco){ const ins=d('itens').querySelectorAll('.tq-it-txt'); ins[ins.length-1].focus(); }
  }
  function ajustarRenovacao(){
    const r=d('e-recor').value;
    d('bl-dias').style.display = r==='dias_semana' ? '' : 'none';
    d('bl-semanal').style.display = r==='semanal' ? '' : 'none';
    d('bl-mensal').style.display = r==='mensal' ? '' : 'none';
  }

  async function abrirDrawer(quadro, cartao, aoSalvar, padraoResp){
    ED={quadro, cartao, aoSalvar};
    const us=await usuarios();
    d('erro').textContent='';
    const novo=!cartao;
    const nomeQ= quadro==='diaria' ? 'demanda diária' : 'demanda extra';
    d('titulo').firstChild.textContent=(novo?'Nova '+nomeQ:'Editar '+nomeQ)+' ';
    d('e-titulo').value= cartao ? cartao.titulo : '';
    d('e-titulo').placeholder= quadro==='diaria' ? 'Ex.: Abertura da loja' : 'Ex.: Trocar fornecedor de caixas';
    d('e-desc').value= cartao ? (cartao.descricao||'') : '';
    const resp= cartao ? cartao.responsavel_id : (padraoResp||USER.id);
    d('e-resp').innerHTML=us.map(u=>`<option value="${u.id}"${u.id===resp?' selected':''}>${escH(u.nome)}${u.id===USER.id?' (eu)':''}</option>`).join('');
    // responsável inativo (saiu da lista): entra para não trocar em silêncio
    if(cartao && !us.some(u=>u.id===resp)) d('e-resp').insertAdjacentHTML('afterbegin',`<option value="${resp}" selected>${escH(cartao.responsavel)}</option>`);
    // diária
    d('bl-diaria').style.display = quadro==='diaria' ? '' : 'none';
    d('bl-extra').style.display  = quadro==='extra'  ? '' : 'none';
    d('e-recor').value= (cartao && cartao.recorrencia) || 'dias_uteis';
    const dias=new Set((cartao && cartao.dias_semana)||[1,2,3,4,5]);
    d('e-dias').querySelectorAll('input').forEach(i=>{ i.checked=dias.has(Number(i.value)); });
    d('e-semanal').value= String(((cartao && cartao.dias_semana)||[1])[0]);
    d('e-diames').value= (cartao && cartao.dia_mes) || '';
    d('e-ativo').checked= !cartao || cartao.ativo!==false;
    d('e-hora').value= (cartao && cartao.hora_renovacao) || '';
    ajustarRenovacao();
    // extra
    d('e-urg').value= (cartao && cartao.urgencia) || 'normal';
    d('e-prazo').value= (cartao && cartao.prazo) || '';
    // itens
    d('itens').innerHTML=(cartao && cartao.itens.length ? cartao.itens : [null]).map(itemLinha).join('');
    // rodapé e informações
    d('info').innerHTML= cartao
      ? `Criado por <b>${escH(cartao.criador||'—')}</b> em ${escH(quando(cartao.criado_em))}`+
        (cartao.concluido_em?` · concluído por <b>${escH(cartao.concluido_por||'—')}</b> em ${escH(quando(cartao.concluido_em))}`:'')
      : '';
    d('excluir').style.display = (cartao && cartao.pode_excluir) ? '' : 'none';
    d('historico').style.display = (cartao && quadro==='diaria') ? '' : 'none';
    d('hist-corpo').innerHTML=''; d('hist-corpo').style.display='none';
    d('overlay').classList.add('open'); d('drawer').classList.add('open');
    setTimeout(()=>d('e-titulo').focus(),60);
  }
  function fecharDrawer(){ d('overlay').classList.remove('open'); d('drawer').classList.remove('open'); ED=null; }

  async function salvarDrawer(){
    if(!ED) return;
    d('erro').textContent='';
    const itens=[...d('itens').querySelectorAll('.tq-it-ed')].map(l=>({
      id: l.dataset.id ? Number(l.dataset.id) : null,
      texto: l.querySelector('.tq-it-txt').value.trim()
    })).filter(i=>i.texto);
    const dados={
      quadro: ED.quadro,
      titulo: d('e-titulo').value.trim(),
      descricao: d('e-desc').value.trim(),
      responsavel_id: Number(d('e-resp').value),
      itens
    };
    if(!dados.titulo){ d('erro').textContent='Informe o título.'; return; }
    if(ED.quadro==='diaria'){
      dados.recorrencia=d('e-recor').value;
      dados.ativo=d('e-ativo').checked;
      dados.hora_renovacao=d('e-hora').value||null;
      if(dados.recorrencia==='dias_semana') dados.dias_semana=[...d('e-dias').querySelectorAll('input:checked')].map(i=>Number(i.value));
      if(dados.recorrencia==='semanal') dados.dias_semana=[Number(d('e-semanal').value)];
      if(dados.recorrencia==='mensal') dados.dia_mes=Number(d('e-diames').value)||null;
    }else{
      dados.urgencia=d('e-urg').value;
      dados.prazo=d('e-prazo').value||null;
    }
    const b=d('save'); b.disabled=true; const t=b.textContent; b.textContent='Salvando…';
    try{
      await rpc('cn_tarefas_salvar',{p_usuario_id:USER.id, p_id:ED.cartao?ED.cartao.id:null, p_dados:dados});
      // enviada para outra pessoa: some das telas Diárias/Extras (só aparece
      // no Painel do Gestor), então o aviso diz para quem foi
      const sel=d('e-resp'), nomeResp=sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text.replace(/ \(eu\)$/,''):'';
      const aviso = dados.responsavel_id===USER.id ? 'Demanda salva.' : `Demanda enviada para ${nomeResp}.`;
      const cb=ED.aoSalvar; fecharDrawer();
      if(cb) await cb(aviso);
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ d('erro').textContent=(e.message||e); }
    finally{ b.disabled=false; b.textContent=t; }
  }

  async function excluirDrawer(){
    if(!ED || !ED.cartao) return;
    if(!confirm(`Excluir a demanda "${ED.cartao.titulo}"?\n\nO cartão, os itens e o histórico dele são apagados de vez.`)) return;
    try{
      await rpc('cn_tarefas_excluir',{p_usuario_id:USER.id, p_id:ED.cartao.id});
      const cb=ED.aoSalvar; fecharDrawer();
      if(cb) await cb('Demanda excluída.');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ d('erro').textContent=(e.message||e); }
  }

  async function verHistorico(){
    if(!ED || !ED.cartao) return;
    const box=d('hist-corpo');
    if(box.style.display!=='none'){ box.style.display='none'; return; }
    box.style.display=''; box.innerHTML='<p style="color:var(--muted);font-size:12px">Carregando…</p>';
    try{
      const h=await rpc('cn_tarefas_historico',{p_usuario_id:USER.id, p_cartao_id:ED.cartao.id})||[];
      if(!h.length){ box.innerHTML='<p style="color:var(--muted);font-size:12px">Ainda não há dias anteriores: o histórico começa na primeira renovação.</p>'; return; }
      box.innerHTML='<table class="res"><thead><tr><th>Dia</th><th class="num">Feitos</th><th>Itens</th></tr></thead><tbody>'+
        h.map(x=>`<tr><td>${escH(DIAS_CURTO[diaSemanaIso(x.dia)])} ${escH(ddmm(x.dia))}</td>
          <td class="num"${x.itens_total&&x.itens_feitos<x.itens_total?' style="color:var(--warn)"':''}>${x.itens_feitos}/${x.itens_total}</td>
          <td style="white-space:normal;font-size:12px">${(x.itens||[]).map(i=>i.feito
              ? `<span style="color:var(--ok)">✓</span> ${escH(i.texto)}${i.feito_por?` <span style="color:var(--muted)">(${escH(i.feito_por)})</span>`:''}`
              : `<span style="color:var(--danger)">✗</span> ${escH(i.texto)}`).join('<br>')}</td></tr>`).join('')+
        '</tbody></table>';
    }catch(e){ box.innerHTML='<p style="color:var(--danger);font-size:12px">'+escH(e.message||e)+'</p>'; }
  }

  // eventos do drawer: ligados uma vez só
  let DRAWER_LIGADO=false;
  function ligarDrawer(){
    if(DRAWER_LIGADO) return; DRAWER_LIGADO=true;
    d('x').addEventListener('click',fecharDrawer);
    d('overlay').addEventListener('click',fecharDrawer);
    d('cancel').addEventListener('click',fecharDrawer);
    d('save').addEventListener('click',salvarDrawer);
    d('excluir').addEventListener('click',excluirDrawer);
    d('historico').addEventListener('click',verHistorico);
    d('e-recor').addEventListener('change',ajustarRenovacao);
    d('add-item').addEventListener('click',()=>addItem(true));
    d('itens').addEventListener('click',(e)=>{
      if(!e.target.classList.contains('tq-it-rm')) return;
      const linha=e.target.closest('.tq-it-ed'); if(linha) linha.remove();
      if(!d('itens').children.length) addItem(false);
    });
    // Enter no último item cria o próximo
    // ordem dos itens: arrastar pela alça ⠿ (a ordem da tela é a que fica salva)
    let ARR_IT=null;
    d('itens').addEventListener('mousedown',(e)=>{ const a=e.target.closest('.tq-it-alca'); if(a) a.closest('.tq-it-ed').draggable=true; });
    d('itens').addEventListener('mouseup',()=>{ d('itens').querySelectorAll('.tq-it-ed[draggable="true"]').forEach(l=>{ if(l!==ARR_IT) l.draggable=false; }); });
    d('itens').addEventListener('dragstart',(e)=>{
      const l=e.target.closest && e.target.closest('.tq-it-ed'); if(!l || !l.draggable) return;
      ARR_IT=l; l.classList.add('tq-it-arr');
      e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain','item'); }catch(_){}
    });
    d('itens').addEventListener('dragover',(e)=>{
      if(!ARR_IT) return; e.preventDefault();
      const alvo=e.target.closest('.tq-it-ed'); if(!alvo || alvo===ARR_IT) return;
      const r=alvo.getBoundingClientRect();
      alvo.parentNode.insertBefore(ARR_IT, e.clientY>r.top+r.height/2 ? alvo.nextSibling : alvo);
    });
    d('itens').addEventListener('drop',(e)=>{ if(ARR_IT) e.preventDefault(); });
    d('itens').addEventListener('dragend',()=>{ if(!ARR_IT) return; ARR_IT.classList.remove('tq-it-arr'); ARR_IT.draggable=false; ARR_IT=null; });
    d('itens').addEventListener('keydown',(e)=>{
      if(e.key!=='Enter' || !e.target.classList.contains('tq-it-txt')) return;
      e.preventDefault();
      const linhas=[...d('itens').querySelectorAll('.tq-it-txt')];
      if(e.target===linhas[linhas.length-1]) addItem(true);
      else linhas[linhas.indexOf(e.target)+1].focus();
    });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && d('drawer').classList.contains('open')) fecharDrawer(); });
  }

  // ---------------------------------------------------------------
  // QUADRO (uma instância por tela)
  //   cfg.pfx     prefixo dos ids da tela ('td', 'tx', 'tg')
  //   cfg.quadro  'diaria' | 'extra' (o gestor troca pelo seletor)
  //   cfg.gestor  true no Painel do Gestor
  // ---------------------------------------------------------------
  function criarQuadro(cfg){
    const f=(id)=>$(cfg.pfx+'-'+id);
    let CARDS=[], QUADRO=cfg.quadro, PESSOA='', RESUMO=[];
    let RENOVOU=false;

    function montar(){
      const raiz=f('root');
      const seletor = cfg.gestor
        ? `<select id="${cfg.pfx}-quadro"><option value="diaria">Demandas Diárias</option><option value="extra">Demandas Extras</option></select>
           <select id="${cfg.pfx}-pessoa"><option value="">Todas as pessoas</option></select>`
        : '';
      raiz.innerHTML=`
        <div class="toolbar">
          <div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input id="${cfg.pfx}-busca" placeholder="Buscar no título ou nos itens"></div>
          ${seletor}
          <button class="act prim" id="${cfg.pfx}-limpar">Limpar filtros</button>
          <button class="act prim" id="${cfg.pfx}-novo">+ Nova demanda</button>
          <button class="act" id="${cfg.pfx}-atualizar" title="Recarregar">↻</button>
          <span id="${cfg.pfx}-msg" style="font-size:12px;color:var(--muted)"></span>
        </div>
        ${cfg.gestor?`<div class="tq-resumo" id="${cfg.pfx}-resumo"></div>`:''}
        <div class="tq-quadro" id="${cfg.pfx}-quadro-cols">
          ${COLUNAS.map(([st,nome])=>`<div class="tq-col tq-col-${st}" data-status="${st}">
              <div class="tq-col-tit">${nome}<span class="tq-col-n" id="${cfg.pfx}-n-${st}">0</span></div>
              <div class="tq-col-corpo" id="${cfg.pfx}-col-${st}" data-status="${st}"></div></div>`).join('')}
        </div>`;
    }

    function msg(t,erro){ const el=f('msg'); if(!el) return; el.textContent=t||''; el.style.color=erro?'var(--danger)':'var(--muted)'; }

    async function carregar(){
      try{
        if(!RENOVOU){ RENOVOU=true; try{ await rpc('cn_tarefas_renovar_tela',{p_usuario_id:USER.id}); }catch(e){} }
        const args={p_usuario_id:USER.id, p_quadro:QUADRO};
        if(cfg.gestor){ args.p_visao='todas'; args.p_responsavel_id=PESSOA?Number(PESSOA):null; }
        else args.p_visao='minhas';   // só as minhas: terceiros só no Painel do Gestor
        const [cards,resumo]=await Promise.all([
          rpc('cn_tarefas_listar',args),
          cfg.gestor ? rpc('cn_tarefas_resumo_pessoas',{p_usuario_id:USER.id}) : null
        ]);
        CARDS=cards||[];
        if(cfg.gestor) RESUMO=resumo||[];
        render();
      }catch(e){ msg('Erro: '+(e.message||e),true); }
    }

    const passaBusca=(c)=>{
      const q=(f('busca').value||'').trim().toLowerCase(); if(!q) return true;
      return c.titulo.toLowerCase().includes(q) || (c.descricao||'').toLowerCase().includes(q) ||
             c.itens.some(i=>i.texto.toLowerCase().includes(q));
    };

    function cardHtml(c){
      const feitos=c.itens.filter(i=>i.feito).length, tot=c.itens.length;
      const etiquetas=[];
      if(c.quadro==='extra'){
        etiquetas.push(`<span class="tq-urg tq-urg-${c.urgencia}">${URG[c.urgencia]||c.urgencia}</span>`);
        if(c.prazo) etiquetas.push(`<span class="tq-prazo${c.atrasado?' tq-atraso':''}">${c.atrasado?'Atrasada · ':''}até ${ddmm(c.prazo)}</span>`);
      }else{
        etiquetas.push(`<span class="tq-recor" title="Quando se renova">↻ ${escH(textoRenovacao(c))}${c.hora_renovacao?' · '+escH(c.hora_renovacao):''}</span>`);
        // vale hoje mas o horário ainda não chegou: o cartão ainda é o de ontem
        if(c.ativo!==false && c.vale_hoje && c.hora_renovacao && (!c.ultima_renovacao || c.ultima_renovacao<hojeSP()))
          etiquetas.push(`<span class="tq-prox">Renova hoje às ${escH(c.hora_renovacao)}</span>`);
        if(c.ativo===false) etiquetas.push('<span class="tq-pausa">Pausada</span>');
        else if(!c.vale_hoje && c.proximo_dia) etiquetas.push(`<span class="tq-prox">Não vale hoje · próxima ${DIAS_CURTO[diaSemanaIso(c.proximo_dia)].toLowerCase()} ${ddmm(c.proximo_dia)}</span>`);
      }
      const outro = c.criado_por && c.criado_por!==c.responsavel_id;
      return `<div class="tq-card${c.status==='concluido'?' tq-feito':''}${c.atrasado?' tq-card-atraso':''}${c.ativo===false?' tq-card-pausa':''}"
                   draggable="true" data-id="${c.id}">
        <div class="tq-etq">${etiquetas.join('')}</div>
        <div class="tq-tit" data-abrir="${c.id}" title="Abrir para editar">${escH(c.titulo)}</div>
        ${c.descricao?`<div class="tq-desc">${escH(c.descricao)}</div>`:''}
        ${tot?`<ul class="tq-itens">${c.itens.map(i=>`<li class="${i.feito?'tq-ok':''}"><label>
            <input type="checkbox" data-item="${i.id}" data-cartao="${c.id}"${i.feito?' checked':''}>
            <span title="${i.feito&&i.feito_por?escH('Feito por '+i.feito_por+' em '+quando(i.feito_em)):''}">${escH(i.texto)}</span></label></li>`).join('')}</ul>`:''}
        <div class="tq-rodape">
          <span class="tq-av" title="Responsável">${escH(inicial(c.responsavel))}</span>
          <span class="tq-resp">${escH(c.responsavel)}${outro?`<span class="tq-de"> · de ${escH(c.criador||'—')}</span>`:''}</span>
          ${tot?`<span class="tq-prog${feitos===tot?' tq-prog-ok':''}">${feitos}/${tot}</span>`:''}
        </div>
      </div>`;
    }

    function render(){
      for(const [st] of COLUNAS){
        let l=CARDS.filter(c=>c.status===st && passaBusca(c));
        // concluídos: o mais recente em cima
        if(st==='concluido') l=l.slice().sort((a,b)=>String(b.concluido_em||'').localeCompare(String(a.concluido_em||'')));
        f('col-'+st).innerHTML = l.length ? l.map(cardHtml).join('')
          : `<div class="tq-vazio">${st==='a_fazer'?'Nada a fazer':st==='andamento'?'Nada em andamento':'Nada concluído'}</div>`;
        f('n-'+st).textContent=l.length;
      }
      if(cfg.gestor) renderResumo();
    }

    function renderResumo(){
      const box=f('resumo'); if(!box) return;
      const sel=f('pessoa');
      if(sel.options.length<=1) sel.insertAdjacentHTML('beforeend', RESUMO.map(p=>`<option value="${p.id}">${escH(p.nome)}</option>`).join(''));
      box.innerHTML=RESUMO.map(p=>{
        const ativo=String(p.id)===PESSOA;
        const extra=[];
        if(p.extras_urgentes) extra.push(`<span style="color:var(--danger)">${p.extras_urgentes} urgente${p.extras_urgentes>1?'s':''}</span>`);
        if(p.extras_atrasadas) extra.push(`<span style="color:var(--danger)">${p.extras_atrasadas} atrasada${p.extras_atrasadas>1?'s':''}</span>`);
        return `<div class="kpi click tq-pessoa ${ativo?'on':''}" data-pessoa="${p.id}" title="Clique para ver só as demandas de ${escH(p.nome)}">
          <div class="lbl"><span class="tq-av">${escH(inicial(p.nome))}</span> ${escH(p.nome)}</div>
          <div class="tq-pessoa-l">Diárias: <b>${p.diarias_abertas}</b> em aberto · <b>${p.diarias_feitas}</b> ${p.diarias_feitas===1?'feita':'feitas'}</div>
          <div class="tq-pessoa-l">Extras: <b>${p.extras_abertas}</b> em aberto${extra.length?' · '+extra.join(' · '):''}</div>
          <div class="flag">filtro ativo · clique para remover</div></div>`;
      }).join('');
    }

    // ---- ações ----
    async function marcar(el){
      const id=Number(el.dataset.item), cid=Number(el.dataset.cartao), feito=el.checked;
      const c=CARDS.find(x=>x.id===cid); const it=c && c.itens.find(i=>i.id===id);
      if(it){ it.feito=feito; }
      el.closest('li').classList.toggle('tq-ok',feito);
      el.disabled=true;
      try{
        const st=await rpc('cn_tarefas_marcar_item',{p_usuario_id:USER.id, p_item_id:id, p_feito:feito});
        if(c){
          if(feito && it){ it.feito_por=USER.nome; it.feito_em=new Date().toISOString(); }
          if(st && st!==c.status){
            c.status=st;
            if(st==='concluido'){ c.concluido_em=new Date().toISOString(); c.concluido_por=USER.nome; msg(`"${c.titulo}" concluída.`); }
          }
        }
        render();
        if(typeof atualizarBadges==='function') atualizarBadges();
      }catch(e){ el.checked=!feito; if(it) it.feito=!feito; el.disabled=false; msg('Não foi possível marcar: '+(e.message||e),true); }
    }

    // arrastar entre colunas
    let ARRASTA=null;
    function ligarArrasto(){
      const quadro=f('quadro-cols');
      quadro.addEventListener('dragstart',(e)=>{
        const card=e.target.closest('.tq-card'); if(!card) return;
        ARRASTA=Number(card.dataset.id);
        e.dataTransfer.effectAllowed='move';
        try{ e.dataTransfer.setData('text/plain',String(ARRASTA)); }catch(_){}
        card.classList.add('tq-arrastando');
      });
      quadro.addEventListener('dragend',(e)=>{
        ARRASTA=null;
        quadro.querySelectorAll('.tq-arrastando').forEach(x=>x.classList.remove('tq-arrastando'));
        quadro.querySelectorAll('.tq-alvo').forEach(x=>x.classList.remove('tq-alvo'));
      });
      quadro.addEventListener('dragover',(e)=>{
        const col=e.target.closest('.tq-col'); if(!col || ARRASTA==null) return;
        e.preventDefault(); e.dataTransfer.dropEffect='move';
        quadro.querySelectorAll('.tq-alvo').forEach(x=>{ if(x!==col) x.classList.remove('tq-alvo'); });
        col.classList.add('tq-alvo');
      });
      quadro.addEventListener('drop',async (e)=>{
        const col=e.target.closest('.tq-col'); if(!col || ARRASTA==null) return;
        e.preventDefault();
        quadro.querySelectorAll('.tq-alvo').forEach(x=>x.classList.remove('tq-alvo'));
        const id=ARRASTA, st=col.dataset.status;
        const c=CARDS.find(x=>x.id===id); if(!c || c.status===st) return;
        const antes={status:c.status, concluido_em:c.concluido_em};
        c.status=st; if(st==='concluido'){ c.concluido_em=new Date().toISOString(); c.concluido_por=USER.nome; }
        render();
        try{
          await rpc('cn_tarefas_mover',{p_usuario_id:USER.id, p_id:id, p_status:st});
          if(typeof atualizarBadges==='function') atualizarBadges();
        }catch(err){ Object.assign(c,antes); render(); msg('Não foi possível mover: '+(err.message||err),true); }
      });
    }

    async function recarregar(texto){ await carregar(); if(texto) msg(texto); }

    function limpar(){
      f('busca').value='';
      if(cfg.gestor){ PESSOA=''; f('pessoa').value=''; }
      carregar();
    }

    function bind(){
      let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(render,200); });
      if(cfg.gestor){
        f('quadro').addEventListener('change',()=>{ QUADRO=f('quadro').value; carregar(); });
        f('pessoa').addEventListener('change',()=>{ PESSOA=f('pessoa').value; carregar(); });
        f('resumo').addEventListener('click',(e)=>{
          const k=e.target.closest('[data-pessoa]'); if(!k) return;
          PESSOA = (PESSOA===k.dataset.pessoa) ? '' : k.dataset.pessoa;
          f('pessoa').value=PESSOA; carregar();
        });
      }
      f('limpar').addEventListener('click',limpar);
      f('atualizar').addEventListener('click',()=>{ RENOVOU=false; carregar(); });
      f('novo').addEventListener('click',()=>abrirDrawer(QUADRO,null,recarregar, cfg.gestor&&PESSOA?Number(PESSOA):null));
      const cols=f('quadro-cols');
      cols.addEventListener('change',(e)=>{ if(e.target.matches('input[data-item]')) marcar(e.target); });
      cols.addEventListener('click',(e)=>{
        const t=e.target.closest('[data-abrir]'); if(!t) return;
        const c=CARDS.find(x=>x.id===Number(t.dataset.abrir)); if(!c) return;
        if(!c.pode_editar){ msg('Só quem criou, o responsável ou o gestor podem editar este cartão.',true); return; }
        abrirDrawer(c.quadro,c,recarregar);
      });
      ligarArrasto();
    }

    async function init(){ montar(); ligarDrawer(); bind(); await carregar(); }
    // voltou para a tela: relê (outra pessoa pode ter mexido)
    function aoVoltar(){ carregar(); }
    return { init, aoVoltar };
  }

  const TQD=criarQuadro({pfx:'td', quadro:'diaria'});
  const TQX=criarQuadro({pfx:'tx', quadro:'extra'});
  const TQG=criarQuadro({pfx:'tg', quadro:'diaria', gestor:true});
  window.TQD=TQD; window.TQX=TQX; window.TQG=TQG;
  registrarTela('tarefas_diarias', TQD);
  registrarTela('tarefas_extras', TQX);
  registrarTela('tarefas_gestor', TQG);
})();
