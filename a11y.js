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
