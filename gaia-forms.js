/* Gaia Search – website forms
 * Sends applications, CV registrations, referrals and Work With Us enquiries
 * straight into recruitCRM (Supabase) and emails Shaun an alert (EmailJS).
 * The public key below can only ADD entries; it cannot read anything back.
 */
(function () {
  var CFG = {
    url: 'https://wnzpeyrdtdxcodeezqxb.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduenBleXJkdGR4Y29kZWV6cXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyNzksImV4cCI6MjA5NDAwNTI3OX0.zd1AdzDm7S2qzA2xsXZatE1nJynAT3j2tN-tp2g6xlA',
    bucket: 'candidate-cvs',
    emailjs: { service: 'service_09b4hfs', template: 'template_dlc5054', confirmTemplate: 'template_fi1iwm8', publicKey: 'MadIajEVnrBSCAMNb' },
    alertTo: 'shaun.silva@gaia-search.com',
    crmUrl: 'https://gaia-search.com/recruitCRM.html',
    maxMB: 10
  };

  var scriptSrc = (document.currentScript && document.currentScript.src) || '';
  var base = scriptSrc ? scriptSrc.replace(/[^\/]*$/, '') : '/';

  function headers(extra) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key };
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function rid() { return Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
  function clip(s, n) { s = (s == null ? '' : String(s)).trim(); return s.length > n ? s.slice(0, n) : s; }

  function checkCv(file) {
    if (!file) return null;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'doc', 'docx'].indexOf(ext) < 0) return 'Please upload your CV as a PDF or Word document.';
    if (file.size > CFG.maxMB * 1048576) return 'Your CV is over ' + CFG.maxMB + 'MB. Please upload a smaller file.';
    return null;
  }

  async function uploadCv(file) {
    var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    var path = 'website/' + rid() + '.' + ext;
    var r = await fetch(CFG.url + '/storage/v1/object/' + CFG.bucket + '/' + path, {
      method: 'POST',
      headers: headers({ 'Content-Type': file.type || 'application/octet-stream' }),
      body: file
    });
    if (!r.ok) throw new Error('CV upload failed (' + r.status + ')');
    return path;
  }

  async function insert(table, row) {
    var r = await fetch(CFG.url + '/rest/v1/' + table, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(row)
    });
    if (!r.ok) throw new Error('Saving failed (' + r.status + ')');
  }

  function emailjsSend(templateId, params) {
    return fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: CFG.emailjs.service, template_id: templateId, user_id: CFG.emailjs.publicKey, template_params: params })
    }).catch(function () {});
  }

  // Alert to Shaun, then a confirmation with his signature to the person who filled in the form
  function sendAlert(subject, lines, replyTo, ack) {
    var body = lines.filter(function (l) { return l !== null; }).join('\n') +
      '\n\nOpen recruitCRM: ' + CFG.crmUrl;
    var alert = emailjsSend(CFG.emailjs.template, { subject: subject, message: body, reply_to: replyTo || CFG.alertTo });
    if (!ack || !replyTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return alert;
    var confirm = emailjsSend(CFG.emailjs.confirmTemplate, {
      to_email: replyTo, first_name: ack.firstName || 'there', ack_subject: ack.subject, ack_message: ack.message
    });
    return Promise.all([alert, confirm]);
  }


  function firstName(n) { return (String(n || '').trim().split(/\s+/)[0] || 'there').slice(0, 40); }

  function track(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }

  /* ---- Public helpers used by the forms ---- */

  // Applications and CV registrations -> CV inbox
  async function submitCv(d) {
    var err = checkCv(d.file);
    if (err) throw new Error(err);
    var path = d.file ? await uploadCv(d.file) : null;
    await insert('cv_inbox', {
      source: 'website',
      form_type: d.formType,               // 'apply' or 'register'
      guess_name: clip(d.name, 200),
      file_path: path,
      file_name: d.file ? clip(d.file.name, 300) : null,
      email: clip(d.email, 200),
      phone: clip(d.phone, 50) || null,
      job_title: clip(d.jobTitle, 300) || null,
      job_url: clip(d.jobUrl, 500) || null,
      message: clip(d.message, 5000) || null
    });
    var what = d.formType === 'apply' ? 'Application: ' + (d.jobTitle || 'a role') : 'CV registration';
    await sendAlert(what + ' — ' + d.name, [
      d.formType === 'apply' ? 'New application from gaia-search.com' : 'New CV registration from gaia-search.com',
      '',
      d.formType === 'apply' ? 'Role: ' + d.jobTitle : null,
      d.formType === 'apply' && d.jobUrl ? 'Job page: ' + d.jobUrl : null,
      'Name: ' + d.name,
      'Email: ' + d.email,
      'Phone: ' + (d.phone || 'Not provided'),
      'CV: ' + (d.file ? d.file.name + ' (in your recruitCRM CV inbox)' : 'Not attached'),
      '',
      d.message ? 'Message:\n' + d.message : null
    ], d.email, d.formType === 'apply' ? {
      firstName: firstName(d.name),
      subject: 'Your application for ' + clip(d.jobTitle, 120),
      message: 'Thanks for applying for the ' + clip(d.jobTitle, 120) + ' role. Your CV has reached me and I\'ll be in touch soon to talk it through.'
    } : {
      firstName: firstName(d.name),
      subject: 'Thanks for registering your CV',
      message: 'Thanks for registering your CV with Gaia Search. I\'ll be in touch when a role comes up that fits your experience.'
    });
    track(d.formType === 'apply' ? 'job_application' : 'cv_registration', { job_title: d.jobTitle || '' });
  }

  // Referrals and Work With Us -> website enquiries
  async function submitEnquiry(d) {
    await insert('web_enquiries', {
      form_type: d.formType,               // 'refer' or 'work-with-us'
      name: clip(d.name, 200),
      email: clip(d.email, 200),
      phone: clip(d.phone, 50) || null,
      details: d.details || {}
    });
    var lines = [d.formType === 'refer' ? 'New referral from gaia-search.com' : 'New Work With Us enquiry from gaia-search.com', ''];
    lines.push('From: ' + d.name + ' <' + d.email + '>');
    lines.push('Phone: ' + (d.phone || 'Not provided'));
    lines.push('');
    Object.keys(d.details || {}).forEach(function (k) { lines.push(k + ': ' + (d.details[k] === '' ? '—' : d.details[k])); });
    var referred = d.details && d.details['Referred person'] ? clip(d.details['Referred person'], 80) : 'your contact';
    await sendAlert((d.formType === 'refer' ? 'Referral' : 'Work With Us') + ' — ' + d.name, lines, d.email, d.formType === 'refer' ? {
      firstName: firstName(d.name),
      subject: 'Thanks for your referral',
      message: 'Thanks for referring ' + referred + '. I\'ll reach out to them shortly and keep you posted. If they\'re placed in a permanent role, you\'ll receive your £500 reward once they\'ve completed 4 weeks in post.'
    } : {
      firstName: firstName(d.name),
      subject: 'Thanks for getting in touch',
      message: 'Thanks for your interest in working with Gaia Search. I\'ll keep your details on file and be in touch if a suitable opportunity opens up.'
    });
    track(d.formType === 'refer' ? 'referral' : 'work_with_us_enquiry');
  }

  window.GaiaForms = { submitCv: submitCv, submitEnquiry: submitEnquiry, checkCv: checkCv };

  /* ---- Apply form on job pages ---- */

  var CSS = '' +
    '.gf-overlay{position:fixed;inset:0;z-index:10000;background:rgba(10,25,10,.6);display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:4vh 1rem;}' +
    '.gf-overlay.open{display:flex;}' +
    '.gf-modal{background:#fafaed;color:#1a1a1a;width:100%;max-width:560px;border-radius:4px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:"DM Sans",sans-serif;position:relative;}' +
    '.gf-head{background:#1b4a1b;color:#fff;padding:1.4rem 1.6rem;border-radius:4px 4px 0 0;}' +
    '.gf-head .gf-kicker{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#7ccc66;margin:0 0 .3rem;}' +
    '.gf-head h2{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:1.7rem;line-height:1.15;margin:0;color:#fff;}' +
    '.gf-close{position:absolute;top:.8rem;right:.9rem;background:none;border:0;color:#fff;font-size:1.7rem;line-height:1;cursor:pointer;padding:.2rem .5rem;}' +
    '.gf-body{padding:1.4rem 1.6rem 1.6rem;}' +
    '.gf-row{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;}' +
    '@media(max-width:520px){.gf-row{grid-template-columns:1fr;}}' +
    '.gf-field{margin-bottom:.95rem;}' +
    '.gf-field label{display:block;font-size:.8rem;font-weight:600;color:#383838;margin-bottom:.35rem;}' +
    '.gf-field input[type=text],.gf-field input[type=email],.gf-field input[type=tel],.gf-field textarea{width:100%;box-sizing:border-box;border:1px solid #d8d6b8;background:#fff;border-radius:2px;padding:.7rem .8rem;font:inherit;font-size:.95rem;color:#1a1a1a;}' +
    '.gf-field input:focus,.gf-field textarea:focus{outline:2px solid #5bb544;outline-offset:0;border-color:#5bb544;}' +
    '.gf-file{border:1.5px dashed #b9b796;background:#fff;border-radius:3px;padding:1rem;text-align:center;cursor:pointer;font-size:.9rem;color:#383838;display:block;}' +
    '.gf-file:hover,.gf-file.drag{border-color:#5bb544;background:#f3f8ef;}' +
    '.gf-file strong{color:#2a6b2a;}' +
    '.gf-file input{position:absolute;width:1px;height:1px;opacity:0;}' +
    '.gf-hint{font-size:.75rem;color:#686868;margin-top:.3rem;}' +
    '.gf-check{display:flex;gap:.6rem;align-items:flex-start;font-size:.82rem;color:#383838;line-height:1.5;margin:.4rem 0 1.1rem;}' +
    '.gf-check input{margin-top:.2rem;flex-shrink:0;width:16px;height:16px;accent-color:#2a6b2a;}' +
    '.gf-check a{color:#2a6b2a;}' +
    '.gf-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}' +
    '.gf-submit{width:100%;background:#5bb544;color:#fff;border:0;border-radius:2px;padding:.95rem;font:inherit;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;}' +
    '.gf-submit:hover{background:#2a6b2a;}' +
    '.gf-submit[disabled]{opacity:.6;cursor:wait;}' +
    '.gf-error{display:none;background:#fdecea;color:#8a1f11;border-left:3px solid #c0392b;padding:.7rem .9rem;font-size:.85rem;margin-bottom:1rem;line-height:1.5;}' +
    '.gf-error a{color:#8a1f11;}' +
    '.gf-done{display:none;text-align:center;padding:1rem .5rem .5rem;}' +
    '.gf-done .gf-tick{width:56px;height:56px;border-radius:50%;background:#5bb544;color:#fff;font-size:1.8rem;line-height:56px;margin:0 auto 1rem;}' +
    '.gf-done h3{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:1.7rem;color:#1b4a1b;margin:0 0 .6rem;}' +
    '.gf-done p{color:#383838;line-height:1.6;margin:0 0 1.2rem;}' +
    '.gf-done button{background:#1b4a1b;color:#fff;border:0;border-radius:2px;padding:.75rem 1.6rem;font:inherit;font-weight:600;cursor:pointer;}' +
    'body.gf-lock{overflow:hidden;}';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function buildModal() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var o = document.createElement('div');
    o.className = 'gf-overlay';
    o.innerHTML =
      '<div class="gf-modal" role="dialog" aria-modal="true" aria-labelledby="gf-title">' +
      '<button type="button" class="gf-close" aria-label="Close">&times;</button>' +
      '<div class="gf-head"><p class="gf-kicker">Apply for this role</p><h2 id="gf-title"></h2></div>' +
      '<div class="gf-body">' +
      '<form class="gf-form" novalidate>' +
      '<div class="gf-error" role="alert"></div>' +
      '<div class="gf-row">' +
      '<div class="gf-field"><label for="gf-first">First name *</label><input type="text" id="gf-first" autocomplete="given-name" required maxlength="100"></div>' +
      '<div class="gf-field"><label for="gf-last">Last name *</label><input type="text" id="gf-last" autocomplete="family-name" required maxlength="100"></div>' +
      '</div>' +
      '<div class="gf-row">' +
      '<div class="gf-field"><label for="gf-email">Email *</label><input type="email" id="gf-email" autocomplete="email" required maxlength="200"></div>' +
      '<div class="gf-field"><label for="gf-phone">Phone</label><input type="tel" id="gf-phone" autocomplete="tel" maxlength="50"></div>' +
      '</div>' +
      '<div class="gf-field"><label for="gf-cv">Your CV *</label>' +
      '<label class="gf-file" id="gf-drop"><input type="file" id="gf-cv" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>' +
      '<span class="gf-file-text"><strong>Choose a file</strong> or drag it here</span></label>' +
      '<div class="gf-hint">PDF or Word, up to 10MB</div></div>' +
      '<div class="gf-field"><label for="gf-msg">Anything you\'d like to add? <span style="font-weight:400;color:#686868">(optional)</span></label><textarea id="gf-msg" rows="3" maxlength="3000" placeholder="Notice period, salary expectations, location preferences…"></textarea></div>' +
      '<div class="gf-hp" aria-hidden="true"><label>Leave this empty<input type="text" id="gf-website" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="gf-check"><input type="checkbox" id="gf-consent" required><span>I agree to Gaia Search storing my details and CV to consider me for this and similar roles. See our <a href="' + base + 'privacy.html" target="_blank">Privacy Policy</a>. *</span></label>' +
      '<button type="submit" class="gf-submit">Send application</button>' +
      '</form>' +
      '<div class="gf-done" aria-live="polite"><div class="gf-tick">✓</div><h3>Application sent</h3><p class="gf-done-text"></p><button type="button" class="gf-done-close">Close</button></div>' +
      '</div></div>';
    document.body.appendChild(o);
    return o;
  }

  function initApply() {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="mailto:"]')).filter(function (a) {
      return /subject=Application/i.test(a.getAttribute('href'));
    });
    if (!links.length) return;

    var o, form, errBox, fileInput, fileText, lastFocus, jobTitle, jobUrl = location.href.split('#')[0].split('?')[0];

    function titleFrom(a) {
      var m = decodeURIComponent(a.getAttribute('href')).match(/subject=Application:\s*([^&]+)/i);
      if (m) return m[1].trim();
      var h = document.querySelector('h1');
      return h ? h.textContent.trim() : document.title;
    }
    function showErr(msg) {
      errBox.innerHTML = msg; errBox.style.display = 'block';
      errBox.scrollIntoView({ block: 'nearest' });
    }
    function setFile(f) {
      fileText.innerHTML = f ? '<strong>' + esc(f.name) + '</strong> · ' + Math.max(1, Math.round(f.size / 1024)) + 'KB · <span style="text-decoration:underline">change</span>'
                             : '<strong>Choose a file</strong> or drag it here';
    }
    function open(a) {
      if (!o) setup();
      jobTitle = titleFrom(a);
      o.querySelector('#gf-title').textContent = jobTitle;
      form.style.display = ''; o.querySelector('.gf-done').style.display = 'none';
      errBox.style.display = 'none';
      lastFocus = document.activeElement;
      o.classList.add('open'); document.body.classList.add('gf-lock');
      setTimeout(function () { o.querySelector('#gf-first').focus(); }, 30);
      track('apply_form_open', { job_title: jobTitle });
    }
    function close() {
      o.classList.remove('open'); document.body.classList.remove('gf-lock');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function setup() {
      o = buildModal();
      form = o.querySelector('.gf-form');
      errBox = o.querySelector('.gf-error');
      fileInput = o.querySelector('#gf-cv');
      fileText = o.querySelector('.gf-file-text');
      var drop = o.querySelector('#gf-drop');

      o.querySelector('.gf-close').onclick = close;
      o.querySelector('.gf-done-close').onclick = close;
      o.addEventListener('click', function (e) { if (e.target === o) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && o.classList.contains('open')) close(); });
      fileInput.addEventListener('change', function () { setFile(fileInput.files[0]); });
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) { try { var dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; } catch (x) {} setFile(f); drop._file = f; }
      });

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errBox.style.display = 'none';
        var v = function (id) { return o.querySelector(id).value.trim(); };
        var first = v('#gf-first'), last = v('#gf-last'), email = v('#gf-email');
        var file = (fileInput.files && fileInput.files[0]) || drop._file;
        if (v('#gf-website')) { form.style.display = 'none'; o.querySelector('.gf-done').style.display = 'block'; return; }
        if (!first || !last) return showErr('Please enter your first and last name.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('Please enter a valid email address.');
        if (!file) return showErr('Please attach your CV.');
        var bad = checkCv(file); if (bad) return showErr(bad);
        if (!o.querySelector('#gf-consent').checked) return showErr('Please tick the box to agree to us storing your details.');

        var btn = form.querySelector('.gf-submit');
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
          await submitCv({
            formType: 'apply', name: first + ' ' + last, email: email, phone: v('#gf-phone'),
            message: v('#gf-msg'), jobTitle: jobTitle, jobUrl: jobUrl, file: file
          });
          form.reset(); drop._file = null; setFile(null);
          o.querySelector('.gf-done-text').textContent = 'Thanks, ' + first + '. Your application for ' + jobTitle + ' is with Gaia Search. We'll be in touch soon.';
          form.style.display = 'none'; o.querySelector('.gf-done').style.display = 'block';
        } catch (x) {
          showErr('Sorry, something went wrong sending your application. Please try again, or email your CV to <a href="mailto:shaun.silva@gaia-search.com?subject=' + encodeURIComponent('Application: ' + jobTitle) + '">shaun.silva@gaia-search.com</a>.');
        } finally {
          btn.disabled = false; btn.textContent = 'Send application';
        }
      });
    }

    links.forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); open(a); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApply); else initApply();
})();
