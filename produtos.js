// =====================================================================
// CARRINHOS_NET — TELA: Cadastro de Produtos
// Depende da base do index.html: $, rpc, USER, temPermissao,
// dataBr, registrarTela.
// =====================================================================
const PD = (function(){
  let LINHAS=[], PAGINA=0, TOTAL=0, EDIT_ID=null; const POR=100;
  let OPC={ tipo_sku:[], categoria_produto:[], unidade_medida:[], origem_produto:[] };
  let SKUS_CACHE=[];            // lista de SKUs simples p/ autocomplete de componentes
  let COMPONENTES=[];           // estado do drawer (kit): [{sku, qtd}]
  let IMAGENS=[];               // estado do drawer: [{url, padrao}]
  const f=(id)=>$('pd-'+id);

  function filtros(){ return {
    p_usuario_id:USER.id,
    p_tipo:f('tipo').value||null,
    p_categoria:f('categoria').value||null,
    p_origem:f('origem').value||null,
    p_ativo:f('ativo').value===''?null:(f('ativo').value==='true'),
    p_status:f('status').value||null,
    p_busca:f('busca').value.trim()||null
  }; }

  async function init(){ await carregarOpcoes(); carregar(); bind(); }

  // ---------- opções (dropdowns) ----------
  async function carregarOpcoes(){
    try{
      const r=await rpc('cn_listar_opcoes_produto',{p_usuario_id:USER.id,p_tipo:null});
      OPC={tipo_sku:[],categoria_produto:[],unidade_medida:[],origem_produto:[]};
      (r||[]).forEach(o=>{ if(!OPC[o.tipo])OPC[o.tipo]=[]; OPC[o.tipo].push(o.valor); });
    }catch(e){}
    // filtros do topo
    OPC.tipo_sku.forEach(v=>addOpt('tipo',v));
    OPC.categoria_produto.forEach(v=>addOpt('categoria',v));
    OPC.origem_produto.forEach(v=>addOpt('origem',v));
    // selects do drawer
    fillSel('e-tipo',OPC.tipo_sku);
    fillSel('e-categoria',OPC.categoria_produto);
    fillSel('e-origem',OPC.origem_produto);
    fillSel('e-unidade',OPC.unidade_medida);
  }
  function addOpt(id,v){ const o=document.createElement('option'); o.value=v;o.textContent=v; f(id).appendChild(o); }
  function fillSel(id,arr){ const s=f(id); if(!s)return; s.innerHTML=arr.map(v=>`<option value="${v}">${v}</option>`).join(''); }

  // ---------- listagem ----------
  async function carregar(reset){ if(reset)PAGINA=0; f('tbody').innerHTML='<tr><td colspan="11" class="loading">Carregando produtos…</td></tr>'; const fl=filtros();
    try{ const [linhas,total,kpis]=await Promise.all([
        rpc('cn_listar_produtos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:POR,p_offset:PAGINA*POR}),
        rpc('cn_contar_produtos',fl),
        rpc('cn_kpis_produtos',fl)
      ]);
      LINHAS=linhas||[]; TOTAL=Number(total)||0; renderKpis(kpis&&kpis[0]); renderTabela(); renderPag();
      f('msg').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){ f('tbody').innerHTML='<tr><td colspan="11" class="empty">Erro: '+(e.message||e)+'</td></tr>'; } }

  function renderPag(){ const tp=Math.max(1,Math.ceil(TOTAL/POR)),p=PAGINA+1,i=TOTAL===0?0:PAGINA*POR+1,fm=Math.min((PAGINA+1)*POR,TOTAL); f('contagem').textContent=TOTAL===0?'0 registros':`${i}–${fm} de ${TOTAL}`; f('paginfo').textContent=`Página ${p} de ${tp}`; f('prev').disabled=PAGINA<=0; f('next').disabled=p>=tp; }

  function renderKpis(k){ const box=f('kpis'); if(!k){box.innerHTML='';return;}
    const cards=[
      ['Total de produtos',Number(k.total||0).toLocaleString('pt-BR')],
      ['Ativos',Number(k.ativos||0).toLocaleString('pt-BR')],
      ['Inativos',Number(k.inativos||0).toLocaleString('pt-BR')],
      ['Cadastro Básico',Number(k.basico||0).toLocaleString('pt-BR')],
      ['Intermediário',Number(k.intermediario||0).toLocaleString('pt-BR')],
      ['Completo',Number(k.completo||0).toLocaleString('pt-BR')]
    ];
    box.innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${c[1]}</div></div>`).join('');
  }

  function statusPill(st){ const cor = st==='Completo'?'#22c55e':(st==='Intermediário'?'#f59e0b':'#94a3b8');
    return `<span class="pill" style="border-color:${cor};color:${cor}">${st||'—'}</span>`; }
  function tipoPill(t){ return `<span class="pill">${t||'—'}</span>`; }

  function renderTabela(){ const tb=f('tbody'); if(!LINHAS.length){ tb.innerHTML='<tr><td colspan="11" class="empty">Nenhum produto encontrado.</td></tr>'; return; }
    const podeEditar=temPermissao('produtos.editar');
    tb.innerHTML=LINHAS.map(l=>`<tr class="${l.ativo?'':'pendente'}" ${podeEditar?`style="cursor:pointer" onclick="PD.abrir(${l.id})"`:''}>
      <td><b>${l.sku||'—'}</b></td><td>${tipoPill(l.tipo_sku)}</td><td>${l.categoria||'—'}</td><td>${l.descricao||'—'}</td><td>${l.origem||'—'}</td>
      <td>${l.unidade_medida||'—'}</td><td class="num">${l.quantidade??'—'}</td><td>${l.ncm||'—'}</td>
      <td class="num">${l.qtd_componentes>0?l.qtd_componentes:'—'}</td><td>${statusPill(l.status)}</td>
      <td>${l.ativo?'<span class="pill">Ativo</span>':'<span class="pill" style="color:var(--muted)">Inativo</span>'}</td>
    </tr>`).join('');
  }

  // ---------- helpers de nomenclatura (espelho da planilha) ----------
  function unidadePorExtenso(u){ const m={ 'M':'metros','cm':'centímetros','Kg':'quilos','g':'gramas','L':'litros','mL':'mililitros','Un':'unidades','M²':'metros quadrados','M³':'metros cúbicos' }; return m[u]||u; }
  function fmtQtd(n){ return String(n).replace('.',','); }
  function sugerirSku(tipo,skupai,qtd,unidade){ if(!skupai||qtd==null||qtd==='')return '';
    if(tipo==='Combo') return skupai+'-KIT'+parseInt(qtd);
    if(tipo==='Fracionado') return skupai+'-'+fmtQtd(qtd)+(unidade||'');
    return ''; }
  function sugerirDescricao(tipo,skupai,qtd,unidade,skusec){ if(tipo==='Combo'&&skupai&&qtd) return 'COMBO COM '+parseInt(qtd)+' UNIDADES DO MODELO '+skupai;
    if(tipo==='Fracionado'&&skupai&&qtd) return fmtQtd(qtd)+' '+unidadePorExtenso(unidade)+' DO MODELO '+skupai;
    if(tipo==='Kit'&&skupai) return 'KIT COM '+skupai+(skusec?' + '+skusec:'');
    return ''; }

  // ---------- drawer ----------
  function tipoAtual(){ return f('e-tipo').value; }

  function ajustarPorTipo(){ const t=tipoAtual();
    const bloco=f('bloco-composicao'), kitLista=f('kit-lista'), fldQtdPai=f('fld-qtdpai');
    const lblPai=f('lbl-pai'), lblQtdPai=f('lbl-qtdpai'), hint=f('comp-hint');
    if(t==='Simples'||!t){ bloco.style.display='none'; return; }
    bloco.style.display='block';
    if(t==='Kit'){
      kitLista.style.display='block'; fldQtdPai.style.display='none';
      lblPai.textContent='SKU do produto-pai (principal)';
      hint.textContent='— o SKU do Kit é digitado manualmente';
    } else if(t==='Combo'){
      kitLista.style.display='none'; fldQtdPai.style.display='block';
      lblPai.textContent='SKU do produto-pai'; lblQtdPai.textContent='Quantidade de unidades';
      hint.textContent='— SKU e descrição gerados automaticamente';
    } else if(t==='Fracionado'){
      kitLista.style.display='none'; fldQtdPai.style.display='block';
      lblPai.textContent='SKU do produto-master'; lblQtdPai.textContent='Quantidade fracionada (ex.: 0,5)';
      hint.textContent='— SKU e descrição gerados automaticamente';
    }
    recomputarAuto();
  }

  // Recalcula SKU/descrição sugeridos para Combo/Fracionado (não sobrescreve edição manual do usuário em Kit)
  function recomputarAuto(){ const t=tipoAtual();
    if(t!=='Combo'&&t!=='Fracionado')return;
    const skupai=f('e-skupai').value.trim(); const qtd=f('e-qtdpai').value; const un=f('e-unidade').value;
    const sku=sugerirSku(t,skupai,qtd,un); const desc=sugerirDescricao(t,skupai,qtd,un);
    if(sku){ f('e-sku').value=sku; }
    if(desc){ f('e-descricao').value=desc; }
  }

  // ---- componentes (kit) ----
  function renderComponentes(){ const box=f('componentes');
    box.innerHTML=COMPONENTES.map((c,i)=>`<div class="grid" style="margin-bottom:6px">
      <div class="fld"><label>SKU componente ${i+1}</label><input value="${c.sku||''}" list="pd-datalist-skus" onchange="PD.setComp(${i},'sku',this.value)"></div>
      <div class="fld"><label>Qtd <button class="mini dg" style="float:right" onclick="PD.rmComp(${i})">remover</button></label><input type="number" step="0.0001" value="${c.qtd??1}" onchange="PD.setComp(${i},'qtd',this.value)"></div>
    </div>`).join('');
  }
  function addComp(){ COMPONENTES.push({sku:'',qtd:1}); renderComponentes(); }
  function rmComp(i){ COMPONENTES.splice(i,1); renderComponentes(); }
  function setComp(i,campo,val){ if(!COMPONENTES[i])return; COMPONENTES[i][campo]= campo==='qtd'?(val===''?null:Number(val)):val; if(campo==='sku'){ const sec=COMPONENTES[0]?.sku; const d=sugerirDescricao('Kit',f('e-skupai').value.trim(),null,null,sec); if(d && !f('e-descricao').value) f('e-descricao').value=d; } }

  // ---- imagens ----
  function renderImagens(){ const box=f('imagens');
    box.innerHTML=IMAGENS.map((im,i)=>`<div class="grid" style="margin-bottom:6px">
      <div class="fld full"><label>URL ${i+1}
        <label style="float:right;font-size:11px;color:var(--muted)"><input type="radio" name="pd-img-padrao" ${im.padrao?'checked':''} onchange="PD.setPadrao(${i})"> padrão</label>
        <button class="mini dg" style="float:right;margin-right:8px" onclick="PD.rmImg(${i})">remover</button></label>
        <input value="${im.url||''}" placeholder="https://…" onchange="PD.setImg(${i},this.value)"></div>
    </div>`).join('');
  }
  function addImg(){ if(IMAGENS.length>=20){ alert('Máximo de 20 imagens.'); return; } IMAGENS.push({url:'',padrao:IMAGENS.length===0}); renderImagens(); }
  function rmImg(i){ const eraPadrao=IMAGENS[i].padrao; IMAGENS.splice(i,1); if(eraPadrao&&IMAGENS.length)IMAGENS[0].padrao=true; renderImagens(); }
  function setImg(i,v){ if(IMAGENS[i])IMAGENS[i].url=v; }
  function setPadrao(i){ IMAGENS.forEach((im,ix)=>im.padrao=(ix===i)); }

  // ---- abrir novo / edição ----
  function novo(){ if(!temPermissao('produtos.criar')){ alert('Sem permissão para criar produtos.'); return; }
    EDIT_ID=null; f('erro').textContent=''; f('titulo').textContent='Novo produto';
    f('e-tipo').value='Simples'; f('e-ativo').value='true';
    f('e-categoria').selectedIndex=0; f('e-origem').selectedIndex=0; f('e-unidade').selectedIndex=0;
    ['e-sku','e-descricao','e-ncm','e-ean','e-qtd','e-altura','e-largura','e-comprimento','e-peso','e-desclonga','e-caract','e-skupai','e-qtdpai'].forEach(id=>{ if(f(id))f(id).value=''; });
    COMPONENTES=[]; IMAGENS=[]; renderComponentes(); renderImagens();
    ajustarPorTipo(); f('c-status').value='Básico (novo)';
    f('excluir').style.display='none';   // novo produto ainda não existe, nada a excluir
    abre();
  }

  async function abrir(id){ if(!temPermissao('produtos.editar'))return; f('erro').textContent=''; f('titulo').textContent='Editar produto'; EDIT_ID=id;
    let p; try{ p=await rpc('cn_obter_produto',{p_usuario_id:USER.id,p_produto_id:id}); }catch(e){ alert(e.message||e); return; }
    if(!p){ alert('Produto não encontrado.'); return; }
    f('e-tipo').value=p.tipo_sku||'Simples'; f('e-ativo').value=String(p.ativo);
    setSelSafe('e-categoria',p.categoria); setSelSafe('e-origem',p.origem); setSelSafe('e-unidade',p.unidade_medida);
    f('e-sku').value=p.sku||''; f('e-descricao').value=p.descricao||''; f('e-ncm').value=p.ncm||''; f('e-ean').value=p.ean||'';
    f('e-qtd').value=p.quantidade??''; f('e-altura').value=p.dim_altura??''; f('e-largura').value=p.dim_largura??''; f('e-comprimento').value=p.dim_comprimento??''; f('e-peso').value=p.peso??'';
    f('e-desclonga').value=p.descricao_longa||''; f('e-caract').value=p.caracteristicas||'';
    // composição
    COMPONENTES=(p.componentes||[]).map(c=>({sku:c.componente_sku,qtd:c.quantidade}));
    f('e-skupai').value=''; f('e-qtdpai').value='';
    if((p.tipo_sku==='Combo'||p.tipo_sku==='Fracionado') && COMPONENTES.length===1){ f('e-skupai').value=COMPONENTES[0].sku||''; f('e-qtdpai').value=COMPONENTES[0].qtd??''; }
    // imagens
    IMAGENS=(p.imagens||[]).map(im=>({url:im.url,padrao:im.eh_padrao}));
    renderComponentes(); renderImagens();
    ajustarPorTipo(); f('c-status').value=p.status||'—';
    f('excluir').style.display = temPermissao('produtos.excluir') ? '' : 'none';
    f('excluir').textContent = 'Excluir produto';
    abre();
  }
  function setSelSafe(id,val){ const s=f(id); if(!s)return; if(val&&![...s.options].some(o=>o.value===val)){ const o=document.createElement('option'); o.value=val;o.textContent=val; s.appendChild(o); } s.value=val||''; }

  function abre(){ f('overlay').classList.add('open'); f('drawer').classList.add('open'); }
  function fechar(){ f('overlay').classList.remove('open'); f('drawer').classList.remove('open'); EDIT_ID=null; }

  // monta o array de componentes conforme o tipo
  function montarComponentes(){ const t=tipoAtual();
    if(t==='Combo'||t==='Fracionado'){ const sku=f('e-skupai').value.trim(); const q=f('e-qtdpai').value;
      if(!sku) return []; return [{componente_sku:sku, quantidade:(q===''?1:Number(q)), ordem:0}]; }
    if(t==='Kit'){ return COMPONENTES.filter(c=>c.sku&&c.sku.trim()).map((c,i)=>({componente_sku:c.sku.trim(), quantidade:(c.qtd==null?1:Number(c.qtd)), ordem:i})); }
    return [];
  }

  async function salvar(){ f('erro').textContent=''; const b=f('save'); b.disabled=true; b.textContent='Salvando...';
    const num=(id)=>{const v=f(id).value;return v===''?null:Number(v);};
    try{
      const args={
        p_usuario_id:USER.id, p_id:EDIT_ID,
        p_sku:f('e-sku').value.trim(), p_tipo_sku:f('e-tipo').value, p_categoria:f('e-categoria').value,
        p_origem:f('e-origem').value, p_descricao:f('e-descricao').value.trim(), p_ncm:f('e-ncm').value.trim(),
        p_unidade_medida:f('e-unidade').value, p_quantidade:num('e-qtd'),
        p_descricao_longa:f('e-desclonga').value.trim()||null, p_ncm_opt:null,
        p_dim_altura:num('e-altura'), p_dim_largura:num('e-largura'), p_dim_comprimento:num('e-comprimento'),
        p_peso:num('e-peso'), p_caracteristicas:f('e-caract').value.trim()||null, p_ean:f('e-ean').value.trim()||null,
        p_ativo:f('e-ativo').value==='true',
        p_componentes:montarComponentes(),
        p_imagens:IMAGENS.filter(im=>im.url&&im.url.trim()).map((im,i)=>({url:im.url.trim(),eh_padrao:!!im.padrao,ordem:i}))
      };
      await rpc('cn_salvar_produto',args);
      fechar(); await carregar(true); await recarregarSkusCache();
    }catch(e){ f('erro').textContent='Erro ao salvar: '+(e.message||e); } finally{ b.disabled=false; b.textContent='Salvar'; }
  }

  // cache de SKUs (para autocomplete de componentes)
  async function recarregarSkusCache(){ try{ const r=await rpc('cn_listar_produtos',{p_usuario_id:USER.id,p_limite:1000,p_offset:0,p_ordem:'sku'}); SKUS_CACHE=(r||[]).map(x=>x.sku); const dl=$('pd-datalist-skus'); if(dl) dl.innerHTML=SKUS_CACHE.map(s=>`<option value="${s}">`).join(''); }catch(e){} }

  async function exportar(){ const b=f('exportar'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{ const fl=filtros(); const todas=await rpc('cn_listar_produtos',{...fl,p_ordem:f('ordem').value||'recentes',p_limite:100000,p_offset:0}); if(!todas||!todas.length)return;
      const cols=['sku','tipo_sku','categoria','descricao','origem','unidade_medida','quantidade','ncm','qtd_componentes','status','ativo'];
      const head=['SKU','Tipo','Categoria','Descricao','Origem','Unidade','Quantidade','NCM','Componentes','Status','Ativo'];
      const ls=todas.map(l=>cols.map(c=>{let v=l[c];if(v==null)v='';v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
      const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='produtos_carrinhos_net.csv'; a.click();
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; } }

  // =====================================================================
  // IMPORT / EXPORT EXCEL
  // =====================================================================
  let IMP_LINHAS=[];   // linhas normalizadas do arquivo, prontas p/ enviar

  const im=(id)=>$('pdimp-'+id);

  // mapa: nome da aba -> {tipo, mapeamento de cabeçalho da planilha -> campo interno}
  // cabeçalhos são comparados de forma tolerante (minúsculo, sem acento, sem *).
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\*/g,'').trim(); }

  const MAP_COMUM = {
    'sku':'sku', 'categoria':'categoria', 'origem':'origem', 'descricao':'descricao',
    'ncm':'ncm', 'unidade':'unidade_medida', 'quantidade':'quantidade', 'ean':'ean',
    'peso (kg)':'peso', 'altura (cm)':'dim_altura', 'largura (cm)':'dim_largura',
    'comprimento (cm)':'dim_comprimento', 'descricao longa':'descricao_longa',
    'caracteristicas tecnicas':'caracteristicas'
  };
  function mapImagens(k){ return norm(k).startsWith('imagens'); }
  function mapComponentes(k){ return norm(k).startsWith('componentes'); }

  function abrirImport(){ if(!temPermissao('produtos.importar')){ alert('Sem permissão para importar.'); return; }
    IMP_LINHAS=[]; im('erro').textContent=''; im('status').textContent=''; im('file').value='';
    im('step1').style.display='block'; im('step2').style.display='none'; im('sim').checked=true;
    im('confirmar').style.display='none';
    $('pdimp-modal').classList.add('open');
  }
  function fecharImport(){ $('pdimp-modal').classList.remove('open'); }

  // lê o arquivo e monta IMP_LINHAS
  async function lerArquivo(){
    const inp=im('file'); if(!inp.files||!inp.files[0]){ im('erro').textContent='Selecione um arquivo.'; return false; }
    im('erro').textContent=''; im('status').textContent='Lendo arquivo…';
    const buf=await inp.files[0].arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const linhas=[];
    const abas=[['Simples','Simples'],['Kit','Kit'],['Combo','Combo'],['Fracionado','Fracionado']];
    for(const [abaNome,tipo] of abas){
      const ws=wb.Sheets[abaNome]; if(!ws) continue;
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); if(!rows.length) continue;
      const head=rows[0].map(h=>norm(h));
      // localizar índices
      for(let r=1;r<rows.length;r++){
        const row=rows[r]; if(!row || row.every(c=>String(c).trim()==='')) continue;
        // pular a linha de exemplo do template (heurística: 1ª linha de dados idêntica ao exemplo conhecido)
        const obj=montarObj(tipo,head,row,abaNome,r+1);
        if(obj) linhas.push(obj);
      }
    }
    IMP_LINHAS=linhas;
    if(!linhas.length){ im('erro').textContent='Nenhuma linha de dados encontrada nas abas Simples/Kit/Combo/Fracionado.'; im('status').textContent=''; return false; }
    im('status').textContent=`${linhas.length} linha(s) lida(s).`;
    return true;
  }

  function valCol(head,row,alvoTest){ for(let i=0;i<head.length;i++){ if(alvoTest(head[i])) return row[i]; } return ''; }
  function getByMap(head,row,mapKey){ for(let i=0;i<head.length;i++){ if(MAP_COMUM[head[i]]===mapKey) return row[i]; } return ''; }

  // SKUs das linhas de exemplo do template — puladas automaticamente na importação
  const EXEMPLOS_TEMPLATE = new Set(['GE20','KIT-PD90-PD70','ABAR1200','CE8MM']);

  function montarObj(tipo,head,row,aba,linhaNum){
    const o={ tipo_sku:tipo, _aba:aba, _linha:linhaNum };
    // campos comuns via MAP_COMUM
    for(const campo of ['sku','categoria','origem','descricao','ncm','unidade_medida','quantidade','ean','peso','dim_altura','dim_largura','dim_comprimento','descricao_longa','caracteristicas']){
      const v=getByMap(head,row,campo); if(v!=='' && v!=null) o[campo]=String(v).trim();
    }
    // imagens (coluna que começa com "imagens")
    const imgs=valCol(head,row,mapImagens);
    if(imgs){ o.imagens=String(imgs).split(';').map(s=>s.trim()).filter(Boolean); }
    // por tipo
    if(tipo==='Kit'){
      const comp=valCol(head,row,mapComponentes);
      if(comp){ o.componentes=String(comp).split(';').map(par=>{ const [sku,q]=par.split(':'); return {sku:(sku||'').trim(), quantidade:(q||'1').trim()}; }).filter(c=>c.sku); }
    } else if(tipo==='Combo' || tipo==='Fracionado'){
      // colunas específicas: SKU-Pai/SKU-Master e Quantidade no Combo/Fracionada
      o.sku_pai = String(valCol(head,row,k=>{ const n=norm(k); return n==='sku-pai'||n==='sku-master'; })||'').trim();
      o.quantidade_composicao = String(valCol(head,row,k=>{ const n=norm(k); return n.startsWith('quantidade no combo')||n.startsWith('quantidade fracionada'); })||'').trim();
      // SKU e descrição podem vir vazios (auto). Se preenchidos, usa.
      const skuManual=String(valCol(head,row,k=>norm(k)==='sku'||norm(k).startsWith('sku (deixe'))||'').trim();
      if(skuManual) o.sku=skuManual;
      const descManual=String(valCol(head,row,k=>norm(k)==='descricao'||norm(k).startsWith('descricao (deixe'))||'').trim();
      if(descManual) o.descricao=descManual;
      if(!o.unidade_medida){ const u=String(valCol(head,row,k=>norm(k)==='unidade')||'').trim(); if(u)o.unidade_medida=u; }
    }
    // pula a linha de exemplo do template (SKU ou SKU-pai de exemplo, exatamente na 2ª linha)
    const skuRef = o.sku || o.sku_pai;
    if(linhaNum===2 && EXEMPLOS_TEMPLATE.has(skuRef)) return null;
    return o;
  }

  async function processarImport(){
    const b=im('processar'); b.disabled=true;
    try{
      const ok=await lerArquivo(); if(!ok){ b.disabled=false; return; }
      const simular=im('sim').checked; const modo=im('modo').value;
      im('status').textContent=simular?'Simulando…':'Importando…';
      const rel=await rpc('cn_importar_produtos',{p_usuario_id:USER.id,p_linhas:IMP_LINHAS,p_modo:modo,p_simulacao:simular});
      mostrarRelatorio(rel,simular);
    }catch(e){ im('erro').textContent='Erro: '+(e.message||e); }
    finally{ b.disabled=false; im('status').textContent=''; }
  }

  function mostrarRelatorio(rel,simulado){
    im('step1').style.display='none'; im('step2').style.display='block';
    const cards=[
      ['Total',rel.total||0],['Criados',rel.criados||0],['Atualizados',rel.atualizados||0],
      ['Ignorados',rel.ignorados||0],['Erros',rel.erros||0]
    ];
    im('resumo').innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${Number(c[1]).toLocaleString('pt-BR')}</div></div>`).join('');
    const itens=rel.itens||[];
    im('itens').innerHTML = itens.length ? itens.map(it=>{
      const cor = it.acao==='erro'?'#ef4444':(it.acao&&it.acao.startsWith('ignorado')?'#94a3b8':'#22c55e');
      return `<tr><td>${it.aba||'—'}</td><td>${it.linha||'—'}</td><td>${it.sku||'—'}</td><td><span class="pill" style="border-color:${cor};color:${cor}">${it.acao||'—'}</span></td><td>${it.mensagem||''}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">Sem itens.</td></tr>';
    // se foi simulação e não houve erro fatal, oferece confirmar
    im('confirmar').style.display = simulado ? '' : 'none';
  }

  async function confirmarImport(){ // re-processa sem simulação
    const b=im('confirmar'); b.disabled=true; b.textContent='Importando…';
    try{
      const modo=im('modo').value;
      const rel=await rpc('cn_importar_produtos',{p_usuario_id:USER.id,p_linhas:IMP_LINHAS,p_modo:modo,p_simulacao:false});
      mostrarRelatorio(rel,false); await carregar(true); await recarregarSkusCache();
    }catch(e){ im('erro').textContent='Erro: '+(e.message||e); }
    finally{ b.disabled=false; b.textContent='Confirmar importação'; }
  }

  // -------- EXPORT XLSX (no mesmo formato do template) --------
  async function exportarXlsx(){ const b=f('exportar-xlsx'); b.disabled=true; const t=b.textContent; b.textContent='Gerando…';
    try{
      const dados=await rpc('cn_exportar_produtos',{p_usuario_id:USER.id}); if(!dados||!dados.length){ alert('Nenhum produto para exportar.'); return; }
      const porTipo={Simples:[],Kit:[],Combo:[],Fracionado:[]};
      dados.forEach(p=>{ (porTipo[p.tipo_sku]=porTipo[p.tipo_sku]||[]).push(p); });
      const wb=XLSX.utils.book_new();
      // Simples
      addAba(wb,'Simples',porTipo.Simples,p=>({
        'SKU *':p.sku,'Categoria *':p.categoria,'Origem *':p.origem,'Descrição *':p.descricao,'NCM *':p.ncm,
        'Unidade *':p.unidade_medida,'Quantidade *':p.quantidade,'EAN':p.ean||'','Peso (kg)':p.peso||'',
        'Altura (cm)':p.dim_altura||'','Largura (cm)':p.dim_largura||'','Comprimento (cm)':p.dim_comprimento||'',
        'Descrição Longa':p.descricao_longa||'','Características Técnicas':p.caracteristicas||'','Imagens (URLs separadas por ;)':p.imagens||''
      }));
      addAba(wb,'Kit',porTipo.Kit,p=>({
        'SKU *':p.sku,'Categoria *':p.categoria,'Origem *':p.origem,'Descrição *':p.descricao,'NCM *':p.ncm,
        'Unidade *':p.unidade_medida,'Quantidade *':p.quantidade,'Componentes (SKU:qtd separados por ;) *':p.componentes||'',
        'EAN':p.ean||'','Peso (kg)':p.peso||'','Imagens (URLs separadas por ;)':p.imagens||''
      }));
      addAba(wb,'Combo',porTipo.Combo,p=>({
        'SKU':p.sku,'Categoria *':p.categoria,'Origem *':p.origem,'NCM *':p.ncm,'Unidade *':p.unidade_medida,
        'Descrição':p.descricao,'Componentes (SKU:qtd)':p.componentes||'','EAN':p.ean||'','Peso (kg)':p.peso||'','Imagens (URLs separadas por ;)':p.imagens||''
      }));
      addAba(wb,'Fracionado',porTipo.Fracionado,p=>({
        'SKU':p.sku,'Categoria *':p.categoria,'Origem *':p.origem,'NCM *':p.ncm,'Unidade *':p.unidade_medida,
        'Descrição':p.descricao,'Componentes (SKU:qtd)':p.componentes||'','EAN':p.ean||'','Peso (kg)':p.peso||'','Imagens (URLs separadas por ;)':p.imagens||''
      }));
      XLSX.writeFile(wb,'produtos_carrinhos_net.xlsx');
    }catch(e){ alert('Erro ao exportar: '+(e.message||e)); } finally{ b.disabled=false; b.textContent=t; }
  }
  function addAba(wb,nome,lista,fn){ const arr=(lista||[]).map(fn); const ws=XLSX.utils.json_to_sheet(arr.length?arr:[fn({})]); XLSX.utils.book_append_sheet(wb,ws,nome); }

  // =====================================================================
  // CONFERÊNCIA COM O BLING (só existência por SKU — não altera dados)
  // =====================================================================
  let CONF_ITENS=[];
  const cf=(id)=>$('pdconf-'+id);

  function abrirConf(){ if(!temPermissao('produtos.sincronizar')){ alert('Sem permissão para conferir com o Bling.'); return; }
    cf('erro').textContent=''; cf('status').textContent=''; cf('resultado').style.display='none'; CONF_ITENS=[];
    $('pdconf-modal').classList.add('open');
  }
  function fecharConf(){ $('pdconf-modal').classList.remove('open'); }

  async function rodarConf(){ const b=cf('rodar'); if(b.disabled)return; b.disabled=true; cf('erro').textContent='';
    try{
      cf('status').textContent='Buscando códigos no Bling…';
      const sit = cf('ativos').checked ? 'ativos' : 'todas';
      const resp = await chamarFuncao('bling-produtos-codigos',{situacao:sit});
      const codigos = resp.codigos||[];
      cf('status').textContent=`Comparando ${codigos.length} códigos do Bling…`;
      const rel = await rpc('cn_conferir_produtos_bling',{p_usuario_id:USER.id,p_codigos:codigos,p_incluir_ambos:true});
      CONF_ITENS = rel.itens||[];
      renderConfKpis(rel); renderConfItens(); cf('resultado').style.display='block';
      cf('status').textContent='Conferência concluída '+new Date().toLocaleTimeString('pt-BR');
      if(typeof atualizarBadges==='function') atualizarBadges();
    }catch(e){ cf('erro').textContent='Erro: '+(e.message||e); cf('status').textContent=''; }
    finally{ b.disabled=false; }
  }

  function renderConfKpis(rel){
    const cards=[
      ['Total no Bling',rel.total_bling||0],
      ['Total no sistema',rel.total_sistema||0],
      ['Em ambos',rel.qtd_ambos||0],
      ['Só no Bling',rel.qtd_so_bling||0],
      ['Só no sistema',rel.qtd_so_sistema||0]
    ];
    cf('kpis').innerHTML=cards.map(c=>`<div class="kpi"><div class="lbl">${c[0]}</div><div class="val">${Number(c[1]).toLocaleString('pt-BR')}</div></div>`).join('');
  }

  function confSituacaoLabel(s){ return s==='so_bling'?'Só no Bling':(s==='so_sistema'?'Só no sistema':'Em ambos'); }
  function confSituacaoCor(s){ return s==='so_bling'?'#3b82f6':(s==='so_sistema'?'#a855f7':'#22c55e'); }

  function renderConfItens(){
    const filtro=cf('filtro').value;
    let lista=CONF_ITENS.slice();
    if(filtro==='desacordo') lista=lista.filter(i=>i.situacao!=='ambos');
    else if(filtro!=='todos') lista=lista.filter(i=>i.situacao===filtro);
    const tb=cf('itens');
    if(!lista.length){ tb.innerHTML='<tr><td colspan="5" class="empty">Nenhum item nesta categoria.</td></tr>'; return; }
    tb.innerHTML=lista.map(i=>{
      const cor=confSituacaoCor(i.situacao);
      const ativo = i.situacao==='so_bling' ? (i.ativo_bling?'Sim':'Não')
                  : i.situacao==='so_sistema' ? (i.ativo_sistema?'Sim':'Não')
                  : (i.ativo_sistema?'Sim':'Não');
      return `<tr>
        <td><span class="pill" style="border-color:${cor};color:${cor}">${confSituacaoLabel(i.situacao)}</span></td>
        <td><b>${i.sku||'—'}</b></td><td>${i.descricao||'—'}</td><td>${i.tipo_sku||'—'}</td><td>${ativo}</td>
      </tr>`;
    }).join('');
  }

  function exportarConf(){ if(!CONF_ITENS.length)return;
    const filtro=cf('filtro').value; let lista=CONF_ITENS.slice();
    if(filtro==='desacordo') lista=lista.filter(i=>i.situacao!=='ambos');
    else if(filtro!=='todos') lista=lista.filter(i=>i.situacao===filtro);
    const head=['Situacao','SKU','Descricao','Tipo','AtivoSistema','AtivoBling'];
    const ls=lista.map(i=>[confSituacaoLabel(i.situacao),i.sku||'',i.descricao||'',i.tipo_sku||'',
      (i.ativo_sistema==null?'':(i.ativo_sistema?'Sim':'Nao')),(i.ativo_bling==null?'':(i.ativo_bling?'Sim':'Nao'))]
      .map(v=>{v=String(v).replace(/"/g,'""');return /[",;\n]/.test(v)?`"${v}"`:v;}).join(';'));
    const csv=[head.join(';'),...ls].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='conferencia_bling_carrinhos_net.csv'; a.click();
  }

  function bind(){
    let bt; f('busca').addEventListener('input',()=>{ clearTimeout(bt); bt=setTimeout(()=>carregar(true),400); });
    ['tipo','categoria','origem','status','ativo','ordem'].forEach(id=>f(id).addEventListener('change',()=>carregar(true)));
    f('btn-filtrar').addEventListener('click',()=>carregar(true));
    f('novo').addEventListener('click',novo); f('exportar').addEventListener('click',exportar);
    f('prev').addEventListener('click',()=>{ if(PAGINA>0){ PAGINA--; carregar(); } }); f('next').addEventListener('click',()=>{ PAGINA++; carregar(); });
    // drawer
    f('x').addEventListener('click',fechar); f('cancel').addEventListener('click',fechar); f('overlay').addEventListener('click',fechar); f('save').addEventListener('click',salvar);
    f('excluir').addEventListener('click',excluirAtual);
    f('e-tipo').addEventListener('change',ajustarPorTipo);
    ['e-skupai','e-qtdpai'].forEach(id=>f(id).addEventListener('input',recomputarAuto));
    f('e-unidade').addEventListener('change',recomputarAuto);
    f('add-comp').addEventListener('click',addComp);
    f('add-img').addEventListener('click',addImg);
    // import/export
    f('importar').addEventListener('click',abrirImport);
    f('exportar-xlsx').addEventListener('click',exportarXlsx);
    im('x').addEventListener('click',fecharImport);
    im('processar').addEventListener('click',processarImport);
    im('confirmar').addEventListener('click',confirmarImport);
    im('voltar').addEventListener('click',()=>{ im('step2').style.display='none'; im('step1').style.display='block'; });
    im('fechar2').addEventListener('click',fecharImport);
    // conferência bling
    f('conferir').addEventListener('click',abrirConf);
    cf('x').addEventListener('click',fecharConf);
    cf('rodar').addEventListener('click',rodarConf);
    cf('filtro').addEventListener('change',renderConfItens);
    cf('exportar').addEventListener('click',exportarConf);
    recarregarSkusCache();
  }

  async function excluirAtual(){ if(EDIT_ID==null)return; const l=LINHAS.find(x=>x.id===EDIT_ID); const nome = l?l.sku:'este produto';
    if(!confirm(`Excluir o produto "${nome}" definitivamente?\n\nEsta ação NÃO pode ser desfeita e remove também a composição e as imagens do produto.\n\n(Se quiser apenas tirá-lo das listagens sem apagar, use a Situação "Inativo" e salve.)`)) return;
    const b=f('excluir'); b.disabled=true; const t=b.textContent; b.textContent='Excluindo…';
    try{ await rpc('cn_excluir_produto',{p_usuario_id:USER.id,p_produto_id:EDIT_ID,p_definitivo:true});
      f('msg').textContent='Produto excluído definitivamente.';
      fechar(); await carregar(); await recarregarSkusCache();
    }catch(e){ f('erro').textContent='Erro ao excluir: '+(e.message||e); b.disabled=false; b.textContent=t; }
  }

  return { init, abrir, setComp, rmComp, addComp:()=>addComp(), setImg, rmImg, setPadrao };
})();
window.PD = PD;
registrarTela('produtos', PD);
