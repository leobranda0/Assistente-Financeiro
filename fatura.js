// ===== Importação de faturas de cartão =====
(function(){
if(window.__fatLoaded)return;window.__fatLoaded=1;

var PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var CARD_CAT='Cartão de Crédito';
var ITEMS=[];        // itens importados (todas as faturas do usuário)
var MCATS={};        // estabelecimento -> categoria aprendida
var loaded=false;

// ---------- utilidades ----------
function money(s){s=String(s).replace(/R\$\s*/,'').trim();var neg=/^[-+]/.test(s)||/-$/.test(s);s=s.replace(/[-+]/g,'').trim();var v=parseFloat(s.replace(/\./g,'').replace(',','.'));return neg?-v:v}
var MONEY_RE=/^[-+]?\s*(R\$\s*)?-?\d{1,3}(\.\d{3})*,\d{2}\s*-?$/;
function isMoney(t){return MONEY_RE.test(String(t).trim())}
function mKey(desc){return String(desc).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\d{2}\/\d{2}/g,'').replace(/[^a-z0-9*]+/g,' ').trim().slice(0,40)}
function itemsOf(expId,mk){return ITEMS.filter(function(i){return i.expense_id===expId&&i.month===mk})}

// categorias por palavras de fatura (antes do detector geral do app)
var FAT_RULES=[
  ['Outros',/(amazonmktplc|amazon ?mktplc|amazon br|mercado ?livre|mercadolivre|shopee|magalu|aliexpress|americanas|casas bahia)/],
  ['Alimentação',/(ifd\*|ifood|99food|rappi|daki|super ?nosso|supermerc|mercado|padaria|restaurante|lanchonete|burger|pizza|sushi|cafe|bar\b|acougue|hortifruti|sorvet|doceria|confeit|emporio|bistro|grill|churrasc|izakaya|alimentos|atacad|hipermerc|delivery)/],
  ['Transporte',/(posto|combust|shell|ipiranga|petrobras|br mania|uber|99 ?app|99pop|cabify|estaciona|estapar|sem parar|conectcar|veloe|pedagio|autopass|localiza|movida|sixt|hertz|avis\b|unidas|rent a car|\bzul\b|allpark|tagitau)/],
  ['Assinaturas',/(apple\.com|netflix|spotify|prime video|amazon prime|disney|hbo|max\.com|youtube|google \*|globoplay|deezer|clubelivelo|icloud|microsoft|adobe|canva|chatgpt|openai|anthropic|claude)/],
  ['Saúde',/(drogaria|farmacia|droga|raia|pacheco|araujo|panvel|hospital|clinica|laborat|odonto|dentist|medic|academia|smart ?fit|bluefit|suplem)/],
  ['Moradia',/(conta vivo|vivo|claro|tim\b|oi\b|net\b|cemig|copasa|sabesp|enel|light|condominio|aluguel|leroy|telha norte|c&c|tok ?stok|etna)/],
  ['Vestuário',/(renner|riachuelo|c&a|zara|hering|centauro|netshoes|nike|adidas|shein|arezzo|reserva|calcad|roupa)/],
  ['Lazer',/(cinema|cinemark|ingresso|sympla|eventim|hotel|pousada|airbnb|booking|decolar|latam|\bgol\b|\bazul\b|viagem|parque|show|steam|playstation|xbox)/],
  ['Educação',/(livraria|curso|udemy|alura|escola|faculdade|kindle|amazon livros)/]
];
function guessCat(desc){
  var k=mKey(desc);if(MCATS[k])return MCATS[k];
  var s=String(desc).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for(var i=0;i<FAT_RULES.length;i++)if(FAT_RULES[i][1].test(s))return FAT_RULES[i][0];
  var c=(typeof detectCat==='function')?detectCat(desc):null;
  if(c&&c!==CARD_CAT)return c;
  return 'Outros';
}

// ---------- dados ----------
async function loadFat(){
  if(typeof currentUser==='undefined'||!currentUser)return;
  try{
    var r=await Promise.all([sbFetch('/rest/v1/card_items?select=*&order=date.asc'),sbFetch('/rest/v1/merchant_cats?select=merchant_key,category')]);
    ITEMS=(r[0]||[]).map(function(i){i.amount=Number(i.amount);return i});
    MCATS={};(r[1]||[]).forEach(function(m){MCATS[m.merchant_key]=m.category});
    loaded=true;try{renderMain()}catch(e){}
  }catch(e){}
}

// ---------- leitura do PDF ----------
function loadPdfJs(){
  return new Promise(function(ok,fail){
    if(window.pdfjsLib)return ok(window.pdfjsLib);
    var s=document.createElement('script');s.src=PDFJS;
    s.onload=function(){try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER}catch(e){}ok(window.pdfjsLib)};
    s.onerror=function(){fail(new Error('Não consegui carregar o leitor de PDF. Verifique a internet.'))};
    document.head.appendChild(s);
  });
}
async function pdfLines(file){
  var lib=await loadPdfJs();
  var buf=new Uint8Array(await file.arrayBuffer());
  // alguns bancos (ex.: Inter) entregam o PDF com bytes extras antes do início
  var st=-1;for(var b=0;b<buf.length-4;b++){if(buf[b]===37&&buf[b+1]===80&&buf[b+2]===68&&buf[b+3]===70){st=b;break}}
  if(st>0)buf=buf.subarray(st);
  var doc;
  try{doc=await lib.getDocument({data:buf}).promise}
  catch(e){
    if(e&&e.name==='PasswordException')throw new Error('Este PDF tem senha. Abra a fatura no iPhone, toque em Compartilhar › Imprimir › Compartilhar › Salvar em Arquivos e importe o arquivo novo.');
    throw new Error('Não consegui abrir este arquivo como PDF. Abra a fatura no iPhone, toque em Compartilhar › Imprimir › Compartilhar › Salvar em Arquivos e importe o arquivo novo.');
  }
  var lines=[];
  for(var p=1;p<=doc.numPages;p++){
    var page=await doc.getPage(p);var tc=await page.getTextContent();
    var rows=[];
    tc.items.forEach(function(it){
      var t=(it.str||'').trim();if(!t)return;
      var x=it.transform[4],y=it.transform[5];
      var row=null;for(var i=0;i<rows.length;i++){if(Math.abs(rows[i].y-y)<2.5){row=rows[i];break}}
      if(!row){row={y:y,items:[]};rows.push(row)}
      row.items.push({x:x,t:t,w:it.width||0});
    });
    rows.sort(function(a,b){return b.y-a.y});
    rows.forEach(function(r){
      r.items.sort(function(a,b){return a.x-b.x});
      var m=[];r.items.forEach(function(i){var l=m[m.length-1];if(l&&i.x-(l.x+l.w)<1.2&&i.x-(l.x+l.w)>-3){l.t+=i.t;l.w=i.x+i.w-l.x}else m.push({x:i.x,t:i.t,w:i.w})});
      lines.push(m);
    });
  }
  return lines;
}

// Interpreta linhas de qualquer fatura: data no início, descrição, valor
var DATE_RE=/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/;
var DATE_TXT_RE=/^(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?$/i;
var MESES={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
var PAY_RE=/(pagto|pagamento|pgto|pag fatura|credito de pagamento|pagamento recebido|deb em c\/c)/i;
function parseLines(lines,dueMk){
  var dueY=+dueMk.slice(0,4),dueM=+dueMk.slice(5,7);
  var out=[],holder=null,totals=[];
  lines=lines.map(function(l){return l.map(function(o){return typeof o==='string'?{t:o,x:0,w:0}:o})});
  // coluna do valor em R$: borda direita mais comum do 1º valor nas linhas com data
  var edges={};
  lines.forEach(function(l){
    if(!l.length||!(DATE_RE.test(l[0].t)||DATE_TXT_RE.test(l[0].t)||/^\d{2}\/\d{2}\s/.test(l[0].t)))return;
    for(var k=1;k<l.length;k++)if(isMoney(l[k].t)){var e=Math.round((l[k].x+l[k].w)/4)*4;edges[e]=(edges[e]||0)+1;break}
  });
  var colEdge=null,best=0;Object.keys(edges).forEach(function(e){if(edges[e]>best){best=edges[e];colEdge=+e}});
  var future=false;
  var FUT_RE=/(pr[oó]ximas faturas|lan[çc]amentos futuros|parcelas? futuras?|compras parceladas\s*-\s*pr[oó]x|saldo de compras parceladas|pr[oó]ximos lan[çc]amentos)/i;
  lines.forEach(function(objs){
    var tokens=objs.map(function(o){return o.t});
    var joined=tokens.join(' ');
    // seção de lançamentos de faturas futuras: ignora até começar outro bloco de cartão
    if(FUT_RE.test(joined)&&!DATE_RE.test(tokens[0])&&joined.length<70&&!tokens.some(isMoney)){future=true;return}
    // portador (cartão adicional): "NOME  Cartão 3747 XXXXXX 38277"
    var hm=/^(.*?)\s*cart[aã]o\s+(?:final\s+)?[\dX*•\. ]{4,}/i.exec(joined);
    if(hm&&!DATE_RE.test(tokens[0])){var nm=hm[1].trim();holder=nm&&nm.length>2&&!/n[uú]mero/i.test(nm)?nm:null;future=false}
    if(/lan[çc]amentos (atuais|nacionais|internacionais|no cart)|despesas da fatura/i.test(joined)&&!FUT_RE.test(joined))future=false;
    if(future)return;
    // totais impressos na fatura (para conferir a soma)
    if(/total/i.test(joined))tokens.forEach(function(t){if(isMoney(t))totals.push(Math.abs(money(t)))});
    // separa data colada na descrição: "02/10 APP *GWX20UVW"
    var queue=[objs.slice()];
    while(queue.length){var to=queue.shift();if(!to.length)continue;
    var m0=/^(\d{2}\/\d{2})\s+(.+)$/.exec(to[0].t);if(m0)to.splice(0,1,{t:m0[1],x:to[0].x,w:0},{t:m0[2],x:to[0].x,w:to[0].w});
    var tk=to.map(function(o){return o.t});
    var d=null,start=1,mm;
    if((mm=DATE_RE.exec(tk[0]))){d={dd:+mm[1],mo:+mm[2],y:mm[3]?+mm[3]:null}}
    else if((mm=DATE_TXT_RE.exec(tk[0]))){d={dd:+mm[1],mo:MESES[mm[2].toLowerCase()],y:mm[3]?+mm[3]:null}}
    else if(tk.length>1&&(mm=DATE_TXT_RE.exec(tk[0]+' '+tk[1]))){d={dd:+mm[1],mo:MESES[mm[2].toLowerCase()],y:mm[3]?+mm[3]:null};start=2}
    if(!d){ // data no meio da linha (ex.: título de seção à esquerda)
      for(var q2=1;q2<tk.length-2;q2++){if(DATE_RE.test(tk[q2])&&!/^\d{2}\/\d{2}\/\d{2,4}$/.test(tk[q2])&&tk.slice(q2+2).some(isMoney)){queue.push(to.slice(q2));break}}
      continue;
    }
    if(d.mo<1||d.mo>12||d.dd<1||d.dd>31)continue;
    // valor: o que estiver na coluna de R$ (evita pegar valor em moeda estrangeira ou da lateral)
    var vi=-1,firstM=-1;
    for(var k=start;k<to.length;k++){if(isMoney(to[k].t)){if(firstM<0)firstM=k;if(colEdge!==null&&to[k].w&&Math.abs(to[k].x+to[k].w-colEdge)<=14){vi=k;break}}}
    if(vi<0)vi=firstM;
    var desc=[],extra=[],val=null,inst=null,i;
    for(i=start;i<tk.length;i++){
      var t=tk[i];
      if(i===vi){val=money(t);var nx=i+1;if(tk[i+1]==='-'||/^-\s*$/.test(tk[i+1]||'')){val=-Math.abs(val);nx++}
        // outra transação na mesma linha (fatura em duas colunas)
        for(var q=nx;q<tk.length;q++){if(DATE_RE.test(tk[q])||/^\d{2}\/\d{2}\s/.test(tk[q])){queue.push(to.slice(q));break}}
        break}
      if(isMoney(t)||/^[A-Z]{3}$/.test(t)&&/^(EUR|USD|GBP|ARS|CLP|CAD|AUD|JPY|CHF|MXN|UYU|COP|PEN)$/.test(t)||/^\d+,\d{3,}$/.test(t)){extra.push(t);continue}
      if(t==='-'||t==='–')continue;
      var pp=/^\(?\s*parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*\)?$/i.exec(t);if(pp&&!inst){inst=(+pp[1])+'/'+(+pp[2]);continue}
      if(/^\d{1,2}\/\d{1,2}$/.test(t)&&!inst){inst=t;continue}
      var pi=/^(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})$/i.exec(t);if(pi&&!inst){inst=pi[1]+'/'+pi[2];continue}
      if(desc.length===0)desc.push(t);else if(/^\*/.test(t)&&!extra.length)desc.push(t);else extra.push(t);
    }
    if(val===null||!desc.length)continue;
    var description=desc.join(' ').replace(/\s+/g,' ').trim();
    var ie=/\s(\d{2})\/(\d{2})$/.exec(description);if(ie&&!inst&&+ie[1]>=1&&+ie[1]<=+ie[2]&&+ie[2]<=99){inst=ie[1]+'/'+ie[2];description=description.slice(0,ie.index).trim()}
    if(PAY_RE.test(description)&&val<0)continue;           // pagamento da fatura anterior
    if(PAY_RE.test(description)&&/deb|c\/c|recebido/i.test(description))continue;
    var y=d.y?(d.y<100?2000+d.y:d.y):((d.mo>dueM||(inst&&d.mo===dueM))?dueY-1:dueY);
    out.push({date:y+'-'+String(d.mo).padStart(2,'0')+'-'+String(d.dd).padStart(2,'0'),description:description,place:extra.join(' '),amount:Math.round(val*100)/100,installment:inst,holder:holder,category:guessCat(description)});
    }
  });
  var sum=Math.round(out.reduce(function(s,i){return s+i.amount},0)*100)/100;
  var match=totals.some(function(t){return Math.abs(t-sum)<0.01});
  return {items:out,sum:sum,match:match,totals:totals};
}
window.__fatParse=parseLines;window.__fatLines=pdfLines;

// ---------- telas ----------
function ov(html){
  var o=document.getElementById('fat-ov');if(o)o.remove();
  o=document.createElement('div');o.id='fat-ov';o.className='modal-overlay';o.style.zIndex='340';o.style.alignItems='flex-start';o.style.paddingTop='max(12px, env(safe-area-inset-top))';
  o.innerHTML='<div class="modal" style="max-width:520px;max-height:92vh;overflow-y:auto">'+html+'</div>';
  document.body.appendChild(o);
  o.addEventListener('click',function(e){if(e.target===o)o.remove()});
  return o;
}
function closeOv(){var o=document.getElementById('fat-ov');if(o)o.remove()}
function catOpts(sel){return CATS.filter(function(c){return c!==CARD_CAT}).map(function(c){return '<option'+(c===sel?' selected':'')+'>'+c+'</option>'}).join('')}

function openFat(expId,mk){
  var e=DB.expenses.find(function(x){return x.id===expId});if(!e)return;
  var its=itemsOf(expId,mk);
  if(its.length)showDetail(e,mk,its);else showImport(e,mk);
}

function showImport(e,mk){
  var o=ov('<div class="modal-title">Importar fatura · '+esc(e.description)+'</div>'
    +'<div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:12px">Escolha o <b>PDF da fatura</b> de '+lbl(mk)+', do jeito que o banco envia. O app lê as compras, sugere a categoria de cada uma e você confere antes de salvar.</div>'
    +'<input type="file" id="fat-file" accept="application/pdf,.pdf" style="display:none"/>'
    +'<button class="btn-primary" id="fat-pick"><i class="ti ti-file-upload" style="font-size:16px"></i>Escolher PDF da fatura</button>'
    +'<div id="fat-st" style="font-size:12px;color:var(--text2);margin-top:10px;min-height:16px"></div>'
    +'<div class="modal-actions"><button class="btn-ghost" data-fx="close">Cancelar</button></div>');
  o.querySelector('[data-fx=close]').onclick=closeOv;
  var f=o.querySelector('#fat-file');
  o.querySelector('#fat-pick').onclick=function(){f.click()};
  f.onchange=async function(){
    var file=f.files&&f.files[0];if(!file)return;
    var st=o.querySelector('#fat-st');st.style.color='var(--text2)';st.textContent='Lendo a fatura...';
    try{
      var lines=await pdfLines(file);
      var r=parseLines(lines,mk);
      if(!r.items.length){st.style.color='var(--orange)';st.textContent='Não encontrei compras neste PDF. Se for foto ou PDF escaneado, ainda não consigo ler. Tente o PDF original do banco.';return}
      showReview(e,mk,r);
    }catch(err){st.style.color='var(--red)';st.textContent=(err&&err.message)||'Não consegui ler o PDF.'}
  };
}

function showReview(e,mk,r){
  var cur=(getExpMonth(mk).find(function(x){return x.id===e.id})||{}).amount;
  var holders={};r.items.forEach(function(i){holders[i.holder||'']=1});var multi=Object.keys(holders).length>1;
  var rows='',lastH=null;
  r.items.forEach(function(it,ix){
    if(multi&&it.holder!==lastH){lastH=it.holder;rows+='<div style="font-size:10px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em;margin:12px 0 4px">'+esc(it.holder||'Titular')+'</div>'}
    rows+='<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:10px;font-size:13px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis">'+esc(it.description)+(it.installment?' <span class="tag tag-fixed">'+esc(it.installment)+'</span>':'')+'<br><span style="font-size:11px;color:var(--text3)">'+fmtD(it.date)+(it.place?' · '+esc(it.place):'')+'</span></span><span style="font-family:var(--mono);white-space:nowrap;color:'+(it.amount<0?'var(--green)':'var(--text)')+'">'+fmt(it.amount)+'</span></div>'
      +'<select class="input-field fat-cat" data-ix="'+ix+'" style="margin-top:6px;padding:7px 10px;font-size:13px">'+catOpts(it.category)+'</select></div>';
  });
  var chk=r.match?'<div style="background:var(--green-bg);border:1px solid var(--green-border);color:var(--green);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px">✓ A soma das '+r.items.length+' compras ('+fmt(r.sum)+') bate com o total da fatura.</div>'
    :'<div style="background:var(--orange-bg);border:1px solid var(--orange-border);color:var(--orange);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px">Encontrei '+r.items.length+' lançamentos somando '+fmt(r.sum)+', mas não consegui confirmar com o total impresso na fatura. Confira se falta alguma compra.</div>';
  var upd=(typeof cur==='number'&&Math.abs(cur-r.sum)>=0.01)?'<div class="check-row" style="margin-top:12px"><input type="checkbox" id="fat-upd" checked/><label for="fat-upd">Atualizar o valor de '+esc(e.description)+' em '+lbl(mk)+' de '+fmt(cur)+' para '+fmt(r.sum)+'</label></div>':'';
  var o=ov('<div class="modal-title">Conferir fatura · '+esc(e.description)+'</div>'+chk
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:4px">Ajuste a categoria se precisar. O app aprende e acerta nas próximas faturas.</div>'
    +rows+upd
    +'<div class="modal-actions"><button class="btn-ghost" data-fx="close">Cancelar</button><button class="btn-primary" data-fx="save">Salvar '+r.items.length+' compras</button></div>');
  o.querySelector('[data-fx=close]').onclick=closeOv;
  o.querySelectorAll('.fat-cat').forEach(function(s){s.onchange=function(){r.items[+s.dataset.ix].category=s.value;r.items[+s.dataset.ix]._changed=1}});
  o.querySelector('[data-fx=save]').onclick=async function(){
    var b=this;b.disabled=true;b.textContent='Salvando...';
    try{
      var rows=r.items.map(function(i){return{expense_id:e.id,month:mk,date:i.date,description:i.description,amount:i.amount,category:i.category,holder:i.holder||null,installment:i.installment||null,user_id:currentUser.id}});
      await sbFetch('/rest/v1/card_items?expense_id=eq.'+encodeURIComponent(e.id)+'&month=eq.'+mk,{method:'DELETE'});
      await sbFetch('/rest/v1/card_items',{method:'POST',headers:{'Prefer':'return=minimal'},body:JSON.stringify(rows)});
      var learn={};r.items.forEach(function(i){if(i._changed||!MCATS[mKey(i.description)])learn[mKey(i.description)]=i.category});
      var lr=Object.keys(learn).filter(function(k){return k}).map(function(k){MCATS[k]=learn[k];return{merchant_key:k,category:learn[k],user_id:currentUser.id}});
      if(lr.length)try{await sbFetch('/rest/v1/merchant_cats?on_conflict=user_id,merchant_key',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(lr)})}catch(x){}
      var u=document.getElementById('fat-upd');
      if(u&&u.checked){
        snap('Importou fatura: '+e.description);
        if(e.recurrence==='monthly'){e.monthAmounts=e.monthAmounts||{};e.monthAmounts[mk]=r.sum}else{e.amount=r.sum}
        saveCache();syncExp(e);
      }
      closeOv();await loadFat();vToast('✓ Fatura importada: '+r.items.length+' compras');
    }catch(err){b.disabled=false;b.textContent='Tentar de novo';vToast('Não foi possível salvar: '+String(err.message||err).slice(0,80),true)}
  };
}

function showDetail(e,mk,its){
  var tot=its.reduce(function(s,i){return s+i.amount},0);
  var byCat={};its.forEach(function(i){(byCat[i.category]=byCat[i.category]||[]).push(i)});
  var cats=Object.keys(byCat).map(function(c){return{c:c,t:byCat[c].reduce(function(s,i){return s+i.amount},0)}}).sort(function(a,b){return b.t-a.t});
  var html='<div class="modal-title">'+esc(e.description)+' · '+lbl(mk)+'</div>'
    +'<div style="font-size:13px;color:var(--text2);margin-bottom:12px">'+its.length+' compras · <b style="font-family:var(--mono);color:var(--text)">'+fmt(tot)+'</b></div>';
  cats.forEach(function(x){
    var ic=CAT_ICONS[x.c]||'📦';
    html+='<details style="border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:8px"><summary style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;list-style:none;font-size:14px"><span>'+ic+' '+x.c+' <span style="font-size:11px;color:var(--text3)">· '+byCat[x.c].length+'</span></span><span style="font-family:var(--mono)">'+fmt(x.t)+'</span></summary>';
    byCat[x.c].forEach(function(i){
      html+='<div style="padding:8px 0;border-top:1px solid var(--border);margin-top:8px"><div style="display:flex;justify-content:space-between;gap:10px;font-size:13px"><span>'+esc(i.description)+(i.installment?' <span class="tag tag-fixed">'+esc(i.installment)+'</span>':'')+'<br><span style="font-size:11px;color:var(--text3)">'+(i.date?fmtD(i.date):'')+(i.holder?' · '+esc(i.holder):'')+'</span></span><span style="font-family:var(--mono);white-space:nowrap;color:'+(i.amount<0?'var(--green)':'var(--text)')+'">'+fmt(i.amount)+'</span></div>'
        +'<select class="input-field fat-recat" data-id="'+i.id+'" style="margin-top:6px;padding:6px 10px;font-size:12px">'+catOpts(i.category)+'</select></div>';
    });
    html+='</details>';
  });
  html+='<div class="modal-actions"><button class="btn-ghost" data-fx="redo">Reimportar</button><button class="btn-primary" data-fx="close">Fechar</button></div>'
    +'<button data-fx="del" style="background:none;border:none;color:var(--red);font-size:12px;margin-top:12px;cursor:pointer">Apagar importação desta fatura</button>';
  var o=ov(html);
  o.querySelector('[data-fx=close]').onclick=closeOv;
  o.querySelector('[data-fx=redo]').onclick=function(){showImport(e,mk)};
  o.querySelector('[data-fx=del]').onclick=async function(){
    if(!confirm('Apagar as compras importadas desta fatura? A despesa do cartão continua.'))return;
    try{await sbFetch('/rest/v1/card_items?expense_id=eq.'+encodeURIComponent(e.id)+'&month=eq.'+mk,{method:'DELETE'})}catch(x){}
    closeOv();await loadFat();vToast('Importação apagada');
  };
  o.querySelectorAll('.fat-recat').forEach(function(s){s.onchange=async function(){
    var it=ITEMS.find(function(i){return i.id===s.dataset.id});if(!it)return;it.category=s.value;
    var k=mKey(it.description);MCATS[k]=s.value;
    try{await sbFetch('/rest/v1/card_items?id=eq.'+it.id,{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({category:s.value})})}catch(x){}
    try{await sbFetch('/rest/v1/merchant_cats?on_conflict=user_id,merchant_key',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{merchant_key:k,category:s.value,user_id:currentUser.id}])})}catch(x){}
    try{renderMain()}catch(x){}
  }});
}

// ---------- integração com a tela ----------
function decorate(){
  var mc=document.getElementById('mc');if(!mc)return;
  if(activeTab==='expenses'){
    mc.querySelectorAll('.exp-row').forEach(function(row){
      var tb=row.querySelector('[data-action="toggle-paid"]');if(!tb||row.querySelector('[data-fat]'))return;
      var id=tb.dataset.id,mk=tb.dataset.ik||activeMonth;
      var e=DB.expenses.find(function(x){return x.id===id});if(!e||e.category!==CARD_CAT)return;
      var n=itemsOf(id,mk).length;
      var b=document.createElement('button');b.className='act-btn'+(n?' success':'');b.setAttribute('data-fat',id);b.setAttribute('data-mk',mk);
      b.title=n?'Ver compras da fatura':'Importar fatura';
      b.innerHTML='<i class="ti '+(n?'ti-list-details':'ti-file-import')+'" style="font-size:13px"></i>';
      var acts=row.querySelector('.exp-actions');if(acts)acts.insertBefore(b,acts.firstChild);
      var meta=row.querySelector('.exp-meta');
      if(meta&&n){var sp=document.createElement('span');sp.style.color='var(--accent2)';sp.textContent=n+' compras importadas';meta.appendChild(sp)}
      var name=row.querySelector('.exp-info');if(name){name.style.cursor='pointer';name.setAttribute('data-fat-open',id);name.setAttribute('data-mk',mk)}
    });
  }
  if(activeTab==='dashboard')patchCategories();
}
// "Por categoria" na Visão Geral: troca o total do cartão pelas categorias das compras importadas
function patchCategories(){
  var lblEl=Array.prototype.find.call(document.querySelectorAll('#mc .section-lbl'),function(x){return x.textContent==='Por categoria'});
  if(!lblEl)return;var card=lblEl.parentNode;
  var tot={};var any=false;
  getExpMonth(activeMonth).forEach(function(e){
    var mk=e._ik||activeMonth,its=e.category===CARD_CAT?itemsOf(e.id,mk):[];
    if(its.length){
      any=true;var s=0;
      its.forEach(function(i){tot[i.category]=(tot[i.category]||0)+i.amount;s+=i.amount});
      var rest=Math.round((e.amount-s)*100)/100;if(rest>0.009)tot[CARD_CAT]=(tot[CARD_CAT]||0)+rest;
    }else{tot[e.category]=(tot[e.category]||0)+e.amount}
  });
  if(!any)return;
  var arr=Object.keys(tot).map(function(c){return{c:c,t:tot[c]}}).filter(function(x){return x.t>0.009}).sort(function(a,b){return b.t-a.t});
  var max=arr.length?arr[0].t:1;
  var h='<div class="section-lbl">Por categoria</div>';
  arr.forEach(function(x){var ic=CAT_ICONS[x.c]||'📦';h+='<div class="cat-row"><div class="cat-row-top"><span class="cat-name">'+ic+' '+x.c+'</span><span class="cat-amt">'+fmt(x.t)+'</span></div><div class="cat-track"><div class="cat-fill" style="width:'+Math.round(x.t/max*100)+'%;background:'+(CAT_COLORS[x.c]||'var(--accent)')+'"></div></div></div>'});
  h+='<div style="font-size:11px;color:var(--text3);margin-top:4px">Inclui o detalhamento das faturas de cartão importadas.</div>';
  card.innerHTML=h;
}
document.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-fat],[data-fat-open]');if(!b)return;
  var id=b.getAttribute('data-fat')||b.getAttribute('data-fat-open');
  if(b.hasAttribute('data-fat-open')){var e=DB.expenses.find(function(x){return x.id===id});if(!e||e.category!==CARD_CAT)return}
  ev.stopPropagation();openFat(id,b.getAttribute('data-mk')||activeMonth);
},true);

(function boot(){
  if(typeof renderMain!=='function'){setTimeout(boot,60);return}
  var orig=renderMain;var first=true;
  renderMain=function(){orig.apply(this,arguments);try{decorate()}catch(e){}if(first&&typeof currentUser!=='undefined'&&currentUser){first=false;loadFat()}};
  try{decorate()}catch(e){}
  if(typeof currentUser!=='undefined'&&currentUser){first=false;loadFat()}
})();
window.__fat={openFat:openFat,items:function(){return ITEMS},parse:parseLines};
})();
