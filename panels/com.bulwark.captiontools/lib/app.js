// Bulwark Clips & Captions: the panel side. Transcribe on this Mac -> ask Claude for clips -> cut them;
// and transcribe a vertical clip -> place active-word captions.
(function () {
  var E = window.BulwarkEngine, csi = new CSInterface();
  var MAC = /Mac/i.test(navigator.platform) && window.cep && cep.process && cep.process.createProcess;
  var WORK = csi.getSystemPath(SystemPath.USER_DATA) + '/Bulwark Tools';
  var EXT = csi.getSystemPath(SystemPath.EXTENSION);
  var HELPER = WORK + '/transcribe', WHISPER = WORK + '/wtranscribe', MODELS = WORK + '/models', MOGRT = WORK + '/Bulwark Word Fill Vertical.mogrt';
  var BIN = 'SOCIAL CLIPS 16x9', MODEL = 'claude-opus-5-5';
  function $(id) { return document.getElementById(id); }
  function say(el, text, cls) { el.className = 'status' + (cls ? ' ' + cls : ''); el.textContent = text; }
  function jsx(code, cb) { csi.evalScript(code, function (r) { cb(String(r || '')); }); }
  function q(v) { return JSON.stringify(v); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

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
            status(first ? 'Getting the speech model (about 640 MB, this Mac\'s first time only; a few minutes)…' : 'Transcribing on this Mac…');
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
    if (!key) return cb('Add a Claude API key at the bottom of this panel first.');
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
      if (x.status === 401) return cb('Claude did not accept the API key. Paste it again at the bottom of the panel.');
      if (x.status === 429) return cb('Claude is rate limiting this key. Wait a minute and try again.');
      if (x.status >= 500) return cb('Claude is having trouble (' + x.status + '). Try again in a minute.');
      if (x.status !== 200 || !res) return cb('Claude returned an error (' + x.status + ')' + (msg ? ': ' + msg : '.'));
      if (res.stop_reason === 'refusal') return cb('Claude declined to work on this transcript.');
      if (res.stop_reason === 'max_tokens') return cb('Claude ran out of room answering. Try again, or ask for fewer clips.');
      var text = '';
      for (var i = 0; i < (res.content || []).length; i++) if (res.content[i].type === 'text') text += res.content[i].text;
      try { cb(null, JSON.parse(text)); } catch (e2) { cb('Claude answered in a form the panel could not read. Try again.'); }
    };
    x.send(JSON.stringify(body));
  }

  // ---- API key ----
  function keyState() { say($('keystat'), store('bulwarkClaudeKey') ? 'A key is saved on this Mac.' : 'No key saved yet.', store('bulwarkClaudeKey') ? 'ok' : ''); }
  $('savekey').addEventListener('click', function () {
    var v = $('key').value.replace(/\s+/g, '');
    if (!v) { store('bulwarkClaudeKey', ''); try { localStorage.removeItem('bulwarkClaudeKey'); } catch (e) {} return keyState(); }
    store('bulwarkClaudeKey', v); $('key').value = ''; keyState();
  });
  keyState();

  // ---- 1. find clips ----
  var found = null;   // { info, clips }
  function busy(on) { var b = ['find', 'cut', 'caption']; for (var i = 0; i < b.length; i++) $(b[i]).disabled = on; }
  function showClips() {
    var box = $('clips'); box.innerHTML = '';
    if (!found || !found.clips.length) { $('cut').style.display = 'none'; return; }
    found.clips.forEach(function (c, i) {
      var d = document.createElement('div'); d.className = 'clip';
      var len = c.e - c.s, odd = len < 75 || len > 165;
      d.innerHTML = '<div class="top"><input type="checkbox" checked><input type="text"><button class="secondary">Go to</button></div>' +
        '<div class="meta"></div><div class="head"></div><div class="why"></div><div class="ends"></div>';
      var inputs = d.getElementsByTagName('input');
      inputs[0].addEventListener('change', function () { c.off = !inputs[0].checked; });
      inputs[1].value = c.title; inputs[1].addEventListener('input', function () { c.title = inputs[1].value; });
      d.getElementsByTagName('button')[0].addEventListener('click', function () { jsx('$.bulwark.jump(' + c.s + ')', function () {}); });
      d.querySelector('.meta').textContent = E.clock(c.s) + ' to ' + E.clock(c.e) + '  (' + E.clock(len) + ')' + (odd ? '  outside 1:15 to 2:45, check it' : '');
      d.querySelector('.head').textContent = c.headline;
      d.querySelector('.why').textContent = c.why;
      d.querySelector('.ends').textContent = 'Starts: "' + c.first.slice(0, 70) + (c.first.length > 70 ? '…' : '') + '"  Ends: "' + (c.last.length > 70 ? '…' : '') + c.last.slice(-70) + '"';
      box.appendChild(d);
    });
    $('cut').style.display = '';
  }
  function findClips(fresh) {
    var st = $('fstat'), count = Math.max(1, Math.min(15, parseInt($('count').value, 10) || 6));
    if (!store('bulwarkClaudeKey')) return say(st, 'Add a Claude API key at the bottom of this panel first.', 'err');
    busy(true); say($('cstat'), ''); found = null; showClips();
    transcribe(function (t) { say(st, t); }, fresh, function (err, info) {
      if (err) { busy(false); return say(st, err, 'err'); }
      if (info.total < 180) { busy(false); return say(st, 'This sequence is only ' + E.clock(info.total) + ' long. Open the full episode to find clips in it.', 'err'); }
      var sents = E.sentences(info.words);
      say(st, (info.cached ? 'Using the transcript from last time. ' : 'Transcribed ' + info.words.length + ' words. ') + 'Claude is reading the episode (a minute or two)…');
      claude(E.clipSystem(count), 'Episode: ' + info.name + '\nLength: ' + E.clock(info.total) + '\n\nTranscript:\n' + E.transcriptText(info.words, sents), E.clipSchema, 'high', function (e2, res) {
        busy(false);
        if (e2) return say(st, e2, 'err');
        found = { info: info, clips: E.clipTimes(res.clips, info.words, sents, info.total) };
        showClips();
        st.className = 'status ok';
        st.textContent = found.clips.length ? found.clips.length + ' clips found in "' + info.name + '". Untick any you do not want, rename them, then cut. ' : 'Claude did not find a clip worth cutting. ';
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
    var st = $('cstat'), list = found.clips.filter(function (c) { return !c.off; }), i = 0, made = [], failed = [];
    if (!list.length) return say(st, 'Tick at least one clip.', 'err');
    busy(true);
    (function next() {
      if (i >= list.length) {
        return jsx('$.bulwark.openSeq(' + q(found.info.id) + ')', function () {
          busy(false);
          say(st, made.length + ' sequence' + (made.length === 1 ? '' : 's') + ' cut into the bin "' + BIN + '":\n' + made.join('\n') +
            (failed.length ? '\nNot cut: ' + failed.join('; ') : '') + '\nNext: open one, run Bulwark Vertical Reformat, then caption it below.', failed.length && !made.length ? 'err' : 'ok');
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
  ['size', 'stroke', 'ypos', 'count', 'names'].forEach(function (id) {
    var v = store('bulwark_' + id); if (v) $(id).value = v;
    $(id).addEventListener('change', function () { store('bulwark_' + id, $(id).value); });
  });
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
      if (!$('fix').checked || !store('bulwarkClaudeKey')) {
        if ($('fix').checked) notes.push('No API key saved, so words were not proofread.');
        return place();
      }
      say(st, 'Claude is proofreading ' + info.words.length + ' words…');
      var names = $('names').value.replace(/^\s+|\s+$/g, '');
      claude(E.fixSystem(), 'Clip: ' + info.name + (names ? '\nNames that may come up: ' + names : '') + '\n\nWords:\n' + E.numbered(info.words), E.fixSchema, 'medium', function (e2, res) {
        if (e2) notes.push('Words were not proofread: ' + e2);
        else { var n = E.applyFixes(info.words, res.fixes); notes.push(n ? 'Claude corrected ' + n + ' word' + (n === 1 ? '' : 's') + '.' : 'Claude found nothing to correct.'); }
        place();
      });
    });
  });
})();
