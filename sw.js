self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
self.addEventListener('push',function(e){
  var d={};
  try{d=e.data.json()}catch(err){d={title:'Assistente Financeiro',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Assistente Financeiro',{
    body:d.body||'',icon:'icon-v2-192.png',badge:'icon-v2-192.png',tag:d.tag||'vencimentos',data:d
  }));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  var n=e.notification.data||{};
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){
    for(var i=0;i<l.length;i++){
      if('focus' in l[i]){
        var c=l[i];
        return c.focus().then(function(){try{c.postMessage({type:'notice',n:n})}catch(err){}},function(){try{c.postMessage({type:'notice',n:n})}catch(err){}});
      }
    }
    return self.clients.openWindow('./?aviso='+encodeURIComponent(JSON.stringify(n)));
  }));
});
