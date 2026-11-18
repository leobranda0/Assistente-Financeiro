// ===== Extras: exportar CSV =====
function csvCell(v){v=String(v==null?'':v);return /[;"\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function csvNum(n){return String(Number(n||0).toFixed(2)).replace('.',',')}
function buildCSV(mk){
  const rows=[['Tipo','Descrição','Categoria','Data','Valor','Situação','Recorrência']];
  getExpMonth(mk).forEach(function(e){
    rows.push(['Despesa',e.description,e.category,fmtD(e.date),'-'+csvNum(e.amount),e.paid?'Paga':'Pendente',e.recurrence==='monthly'?'Mensal':'Avulsa']);
  });
  getIncMonth(mk).forEach(function(i){
    rows.push(['Receita',i.description,'',fmtD(i.date),csvNum(i.amount),i.received!==false?'Recebida':'A receber','Avulsa']);
  });
  return '﻿'+rows.map(function(r){return r.map(csvCell).join(';')}).join('\r\n');
}
async function exportCSV(){
  const mk=activeMonth,name='financeiro-'+mk+'.csv',text=buildCSV(mk);
  try{
    const file=new File([text],name,{type:'text/csv'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return}
  }catch(e){if(e&&e.name==='AbortError')return}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(a.href)},1500);
  vToast('✓ Planilha '+name+' gerada');
}
function addExtras(){
  const pdf=document.querySelector('#mc [data-action="gen-pdf"]');
  if(pdf&&!document.getElementById('btn-csv')){
    const b=document.createElement('button');b.id='btn-csv';b.className='act-btn';b.style.cssText='font-size:11px;display:flex;align-items:center;gap:4px;padding:5px 9px';
    b.innerHTML='<i class="ti ti-table-export" style="font-size:13px"></i>CSV';b.addEventListener('click',exportCSV);
    pdf.parentNode.insertBefore(b,pdf);
  }
}
(function(){
  if(typeof renderMain!=='function')return;
  const orig=renderMain;
  renderMain=function(){orig.apply(this,arguments);try{addExtras()}catch(e){}};
  try{addExtras()}catch(e){}
})();

// ===== Aviso aberto pela notificação =====
var pendingNotice=null;
function takeNotice(n){
  try{if(typeof n==='string')n=JSON.parse(n)}catch(e){return}
  if(!n||!n.title)return;pendingNotice=n;showNoticeIfReady();
}
function showNoticeIfReady(){
  if(!pendingNotice||typeof currentUser==='undefined'||!currentUser||!document.getElementById('mc'))return;
  const n=pendingNotice;pendingNotice=null;openNotice(n);
}
function openNotice(n){
  if(n.go==='expenses'||n.go==='dashboard'||n.go==='income')activeTab=n.go;
  if(n.month&&/^\d{4}-\d{2}$/.test(n.month))activeMonth=n.month;
  updMonthLbl();updTabs();renderMain();
  const old=document.getElementById('notice-ov');if(old)old.remove();
  const ov=document.createElement('div');ov.id='notice-ov';ov.className='modal-overlay';ov.style.zIndex='350';
  const items=(n.items||[]).slice(0,12).map(function(i){
    return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border)"><span>'+esc(i.name)+(i.date?' <span style="color:var(--text3);font-size:11px">· '+fmtD(i.date)+'</span>':'')+'</span><span style="font-family:var(--mono)">'+fmt(i.amount)+'</span></div>';
  }).join('');
  ov.innerHTML='<div class="modal" style="max-width:420px"><div class="modal-title">🔔 '+esc(n.title)+'</div>'
    +(n.body?'<div style="font-size:13px;color:var(--text2);margin-bottom:12px;line-height:1.5">'+esc(n.body)+'</div>':'')
    +(items?'<div style="margin-bottom:6px">'+items+'</div>':'')
    +'<div class="modal-actions"><button class="btn-primary" data-close="1">'+(n.go==='expenses'?'Ver despesas':'Fechar')+'</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov||e.target.closest('[data-close]'))ov.remove()});
}
(function(){
  try{
    if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){if(e.data&&e.data.type==='notice')takeNotice(e.data.n)});
    const q=new URLSearchParams(location.search).get('aviso');
    if(q){history.replaceState(null,'',location.pathname);takeNotice(q)}
  }catch(e){}
  const orig2=renderMain;
  renderMain=function(){orig2.apply(this,arguments);try{showNoticeIfReady()}catch(e){}};
})();
