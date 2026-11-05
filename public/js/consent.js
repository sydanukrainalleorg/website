/* GMAH: Google tag with Consent Mode v2 and a cookie banner.
   Nothing is stored and no ad cookies are set until the visitor clicks "Accept".
   Default for everyone: denied. The choice is kept in localStorage ("gmah-consent"). */
(function(){
  var GTM='GTM-M95BSHHF', KEY='gmah-consent';
  window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments)}
  window.gtag=window.gtag||gtag;
  var store={get:function(){try{return localStorage.getItem(KEY)}catch(e){return null}},set:function(v){try{localStorage.setItem(KEY,v)}catch(e){}}};
  var choice=store.get();
  gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
  gtag('set','ads_data_redaction',true);
  gtag('set','url_passthrough',true);
  if(choice==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'denied',analytics_storage:'granted'})}
  gtag('js',new Date());
  var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id='+GTM;
  (document.head||document.documentElement).appendChild(s);

  // Google Ads conversion actions (account 897-577-3431). "Анкета кинолога" = handler talent pool + dog programme form.
  window.GMAH_ADS_SEND_TO=window.GMAH_ADS_SEND_TO||{reserve:'AW-18556158795/KvVtCOLPzrIdEMuGopBF',join:'AW-18556158795/KvVtCOLPzrIdEMuGopBF'};
  // conversion helper: call gmahConv('reserve'|'callback'|'join'|'member') after a form was sent successfully
  window.gmahConv=function(form){
    try{
      dataLayer.push({event:'gmah_lead',form_name:form,lang:document.documentElement.lang});
      gtag('event','generate_lead',{form_name:form});
      if(window.GMAH_ADS_SEND_TO&&window.GMAH_ADS_SEND_TO[form]){gtag('event','conversion',{send_to:window.GMAH_ADS_SEND_TO[form]})}
    }catch(e){}
  };

  var T={
    en:{t:'We use cookies only with your consent: to see which of our Google ads help people find us. Without consent the site works fully.',a:'Accept',d:'Decline',m:'Privacy policy',u:'/privacy/'},
    fi:{t:'Käytämme evästeitä vain suostumuksellasi: näemme, mitkä Google-mainoksistamme auttavat ihmisiä löytämään meidät. Sivusto toimii täysin myös ilman suostumusta.',a:'Hyväksy',d:'Hylkää',m:'Tietosuojaseloste',u:'/fi/privacy/'},
    uk:{t:'Ми використовуємо файли cookie лише з вашої згоди: щоб бачити, які наші оголошення Google допомагають людям знайти нас. Без згоди сайт працює повністю.',a:'Погоджуюсь',d:'Відхилити',m:'Політика конфіденційності',u:'/uk/privacy/'}
  };
  function banner(){
    if(store.get())return;
    var L=T[(document.documentElement.lang||'en').slice(0,2)]||T.en;
    var b=document.createElement('div');b.id='gmah-consent';b.setAttribute('role','dialog');b.setAttribute('aria-label','Cookies');
    b.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;margin:0 auto;background:#fff;color:#1f2a20;border:1px solid #cfc8b0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px 18px;font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif';
    b.innerHTML='<p style="margin:0 0 12px">'+L.t+' <a href="'+L.u+'" style="color:#35503A">'+L.m+'</a></p>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-c="granted" style="flex:1;min-width:120px;padding:10px 14px;border:0;border-radius:8px;background:#35503A;color:#fff;font:inherit;font-weight:600;cursor:pointer">'+L.a+'</button>'+
      '<button type="button" data-c="denied" style="flex:1;min-width:120px;padding:10px 14px;border:1px solid #35503A;border-radius:8px;background:#fff;color:#35503A;font:inherit;font-weight:600;cursor:pointer">'+L.d+'</button></div>';
    b.addEventListener('click',function(e){
      var c=e.target&&e.target.getAttribute&&e.target.getAttribute('data-c'); if(!c)return;
      store.set(c);
      if(c==='granted'){gtag('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'denied',analytics_storage:'granted'})}
      b.remove();
    });
    document.body.appendChild(b);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner);else banner();
})();
