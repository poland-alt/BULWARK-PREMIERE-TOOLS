// Bulwark panel updater.
// Looks at a public GitHub repo for a newer version of this panel. If there is one it shows a notice with an
// "Update now" button; clicking it downloads the panel's files and replaces the ones in this panel's own folder.
// Nothing is changed until every file has downloaded, and nothing happens without the click.
(function () {
  function cmp(a, b) {
    a = String(a).split('.'); b = String(b).split('.');
    for (var i = 0; i < 3; i++) { var d = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0); if (d) return d; }
    return 0;
  }
  function get(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), true);   // skip GitHub's 5-minute cache
    x.timeout = 120000;
    x.onload = function () { cb(x.status === 200 ? null : 'HTTP ' + x.status, x.responseText); };
    x.onerror = x.ontimeout = function () { cb('no connection'); };
    x.send();
  }
  function el(tag, text, css) { var e = document.createElement(tag); if (text) e.textContent = text; if (css) e.style.cssText = css; return e; }

  window.BulwarkUpdater = {
    // opts: { panel: 'com.bulwark.reformat', banner: element for the notice, versionEl: element that shows the version }
    start: function (opts) {
      var csi = new CSInterface(), root = csi.getSystemPath(SystemPath.EXTENSION), version = '0';
      try {
        var m = /ExtensionBundleVersion="([\d.]+)"/.exec(window.cep.fs.readFile(root + '/CSXS/manifest.xml').data || '');
        if (m) version = m[1];
      } catch (e) {}
      if (opts.versionEl && version !== '0') opts.versionEl.textContent = 'v' + version;
      var base = String(window.BULWARK_UPDATE_URL || '');
      if (!base || !opts.banner) return;
      if (base.charAt(base.length - 1) !== '/') base += '/';

      get(base + 'latest.json', function (err, text) {
        var info = null;
        try { info = JSON.parse(text).panels[opts.panel]; } catch (e) {}
        var newer = !err && info && info.version && info.files && cmp(info.version, version) > 0;
        if (opts.onResult) opts.onResult(err || !info ? 'offline' : newer ? 'update' : 'current', version, info && info.version);
        if (!newer) return;   // up to date, or offline: say nothing

        var box = opts.banner, msg = el('div', 'Update available: v' + info.version + ' (you have v' + version + ')', 'font-weight:600;color:#fff;'),
            notes = el('div', info.notes || '', 'margin:4px 0 8px;color:#d0d0d0;white-space:pre-line;'),
            btn = el('button', 'Update now'), status = el('div', '', 'color:#b5b5b5;white-space:pre-line;');
        box.style.cssText = 'margin:0 0 14px;padding:10px;border:1px solid #3a6ff2;border-radius:6px;background:#22283a;font-size:12px;';
        box.innerHTML = ''; box.appendChild(msg); box.appendChild(notes); box.appendChild(btn); box.appendChild(status);

        function fail(why) { status.style.color = '#ff7b7b'; status.textContent = why; btn.disabled = false; }
        btn.addEventListener('click', function () {
          btn.disabled = true; status.style.color = '#b5b5b5'; status.textContent = 'Downloading…';
          var files = info.files.slice(0), got = {}, i = 0;
          for (var k = 0; k < files.length; k++) {
            if (!/^[A-Za-z0-9_][A-Za-z0-9_.\/ -]*$/.test(files[k]) || files[k].indexOf('..') >= 0) return fail('The update list is not valid. Nothing was changed.');
          }
          (function next() {
            if (i < files.length) {
              var f = files[i++];
              return get(base + 'panels/' + opts.panel + '/' + f, function (e2, body) {
                if (e2 || !body) return fail('Could not download ' + f + ' (' + (e2 || 'empty') + '). Nothing was changed; try again later.');
                got[f] = body; next();
              });
            }
            // everything is here: check it is really this version before touching the installed panel
            var man = got['CSXS/manifest.xml'] || '';
            if (man.indexOf('ExtensionBundleVersion="' + info.version + '"') < 0 || man.indexOf(opts.panel) < 0) return fail('The download does not match v' + info.version + '. Nothing was changed.');
            for (var j = 0; j < files.length; j++) {
              var path = root + '/' + files[j], dir = path.slice(0, path.lastIndexOf('/'));
              try { window.cep.fs.makedir(dir); } catch (e3) {}
              var res = window.cep.fs.writeFile(path, got[files[j]]);
              if (res.err) return fail('Could not write ' + files[j] + ' (error ' + res.err + '). Reinstall from the zip to be safe.');
            }
            status.style.color = '#7fd38a'; status.textContent = 'Updated to v' + info.version + '. Reloading…';
            setTimeout(function () { window.location.reload(); }, 900);
          })();
        });
      });
    }
  };
})();
