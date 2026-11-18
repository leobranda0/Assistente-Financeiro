// ===== Comandos de voz =====
function localISO(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function vNorm(s){return s.toLowerCase().replace(/[áàâãä]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i').replace(/[óòôõö]/g,'o').replace(/[úùûü]/g,'u').replace(/ç/g,'c')}
const V_UN={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19};
const V_TE={vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90};
const V_HU={cem:100,cento:100,duzentos:200,duzentas:200,trezentos:300,quatrocentos:400,quinhentos:500,seiscentos:600,setecentos:700,oitocentos:800,novecentos:900};
const V_MES=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function vIsNum(w){return (w in V_UN)||(w in V_TE)||(w in V_HU)||w==='mil'}
// converte "cinquenta reais" em "50 reais" (só quando seguido de moeda)
function vWordsToDigits(s){
  const tk=s.split(/\s+/),out=[];let i=0;
  while(i<tk.length){
    if(vIsNum(tk[i])){
      let j=i,tot=0,cur=0;
      while(j<tk.length){
        const w=tk[j];
        if(w==='e'&&j+1<tk.length&&vIsNum(tk[j+1])&&j>i){j++;continue}
        if(!vIsNum(w))break;
        if(w==='mil'){tot+=(cur||1)*1000;cur=0}
        else cur+=(V_UN[w]!==undefined?V_UN[w]:V_TE[w]!==undefined?V_TE[w]:V_HU[w]);
        j++;
      }
      const nx=tk[j]||'';
      if(/^(reais|real|conto|contos|pila|pilas|centavos)/.test(nx)){out.push(String(tot+cur));i=j;continue}
    }
    out.push(tk[i]);i++;
  }
  return out.join(' ');
}
function vParseBR(s){
  if(s.indexOf(',')>=0)return parseFloat(s.replace(/\./g,'').replace(',','.'));
  if(/^\d{1,3}(\.\d{3})+$/.test(s))return parseFloat(s.replace(/\./g,''));
  return parseFloat(s);
}
function parseVoice(raw,now,mode){
  now=now||new Date();
  let o=String(raw||'').toLowerCase().replace(/\s+/g,' ').trim();
  let n=vNorm(o);
  n=vWordsToDigits(n);o=vWordsToDigits(o);
  if(n.length!==o.length)o=n;
  const cut=function(re){const m=re.exec(n);if(!m)return null;n=n.slice(0,m.index)+' '+n.slice(m.index+m[0].length);o=o.slice(0,m.index)+' '+o.slice(m.index+m[0].length);return m};
  // ---- valor
  let amt=null,m;
  m=cut(/(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais|real|conto|contos|pila|pilas)(?:\s+e\s+(\d{1,2})\s*centavos)?/);
  if(m){amt=vParseBR(m[1]);if(m[2])amt+=parseInt(m[2],10)/100}
  if(amt===null){m=cut(/r\$\s*(\d[\d.]*(?:,\d{1,2})?)/);if(m)amt=vParseBR(m[1])}
  // ---- data
  const hoje=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let dt=null;
  if(cut(/\banteontem\b/))dt=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()-2);
  else if(cut(/\bontem\b/))dt=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()-1);
  else if(cut(/\bamanha\b/))dt=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()+1);
  else if(cut(/\bhoje\b/))dt=hoje;
  else{
    m=cut(/\b(?:no |para o |pro |do |ate o )?dia (\d{1,2})(?:\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?(\s+(?:do|no|para o)\s+(?:mes que vem|proximo mes|mes passado))?/);
    if(m){
      let y=hoje.getFullYear(),mo=hoje.getMonth();
      if(m[2])mo=V_MES.indexOf(m[2]);
      if(m[3]){mo+=/passado/.test(m[3])?-1:1}
      const last=new Date(y,mo+1,0).getDate();
      dt=new Date(y,mo,Math.min(parseInt(m[1],10),last));
    }
  }
  if(amt===null){const mm=cut(/(\d+(?:[.,]\d+)?)/);if(mm)amt=vParseBR(mm[1])}
  if(!dt)dt=hoje;
  // ---- tipo
  const isInc=mode==='income';
  // ---- pago / pendente
  const pend=/\b(a pagar|pendente|nao paguei|nao foi paga|nao paga|ainda nao|vou pagar|pagarei|em aberto|a vencer|vence|a receber|vou receber|receberei)\b/.test(n);
  const paidW=/\b(paga|pago|paguei|ja paguei|quitad[ao]|recebi|recebida|recebido|ja recebi)\b/.test(n);
  let paid;
  if(pend)paid=false;else if(paidW)paid=true;else paid=dt<=hoje;
  // ---- fixa
  const fixedW=/\b(fixa|fixo|fixas|mensal|mensalmente|recorrente|todo mes|todos os meses|por mes)\b/.test(n);
  const fixedSoft=/\b(aluguel|condominio|assinatura|netflix|spotify|internet|iptu|mensalidade|plano de saude|parcela|financiamento)\b/.test(n);
  const rec=(fixedW||fixedSoft)?'monthly':'none';
  // ---- descrição
  const junk=[/\b(adicione|adicionar|adiciona|registre|registrar|lance|lancar|lanca|anote|anotar|inclua|incluir|coloque|colocar|cadastre|cadastrar|crie|criar|nova|novo)\b/,
    /\b(despesas?|gastos?|receitas?|lancamento|entradas?)\b/,
    /\b(a pagar|pendente|nao paguei|nao foi paga|nao paga|ainda nao|vou pagar|pagarei|em aberto|a vencer|vence|a receber|vou receber|receberei|ja paguei|ja recebi|paga|pago|paguei|gastei|comprei|recebi|recebida|recebido|quitad[ao])\b/,
    /\b(fixa|fixo|fixas|mensal|mensalmente|recorrente|todo mes|todos os meses|por mes)\b/,
    /\b(reais|real|r\$)\b/,/[.,;!?]/];
  junk.forEach(function(re){let g=0;while(g++<6&&cut(re));});
  let d=n.replace(/\s+/g,' ').trim();let od=o.replace(/\s+/g,' ').trim();
  const ref=/\b(?:referente|relativo|relativa)\s+(?:a|ao|aos|as|da|do|de)?\s*(.+)$/.exec(d);
  if(ref){od=od.slice(od.length-ref[1].length);d=ref[1]}
  const stop=/^(um|uma|uns|umas|o|a|os|as|de|do|da|dos|das|no|na|nos|nas|em|para|pra|ao|com|por|que|e|referente)\s+/;
  let guard=0;while(stop.test(d)&&guard++<8){const k=stop.exec(d)[0].length;d=d.slice(k);od=od.slice(k)}
  od=od.trim();
  let cat=detectCat(od)||detectCat(raw)||'Outros';
  if(!isInc)od=cat;
  else if(!od)od='Receita';
  od=od.charAt(0).toUpperCase()+od.slice(1);
  return{type:isInc?'income':'expense',amount:amt,desc:od,category:cat,date:localISO(dt),paid:paid,recurrence:isInc?'none':rec,soft:!fixedW&&fixedSoft};
}

let vRec=null,vLast=null,vMode='expense';
const V_IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function vUseApp(){try{const v=localStorage.getItem('voice_app_mic');if(v==='1')return true;if(v==='0')return false}catch(e){}return !V_IOS}
function vSetApp(on){try{localStorage.setItem('voice_app_mic',on?'1':'0')}catch(e){}if(!on)vKill();vRefreshHint()}
function vRefreshHint(){
  const h=$('voice-hint');if(!h)return;const app=vUseApp();
  h.innerHTML=app?'Toque no microfone e fale. Ex.: “100 reais de almoço pago hoje”.':'Toque no microfone <b>do teclado</b> e fale. Ex.: “100 reais de almoço pago hoje”.';
  const t=$('voice-switch');if(t)t.textContent=app?'Usar o ditado do teclado (recomendado no iPhone/iPad)':'Usar o microfone do app (pode deixar a bolinha laranja ligada)';
}
function voiceStart(){if(vUseApp()){voiceMic()}else{const t=$('voice-text');if(t)t.focus()}}
function voiceToggleMode(){vSetApp(!vUseApp());if(!vUseApp()){const t=$('voice-text');if(t)t.focus()}}

function vToast(msg,warn){const t=document.createElement('div');t.textContent=msg;t.style.cssText='position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--bg2);border:1px solid '+(warn?'var(--orange-border)':'var(--green-border)')+';color:'+(warn?'var(--orange)':'var(--green)')+';padding:10px 16px;border-radius:12px;font-size:13px;z-index:400;max-width:90vw;text-align:center';document.body.appendChild(t);setTimeout(function(){t.remove()},warn?6000:3200)}
function vStatus(msg){const s=$('voice-status');if(s)s.textContent=msg||''}
function openVoice(){const o=$('voice-overlay');if(!o)return;o.style.alignItems='flex-start';o.style.paddingTop='max(12px, env(safe-area-inset-top))';vRefreshHint();vMode=activeTab==='income'?'income':'expense';$('voice-title').textContent=vMode==='income'?'Nova receita por voz':'Nova despesa por voz';o.style.display='flex';$('voice-text').value='';$('voice-prev').innerHTML='';$('voice-ok').disabled=true;vLast=null;vStatus('')}
function vKill(){const r=vRec;vRec=null;if(r){r.onresult=r.onerror=r.onend=r.onstart=null;try{r.abort()}catch(e){}try{r.stop()}catch(e){}}const b=$('voice-mic');if(b){b.style.background='';b.style.color=''}}
function closeVoice(){vKill();const o=$('voice-overlay');if(o)o.style.display='none'}
window.addEventListener('pagehide',function(){vKill()});
document.addEventListener('visibilitychange',function(){if(document.hidden)vKill()});
function voiceParse(){
  const t=($('voice-text').value||'').trim();
  if(!t){$('voice-prev').innerHTML='';$('voice-ok').disabled=true;return}
  vLast=parseVoice(t,new Date(),vMode);vRenderPrev(vLast);$('voice-ok').disabled=false;
  vStatus(vLast.amount===null?'Não entendi o valor — preencha abaixo.':'Confira e toque em Adicionar.');
}
function vRenderPrev(p){
  const isE=p.type==='expense';
  const opt=function(v,l,sel){return '<option value="'+v+'"'+(sel?' selected':'')+'>'+l+'</option>'};
  $('voice-prev').innerHTML='<div class="modal-fields" style="margin-bottom:6px">'
  +'<div class="modal-grid"><input class="input-field" type="number" step="0.01" id="vp-amt" placeholder="Valor" inputmode="decimal" value="'+(p.amount===null?'':p.amount)+'"/><input class="input-field" type="date" id="vp-date" value="'+p.date+'"/></div>'
  +'<input class="input-field" type="text" id="vp-desc" value="'+esc(p.desc)+'"/>'
  +'<div id="vp-exp-row" style="'+(isE?'':'display:none')+'"><div class="modal-grid"><select class="input-field" id="vp-cat">'+CATS.map(function(c){return opt(c,c,c===p.category)}).join('')+'</select><select class="input-field" id="vp-rec">'+opt('none','Avulsa',p.recurrence==='none')+opt('monthly','Fixa (mensal) 🔄',p.recurrence==='monthly')+'</select></div></div>'
  +'<select class="input-field" id="vp-paid">'+opt('true',isE?'✅ Paga':'✅ Já recebi',p.paid)+opt('false',isE?'⏳ A pagar':'📥 A receber',!p.paid)+'</select>'
  +'</div>'+(p.soft&&isE?'<div style="font-size:11px;color:var(--text3)">Marquei como fixa por ser um gasto que costuma repetir todo mês. Ajuste se não for.</div>':'');
}
async function voiceConfirm(){
  vKill();
  if(!$('vp-amt'))return;
  const type=vMode,amt=parseFloat($('vp-amt').value);
  if(isNaN(amt)||amt<0){vStatus('Informe um valor válido.');return}
  const date=$('vp-date').value||localISO(new Date()),paid=$('vp-paid').value==='true';
  let desc=($('vp-desc').value||'').trim();
  closeVoice();
  if(type==='income'){
    desc=desc||'Receita';
    const inc={id:Date.now().toString(),description:desc,amount:amt,date:date,received:paid};
    snap('Adicionou receita (voz): '+desc);DB.incomes.unshift(inc);
    activeMonth=keyOf(date);activeTab='income';updMonthLbl();updTabs();renderMain();vToast('✓ Receita '+fmt(amt)+' adicionada');
    await syncInc(inc);return;
  }
  if(!desc){desc='Despesa por voz'}
  const cat=$('vp-cat').value||'Outros',rec=$('vp-rec').value||'none',mk=keyOf(date);
  const exp={id:Date.now().toString(),description:desc.charAt(0).toUpperCase()+desc.slice(1),amount:amt,category:cat,date:date,paid:rec==='none'?paid:false,recurrence:rec,paidMonths:rec!=='none'?{[mk]:paid}:{},monthAmounts:{},stopFrom:null,zeroNextMonths:false,createdAt:new Date().toISOString()};
  snap('Adicionou despesa (voz): '+exp.description);DB.expenses.unshift(exp);
  activeMonth=mk;activeTab='expenses';updMonthLbl();updTabs();renderMain();vToast('✓ '+fmt(amt)+' · '+cat+(rec!=='none'?' · fixa':''));
  await syncExp(exp);
}
function voiceMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){vStatus('Ditado direto indisponível aqui. Toque no campo e use o microfone do teclado.');$('voice-text').focus();return}
  if(vRec){vKill();vStatus('');return}
  const r=new SR();vRec=r;r.lang='pt-BR';r.interimResults=true;r.continuous=false;
  r.onstart=function(){vRec=r;$('voice-mic').style.background='var(--red)';$('voice-mic').style.color='#fff';vStatus('Ouvindo...')};
  r.onresult=function(e){let t='',fin=false;for(let i=0;i<e.results.length;i++){t+=e.results[i][0].transcript;if(e.results[i].isFinal)fin=true}$('voice-text').value=t;voiceParse();if(fin){vKill();vStatus('Confira e toque em Adicionar.')}};
  r.onerror=function(e){vStatus(e.error==='not-allowed'||e.error==='service-not-allowed'?'Microfone bloqueado. Libere em Ajustes do iPhone ou use o microfone do teclado.':'Não consegui ouvir. Tente de novo ou use o microfone do teclado.')};
  r.onend=function(){vRec=null;const b=$('voice-mic');if(b){b.style.background='';b.style.color=''}if($('voice-status')&&$('voice-status').textContent==='Ouvindo...')vStatus('')};
  try{r.start()}catch(e){vStatus('Não foi possível iniciar o microfone.')}
}

// ===== Aviso de vencimento =====
function dueDateOf(e,mk){
  if(e.recurrence==='monthly'){const p=mk.split('-'),y=+p[0],m=+p[1];const last=new Date(y,m,0).getDate();return mk+'-'+String(Math.min(parseInt(e.date.slice(8,10),10),last)).padStart(2,'0')}
  return e.date;
}
function dueSoon(){
  const t=new Date(),tm=new Date(t.getFullYear(),t.getMonth(),t.getDate()+1),out=[];
  [[localISO(t),'Hoje'],[localISO(tm),'Amanhã']].forEach(function(x){
    const mk=x[0].slice(0,7);
    getExpMonth(mk).forEach(function(e){if(!e.paid&&e.amount>0&&dueDateOf(e,mk)===x[0])out.push({e:e,w:x[1]})});
  });
  return out;
}
function dueBannerHTML(){
  const l=dueSoon();if(!l.length)return '';
  return '<div class="card" style="border-color:var(--orange-border);background:var(--orange-bg)"><div class="section-lbl" style="color:var(--orange)"><i class="ti ti-bell-ringing"></i> Vencimentos próximos</div>'
  +l.slice(0,6).map(function(x){return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:4px 0"><span><b>'+x.w+'</b> · '+esc(x.e.description)+'</span><span style="font-family:var(--mono)">'+fmt(x.e.amount)+'</span></div>'}).join('')+'</div>';
}
