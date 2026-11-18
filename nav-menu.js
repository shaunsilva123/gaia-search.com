/* Specialisms dropdown for the main menu.
   To add a new specialism page, add a line to ITEMS below; every page picks it up. */
(function () {
  var ITEMS = [
    { label: 'Ecology recruitment', href: '/ecology-recruitment.html' },
    { label: 'Offshore Wind recruitment', href: '/offshore-wind-recruitment.html' },
    { label: 'Solar & Storage recruitment', href: '/solar-storage-recruitment.html' },
    { label: 'Marine & Coastal recruitment', href: '/marine-coastal-recruitment.html' },
    { label: 'Flood Risk & Water recruitment', href: '/flood-risk-water-recruitment.html' }
  ];
  var ALL = { label: 'All specialisms', href: '/index.html#specialisms' };

  var css = '' +
    '.nav-links li.has-drop{position:relative}' +
    '.nav-links li.has-drop>a::after{content:"";display:inline-block;width:6px;height:6px;margin-left:.5rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-3px) rotate(45deg);transition:transform .2s}' +
    '.nav-links li.has-drop.open>a::after,.nav-links li.has-drop:hover>a::after{transform:translateY(0) rotate(225deg)}' +
    '.nav-drop{position:absolute;top:100%;left:-1.2rem;padding-top:1rem;min-width:290px;width:max-content;opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .18s,transform .18s,visibility .18s;z-index:200}' +
    '.nav-links li.has-drop:hover .nav-drop,.nav-links li.has-drop:focus-within .nav-drop,.nav-links li.has-drop.open .nav-drop{opacity:1;visibility:visible;transform:none}' +
    '.nav-drop ul{list-style:none;margin:0;padding:.5rem;background:#fff;border-radius:12px;box-shadow:0 12px 32px rgba(15,40,20,.18),0 0 0 1px rgba(27,74,27,.08)}' +
    '.nav-drop li a{display:block;padding:.65rem .9rem;border-radius:8px;color:#1b4a1b !important;font-size:.95rem !important;letter-spacing:0 !important;text-transform:none !important;font-weight:600;white-space:nowrap}' +
    '.nav-drop li a:hover,.nav-drop li a:focus-visible{background:#eef4e7;color:#1b4a1b !important}' +
    '.nav-drop li.all{border-top:1px solid #e3ecd9;margin-top:.35rem;padding-top:.35rem}' +
    '.nav-drop li.all a{font-weight:500;color:#4f5e52 !important}' +
    '.mobile-menu a.mm-sub{font-size:1rem;letter-spacing:.02em;text-transform:none;font-weight:500;color:#c9e4b8;margin-top:-1.3rem}' +
    '@media (max-width:900px){' +
      '.nav-links.open{display:flex !important;position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;gap:0;background:#1b4a1b;padding:.4rem 1.5rem 1.6rem;box-shadow:0 14px 28px rgba(0,0,0,.28);max-height:calc(100vh - 70px);overflow-y:auto}' +
      '.nav-links.open>li>a{display:block;padding:.95rem 0;border-bottom:1px solid rgba(255,255,255,.12);font-size:1rem}' +
      '.nav-links.open>li>a.nav-cta{display:inline-block;margin-top:1.2rem;padding:.8rem 1.5rem;border-bottom:0}' +
      '.nav-links.open li.has-drop>a::after{display:none}' +
      '.nav-links.open .nav-drop{position:static;opacity:1;visibility:visible;transform:none;padding:.2rem 0 .4rem;min-width:0;width:auto}' +
      '.nav-links.open .nav-drop ul{background:transparent;box-shadow:none;padding:0 0 0 1rem;border-radius:0}' +
      '.nav-links.open .nav-drop li a{color:#c9e4b8 !important;padding:.6rem 0;font-weight:500}' +
      '.nav-links.open .nav-drop li a:hover{background:transparent}' +
      '.nav-links.open .nav-drop li.all{border-top:0;margin:0;padding:0}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.nav-drop{transition:none}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function isSpec(a) { return a && a.textContent.trim().toLowerCase() === 'specialisms'; }

  document.querySelectorAll('.nav-links > li').forEach(function (li) {
    var a = li.querySelector(':scope > a');
    if (!isSpec(a) || li.classList.contains('has-drop')) return;
    li.classList.add('has-drop');
    a.setAttribute('aria-haspopup', 'true');
    a.setAttribute('aria-expanded', 'false');
    var html = '<div class="nav-drop"><ul>';
    ITEMS.forEach(function (it) { html += '<li><a href="' + it.href + '">' + it.label + '</a></li>'; });
    html += '<li class="all"><a href="' + ALL.href + '">' + ALL.label + '</a></li></ul></div>';
    li.insertAdjacentHTML('beforeend', html);

    function set(open) { li.classList.toggle('open', open); a.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    li.addEventListener('mouseenter', function () { a.setAttribute('aria-expanded', 'true'); });
    li.addEventListener('mouseleave', function () { set(false); });
    // Touch screens: first tap opens the menu, second tap follows the link
    a.addEventListener('click', function (e) {
      if (window.matchMedia('(hover: none)').matches && window.innerWidth > 900 && !li.classList.contains('open')) { e.preventDefault(); set(true); }
    });
    document.addEventListener('click', function (e) { if (!li.contains(e.target)) set(false); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); a.focus(); } });
  });

  // Close the phone menu after choosing a link
  document.querySelectorAll('.nav-links').forEach(function (ul) {
    ul.addEventListener('click', function (e) { if (e.target.closest('a') && ul.classList.contains('open')) ul.classList.remove('open'); });
  });

  document.querySelectorAll('.mobile-menu').forEach(function (m) {
    Array.prototype.forEach.call(m.querySelectorAll(':scope > a'), function (a) {
      if (!isSpec(a)) return;
      var after = a;
      ITEMS.forEach(function (it) {
        var s = document.createElement('a');
        s.href = it.href; s.className = 'mm-sub'; s.textContent = it.label;
        after.insertAdjacentElement('afterend', s); after = s;
      });
    });
  });
})();
