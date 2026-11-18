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
