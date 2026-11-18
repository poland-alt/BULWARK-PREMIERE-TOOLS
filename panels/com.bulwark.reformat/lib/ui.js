// Bulwark Premiere Tools: how the panel looks and feels. Nothing here does the work; it dresses the controls the
// other scripts use (dropdowns, the open-sequence bar, progress bars, the "check these" list).
(function () {
  var csi = new CSInterface();
  function $(id) { return document.getElementById(id); }
  function jsx(code, cb) { csi.evalScript(code, function (r) { cb(String(r || '')); }); }

  // ---- dropdowns ----
  // Premiere's panel engine paints standard dropdowns black, so each <select> is kept as the source of truth (the
  // other scripts read and fill it) and shown through a button and a list drawn here.
  var pickers = [], openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.parentNode.removeChild(openMenu); openMenu = null; } }
  function picker(sel) {
    var wrap = document.createElement('div'), btn = document.createElement('button'), label = document.createElement('span');
    wrap.className = 'picker'; btn.type = 'button'; btn.className = 'pk'; btn.appendChild(label); wrap.appendChild(btn);
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    function refresh() {
      var o = sel.options[sel.selectedIndex], text = o ? o.textContent : (sel.options.length ? 'Choose…' : '—');
      if (label.textContent !== text) label.textContent = text;
      var off = sel.disabled || !sel.options.length;
      if (btn.disabled !== off) btn.disabled = off;
      btn.title = text;
    }
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var mine = openMenu && openMenu.parentNode === wrap;
      closeMenu();
      if (mine) return;
      var menu = document.createElement('div'); menu.className = 'pk-menu';
      [].forEach.call(sel.options, function (o, i) {
        var d = document.createElement('div'); d.textContent = o.textContent; d.title = o.textContent;
        if (i === sel.selectedIndex) d.className = 'sel';
        d.addEventListener('click', function (e2) {
          e2.stopPropagation();
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          refresh(); closeMenu();
        });
        menu.appendChild(d);
      });
      wrap.appendChild(menu); openMenu = menu;
      var cur = menu.querySelector('.sel'); if (cur) menu.scrollTop = Math.max(0, cur.offsetTop - 60);
    });
    refresh();
    pickers.push({ sel: sel, refresh: refresh });
  }
  window.bulwarkPicker = picker;                  // for dropdowns made after the page loads (the Setup tab's rows)
  [].forEach.call(document.querySelectorAll('select'), picker);
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (ev) { if (ev.keyCode === 27) closeMenu(); });
  setInterval(function () {
    for (var i = pickers.length - 1; i >= 0; i--) { if (document.body.contains(pickers[i].sel)) pickers[i].refresh(); else pickers.splice(i, 1); }      // a dropdown that has left the page is dropped
  }, 350);     // the other scripts change selects without saying so

  // ---- the open sequence, always in view ----
  function clock(secs) {
    secs = Math.max(0, Math.round(secs));
    var h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  var lastSeq = '';
  function readSequence() {
    if (document.hidden) return;
    jsx('typeof $.bulwark.seqInfo === "function" ? $.bulwark.seqInfo() : "WAIT"', function (r) {
      var p = r.split('|'), key = r;
      if (key === lastSeq) return;
      lastSeq = key;
      var tabs = document.querySelectorAll('#tabs span'), i;
      for (i = 0; i < tabs.length; i++) tabs[i].removeAttribute('data-next');
      if (p[0] !== 'OK') {
        $('seqname').textContent = p[0] === 'WAIT' ? 'Connecting to Premiere…' : 'No sequence open';
        $('seqmeta').textContent = ''; $('seqbadge').textContent = ''; $('seqbadge').className = 'badge';
        return;
      }
      var total = +p[2], w = +p[4], h = +p[5], name = p.slice(6).join('|'), tall = h > w;
      $('seqname').textContent = name; $('seqname').title = name;
      $('seqmeta').textContent = clock(total);
      $('seqbadge').textContent = tall ? '9x16' : '16x9';
      $('seqbadge').className = 'badge ' + (tall ? 'tall' : 'wide');
      // the step that fits this sequence gets a gold ring: a full episode -> Clips, a 16x9 clip -> Reframe, a vertical -> Captions
      var next = tall ? 'captions' : (total > 600 ? 'clips' : 'reframe');
      var t = document.querySelector('#tabs span[data-tab=' + next + ']');
      if (t) t.setAttribute('data-next', '1');
    });
  }
  setInterval(readSequence, 2000); setTimeout(readSequence, 600);

  // ---- each show's own colour, under the header ----
  var showColour = {};
  try {
    var root = csi.getSystemPath(SystemPath.EXTENSION) + '/templates/thumbs', dir = window.cep.fs.readdir(root);
    if (!dir.err) dir.data.forEach(function (id) {
      var j = window.cep.fs.readFile(root + '/' + id + '/template.json');
      if (j.err) return;
      try { var t = JSON.parse(j.data); if (t.headline && t.headline.box) { if (t.show) showColour[t.show] = t.headline.box; showColour['name:' + t.name] = t.headline.box; } } catch (e) {}
    });
  } catch (e) {}
  function lift(hex) {            // a near-black show colour would vanish against the panel: lighten it enough to read
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#378ef0';
    var c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)], lum = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
    if (lum < 70) c = c.map(function (v) { return Math.round(v + (255 - v) * 0.45); });
    return 'rgb(' + c.join(',') + ')';
  }
  function paintShow() {
    var onThumb = $('tab-thumb').className.indexOf('on') >= 0, col = null;
    if (onThumb && $('ttpl').value) col = showColour['name:' + $('ttpl').value.replace(/ \(mine\)$/, '')];
    if (!col) col = showColour[$('show').value];
    document.documentElement.style.setProperty('--show', lift(col));
  }
  setInterval(paintShow, 500); paintShow();

  // ---- progress: a status line that ends in "…" is work in hand; one with a percentage gets a real bar ----
  function dress(el) {
    var text = el.textContent, busy = /…\s*(\d+:\d\d)?\s*$/.test(text) && !/\b(ok|err)\b/.test(el.className);
    var pct = /(\d{1,3})%/.exec(text);
    // Only ever write a class that is actually changing: the panel's older engine reports every classList call as a
    // change, even one that changes nothing, and this function runs on changes, so an unguarded write loops forever.
    function set(name, on) { if (el.classList.contains(name) !== on) { if (on) el.classList.add(name); else el.classList.remove(name); } }
    set('busy', busy);
    set('spin', busy && !pct);
    if (busy && pct) {
      var w = Math.min(100, +pct[1]) + '%';
      if (el.style.getPropertyValue('--pct') !== w) el.style.setProperty('--pct', w);
    }
  }
  var statusWatch = new MutationObserver(function (list) {
    var seen = [];
    list.forEach(function (m) {
      var el = m.target.nodeType === 1 ? m.target : m.target.parentNode;
      while (el && el !== document.body && !(el.classList && el.classList.contains('status'))) el = el.parentNode;
      if (el && el !== document.body && seen.indexOf(el) < 0) { seen.push(el); dress(el); }
    });
  });
  [].forEach.call(document.querySelectorAll('.status'), function (el) { statusWatch.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] }); });

  // ---- "check these": each note is a row, and the ones with a time jump the playhead there ----
  function buildReview() {
    var src = $('review'), out = $('reviewlist'), lines = src.textContent.split('\n').map(function (l) { return l.replace(/^\s+|\s+$/g, ''); }).filter(function (l) { return l && !/^check these:?$/i.test(l); });
    out.innerHTML = '';
    if (!lines.length) return;
    var head = document.createElement('div'); head.className = 'rvh'; head.textContent = 'Check these ';
    var n = document.createElement('b'); n.textContent = lines.length; head.appendChild(n); out.appendChild(head);
    lines.forEach(function (l) {
      var m = /^(\d+):(\d\d)(?::(\d\d))?\s+(.*)$/.exec(l), row = document.createElement('div'), text = document.createElement('span');
      row.className = 'rv'; text.textContent = m ? m[4] : l; row.appendChild(text);
      if (m) {
        var secs = m[3] !== undefined ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 60 + (+m[2]);
        var a = document.createElement('a'); a.textContent = (m[3] !== undefined ? m[1] + ':' + m[2] + ':' + m[3] : m[1] + ':' + m[2]) + ' →'; a.title = 'Go to this moment';
        a.addEventListener('click', function () { jsx('$.bulwark.jump(' + secs + ')', function () {}); });
        row.appendChild(a);
      }
      out.appendChild(row);
    });
  }
  new MutationObserver(buildReview).observe($('review'), { childList: true, characterData: true, subtree: true });
  buildReview();
})();
