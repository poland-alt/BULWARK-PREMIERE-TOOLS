// Bulwark Premiere Tools: the Clips, Captions and Settings tabs. Transcribe on this Mac -> ask Claude for clips -> cut them;
// and transcribe a vertical clip -> place active-word captions.
(function () {
  var E = window.BulwarkEngine, csi = new CSInterface();
  var MAC = /Mac/i.test(navigator.platform) && window.cep && cep.process && cep.process.createProcess;
  var WORK = csi.getSystemPath(SystemPath.USER_DATA) + '/Bulwark Tools';
  var EXT = csi.getSystemPath(SystemPath.EXTENSION);
  var HELPER = WORK + '/transcribe', WHISPER = WORK + '/wtranscribe', MODELS = WORK + '/models', MOGRT = WORK + '/Bulwark Word Fill Vertical.mogrt';
  var MODEL = 'claude-opus-5-5';
  // settings: the fields on the Settings tab (and two on Captions), remembered on this Mac
  var DEFAULTS = { size: '56', stroke: '7', ypos: '67', names: '', clipmin: '90', clipmax: '150', bin: 'SOCIAL CLIPS 16x9', fix: 'on' };
  function $(id) { return document.getElementById(id); }
  function say(el, text, cls) { el.className = 'status' + (cls ? ' ' + cls : ''); el.textContent = text; }
  function jsx(code, cb) { csi.evalScript(code, function (r) { cb(String(r || '')); }); }
  function q(v) { return JSON.stringify(v); }
  function num(id, lo, hi, dflt) { var v = parseFloat($(id).value); return v >= lo && v <= hi ? v : dflt; }
  function binName() { return $('bin').value.replace(/[\\\/|\r\n]/g, ' ').replace(/^\s+|\s+$/g, '') || DEFAULTS.bin; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  jsx('$.evalFile(' + q(EXT + '/jsx/captions.jsx') + ')', function () {});

  // ---- the helper and the template travel inside the panel as text; unpack them once per version ----
  function setUp(cb) {
    if (!MAC) return cb('Transcribing only works on a Mac for now.');
    var ver = '0';
    try { ver = (/ExtensionBundleVersion="([\d.]+)"/.exec(cep.fs.readFile(EXT + '/CSXS/manifest.xml').data) || [])[1] || '0'; } catch (e) {}
    cep.fs.makedir(WORK);
    var mark = cep.fs.readFile(WORK + '/version.txt');
    if (!mark.err && mark.data === ver && !cep.fs.stat(HELPER).err && !cep.fs.stat(WHISPER).err && !cep.fs.stat(MOGRT).err) return cb(null);
    var parts = [['/bin/transcribe.b64', HELPER], ['/bin/wtranscribe.b64', WHISPER], ['/templates/Bulwark Word Fill Vertical.mogrt.b64', MOGRT]];
    for (var i = 0; i < parts.length; i++) {
      var src = cep.fs.readFile(EXT + parts[i][0]);
      if (src.err) return cb('Part of the panel is missing. Reinstall it from the zip.');
      if (cep.fs.writeFile(parts[i][1], src.data.replace(/\s+/g, ''), cep.encoding.Base64).err) return cb('Could not set up the transcriber in ' + WORK + '.');
    }
    var p = cep.process.createProcess('/bin/chmod', '755', HELPER, WHISPER);
    if (p.err) return cb('Could not set up the transcriber.');
    var done = false;
    function fin() { if (done) return; done = true; cep.fs.writeFile(WORK + '/version.txt', ver); cb(null); }
    cep.process.onquit(p.data, fin); setTimeout(fin, 3000);
  }

  // Runs a helper that writes JSON to `json`; cb(result object or null)
  function runHelper(args, json, cb) {
    cep.fs.deleteFile(json);
    var proc = cep.process.createProcess.apply(cep.process, args), done = false;
    function fin() {
      if (done) return; done = true;
      var res = null;
      try { res = JSON.parse(cep.fs.readFile(json).data); } catch (e) {}
      cb(res);
    }
    if (proc.err) { done = true; return cb(null); }
    cep.process.onquit(proc.data, function () { setTimeout(fin, 300); });
    setTimeout(fin, 60 * 60000);
  }

  // ---- words of the open sequence: cb(err, { id, name, total, frame, w, h, words, timed }) ----
  function transcribe(status, fresh, cb) {
    setUp(function (err) {
      if (err) return cb(err);
      jsx('$.bulwark.seqInfo()', function (r) {
        var p = r.split('|');
        if (p[0] !== 'OK') return cb(p.slice(1).join('|') || 'Premiere did not answer. Close and reopen the panel.');
        var info = { id: p[1], total: +p[2], frame: +p[3], w: +p[4], h: +p[5], name: p.slice(6).join('|') };
        var cache = WORK + '/words-' + info.id + '.json';
        if (!fresh) {
          try {
            var c = JSON.parse(cep.fs.readFile(cache).data);
            if (Math.abs(c.total - info.total) < 0.02 && c.words.length) { info.words = c.words; info.timed = c.timed; info.tight = c.tight; info.cached = true; return cb(null, info); }
          } catch (e) {}
        }
        var mins = Math.max(1, Math.round(info.total / 60));
        status('Exporting the audio (Premiere is busy for a moment' + (mins > 10 ? '; a ' + mins + ' minute sequence can take a few minutes' : '') + ')…');
        setTimeout(function () {
          var wav = WORK + '/audio.wav';
          jsx('$.bulwark.exportAudio(' + q(wav) + ')', function (r2) {
            if (r2 !== 'OK') return cb(r2.split('|').slice(1).join('|') || 'Premiere could not export the audio.');
            var first = !!cep.fs.stat(MODELS + '/ready.txt').err;
            status(first ? 'Getting the speech model (about 640 MB, this Mac\'s first time only; a few minutes)…' : 'Transcribing on this Mac' + (mins > 5 ? ' (about ' + Math.max(1, Math.round(mins / 7)) + ' min for a sequence this long)' : '') + '…');
            // WhisperKit for the words, Apple's dictation recogniser for tight word times, side by side
            var heard, tight, left = 2;
            function both() {
              if (--left) return;
              var w = heard && heard.words && heard.words.length ? heard.words : null, t = tight && tight.words && tight.words.length ? tight.words : null;
              if (!w && !(heard && heard.words)) {
                // WhisperKit could not run (no internet for the model, older Mac): Apple's recognisers alone, if this Mac has them
                return runHelper([HELPER, wav, WORK + '/words.json'], WORK + '/words.json', function (r5) {
                  cep.fs.deleteFile(wav);
                  if (!r5 || !r5.words || !r5.words.length) return cb('The transcriber did not finish' + (heard && heard.error ? ': ' + heard.error : '') + '. It needs an Apple silicon Mac on macOS 14 or later, and the internet the first time (to get the speech model).');
                  info.words = r5.words; info.timed = r5.timed; info.tight = true; info.apple = true;
                  cb(null, info);
                });
              }
              cep.fs.deleteFile(wav);
              if (!w) return cb('No speech was found in this sequence.');
              cep.fs.writeFile(MODELS + '/ready.txt', 'ok');
              var m = t ? E.mergeTimes(w, t) : E.whisperOnly(w);
              info.words = m.words; info.timed = m.timed; info.tight = !!t;
              cep.fs.writeFile(cache, JSON.stringify({ total: info.total, words: m.words, timed: m.timed, tight: info.tight }));
              cb(null, info);
            }
            runHelper([WHISPER, wav, WORK + '/words.json', MODELS], WORK + '/words.json', function (r3) { heard = r3; both(); });
            runHelper([HELPER, wav, WORK + '/tight.json', 'tight'], WORK + '/tight.json', function (r4) { tight = r4; both(); });
          });
        }, 60);
      });
    });
  }

  // ---- Claude ----
  function claude(system, user, schema, effort, cb, plain) {
    var key = store('bulwarkClaudeKey');
    if (!key) return cb('Add a Claude API key on the Settings tab first.');
    var body = { model: MODEL, max_tokens: 16000, system: system, messages: [{ role: 'user', content: user }],
      output_config: { effort: effort, format: { type: 'json_schema', schema: schema } } };
    if (!plain) body.fallbacks = 'default';      // if a safety filter declines, let the API retry on its fallback model
    var x = new XMLHttpRequest();
    x.open('POST', 'https://api.anthropic.com/v1/messages', true);
    x.setRequestHeader('content-type', 'application/json');
    x.setRequestHeader('x-api-key', key);
    x.setRequestHeader('anthropic-version', '2026-10-21');
    x.setRequestHeader('anthropic-dangerous-direct-browser-access', 'true');   // the key is the editor's own, kept on their Mac
    if (!plain) x.setRequestHeader('anthropic-beta', 'server-side-fallback-2026-07-01');
    x.timeout = 15 * 60000;
    x.onerror = function () { cb('Could not reach Claude. Check the internet connection.'); };
    x.ontimeout = function () { cb('Claude took too long to answer. Try again.'); };
    x.onload = function () {
      var res = null;
      try { res = JSON.parse(x.responseText); } catch (e) {}
      var msg = res && res.error && res.error.message || '';
      if (x.status === 400 && !plain && /fallback|beta/i.test(msg)) return claude(system, user, schema, effort, cb, true);
      if (x.status === 401) return cb('Claude did not accept the API key. Paste it again on the Settings tab.');
      if (x.status === 429) return cb('Claude is rate limiting this key. Wait a minute and try again.');
      if (x.status >= 500) return cb('Claude is having trouble (' + x.status + '). Try again in a minute.');
      if (x.status !== 200 || !res) return cb('Claude returned an error (' + x.status + ')' + (msg ? ': ' + msg : '.'));
      if (res.stop_reason === 'refusal') return cb('Claude declined to work on this transcript.');
      if (res.stop_reason === 'max_tokens') return cb('Claude ran out of room answering. Try again.');
      var text = '';
      for (var i = 0; i < (res.content || []).length; i++) if (res.content[i].type === 'text') text += res.content[i].text;
      try { cb(null, JSON.parse(text)); } catch (e2) { cb('Claude answered in a form the panel could not read. Try again.'); }
    };
    x.send(JSON.stringify(body));
  }

  // ---- no key: the same question by copy and paste through Claude chat ----
  // box: where the two buttons go. shape: an example of the JSON wanted. cb(err, result); err 'skip' / 'cancel' when the editor backs out.
  function clip(toClipboard, text, cb) {       // the Mac clipboard, through files so nothing is cut short or mangled
    var f = WORK + '/clipboard.txt';
    if (toClipboard && cep.fs.writeFile(f, text).err) return cb('Could not write to ' + WORK + '.');
    if (!toClipboard) cep.fs.deleteFile(f);
    var p = cep.process.createProcess('/bin/sh', '-c', (toClipboard ? '/usr/bin/pbcopy < ' : 'LANG=en_US.UTF-8 /usr/bin/pbpaste > ') + "'" + f.replace(/'/g, "'\\''") + "'"), done = false;
    if (p.err) return cb('Could not reach the clipboard.');
    function fin() { if (done) return; done = true; var r = toClipboard ? { data: '' } : cep.fs.readFile(f); cep.fs.deleteFile(f); cb(r.err ? 'Could not read the clipboard.' : null, r.data); }
    cep.process.onquit(p.data, function () { setTimeout(fin, 150); }); setTimeout(fin, 5000);
  }
  function byPaste(box, what, system, user, shape, field, skipLabel, cb) {
    var prompt = system + '\n\nAnswer with one JSON object in exactly this shape, inside a single code block, and nothing else before or after it:\n' + shape + '\n\n' + user;
    box.innerHTML = ''; box.className = 'manual';
    function el(tag, text, cls) { var e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; box.appendChild(e); return e; }
    el('div', 'No API key saved, so this step goes through Claude chat:', 'mtitle');
    var b1 = el('button', '1. Copy ' + what + ' for Claude');
    el('div', '2. Paste it into a new chat at claude.ai and send. When Claude has answered, use the copy button under its answer.', 'mstep');
    var b3 = el('button', '3. Paste Claude\'s answer'), msg = el('div', '', 'status');
    var row = el('div', '', 'mrow'), skip = skipLabel ? document.createElement('a') : null, cancel = document.createElement('a');
    if (skip) { skip.className = 'link'; skip.textContent = skipLabel; row.appendChild(skip); }
    cancel.className = 'link'; cancel.textContent = 'Cancel'; row.appendChild(cancel);
    function close(err, res) { box.innerHTML = ''; box.className = ''; cb(err, res); }
    b1.addEventListener('click', function () {
      clip(true, prompt, function (e) { say(msg, e || 'Copied (' + Math.round(prompt.length / 1000) + 'k characters). Now paste it into Claude chat.', e ? 'err' : 'ok'); });
    });
    b3.addEventListener('click', function () {
      clip(false, '', function (e, text) {
        if (e) return say(msg, e, 'err');
        text = String(text || '');
        var a = text.indexOf('{'), b = text.lastIndexOf('}'), res = null;
        if (a >= 0 && b > a) try { res = JSON.parse(text.slice(a, b + 1)); } catch (x) {}
        if (!res || !(res[field] instanceof Array)) {
          return say(msg, text.indexOf(system.slice(0, 40)) >= 0 ? 'The clipboard still holds what you copied in step 1. Copy Claude\'s answer first, then press this again.'
            : 'That does not look like Claude\'s answer. Copy the whole answer (the copy button under it), then press this again.', 'err');
        }
        close(null, res);
      });
    });
    if (skip) skip.addEventListener('click', function () { close('skip'); });
    cancel.addEventListener('click', function () { close('cancel'); });
  }
  // One question to Claude: straight to the API with a key, by copy and paste without one
  function ask(o, cb) {
    if (store('bulwarkClaudeKey')) { o.status(o.waiting); return claude(o.system, o.user, o.schema, o.effort, cb); }
    o.status(o.manual);
    byPaste(o.box, o.what, o.system, o.user, o.shape, o.field, o.skip, cb);
  }

  // ---- API key ----
  function keyState() { say($('keystat'), store('bulwarkClaudeKey') ? 'A key is saved on this Mac.' : 'No key saved: clip suggestions and proofreading go through Claude chat by copy and paste.', store('bulwarkClaudeKey') ? 'ok' : ''); }
  $('savekey').addEventListener('click', function () {
    var v = $('key').value.replace(/\s+/g, '');
    if (!v) return say($('keystat'), 'Paste the key into the box first.', 'err');
    store('bulwarkClaudeKey', v); $('key').value = ''; keyState();
  });
  $('clearkey').addEventListener('click', function () { try { localStorage.removeItem('bulwarkClaudeKey'); } catch (e) {} $('key').value = ''; keyState(); });
  keyState();

  // ---- 1. find clips ----
  var found = null;   // { info, clips }
  function busy(on) { var b = ['find', 'cut', 'caption']; for (var i = 0; i < b.length; i++) $(b[i]).disabled = on; }
  function showClips() {
    var box = $('clips'); box.innerHTML = '';
    if (!found || !found.clips.length) { $('cut').style.display = 'none'; return; }
    found.clips.forEach(function (c, i) {
      var d = document.createElement('div'); d.className = 'clip';
      var len = c.e - c.s, lo = num('clipmin', 15, 600, 90) - 15, hi = Math.max(lo + 30, num('clipmax', 30, 900, 150)) + 15, odd = len < lo || len > hi;
      d.innerHTML = '<div class="top"><input type="checkbox" checked><input type="text"><button class="secondary">Go to</button></div>' +
        '<div class="meta"></div><div class="head"></div><div class="why"></div><div class="ends"></div>';
      var inputs = d.getElementsByTagName('input');
      inputs[0].addEventListener('change', function () { c.off = !inputs[0].checked; });
      inputs[1].value = c.title; inputs[1].addEventListener('input', function () { c.title = inputs[1].value; });
      d.getElementsByTagName('button')[0].addEventListener('click', function () { jsx('$.bulwark.jump(' + c.s + ')', function () {}); });
      d.querySelector('.meta').textContent = E.clock(c.s) + ' to ' + E.clock(c.e) + '  (' + E.clock(len) + ')' + (odd ? '  outside ' + E.clock(lo) + ' to ' + E.clock(hi) + ', check it' : '');
      d.querySelector('.head').textContent = c.headline;
      d.querySelector('.why').textContent = c.why;
      d.querySelector('.ends').textContent = 'Starts: "' + c.first.slice(0, 70) + (c.first.length > 70 ? '…' : '') + '"  Ends: "' + (c.last.length > 70 ? '…' : '') + c.last.slice(-70) + '"';
      box.appendChild(d);
    });
    $('cut').style.display = '';
  }
  function findClips(fresh) {
    var st = $('fstat');
    busy(true); say($('cstat'), ''); found = null; showClips();
    transcribe(function (t) { say(st, t); }, fresh, function (err, info) {
      if (err) { busy(false); return say(st, err, 'err'); }
      if (info.total < 180) { busy(false); return say(st, 'This sequence is only ' + E.clock(info.total) + ' long. Open the full episode to find clips in it.', 'err'); }
      var sents = E.sentences(info.words);
      var lead = info.cached ? 'Using the transcript from last time. ' : 'Transcribed ' + info.words.length + ' words. ';
      var cmin = num('clipmin', 15, 600, 90), cmax = Math.max(cmin + 15, num('clipmax', 30, 900, 150));
      ask({ box: $('fmanual'), what: 'the transcript', field: 'clips', effort: 'high', schema: E.clipSchema,
        system: E.clipSystem(cmin, cmax), user: 'Episode: ' + info.name + '\nLength: ' + E.clock(info.total) + '\n\nTranscript:\n' + E.transcriptText(info.words, sents),
        shape: '{"clips": [{"first_line": 12, "last_line": 31, "title": "three to six words", "headline": "four to eight words", "why": "one sentence"}]}',
        status: function (t) { say(st, t); }, waiting: lead + 'Claude is analyzing the transcript (a minute or two)…', manual: lead + 'Follow the three steps below.' }, function (e2, res) {
        if (e2 === 'cancel') { busy(false); return say(st, 'Cancelled. The transcript is saved, so starting again is quick.'); }
        busy(false);
        if (e2) return say(st, e2, 'err');
        found = { info: info, clips: E.clipTimes(res.clips, info.words, sents, info.total) };
        showClips();
        st.className = 'status ok';
        st.textContent = found.clips.length ? found.clips.length + ' clip' + (found.clips.length === 1 ? '' : 's') + ' suggested from "' + info.name + '". Untick any you do not want, rename them, then cut. ' : 'Claude did not find a clip worth cutting. ';
        if (info.cached) {
          var a = document.createElement('a'); a.className = 'link'; a.textContent = 'Sequence changed? Transcribe again';
          a.addEventListener('click', function () { findClips(true); }); st.appendChild(a);
        }
      });
    });
  }
  $('find').addEventListener('click', function () { findClips(false); });

  $('cut').addEventListener('click', function () {
    if (!found) return;
    var st = $('cstat'), list = found.clips.filter(function (c) { return !c.off; }), i = 0, made = [], failed = [], BIN = binName();
    if (!list.length) return say(st, 'Tick at least one clip.', 'err');
    busy(true);
    (function next() {
      if (i >= list.length) {
        return jsx('$.bulwark.openSeq(' + q(found.info.id) + ')', function () {
          busy(false);
          say(st, made.length + ' sequence' + (made.length === 1 ? '' : 's') + ' cut into the bin "' + BIN + '":\n' + made.join('\n') +
            (failed.length ? '\nNot cut: ' + failed.join('; ') : '') + '\nNext: open one, make it vertical on the Reframe tab, then caption it on the Captions tab.', failed.length && !made.length ? 'err' : 'ok');
        });
      }
      var c = list[i++], name = 'SOC - ' + (c.title || 'Clip ' + i);
      say(st, 'Cutting ' + i + ' of ' + list.length + ': ' + name + '…');
      setTimeout(function () {
        jsx('$.bulwark.cutClip(' + [q(found.info.id), q(name), c.s, c.e, q(BIN)].join(',') + ')', function (r) {
          var p = r.split('|');
          if (p[0] === 'OK') made.push(name + '  (' + E.clock(+p[2]) + ')'); else failed.push(name + ': ' + (p.slice(1).join('|') || 'Premiere did not answer'));
          next();
        });
      }, 60);
    })();
  });

  // ---- 2. captions ----
  function capStyle() { $('capstyle').textContent = 'Size ' + num('size', 10, 200, 56) + ', stroke ' + num('stroke', 0, 100, 7) + (($('fix').checked) ? ', words proofread by Claude' : '') + ' (change on the Settings tab).'; $('binname').textContent = binName(); }
  function loadSettings() {
    for (var id in DEFAULTS) {
      var v = store('bulwark_' + id); if (v === null || v === undefined || v === '') v = DEFAULTS[id];
      if ($(id).type === 'checkbox') $(id).checked = v !== 'off'; else $(id).value = v;
    }
    capStyle();
  }
  Object.keys(DEFAULTS).forEach(function (id) {
    $(id).addEventListener('change', function () { store('bulwark_' + id, $(id).type === 'checkbox' ? ($(id).checked ? 'on' : 'off') : $(id).value); capStyle(); });
  });
  loadSettings();
  $('resetall').addEventListener('click', function () {
    for (var id in DEFAULTS) try { localStorage.removeItem('bulwark_' + id); } catch (e) {}
    loadSettings(); say($('updstat'), 'Settings are back to the defaults.', 'ok');
  });
  $('cleartx').addEventListener('click', function () {
    var n = 0, dir = cep.fs.readdir(WORK);
    if (!dir.err) for (var i = 0; i < dir.data.length; i++) if (/^words-.*\.json$/.test(dir.data[i]) && !cep.fs.deleteFile(WORK + '/' + dir.data[i]).err) n++;
    say($('txstat'), n ? n + ' saved transcript' + (n === 1 ? '' : 's') + ' cleared.' : 'No saved transcripts to clear.', 'ok');
  });
  $('checkupd').addEventListener('click', function () {
    say($('updstat'), 'Checking…');
    window.bulwarkCheckUpdates(function (state, have, latest) {
      if (state === 'update') say($('updstat'), 'Version ' + latest + ' is available: see the notice at the top of the panel.', 'ok');
      else if (state === 'current') say($('updstat'), 'You are on the latest version (v' + have + ').', 'ok');
      else say($('updstat'), 'Could not reach the update server. Check the internet connection.', 'err');
    });
  });

  // ---- caption outline (captions already in the sequence) ----
  function outline(scope) {
    var w = parseFloat($('oW').value), o = $('oOut');
    if (!(w >= 0)) return say(o, 'Enter an outline width of 0 or more.', 'err');
    $('oSel').disabled = $('oAll').disabled = true; say(o, 'Working…');
    jsx('$.bulwark.setOutline(' + w + ',"' + scope + '")', function (r) {
      $('oSel').disabled = $('oAll').disabled = false;
      var p = r.split('|');
      if (p.length < 4) return say(o, 'Premiere did not answer: ' + r, 'err');
      var updated = +p[0], noControl = +p[1], notGraphic = +p[2], err = p.slice(3).join('|');
      if (err) return say(o, err, 'err');
      var msg = 'Set Outline Width to ' + w + ' on ' + updated + ' caption' + (updated === 1 ? '' : 's') + '.';
      if (noControl) msg += '\n' + noControl + ' graphic' + (noControl === 1 ? ' has' : 's have') + ' no Outline Width control, left alone.';
      if (notGraphic && scope === 'selected') msg += '\n' + notGraphic + ' selected clip' + (notGraphic === 1 ? ' is' : 's are') + ' not a graphic, left alone.';
      say(o, msg, updated ? 'ok' : '');
    });
  }
  $('oSel').addEventListener('click', function () { outline('selected'); });
  $('oAll').addEventListener('click', function () { outline('all'); });

  $('caption').addEventListener('click', function () {
    var st = $('kstat'), size = parseFloat($('size').value), stroke = parseFloat($('stroke').value), y = parseFloat($('ypos').value);
    if (!(size > 0) || !(stroke >= 0) || !(y > 0 && y < 100)) return say(st, 'Check the size, stroke and height numbers.', 'err');
    busy(true);
    transcribe(function (t) { say(st, t); }, true, function (err, info) {
      if (err) { busy(false); return say(st, err, 'err'); }
      if (info.w > info.h) { busy(false); return say(st, 'This sequence is 16x9. Reformat it to 9x16 first, then caption the vertical one.', 'err'); }
      if (info.total > 900) { busy(false); return say(st, 'This sequence is ' + E.clock(info.total) + ' long. Captions are meant for clips; open the vertical clip.', 'err'); }
      var notes = [];
      function place() {
        var caps = E.captions(info.words, info.frame, info.total), i = 0, track = -1, placed = 0;
        (function batch() {
          if (i >= caps.length) {
            busy(false);
            return say(st, placed + ' captions placed on V' + (track + 1) + ' of "' + info.name + '".' + (notes.length ? '\n' + notes.join('\n') : '') +
              '\nPlay it through once: fix any wrong word in the Caption field of that clip.', 'ok');
          }
          var lines = [];
          for (var n = 0; n < 30 && i < caps.length; n++, i++) lines.push([caps[i].s.toFixed(5), caps[i].e.toFixed(5), caps[i].text.replace(/[\t\n]/g, ' '), caps[i].timing].join('\t'));
          say(st, 'Placing captions: ' + Math.min(i, caps.length) + ' of ' + caps.length + '…');
          jsx('$.bulwark.placeCaptions(' + [q(MOGRT), track, q(lines.join('\n')), size, stroke, y / 100].join(',') + ')', function (r) {
            var p = r.split('|');
            if (p[0] !== 'OK') { busy(false); return say(st, (p[1] || 'Premiere did not answer.') + (placed ? '\n' + placed + ' captions were placed before that.' : ''), 'err'); }
            track = +p[1]; placed += +p[2];
            setTimeout(batch, 30);
          });
        })();
      }
      if (info.apple) notes.push('The Whisper speech model could not be used, so Apple\'s recogniser did the words: expect more misheard words.');
      if (!info.tight) notes.push('This Mac is older than macOS 26, so word timing is a little looser: check the highlight after pauses.');
      else if (info.timed < 0.6) notes.push('Word timing could only be pinned down on ' + Math.round(info.timed * 100) + '% of words (noisy audio or music): check the highlight.');
      if (!$('fix').checked) return place();
      var names = $('names').value.replace(/^\s+|\s+$/g, '');
      ask({ box: $('kmanual'), what: 'the words', field: 'fixes', effort: 'medium', schema: E.fixSchema, skip: 'Skip proofreading',
        system: E.fixSystem(), user: 'Clip: ' + info.name + (names ? '\nNames that may come up: ' + names : '') + '\n\nWords:\n' + E.numbered(info.words),
        shape: '{"fixes": [{"n": 14, "word": "Putin"}]}',
        status: function (t) { say(st, t); }, waiting: 'Claude is proofreading ' + info.words.length + ' words…', manual: 'Transcribed ' + info.words.length + ' words. Follow the three steps below to have Claude proofread them, or skip.' }, function (e2, res) {
        if (e2 === 'cancel') { busy(false); return say(st, 'Cancelled. No captions were placed.'); }
        if (e2 === 'skip') { notes.push('Words were not proofread.'); return place(); }
        if (e2) notes.push('Words were not proofread: ' + e2);
        else { var n = E.applyFixes(info.words, res.fixes); notes.push(n ? 'Claude corrected ' + n + ' word' + (n === 1 ? '' : 's') + '.' : 'Claude found nothing to correct.'); }
        place();
      });
    });
  });
})();
