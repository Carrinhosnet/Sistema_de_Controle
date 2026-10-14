// =====================================================================
// CARRINHOS_NET — inicio.js — TELA INICIAL (14/10/2026)
//
// Abre logo depois do login e quando se clica na LOGO do menu (não há
// botão de "Início" no menu). É um "o que precisa de mim agora":
//
//   1. Saudação + saúde das rotinas automáticas (sincronização da
//      madrugada e Listagem de Envios das 07:30)
//   2. PENDÊNCIAS — um cartão por assunto, só quando há algo a fazer;
//      clicar leva para a tela certa. Sem nada: "Tudo em dia".
//   3. EXPEDIÇÃO HOJE — números da listagem de hoje (envios para hoje,
//      atrasados, próximos dias, aguardando NF, etiquetas emitidas)
//   4. TELAS DO SISTEMA — um box por grupo do menu; clicar abre os
//      boxes das telas do grupo (estilo "liquid glass")
//
// Cada pessoa só vê o que o perfil dela permite. Não tem consulta nova
// no banco: usa as MESMAS funções das bolinhas do menu e das telas
// (cn_*_pendencias, cn_ultima_atualizacao, cn_expedicao_*,
// cn_etiquetas_listas). Se alguma não responder, aquele cartão some sem
// travar a tela.
// Depende da base do index.html: $, USER, rpc, temPermissao,
// mostrarTela, registrarTela, atualizarBadges.
// =====================================================================
const INI = (function(){
  const f=(id)=>$('ini-'+id);
  const escH=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const agoraSP=()=>new Date(Date.now()-3*3600e3);
  const hojeSP=()=>agoraSP().toISOString().slice(0,10);
  const hhmm=(iso)=>{ try{ const d=new Date(new Date(iso).getTime()-3*3600e3).toISOString(); return d.slice(11,16); }catch(e){ return ''; } };
  const ddmmIso=(iso)=>{ try{ const d=new Date(new Date(iso).getTime()-3*3600e3).toISOString(); return d.slice(8,10)+'/'+d.slice(5,7); }catch(e){ return ''; } };
  const DIAS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  let CARREGANDO=false, ultimo=0;

  // ---------------------------------------------------------------
  // PENDÊNCIAS: as mesmas funções das bolinhas do menu
  //   [permissão, função, tela, título, texto(n), cor]
  // ---------------------------------------------------------------
  const PEND=[
    ['expedicao.ver','cn_expedicao_pendencias','expedicao','Listagens não lidas',
      n=>`${n} ${n===1?'listagem automática':'listagens automáticas'} para copiar ou imprimir`, '#22c55e'],
    ['vendas.ver','cn_vendas_pendencias','vendas','Vendas a conferir', n=>`${n} ${n===1?'venda':'vendas'} no Controle de Vendas`, '#ef4444'],
    ['envios.ver','cn_envios_pendencias','envios','Envios a conferir', n=>`${n} ${n===1?'envio':'envios'} no Controle de Envios`, '#a855f7'],
    ['mediacoes.ver','cn_mediacoes_pendencias','mediacoes','Mediações', n=>`${n} ${n===1?'caso':'casos'} na fila de mediações`, '#f59e0b'],
    ['devolucoes.ver','cn_devolucoes_pendencias','devolucoes','Devoluções', n=>`${n} ${n===1?'devolução':'devoluções'} a conferir`, '#f59e0b'],
    ['cancelamentos.ver','cn_cancelamentos_pendencias','cancelamentos','Cancelamentos', n=>`${n} ${n===1?'cancelamento':'cancelamentos'} a conferir`, '#f59e0b'],
    ['reclamacoes.ver','cn_reclamacoes_pendencias','reclamacoes','Reclamações', n=>`${n} ${n===1?'reclamação':'reclamações'} a conferir`, '#f59e0b'],
    ['boletos.ver','cn_boletos_pendencias','boletos','Boletos', n=>`${n} ${n===1?'boleto':'boletos'} em atraso ou em cobrança`, '#ef4444'],
    ['produtos.ver','cn_produtos_pendencias','produtos','Cadastro de produtos', n=>`${n} ${n===1?'produto com pendência':'produtos com pendência'} no cadastro`, '#60a5fa'],
    ['frete.ver','cn_frete_pendencias','frete','Custo de frete', n=>`${n} ${n===1?'item':'itens'} a tratar`, '#60a5fa'],
    ['valores.ver','cn_valores_pendencias','valores','Controle de valores', n=>`${n} ${n===1?'venda':'vendas'} fora do preço permitido`, '#60a5fa'],
  ];
  async function contar(fn){ try{ return Number(await rpc(fn,{p_usuario_id:USER.id}))||0; }catch(e){ return null; } }

  async function pendencias(){
    const itens=PEND.filter(p=>temPermissao(p[0]));
    const ns=await Promise.all(itens.map(p=>contar(p[1])));
    const cards=[];
    itens.forEach((p,i)=>{ const n=ns[i]; if(n>0) cards.push({tela:p[2], tit:p[3], txt:p[4](n), n, cor:p[5]}); });
    // estoque: aviso de importação atrasada (a função devolve os dias)
    if(temPermissao('estoque.ver')){
      const d=await contar('cn_estoque_pendencias');
      if(d>0) cards.push({tela:'estoque', tit:'Estoque', n:'!', cor:'#eab308',
        txt: d>=999 ? 'Nenhum relatório de estoque foi importado ainda' : `Última importação de estoque há ${d} ${d===1?'dia':'dias'}`});
    }
    // arquivos contábeis: lembrete nos 10 primeiros dias do mês
    const hoje=agoraSP();
    if(temPermissao('arquivos_contabeis.gerar') && hoje.getUTCDate()<=10){
      const ant=new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth()-1, 1));
      cards.push({tela:'arquivos', tit:'Arquivos contábeis', n:'📁', cor:'#94a3b8', lembrete:true,
        txt:`Lembrete: gerar o pacote de ${MESES[ant.getUTCMonth()]}/${ant.getUTCFullYear()} para a contabilidade`});
    }
    f('pend').innerHTML= cards.length
      ? cards.map(c=>`<button class="ini-card${c.lembrete?' ini-lembrete':''}" style="--cor:${c.cor}" data-tela="${c.tela}">
            <span class="ini-n">${escH(c.n)}</span>
            <span class="ini-ct"><b>${escH(c.tit)}</b><span>${escH(c.txt)}</span></span>
            <span class="ini-seta">›</span></button>`).join('')
      : `<div class="ini-vazio">✓ Tudo em dia — nenhuma pendência para o seu perfil agora.</div>`;
  }

  // ---------------------------------------------------------------
  // ROTINAS AUTOMÁTICAS
  // ---------------------------------------------------------------
  function pill(ok, txt, titulo){
    const cls= ok===true ? 'ini-ok' : ok===false ? 'ini-erro' : 'ini-neutro';
    return `<span class="ini-pill ${cls}" title="${escH(titulo||'')}">${ok===true?'●':ok===false?'●':'○'} ${escH(txt)}</span>`;
  }
  async function rotinas(){
    const p=[];
    try{
      const u=await rpc('cn_ultima_atualizacao',{p_usuario_id:USER.id})||{};
      // a sincronização da madrugada atualiza vendas e envios juntas
      const d=u.vendas||u.envios||Object.values(u)[0];
      if(d && d.em){
        const quando=`${ddmmIso(d.em)} às ${hhmm(d.em)}`;
        p.push(d.status==='erro' ? pill(false,`Sincronização ${quando} — com erro`, d.resumo) : pill(true,`Sincronização ${quando}`));
      }
    }catch(e){ /* sem a função: não mostra */ }
    if(temPermissao('expedicao.ver')){
      try{
        const s=await rpc('cn_expedicao_status_rotina',{p_usuario_id:USER.id})||{};
        if(s.erro) p.push(pill(false,`Listagem automática — erro${s.erro_em?' às '+hhmm(s.erro_em):''}`, s.erro));
        else if(s.gerada_em) p.push(pill(true,`Listagem automática ${hhmm(s.gerada_em)}`));
        else if(s.esperada) p.push(pill(false,'Listagem das 07:30 não foi gerada'));
        else if(s.dia_rotina) p.push(pill(null,'Listagem automática às 07:30'));
        else p.push(pill(null,'Sem listagem automática hoje'));
      }catch(e){}
    }
    f('rotinas').innerHTML=p.join('');
  }

  // ---------------------------------------------------------------
  // EXPEDIÇÃO HOJE: números da listagem principal mais recente de hoje
  // ---------------------------------------------------------------
  let LISTA_HOJE=null;
  async function expedicao(){
    const bloco=f('exp-bloco');
    if(!temPermissao('expedicao.ver')){ bloco.style.display='none'; return; }
    bloco.style.display='';
    try{
      const r=(await rpc('cn_expedicao_listas',{p_usuario_id:USER.id,p_pagina:1,p_por_pagina:20,p_de:hojeSP(),p_ate:hojeSP()}))||[];
      LISTA_HOJE=r.find(l=>l.tipo==='completa')||null;
    }catch(e){ LISTA_HOJE=null; }
    if(!LISTA_HOJE){
      f('exp').innerHTML=`<div class="ini-vazio">Nenhuma listagem de envios gerada hoje.${temPermissao('expedicao.gerar')?' <button class="act ini-gerar" data-gerar="1">Gerar listagem agora</button>':''}</div>`;
      f('exp-sub').textContent=''; return;
    }
    const t=LISTA_HOJE.totais||{};
    const atr=Number(t.atrasados)||0, env=Number(t.envios)||0;
    let etq='';
    if(temPermissao('expedicao.etiquetas')){
      try{
        const e=(await rpc('cn_etiquetas_listas',{p_usuario_id:USER.id,p_limite:20,p_de:hojeSP(),p_ate:hojeSP()}))||[];
        const x=e.find(l=>l.id===LISTA_HOJE.id);
        if(x) etq=`<button class="ini-num" data-tela="etiquetas"><span class="v">${x.emitidas}<small> de ${x.envios_me2}</small></span><span class="l">Etiquetas ML emitidas</span></button>`;
      }catch(e){}
    }
    f('exp-sub').textContent=`Listagem das ${hhmm(LISTA_HOJE.gerada_em)}${LISTA_HOJE.automatica?' (automática)':''}`;
    f('exp').innerHTML=
      `<button class="ini-num" data-abrir="${LISTA_HOJE.id}" style="--cor:#22c55e"><span class="v">${env-atr}</span><span class="l">Envios para hoje</span></button>`+
      `<button class="ini-num" data-abrir="${LISTA_HOJE.id}" style="--cor:#b91c1c"><span class="v">${atr}</span><span class="l">Atrasados</span></button>`+
      `<button class="ini-num" data-abrir="${LISTA_HOJE.id}" style="--cor:#2563eb"><span class="v">${Number(t.proximos_dias)||0}</span><span class="l">Próximos dias</span></button>`+
      `<button class="ini-num" data-abrir="${LISTA_HOJE.id}" style="--cor:#f59e0b"><span class="v">${Number(t.aguardando_nf)||0}</span><span class="l">Aguardando NF</span></button>`+
      etq;
  }

  // ---------------------------------------------------------------
  // TELAS DO SISTEMA: um box por GRUPO do menu (Expedição, Controle
  // Comercial…). Clicar no grupo abre, logo abaixo, um box para cada tela
  // daquele grupo. Tudo é montado a partir do PRÓPRIO menu: só aparecem
  // os grupos e telas que o perfil enxerga, e uma tela nova colocada no
  // menu entra aqui sozinha. A bolinha de pendências do menu vem junto.
  // ---------------------------------------------------------------
  const ICONES_GRUPO={
    'grp-expedicao':['#22c55e','<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>'],
    'grp-comercial':['#60a5fa','<path d="M3.5 3.5h6.6L21 14.4l-6.6 6.6L3.5 10.1z"/><circle cx="7.6" cy="7.6" r="1.4"/>'],
    'grp-financeiro':['#eab308','<path d="M3.5 20.5h17"/><path d="M6.8 20.5v-6.8M12 20.5V7.5M17.2 20.5v-4.2"/>'],
    'grp-produtos':['#a855f7','<path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/>'],
    'grp-cadastros':['#f472b6','<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.8c1.6.6 2.7 2.2 3 4.7"/>'],
  };
  let GRUPO_ABERTO=null;
  try{ GRUPO_ABERTO=localStorage.getItem('cn_ini_grupo'); }catch(e){}
  function lerMenu(){
    return [...document.querySelectorAll('#nav .navgroup')].map(g=>{
      const tit=(g.querySelector('.navtit')||{}).textContent||'';
      const telas=[...g.querySelectorAll('button[data-tela]')].filter(bt=>bt.style.display!=='none').map(bt=>{
        const dot=bt.querySelector('.badge-dot');
        // data-so-menu: aviso que fica só no menu lateral (ex.: Emissão de Etiquetas)
        const bad= dot && dot.style.display!=='none' && !dot.hasAttribute('data-so-menu') ? dot.textContent.trim() : '';
        return { tela:bt.dataset.tela, nome:((bt.querySelector('.nav-lbl')||{}).textContent||'').trim(),
                 ico:(bt.querySelector('svg')||{}).outerHTML||'', bad };
      });
      return { id:g.id, nome:tit.replace('▾','').trim(), telas };
    }).filter(g=>g.telas.length);
  }
  function grupos(){
    const G=lerMenu();
    if(GRUPO_ABERTO && !G.some(g=>g.id===GRUPO_ABERTO)) GRUPO_ABERTO=null;
    f('grupos').innerHTML=G.map(g=>{
      const [cor,ico]=ICONES_GRUPO[g.id]||['#94a3b8','<circle cx="12" cy="12" r="8"/>'];
      const pend=g.telas.reduce((s,t)=>s+(/^\d+$/.test(t.bad)?Number(t.bad):(t.bad?1:0)),0);
      return `<button class="ini-grupo${GRUPO_ABERTO===g.id?' on':''}" style="--cor:${cor}" data-grupo="${g.id}" title="Mostrar as telas de ${escH(g.nome)}">
          <span class="ini-gico"><svg viewBox="0 0 24 24">${ico}</svg></span>
          <span class="ini-gtx"><b>${escH(g.nome)}</b><span>${g.telas.length} ${g.telas.length===1?'tela':'telas'}</span></span>
          ${pend?`<span class="ini-gbad" title="Pendências neste grupo">${pend>99?'99+':pend}</span>`:''}</button>`;
    }).join('');
    const box=f('telas'), aberto=G.find(g=>g.id===GRUPO_ABERTO);
    if(!aberto){ box.style.display='none'; box.innerHTML=''; }
    else{
      const cor=(ICONES_GRUPO[aberto.id]||['#94a3b8'])[0];
      box.innerHTML=aberto.telas.map(t=>`<button class="ini-tela" style="--cor:${cor}" data-tela="${t.tela}">
          ${t.ico}<span class="t">${escH(t.nome)}</span>${t.bad?`<span class="ini-gbad">${escH(t.bad)}</span>`:''}</button>`).join('');
      box.style.display='';
    }
    f('mod-bloco').style.display=G.length?'':'none';
  }
  function alternarGrupo(id){
    GRUPO_ABERTO= GRUPO_ABERTO===id ? null : id;
    try{ if(GRUPO_ABERTO) localStorage.setItem('cn_ini_grupo',GRUPO_ABERTO); else localStorage.removeItem('cn_ini_grupo'); }catch(e){}
    grupos();
  }

  function saudacao(){
    const d=agoraSP(), h=d.getUTCHours();
    const oi= h<12 ? 'Bom dia' : h<18 ? 'Boa tarde' : 'Boa noite';
    const nome=String((USER&&USER.nome)||'').split(' ')[0];
    f('ola').textContent=`${oi}${nome?', '+nome:''}`;
    f('data').textContent=`${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }

  async function carregar(forcar){
    if(CARREGANDO) return;
    if(!forcar && Date.now()-ultimo<30000) return;
    CARREGANDO=true; ultimo=Date.now();
    saudacao(); grupos();
    try{
      await Promise.all([pendencias(), rotinas(), expedicao()]);
      // as bolinhas do menu chegam depois: redesenha os grupos com elas
      if(typeof atualizarBadges==='function'){ try{ await atualizarBadges(); }catch(e){} }
      grupos();
    }
    finally{ CARREGANDO=false; f('atualizado').textContent='Atualizado às '+agoraSP().toISOString().slice(11,16); }
  }

  // navegação a partir dos cartões
  function ir(tela){
    if(tela==='expedicao' && typeof EXP!=='undefined' && EXP.abrirPendente){ EXP.abrirPendente(); return; }
    mostrarTela(tela);
  }
  function bind(){
    $('scr-inicio').addEventListener('click',(ev)=>{
      const c=ev.target.closest('[data-tela]'); if(c){ ir(c.dataset.tela); return; }
      const g=ev.target.closest('[data-grupo]'); if(g){ alternarGrupo(g.dataset.grupo); return; }
      if(ev.target.closest('[data-gerar]')){ mostrarTela('expedicao'); const b=$('ex-gerar'); if(b && !b.disabled) setTimeout(()=>b.click(),300); return; }
      const l=ev.target.closest('[data-abrir]');
      if(l){ mostrarTela('expedicao'); if(typeof EXP!=='undefined' && EXP.abrirLista) setTimeout(()=>EXP.abrirLista(Number(l.dataset.abrir)),200); }
    });
    f('recarregar').addEventListener('click',()=>{ carregar(true); if(typeof atualizarBadges==='function') atualizarBadges(); });
    // a cada 2 minutos, se a tela estiver aberta
    setInterval(()=>{ if($('scr-inicio').classList.contains('active')) carregar(true); }, 120000);
  }
  async function init(){ bind(); await carregar(true); }
  return { init, carregar };
})();

registrarTela('inicio', INI);
