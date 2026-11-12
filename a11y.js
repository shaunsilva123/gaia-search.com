/* Gaia Search – accessibility helpers */
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('DOMContentLoaded', function(){
    // Background videos: hidden from screen readers, paused for reduced-motion users
    document.querySelectorAll('video[autoplay]').forEach(function(v){
      v.setAttribute('aria-hidden','true'); v.setAttribute('tabindex','-1');
      if(reduce){ v.removeAttribute('autoplay'); v.pause(); }
    });
    // Menu buttons report whether the menu is open
    document.querySelectorAll('.nav-hamburger,.hamburger').forEach(function(b){
      if(!b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded','false');
      b.addEventListener('click', function(){
        setTimeout(function(){
          var m = document.querySelector('.nav-links.open,.mobile-menu.open,.mobile-nav.open,#mobileMenu.open,.nav-links[style*="flex"]');
          var open = b.classList.contains('open') || b.classList.contains('active') || !!m;
          b.setAttribute('aria-expanded', open ? 'true' : 'false');
        }, 60);
      });
    });
    // Close menus / cookie dialogs with Escape
    document.addEventListener('keydown', function(e){
      if(e.key !== 'Escape') return;
      document.querySelectorAll('.nav-hamburger[aria-expanded="true"],.hamburger[aria-expanded="true"]').forEach(function(b){ b.click(); b.focus(); });
    });
  });
})();

/* Shared mobile menu: added only on pages whose nav has no menu button */
(function(){
  function init(){
    var nav=document.querySelector('nav'); if(!nav) return;
    if(document.querySelector('.nav-hamburger,.hamburger')) return;
    var links=[].slice.call(nav.querySelectorAll('a')).filter(function(a){return !a.querySelector('img') && !a.classList.contains('a11y-skip');});
    if(!links.length) return;
    var btn=document.createElement('button');
    btn.className='gs-burger'; btn.type='button';
    btn.setAttribute('aria-label','Open menu'); btn.setAttribute('aria-expanded','false'); btn.setAttribute('aria-controls','gsMenu');
    btn.innerHTML='<span></span><span></span><span></span>';
    nav.appendChild(btn);
    var menu=document.createElement('div');
    menu.className='gs-menu'; menu.id='gsMenu'; menu.setAttribute('role','dialog'); menu.setAttribute('aria-modal','true'); menu.setAttribute('aria-label','Site menu');
    var close=document.createElement('button'); close.className='gs-menu-close'; close.type='button'; close.setAttribute('aria-label','Close menu'); close.innerHTML='&times;';
    menu.appendChild(close);
    links.forEach(function(a){
      var c=document.createElement('a'); c.href=a.getAttribute('href'); c.textContent=a.textContent.trim();
      if(/cta|btn/.test(a.className)) c.className='gs-cta';
      menu.appendChild(c);
    });
    document.body.appendChild(menu);
    function open(){menu.classList.add('open');btn.setAttribute('aria-expanded','true');document.body.classList.add('gs-menu-open');var f=menu.querySelector('a');if(f)f.focus();}
    function shut(){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');document.body.classList.remove('gs-menu-open');btn.focus();}
    btn.addEventListener('click',function(){menu.classList.contains('open')?shut():open();});
    close.addEventListener('click',shut);
    menu.addEventListener('click',function(e){if(e.target.tagName==='A')shut();});
    document.addEventListener('keydown',function(e){
      if(!menu.classList.contains('open'))return;
      if(e.key==='Escape')shut();
      if(e.key==='Tab'){var f=menu.querySelectorAll('a,button');var first=f[0],last=f[f.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
    // Show the button only when the page has hidden its own links
    function check(){
      var visible=links.some(function(a){var r=a.getBoundingClientRect();var s=getComputedStyle(a);return r.width>0&&r.height>0&&s.visibility!=='hidden';});
      document.documentElement.classList.toggle('gs-collapsed',!visible);
      if(visible&&menu.classList.contains('open'))shut();
    }
    check(); window.addEventListener('resize',check);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();

/* Background videos: force muted autoplay, retry on first touch/scroll if the phone blocked it */
(function () {
  function playAll() {
    document.querySelectorAll('video[autoplay]').forEach(function (v) {
      v.muted = true; v.setAttribute('muted', '');
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', playAll); else playAll();
  ['touchstart', 'scroll', 'click'].forEach(function (e) {
    window.addEventListener(e, function once() { playAll(); window.removeEventListener(e, once); }, { passive: true });
  });
})();
