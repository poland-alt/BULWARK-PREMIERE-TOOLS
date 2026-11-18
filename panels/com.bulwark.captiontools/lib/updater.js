// Bulwark panel updater.
// Looks at a public GitHub repo for a newer version of this panel. If there is one it shows a notice with an
// "Update now" button; clicking it downloads the panel's files and replaces the ones in this panel's own folder.
// Nothing is changed until every file has downloaded AND the release has been proved genuine: the list of files and
// their fingerprints must carry a signature made with the key held on the release Mac (checked against the public
// key in lib/update-key.js), and every downloaded file must match its fingerprint. Nothing happens without the click.
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
  function bytes(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function hex(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }

  // Is this release genuine? done(null) when it is, done('why not') otherwise.
  function verify(panel, info, got, done) {
    var subtle = window.crypto && window.crypto.subtle, key = String(window.BULWARK_UPDATE_KEY || '');
    if (!subtle || !window.TextEncoder) return done('This version of Premiere cannot check that the update is genuine.');
    if (!key) return done('This panel has no key to check updates with. Reinstall it from the zip.');
    if (!info.sig || !info.hashes) return done('The update is not signed.');
    var files = info.files.slice(0).sort(), lines = [], i;
    for (i = 0; i < files.length; i++) {
      if (!/^[0-9a-f]{64}$/.test(String(info.hashes[files[i]] || ''))) return done('The update\'s list of files is incomplete.');
      lines.push(info.hashes[files[i]] + ' ' + files[i]);
    }
    var enc = new TextEncoder(), message = enc.encode('bulwark-update-v1\n' + panel + '\n' + info.version + '\n' + lines.join('\n'));
    var sig; try { sig = bytes(info.sig); } catch (e) { return done('The update\'s signature is damaged.'); }
    subtle.importKey('spki', bytes(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']).then(function (k) {
      return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig, message);
    }).then(function (ok) {
      if (!ok) return done('The update\'s signature does not match: it was not made by the Bulwark release key.');
      var n = 0;
      (function next() {                                 // the list is genuine; now every file must be what the list says
        if (n >= files.length) return done(null);
        var f = files[n++];
        subtle.digest('SHA-256', enc.encode(got[f])).then(function (h) {
          if (hex(h) !== info.hashes[f]) return done(f + ' is not the file that was released.');
          next();
        }, function () { done('Could not check ' + f + '.'); });
      })();
    }, function () { done('The update could not be checked.'); });
  }

  window.BulwarkUpdater = {
    // opts: { panel: 'com.bulwark.reformat', banner: element for the notice, versionEl: element that shows the version, onResult }
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
            // everything is here: prove it is a genuine release of this version before touching the installed panel
            var man = got['CSXS/manifest.xml'] || '';
            if (man.indexOf('ExtensionBundleVersion="' + info.version + '"') < 0 || man.indexOf(opts.panel) < 0) return fail('The download does not match v' + info.version + '. Nothing was changed.');
            status.textContent = 'Checking the update is genuine…';
            verify(opts.panel, info, got, function (why) {
              if (why) return fail(why + ' Nothing was changed. Tell Jared.');
              for (var j = 0; j < files.length; j++) {
                var path = root + '/' + files[j], dir = path.slice(0, path.lastIndexOf('/'));
                try { window.cep.fs.makedir(dir); } catch (e3) {}
                var res = window.cep.fs.writeFile(path, got[files[j]]);
                if (res.err) return fail('Could not write ' + files[j] + ' (error ' + res.err + '). Reinstall from the zip to be safe.');
              }
              status.style.color = '#7fd38a'; status.textContent = 'Updated to v' + info.version + '. Reloading…';
              setTimeout(function () { window.location.reload(); }, 900);
            });
          })();
        });
      });
    }
  };
  window.BulwarkUpdater._verify = verify;
})();
