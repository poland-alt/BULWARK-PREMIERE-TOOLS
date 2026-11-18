// Bulwark Premiere Tools: the Setup tab. Collects the recordings, works out the sync for a livestream, and hands
// the plan to jsx/setup.jsx, which builds the nests, the wide shot, the media layout and the main sequence.
(function () {
  var csi = new CSInterface(), cep = window.cep;
  function $(id) { return document.getElementById(id); }
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function jsx(code, cb) { csi.evalScript(code, function (r) { cb(String(r || '')); }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function say(text, kind) { var st = $('sstat'); st.className = 'status' + (kind ? ' ' + kind : ''); st.textContent = text; }
  var EXT = csi.getSystemPath(SystemPath.EXTENSION), WORK = csi.getSystemPath(SystemPath.USER_DATA) + '/Bulwark Tools', DIR = WORK + '/setup';
  var SYNC = DIR + '/syncoffset', TPL = DIR + '/main-template.prproj', MYTPL = DIR + '/my-template.prproj', MYTPLINFO = DIR + '/my-template.json';
  jsx('$.evalFile(' + q(EXT + '/jsx/setup.jsx') + ')', function () {});

  // ---- what ships inside the panel: layouts, the mixer template, the voice-track effect values ----
  function readJSON(path, fallback) { var r = cep.fs.readFile(path); if (r.err) return fallback; try { return JSON.parse(r.data); } catch (e) { return fallback; } }
  var shipped = readJSON(EXT + '/presets/layouts.json', { wide: [], media: [] });
  var mixer = readJSON(EXT + '/presets/mixer-default.json', null), tplInfo = readJSON(EXT + '/presets/main-template.json', null);
  function mine() { try { return JSON.parse(store('bulwark_setuplayouts') || '{}'); } catch (e) { return {}; } }
  function layouts(kind) {                         // shipped ones, then the user's own
    var m = mine()[kind] || [], out = [];
    (shipped[kind] || []).forEach(function (l) { out.push(l); });
    m.forEach(function (l) { l.mine = true; out.push(l); });
    return out;
  }
  // Unpacks the sync helper and the mixer template the first time, and again after an update.
  function unpack(cb) {
    cep.fs.makedir(WORK); cep.fs.makedir(DIR);
    var ver = '0';
    try { ver = (/ExtensionBundleVersion="([\d.]+)"/.exec(cep.fs.readFile(EXT + '/CSXS/manifest.xml').data) || [])[1] || '0'; } catch (e) {}
    var mark = cep.fs.readFile(DIR + '/version.txt');
    if (!mark.err && mark.data === ver && !cep.fs.stat(SYNC).err && !cep.fs.stat(TPL).err) return cb(null);
    var parts = [['/bin/syncoffset.b64', SYNC], ['/presets/main-template.prproj.b64', TPL]];
    for (var i = 0; i < parts.length; i++) {
      var src = cep.fs.readFile(EXT + parts[i][0]);
      if (src.err || !src.data) return cb('Part of the panel is missing. Reinstall it from the zip.');
      if (cep.fs.writeFile(parts[i][1], src.data.replace(/\s+/g, ''), cep.encoding.Base64).err) return cb('Could not set up in ' + DIR + '.');
    }
    var p = cep.process.createProcess('/bin/chmod', '755', SYNC), done = false;
    function fin() { if (done) return; done = true; cep.fs.writeFile(DIR + '/version.txt', ver); cb(null); }
    if (p.err) return cb('Could not set up the sync helper.');
    cep.process.onquit(p.data, fin); setTimeout(fin, 3000);
  }
  function template() {                            // the user's saved mixer template if there is one, else the shipped one
    var my = readJSON(MYTPLINFO, null);
    if (my && my.id && !cep.fs.stat(MYTPL).err) return { path: MYTPL, id: my.id, from: my.from, fx: my.fx || [], mine: true };
    return tplInfo ? { path: TPL, id: tplInfo.id, from: tplInfo.from, fx: tplInfo.fx || [] } : null;
  }

  // ---- the list of recordings ----
  // role: "person" (gets a nest), "master" (the stream's own recording, livestream only), "media" (just imported)
  var files = [], mode = store('bulwark_setupmode') === 'live' ? 'live' : 'raw', made = null;
  var busy = false;                               // while a run is going the list and the mode stay as they were when it started
  function lock(on) { busy = on; $('srun').disabled = on; $('sadd').disabled = on; $('tab-setup').className = $('tab-setup').className.replace(/ ?running/, '') + (on ? ' running' : ''); }
  function guessName(path) {
    var n = path.split('/').pop().replace(/\.[^.]+$/, '');
    n = n.replace(/^riverside[_-]/i, '').replace(/[_-]?(raw|cfr|solo|recording|video|audio|synced|track)\b.*$/i, '');
    n = n.replace(/[-_ ]+[0-9a-f]{6,}.*$/i, '').replace(/[-_ ]+\d+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (!n) n = path.split('/').pop().replace(/\.[^.]+$/, '');
    if (n.length <= 4 && n === n.toLowerCase() && /^[a-z]+$/.test(n) && !/[aeiou]/.test(n)) return n.toUpperCase();      // "jvl" -> "JVL"
    return n.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }
  function guessRole(path) {
    var n = path.split('/').pop().toLowerCase();
    if (/\.(png|jpe?g|gif|psd|tiff?|webp|heic)$/.test(n)) return 'media';
    if (mode === 'live' && /master|full[ _-]?raw|program|stream|composite|back ?channel|backup|mixed/.test(n)) return 'master';
    return 'person';
  }
  function people() { return files.filter(function (f) { return f.role === 'person'; }); }
  function clock(s) {
    var neg = s < 0; s = Math.abs(s);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(2);
    return (neg ? '-' : '') + (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function drawFiles() {
    var box = $('sfiles'); box.innerHTML = '';
    files.forEach(function (f, i) {
      var row = document.createElement('div'); row.className = 'srow';
      var role = document.createElement('select');
      [['person', 'Person'], ['master', 'Master'], ['media', 'Media']].forEach(function (o) {
        if (o[0] === 'master' && mode !== 'live') return;
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (f.role === o[0]) op.selected = true; role.appendChild(op);
      });
      role.addEventListener('change', function () {
        if (role.value === 'master') files.forEach(function (g) { if (g !== f && g.role === 'master') g.role = 'person'; });     // only one master
        f.role = role.value; f.offset = undefined; drawFiles();
      });
      row.appendChild(role);
      if (window.bulwarkPicker) window.bulwarkPicker(role);
      if (f.role === 'person') {
        var name = document.createElement('input'); name.type = 'text'; name.value = f.name; name.placeholder = 'Name'; name.title = 'This person\'s nest is named this';
        name.addEventListener('input', function () { f.name = name.value; });
        row.appendChild(name);
      }
      var fn = document.createElement('span'); fn.className = 'fname'; fn.textContent = f.path.split('/').pop(); fn.title = f.path; row.appendChild(fn);
      if (f.role === 'person' && f.offset !== undefined && mode === 'live') {
        var off = document.createElement('span'); off.className = 'off'; off.textContent = clock(f.offset); off.title = 'Where this recording starts on the master recording'; row.appendChild(off);
      }
      function btn(text, title, fn2) { var b = document.createElement('span'); b.className = 'mv'; b.textContent = text; b.title = title; b.addEventListener('click', fn2); row.appendChild(b); }
      if (f.role === 'person') {
        btn('↑', 'Move up (further left in the wide shot)', function () { if (i > 0) { files.splice(i - 1, 0, files.splice(i, 1)[0]); drawFiles(); } });
        btn('↓', 'Move down (further right in the wide shot)', function () { if (i < files.length - 1) { files.splice(i + 1, 0, files.splice(i, 1)[0]); drawFiles(); } });
      }
      btn('×', 'Take this file off the list', function () { files.splice(i, 1); drawFiles(); });
      box.appendChild(row);
    });
    fillLayouts();
  }
  function fillLayouts() {
    var n = people().length;
    [['swide', 'wide', 'No wide shot'], ['smedia', 'media', 'No media layout']].forEach(function (cfg) {
      var sel = $(cfg[0]), keep = sel.value, list = layouts(cfg[1]).filter(function (l) { return l.people.length === n; });
      sel.innerHTML = '';
      list.forEach(function (l, i) { var o = document.createElement('option'); o.value = l.name; o.textContent = l.name + (l.mine ? ' (mine)' : ''); sel.appendChild(o); });
      var none = document.createElement('option'); none.value = ''; none.textContent = list.length || n < 2 ? cfg[2] : cfg[2] + ' (no layout saved for ' + n + ' people)'; sel.appendChild(none);
      // the last choice for this number of people, else the user's own layout, else the first shipped one
      var last = store('bulwark_setup_' + cfg[1] + n), pick = '';
      list.forEach(function (l) { if (l.name === keep || (!pick && l.name === last)) pick = l.name; });
      if (!pick && last !== '' && list.length) pick = (list.filter(function (l) { return l.mine; })[0] || list[0]).name;
      sel.value = pick;
    });
    fillFrames();
  }
  ['swide', 'smedia'].forEach(function (id) { $(id).addEventListener('change', function () { store('bulwark_setup_' + (id === 'swide' ? 'wide' : 'media') + people().length, $(id).value); fillFrames(); }); });

  // ---- which frame goes on top: the layout's own, or any still in the project's 16x9 frame bins ----
  var projectFrames = [];                          // [{ bin, name }]
  function layoutNamed(kind, id) { var name = $(id).value, n = people().length; return name ? layouts(kind).filter(function (l) { return l.name === name && l.people.length === n; })[0] || null : null; }
  function fillFrames() {
    [['swframe', 'wide', 'swide'], ['smframe', 'media', 'smedia']].forEach(function (cfg) {
      var sel = $(cfg[0]), l = layoutNamed(cfg[1], cfg[2]), keep = store('bulwark_setupframe_' + cfg[1] + '_' + (l ? l.name : '')), has = false;
      sel.innerHTML = '';
      function add(value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); if (value === keep) has = true; }
      add('*', l ? (l.frame ? 'The layout\'s own: ' + l.frame.replace(/\.[a-z]+$/i, '') : 'The layout\'s own: none') : 'None');
      if (l) {
        projectFrames.forEach(function (f) { if (f.name !== l.frame) add(f.name, f.name.replace(/\.[a-z]+$/i, '') + '  (' + f.bin + ')'); });
        if (l.frame) add('', 'No frame');
      }
      sel.value = has ? keep : '*'; sel.disabled = !l;
    });
    $('sframehint').textContent = projectFrames.length ? '' : 'No "16x9 Frames" bin was found in this project, so only each layout\'s own frame is offered. Import the frame assets to choose from them.';
  }
  function loadFrames() {
    jsx('typeof $.bulwark.setupFrames === "function" ? $.bulwark.setupFrames() : "WAIT"', function (r) {
      if (r === 'WAIT') return setTimeout(loadFrames, 700);
      var p = r.split('|'), list = [];
      if (p[0] === 'OK') p.slice(1).forEach(function (x) { var f = x.split('\t'); if (f[1]) list.push({ bin: f[0], name: f[1] }); });
      if (JSON.stringify(list) !== JSON.stringify(projectFrames)) { projectFrames = list; fillFrames(); }
    });
  }
  ['swframe', 'smframe'].forEach(function (id) { $(id).addEventListener('change', function () { var kind = id === 'swframe' ? 'wide' : 'media', l = layoutNamed(kind, id === 'swframe' ? 'swide' : 'smedia'); store('bulwark_setupframe_' + kind + '_' + (l ? l.name : ''), $(id).value); }); });
  window.addEventListener('focus', loadFrames);
  document.querySelector('#tabs span[data-tab=setup]').addEventListener('click', loadFrames);
  // a layout with the chosen frame put in place of its own
  function withFrame(l, id) {
    if (!l) return null;
    var v = $(id).value;
    if (v === '*') return l;
    var copy = JSON.parse(JSON.stringify(l)); copy.frame = v; copy.frameFit = !!v;
    return copy;
  }
  function drawMode() {
    [].forEach.call($('smode').children, function (c) { c.className = 'chip' + (c.getAttribute('data-mode') === mode ? ' on' : ''); });
    $('smodehint').textContent = mode === 'live'
      ? 'Add each person\'s recording and the master recording of the stream. Each person is lined up to the master by sound, so they all play in sync.'
      : 'Add each person\'s recording. They are taken to start at the same moment. The order here is left to right in the wide shot.';
    if (mode !== 'live') files.forEach(function (f) { if (f.role === 'master') f.role = 'person'; f.offset = undefined; });
    drawFiles();
  }
  [].forEach.call($('smode').children, function (c) { c.addEventListener('click', function () { if (busy) return; mode = c.getAttribute('data-mode'); store('bulwark_setupmode', mode); drawMode(); }); });
  function addFiles(paths) {
    if (busy) return;
    paths.forEach(function (p) {
      if (files.some(function (f) { return f.path === p; })) return;
      files.push({ path: p, role: guessRole(p), name: guessName(p) });
    });
    if (mode === 'live' && files.filter(function (f) { return f.role === 'master'; }).length > 1) { var seen = false; files.forEach(function (f) { if (f.role === 'master') { if (seen) f.role = 'person'; seen = true; } }); }
    drawFiles();
    if (!$('smain').value) jsx('app.project ? app.project.name : ""', function (n) { if (!$('smain').value && n) $('smain').value = n.replace(/\.prproj$/i, '') + ' - YouTube'; });
  }
  window.bulwarkSetupAdd = addFiles;                // lets paths be handed in directly
  $('sadd').addEventListener('click', function () {
    var r = cep.fs.showOpenDialogEx(true, false, 'Choose the recordings', store('bulwark_setupdir') || '', ['mp4', 'mov', 'm4v', 'mxf', 'mkv', 'wav', 'mp3', 'm4a', 'aif', 'png', 'jpg', 'jpeg', 'psd']);
    if (r.err || !r.data || !r.data.length) return;
    store('bulwark_setupdir', r.data[0].split('/').slice(0, -1).join('/'));
    addFiles(r.data);
  });

  // ---- livestream: where each person's recording starts on the master ----
  function sync(cb) {
    var master = files.filter(function (f) { return f.role === 'master'; })[0], P = people(), out = DIR + '/sync.json';
    unpack(function (err) {
      if (err) return cb(err);
      cep.fs.deleteFile(out);
      var args = [SYNC, out, master.path].concat(P.map(function (f) { return f.path; }));
      var proc = cep.process.createProcess.apply(cep.process, args), done = false;
      if (proc.err) return cb('Could not start the sync helper.');
      try { cep.process.stdout(proc.data, function (text) {
        String(text).split('\n').forEach(function (line) {
          var p = line.split('|');
          if (p[0] === 'read') say('Sync: lining up the recordings by their sound (about 15 seconds for a long show)…');
          else if (p[0] === 'match') say('Sync: lining up ' + p.slice(3).join('|') + ' (' + p[1] + ' of ' + p[2] + '): ' + Math.round((+p[1] - 0.5) / +p[2] * 100) + '%…');
        });
      }); } catch (e) {}
      function fin() {
        if (done) return; done = true;
        var res = readJSON(out, null);
        if (!res) return cb('The sync helper did not finish.');
        if (res.error) return cb(res.error);
        var bad = [];
        P.forEach(function (f) {
          var it = (res.items || []).filter(function (x) { return x.path === f.path; })[0];
          if (!it || it.offset === undefined) { bad.push(f.name + ' (could not be read)'); f.offset = undefined; return; }
          f.offset = it.offset; f.sure = !!it.ok;
          if (!it.ok) bad.push(f.name + ' (weak match)');
        });
        cb(null, bad);
      }
      cep.process.onquit(proc.data, function () { setTimeout(fin, 300); });
      setTimeout(fin, 30 * 60000);
    });
  }

  // ---- run ----
  function notes(list, undoable) {
    var box = $('snotes'); box.innerHTML = '';
    list.forEach(function (t) { var r = document.createElement('div'); r.className = 'rv'; r.textContent = t; box.appendChild(r); });
    if (undoable && made && made.length) {
      var r2 = document.createElement('div'); r2.className = 'rv';
      var a = document.createElement('a'); a.className = 'link'; a.textContent = 'Undo: delete the ' + made.length + ' sequences this made';
      a.title = 'Removes ' + made.join(', ') + '. The imported files stay in the project.';
      a.addEventListener('click', function () {
        jsx('$.bulwark.setupUndo(' + q(JSON.stringify(made)) + ')', function (r) {
          var p = r.split('|');
          say(p[0] === 'OK' ? p[1] + ' sequences deleted. The imported files are still in the project.' : (p.slice(1).join('|') || 'Premiere did not answer.'), p[0] === 'OK' ? 'ok' : 'err');
          if (p[0] === 'OK') { made = null; box.innerHTML = ''; }
        });
      });
      r2.appendChild(a); box.appendChild(r2);
    }
  }
  function build(force) {
    var P = people(), master = files.filter(function (f) { return f.role === 'master'; })[0];
    function pick(kind, id) { var name = $(id).value; return name ? layouts(kind).filter(function (l) { return l.name === name && l.people.length === P.length; })[0] || null : null; }
    unpack(function (err) {
      if (err) return done(err);
      var tpl = $('smixer').checked ? template() : null;
      var cfg = {
        fps: $('sfps').value, mainName: $('smain').value.replace(/^\s+|\s+$/g, '') || 'MAIN SEQUENCE',
        people: P.map(function (f) { return { name: f.name.replace(/^\s+|\s+$/g, ''), path: f.path, offset: mode === 'live' ? (f.offset || 0) : 0 }; }),
        master: mode === 'live' && master ? { path: master.path } : null,
        media: files.filter(function (f) { return f.role === 'media'; }).map(function (f) { return f.path; }),
        wide: P.length > 1 ? withFrame(pick('wide', 'swide'), 'swframe') : null, mediaLayout: P.length > 1 ? withFrame(pick('media', 'smedia'), 'smframe') : null,
        template: tpl ? { path: tpl.path, id: tpl.id, from: tpl.from } : null, mixer: $('smixer').checked ? mixer : null
      };
      var path = DIR + '/config.json';
      if (cep.fs.writeFile(path, JSON.stringify(cfg)).err) return done('Could not write to ' + DIR + '.');
      say('Building the nests and sequences…');
      jsx('$.bulwark.setupRun(' + q(path) + ')', function (r) {
        if (r.indexOf('OK|') !== 0) return done(r.split('|').slice(1).join('|') || 'Premiere did not answer: ' + r);
        var res = {}; try { res = JSON.parse(r.slice(3)); } catch (e) {}
        made = res.made || [];
        lock(false);
        say('Done. "' + res.main + '" is open, with ' + P.length + (P.length === 1 ? ' person' : ' people') + ' stacked on it. Made: ' + made.join(', ') + '.', 'ok');
        notes(res.notes || [], true);
      });
    });
    function done(msg) { lock(false); say(msg, 'err'); }
  }
  $('srun').addEventListener('click', function () {
    var P = people(), master = files.filter(function (f) { return f.role === 'master'; })[0], names = {};
    $('snotes').innerHTML = '';
    if (!P.length) return say('Add each person\'s video first.', 'err');
    for (var i = 0; i < P.length; i++) {
      var n = P[i].name.replace(/^\s+|\s+$/g, '');
      if (!n) return say('Give every person a name: it becomes the name of their nest.', 'err');
      if (names[n.toLowerCase()]) return say('Two people are both named "' + n + '". Give each a different name.', 'err');
      names[n.toLowerCase()] = true;
    }
    if (mode === 'live' && !master) return say('Livestream mode needs the master recording. Add it and set its role to Master, or switch to Raw video.', 'err');
    lock(true);
    if (mode !== 'live') return build();
    say('Sync: starting…');
    sync(function (err, bad) {
      drawFiles();
      if (err) { lock(false); return say(err, 'err'); }
      if (bad && bad.length) {
        // not sure of a match: show what was found and let the editor decide
        lock(false);
        say('Could not be sure of the sync for: ' + bad.join(', ') + '. The times found are shown beside each name. Check the files are from the same stream as the master.', 'err');
        var box = $('snotes'), r = document.createElement('div'); r.className = 'rv';
        var a = document.createElement('a'); a.className = 'link'; a.textContent = 'Set up anyway with these times (check the sync by ear afterwards)';
        a.addEventListener('click', function () { box.innerHTML = ''; lock(true); build(); });
        r.appendChild(a); box.appendChild(r);
        return;
      }
      build();
    });
  });

  // ---- teaching it a layout or a mixer template from a finished project ----
  function saveLayout(kind) {
    jsx('$.bulwark.layoutRead()', function (r) {
      if (r.indexOf('OK|') !== 0) return say(r.split('|').slice(1).join('|') || 'Premiere did not answer.', 'err');
      var l; try { l = JSON.parse(r.slice(3)); } catch (e) { return say('Could not read that layout.', 'err'); }
      var all = mine(), list = all[kind] || [], name = l.from + ' (' + l.people.length + (l.people.length === 1 ? ' person' : ' people') + ')';
      l.people.forEach(function (p) { delete p.was; });
      list = list.filter(function (x) { return x.name !== name; });
      list.push({ name: name, people: l.people, frame: l.frame, frameScale: l.frameScale });
      all[kind] = list; store('bulwark_setuplayouts', JSON.stringify(all));
      store('bulwark_setup_' + kind + l.people.length, name);
      fillLayouts(); drawSaved();
      say('Saved "' + name + '" as a ' + (kind === 'wide' ? 'wide shot' : 'media') + ' layout' + (l.frame ? ', with the frame ' + l.frame : ', with no frame') + '. It is offered whenever ' + l.people.length + ' people are listed.', 'ok');
    });
  }
  $('ssavewide').addEventListener('click', function () { saveLayout('wide'); });
  $('ssavemedia').addEventListener('click', function () { saveLayout('media'); });
  function drawSaved() {
    var box = $('slayouts'), all = mine(); box.innerHTML = '';
    ['wide', 'media'].forEach(function (kind) {
      (all[kind] || []).forEach(function (l) {
        var row = document.createElement('div'); row.textContent = (kind === 'wide' ? 'Wide shot: ' : 'Media layout: ') + l.name + '  ';
        var a = document.createElement('a'); a.className = 'link'; a.textContent = 'forget';
        a.addEventListener('click', function () { var m = mine(); m[kind] = (m[kind] || []).filter(function (x) { return x.name !== l.name; }); store('bulwark_setuplayouts', JSON.stringify(m)); fillLayouts(); drawSaved(); });
        row.appendChild(a); box.appendChild(row);
      });
    });
    var t = template();
    $('stplinfo').textContent = t ? 'The main sequence starts from ' + (t.mine ? 'your template, saved from "' + t.from + '"' : 'the Bulwark template') + ': ' + (t.fx || []).join('; ') + '.' : 'No mixer template was found: the main sequence is made plain.';
    $('sresettpl').style.display = t && t.mine ? '' : 'none';
  }
  $('ssavetpl').addEventListener('click', function () {
    unpack(function (err) {
      if (err) return say(err, 'err');
      say('Saving the open sequence\'s track mixer as the template (Premiere is busy for up to a minute on a full episode)…');
      $('ssavetpl').disabled = true;
      setTimeout(function () {
        jsx('$.bulwark.templateSave(' + q(MYTPL) + ')', function (r) {
          $('ssavetpl').disabled = false;
          if (r.indexOf('OK|') !== 0) return say(r.split('|').slice(1).join('|') || 'Premiere did not answer.', 'err');
          var info; try { info = JSON.parse(r.slice(3)); } catch (e) { return say('The template was not saved.', 'err'); }
          cep.fs.writeFile(MYTPLINFO, JSON.stringify(info));
          drawSaved();
          say('Template saved from "' + info.from + '" (' + info.audio + ' audio tracks' + (info.fx.length ? '; ' + info.fx.join('; ') : '') + '). Mix track effects are kept too. Every new main sequence now starts from it.', 'ok');
        });
      }, 80);
    });
  });
  $('sresettpl').addEventListener('click', function () { cep.fs.deleteFile(MYTPL); cep.fs.deleteFile(MYTPLINFO); drawSaved(); say('Back to the Bulwark template.', 'ok'); });
  $('sfps').value = store('bulwark_setupfps') || '23.976';
  $('sfps').addEventListener('change', function () { store('bulwark_setupfps', $('sfps').value); });
  $('smixer').checked = store('bulwark_setupmixer') !== 'off';
  $('smixer').addEventListener('change', function () { store('bulwark_setupmixer', $('smixer').checked ? 'on' : 'off'); });

  drawMode(); drawSaved(); loadFrames();
})();
