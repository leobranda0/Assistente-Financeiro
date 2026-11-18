self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
self.addEventListener('push',function(e){
  var d={};
  try{d=e.data.json()}catch(err){d={title:'Assistente Financeiro',body:e.data?e.data.text():''}}
  e.waitUntil(self.registration.showNotification(d.title||'Assistente Financeiro',{
    body:d.body||'',icon:'icon-v2-192.png',badge:'icon-v2-192.png',tag:d.tag||'vencimentos',data:{url:'./'}
  }));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){
    for(var i=0;i<l.length;i++){if('focus' in l[i])return l[i].focus()}
    return self.clients.openWindow('./');
  }));
});
