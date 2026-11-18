// Bulwark Premiere Tools: the Clips, Captions and Settings tabs. Transcribe on this Mac -> ask Claude for clips -> cut them;
// and transcribe a vertical clip -> place active-word captions.
(function () {
  var E = window.BulwarkEngine, csi = new CSInterface();
  var MAC = /Mac/i.test(navigator.platform) && window.cep && cep.process && cep.process.createProcess;
  var WORK = csi.getSystemPath(SystemPath.USER_DATA) + '/Bulwark Tools';
  var EXT = csi.getSystemPath(SystemPath.EXTENSION);
  var AI = WORK + '/ai', HELPER = WORK + '/transcribe', PARAKEET = WORK + '/ptranscribe', MODELS = WORK + '/models', MOGRT = WORK + '/Bulwark Word Fill Vertical.mogrt';
  // Who answers the two AI questions (suggest clips, proofread words). Chosen on the Settings tab.
  var PROVIDERS = {
    anthropic: { name: 'Claude (Anthropic API key)', hint: 'sk-ant-…', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'], dflt: 'claude-opus-5-5' },
    openai: { name: 'ChatGPT (OpenAI API key)', hint: 'sk-…', models: [], dflt: '' },
    google: { name: 'Gemini (Google API key)', hint: 'AIza…', models: [], dflt: '' },
    apple: { name: 'Apple Intelligence (on this Mac, no key)', local: true },
    paste: { name: 'No key: copy and paste through any chat', local: true }
  };
  // settings: the fields on the Settings tab (and two on Captions), remembered on this Mac
  var DEFAULTS = { size: '54', stroke: '7', ypos: '67', names: '', clipmin: '90', clipmax: '150', bin: 'SOCIAL CLIPS 16x9', fix: 'on', autopos: 'on', splitcuts: 'on', shadow: 'off', shadowamt: '50', nofill: 'on' };
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
    if (!mark.err && mark.data === ver && !cep.fs.stat(HELPER).err && !cep.fs.stat(PARAKEET).err && !cep.fs.stat(AI).err && !cep.fs.stat(MOGRT).err) return cb(null);
    // name in the panel -> where it goes. A big helper travels in numbered pieces (name.1, name.2, ...) so no single
    // download is large; the pieces are joined here.
    var parts = [['/bin/transcribe.b64', HELPER], ['/bin/ptranscribe.b64', PARAKEET], ['/bin/ai.b64', AI], ['/templates/Bulwark Word Fill Vertical.mogrt.b64', MOGRT]];
    for (var i = 0; i < parts.length; i++) {
      var src = cep.fs.readFile(EXT + parts[i][0]), data = src.err ? '' : src.data;
      for (var n = 1; src.err && n < 40; n++) {
        var piece = cep.fs.readFile(EXT + parts[i][0] + '.' + n);
        if (piece.err) break;
        data += piece.data;
      }
      if (!data) return cb('Part of the panel is missing. Reinstall it from the zip.');
      if (cep.fs.writeFile(parts[i][1], data.replace(/\s+/g, ''), cep.encoding.Base64).err) return cb('Could not set up the transcriber in ' + WORK + '.');
    }
    var p = cep.process.createProcess('/bin/chmod', '755', HELPER, PARAKEET, AI);
    if (p.err) return cb('Could not set up the transcriber.');
    var done = false;
    function fin() { if (done) return; done = true; cep.fs.writeFile(WORK + '/version.txt', ver); cb(null); }
    cep.process.onquit(p.data, fin); setTimeout(fin, 3000);
  }

  // Runs a helper that writes JSON to `json`; cb(result object or null)
  function runHelper(args, json, cb, onProgress) {
    cep.fs.deleteFile(json); cep.fs.deleteFile(json + '.progress');
    var proc = cep.process.createProcess.apply(cep.process, args), done = false;
    var poll = onProgress ? setInterval(function () {
      var r = cep.fs.readFile(json + '.progress');
      if (!r.err && r.data) onProgress(String(r.data).split(' '));
    }, 1500) : null;
    function fin() {
      if (done) return; done = true;
      if (poll) clearInterval(poll);
      cep.fs.deleteFile(json + '.progress');
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
            var began = Date.now();
            function stage(p) {      // what the transcriber says it is doing right now
              var pct = Math.round((parseFloat(p[1]) || 0) * 100), t = E.clock((Date.now() - began) / 1000);
              if (p[0] === 'download') status('Downloading the speech model: ' + pct + '% of 450 MB (this Mac\'s first time only)…  ' + t);
              else if (p[0] === 'load') status('Loading the speech model (the first time on a Mac takes up to a minute)…  ' + t);
              else if (p[0] === 'transcribe') status('Transcribing on this Mac…  ' + t);
            }
            status('Starting the transcriber…');
            // Parakeet for the words, Apple's dictation recogniser for tight word times, side by side
            var heard, tight, left = 2;
            function both() {
              if (--left) return;
              var w = heard && heard.words && heard.words.length ? heard.words : null, t = tight && tight.words && tight.words.length ? tight.words : null;
              if (!w && !(heard && heard.words)) {
                // Parakeet could not run (no internet for the model, older Mac): Apple's recognisers alone, if this Mac has them
                return runHelper([HELPER, wav, WORK + '/words.json'], WORK + '/words.json', function (r5) {
                  cep.fs.deleteFile(wav);
                  if (!r5 || !r5.words || !r5.words.length) return cb('The transcriber did not finish' + (heard && heard.error ? ': ' + heard.error : '') + '. It needs an Apple silicon Mac on macOS 14 or later, and the internet the first time (to get the speech model).');
                  info.words = r5.words; info.timed = r5.timed; info.tight = true; info.apple = true;
                  cb(null, info);
                });
              }
              cep.fs.deleteFile(wav);
              if (!w) return cb('No speech was found in this sequence.');
              var m = t ? E.mergeTimes(w, t) : E.wordsAlone(w);
              info.words = m.words; info.timed = m.timed; info.tight = !!t;
              cep.fs.writeFile(cache, JSON.stringify({ total: info.total, words: m.words, timed: m.timed, tight: info.tight }));
              cb(null, info);
            }
            runHelper([PARAKEET, wav, WORK + '/words.json', MODELS + '/parakeet', 'v2'], WORK + '/words.json', function (r3) { heard = r3; both(); }, stage);
            runHelper([HELPER, wav, WORK + '/tight.json', 'tight'], WORK + '/tight.json', function (r4) { tight = r4; both(); });
          });
        }, 60);
      });
    });
  }

  // ---- the AI assistant: Claude, ChatGPT or Gemini through their APIs ----
  function keyOf(p) { return store('bulwarkKey_' + p) || (p === 'anthropic' ? store('bulwarkClaudeKey') : null) || ''; }
  function providerNow() {
    var p = store('bulwark_provider');
    return PROVIDERS[p] ? p : (keyOf('anthropic') ? 'anthropic' : 'paste');
  }
  function modelOf(p) { return store('bulwark_model_' + p) || PROVIDERS[p].dflt || ''; }
  function http(method, url, headers, body, cb) {       // cb(status, parsed JSON or null); status 0 = no connection
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    for (var h in headers) x.setRequestHeader(h, headers[h]);
    x.timeout = 15 * 60000;
    x.onerror = x.ontimeout = function () { cb(0, null); };
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} cb(x.status, j); };
    x.send(body ? JSON.stringify(body) : null);
  }
  function authHeaders(p) {
    var k = keyOf(p);
    if (p === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };   // the key is the editor's own, kept on their Mac
    if (p === 'openai') return { 'content-type': 'application/json', 'authorization': 'Bearer ' + k };
    return { 'content-type': 'application/json', 'x-goog-api-key': k };
  }
  // The model's answer as an object: from a code block if there is one, else the outermost braces
  function readAnswer(text, field) {
    text = String(text || '');
    var fence = /```(?:json)?\s*([\s\S]*?)```/g, m, blocks = [];
    while ((m = fence.exec(text))) blocks.push(m[1]);
    blocks.push(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    for (var i = 0; i < blocks.length; i++) {
      try { var j = JSON.parse(blocks[i]); if (j && j[field] instanceof Array) return j; } catch (x) {}
    }
    return null;
  }
  function shapeNote(shape) { return '\n\nAnswer with one JSON object in exactly this shape and nothing else before or after it:\n' + shape; }
  function apiError(p, status, j) {
    var who = PROVIDERS[p].name.split(' (')[0], msg = j && j.error && (j.error.message || j.error) || '';
    if (status === 0) return 'Could not reach ' + who + '. Check the internet connection.';
    if (status === 401 || status === 403) return who + ' did not accept the API key. Check it on the Settings tab.';
    if (status === 404) return who + ' does not know the model "' + modelOf(p) + '". Pick another on the Settings tab.';
    if (status === 429) return who + ' says this key is over its rate or spending limit. Wait a minute, or check the account\'s billing.';
    if (status >= 500) return who + ' is having trouble (' + status + '). Try again in a minute.';
    return who + ' returned an error (' + status + ')' + (msg ? ': ' + String(msg).slice(0, 300) : '.');
  }
  // o: { system, user, schema, shape, field, effort }. cb(err, object)
  function callAI(p, o, cb, step) {
    var model = modelOf(p), who = PROVIDERS[p].name.split(' (')[0];
    if (!keyOf(p)) return cb('Add the ' + who + ' API key on the Settings tab first.');
    if (!model) return cb('Pick a ' + who + ' model on the Settings tab first.');
    step = step || 0;
    function done(text) {
      var res = readAnswer(text, o.field);
      cb(res ? null : who + ' answered in a form the panel could not read. Try again, or pick a stronger model.', res);
    }
    if (p === 'anthropic') {
      // step 0: everything; 1: no refusal fallback; 2: no effort setting; 3: no structured output (older models)
      var body = { model: model, max_tokens: 16000, system: o.system, messages: [{ role: 'user', content: o.user + shapeNote(o.shape) }] }, h = authHeaders(p);
      if (step < 3) body.output_config = { format: { type: 'json_schema', schema: o.schema } };
      if (step < 2) body.output_config.effort = o.effort;
      if (step < 1) { body.fallbacks = 'default'; h['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }   // if a safety filter declines, the API retries on its fallback model
      return http('POST', 'https://api.anthropic.com/v1/messages', h, body, function (status, j) {
        if (status === 400 && step < 3) return callAI(p, o, cb, step + 1);
        if (status !== 200 || !j) return cb(apiError(p, status, j));
        if (j.stop_reason === 'refusal') return cb('Claude declined to work on this transcript.');
        if (j.stop_reason === 'max_tokens') return cb('Claude ran out of room answering. Try again.');
        var text = '';
        for (var i = 0; i < (j.content || []).length; i++) if (j.content[i].type === 'text') text += j.content[i].text;
        done(text);
      });
    }
    if (p === 'openai') {
      // step 0: strict JSON schema; 1: plain (models without structured output)
      var ob = { model: model, messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user + shapeNote(o.shape) }] };
      if (step < 1) ob.response_format = { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: o.schema } };
      return http('POST', 'https://api.openai.com/v1/chat/completions', authHeaders(p), ob, function (status, j) {
        if (status === 400 && step < 1) return callAI(p, o, cb, step + 1);
        if (status !== 200 || !j) return cb(apiError(p, status, j));
        var msg = j.choices && j.choices[0] && j.choices[0].message || {};
        if (msg.refusal) return cb('ChatGPT declined to work on this transcript.');
        if (j.choices && j.choices[0] && j.choices[0].finish_reason === 'length') return cb('ChatGPT ran out of room answering. Try again.');
        done(msg.content);
      });
    }
    // Gemini. step 0: JSON answer mode; 1: plain
    var gb = { systemInstruction: { parts: [{ text: o.system }] }, contents: [{ role: 'user', parts: [{ text: o.user + shapeNote(o.shape) }] }] };
    if (step < 1) gb.generationConfig = { responseMimeType: 'application/json' };
    http('POST', 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', authHeaders(p), gb, function (status, j) {
      if (status === 400 && step < 1 && !(j && j.error && /api key/i.test(j.error.message || ''))) return callAI(p, o, cb, step + 1);
      if (status === 400) return cb('Gemini did not accept the API key. Check it on the Settings tab.');
      if (status !== 200 || !j) return cb(apiError(p, status, j));
      var c = j.candidates && j.candidates[0];
      if (!c || !c.content || !c.content.parts) return cb('Gemini declined to work on this transcript' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ').' : '.'));
      var text = '';
      for (var i = 0; i < c.content.parts.length; i++) if (c.content.parts[i].text && !c.content.parts[i].thought) text += c.content.parts[i].text;
      done(text);
    });
  }
  // The models this key can use, newest names first. cb(err, [ids])
  function listModels(p, cb) {
    if (!keyOf(p)) return cb('Save the API key first.');
    var url = p === 'anthropic' ? 'https://api.anthropic.com/v1/models?limit=100' : p === 'openai' ? 'https://api.openai.com/v1/models' : 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
    http('GET', url, authHeaders(p), null, function (status, j) {
      if (status !== 200 || !j) return cb(status === 400 && p === 'google' ? 'Gemini did not accept the API key.' : apiError(p, status, j));
      var ids = [], i;
      if (p === 'google') {
        for (i = 0; i < (j.models || []).length; i++) {
          var gm = j.models[i], id = String(gm.name || '').replace(/^models\//, '');
          if (/^gemini/.test(id) && (gm.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && !/image|tts|embedding|live|audio|vision|robotics|computer/i.test(id)) ids.push(id);
        }
      } else {
        for (i = 0; i < (j.data || []).length; i++) {
          var oid = String(j.data[i].id || '');
          if (p === 'anthropic' || (/^(gpt-|o\d|chatgpt)/.test(oid) && !/audio|realtime|tts|transcribe|image|embedding|search|moderation|instruct|codex|whisper|dall/i.test(oid))) ids.push(oid);
        }
      }
      ids.sort(); ids.reverse();
      cb(ids.length ? null : 'No text models were listed for this key.', ids);
    });
  }

  // ---- Apple Intelligence: the model built into macOS 26, on this Mac. It reads about a page at a time, so the
  // transcript goes to it in overlapping parts and the answers are put together. ----
  function appleRun(system, user, cb) {         // cb(err, text)
    setUp(function (e0) {
      if (e0) return cb(e0);
      var inp = WORK + '/ai-question.json', out = WORK + '/ai-answer.json';
      if (cep.fs.writeFile(inp, JSON.stringify({ system: system, user: user })).err) return cb('Could not write to ' + WORK + '.');
      runHelper([AI, inp, out], out, function (r) {
        cep.fs.deleteFile(inp); cep.fs.deleteFile(out);
        if (!r) return cb('Apple Intelligence did not answer. It needs an Apple silicon Mac on macOS 26 with Apple Intelligence switched on.');
        cb(r.error || null, r.text);
      });
    });
  }
  function appleParts(o, cb) {
    var parts = o.parts, i = 0, all = [], failed = 0, lastErr = '';
    (function next() {
      if (i >= parts.length) return cb(all.length || failed < parts.length ? null : (lastErr || 'Apple Intelligence could not read the transcript.'), all, failed);
      o.status('Apple Intelligence is reading part ' + (i + 1) + ' of ' + parts.length + '…');
      appleRun(o.system, parts[i++] + shapeNote(o.shape), function (err, text) {
        if (err && /switched off|cannot run|still downloading|needs macOS|needs an Apple/i.test(err)) return cb(err);
        var res = err ? null : readAnswer(text, o.field);
        if (res) all = all.concat(res[o.field]); else { failed++; lastErr = err || lastErr; }
        next();
      });
    })();
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
    el('div', 'This step goes through a chat assistant (claude.ai, ChatGPT or Gemini):', 'mtitle');
    var b1 = el('button', '1. Copy ' + what + ' for the chat');
    el('div', '2. Paste it into a new chat and send. When it has answered, use the copy button under the answer.', 'mstep');
    var b3 = el('button', '3. Paste the answer'), msg = el('div', '', 'status');
    var row = el('div', '', 'mrow'), skip = skipLabel ? document.createElement('a') : null, cancel = document.createElement('a');
    if (skip) { skip.className = 'link'; skip.textContent = skipLabel; row.appendChild(skip); }
    cancel.className = 'link'; cancel.textContent = 'Cancel'; row.appendChild(cancel);
    function close(err, res) { box.innerHTML = ''; box.className = ''; cb(err, res); }
    b1.addEventListener('click', function () {
      clip(true, prompt, function (e) { say(msg, e || 'Copied (' + Math.round(prompt.length / 1000) + 'k characters). Now paste it into the chat.', e ? 'err' : 'ok'); });
    });
    b3.addEventListener('click', function () {
      clip(false, '', function (e, text) {
        if (e) return say(msg, e, 'err');
        text = String(text || '');
        // what was copied in step 1 is still on the clipboard (it holds an example answer, so check before reading it as one)
        if (text.indexOf(system.slice(0, 60)) >= 0) return say(msg, 'The clipboard still holds what you copied in step 1. Copy the chat\'s answer first (the copy button under it), then press this again.', 'err');
        var res = readAnswer(text, field);
        if (!res) return say(msg, 'That does not look like the answer. Copy the whole answer (the copy button under it), then press this again.', 'err');
        close(null, res);
      });
    });
    if (skip) skip.addEventListener('click', function () { close('skip'); });
    cancel.addEventListener('click', function () { close('cancel'); });
  }
  // One question to the assistant chosen in Settings. Without a usable key it falls back to copy and paste.
  function ask(o, cb) {
    var p = providerNow();
    if (p === 'apple') return appleParts(o, function (err, items, failed) {
      if (err) return cb(err);
      var res = {}; res[o.field] = o.join ? o.join(items) : items;
      cb(null, res, failed ? failed + ' of ' + o.parts.length + ' parts could not be read by Apple Intelligence.' : '');
    });
    if (p !== 'paste' && keyOf(p) && modelOf(p)) { o.status(o.waiting.replace(/Claude/g, PROVIDERS[p].name.split(' (')[0])); return callAI(p, o, cb); }
    o.status(o.manual);
    byPaste(o.box, o.what, o.system, o.user, o.shape, o.field, o.skip, cb);
  }

  // ---- Settings: which assistant, its key, its model ----
  function fillSelect(sel, items, value) {
    sel.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var op = document.createElement('option'); op.value = items[i][0]; op.textContent = items[i][1];
      if (items[i][0] === value) op.selected = true;
      sel.appendChild(op);
    }
  }
  function modelList(p) {
    var saved = [];
    try { saved = JSON.parse(store('bulwark_models_' + p) || '[]'); } catch (e) {}
    var ids = saved.length ? saved : (PROVIDERS[p].models || []).slice(0), cur = modelOf(p);
    if (cur && ids.indexOf(cur) < 0) ids.unshift(cur);
    return ids;
  }
  function showProvider() {
    var p = providerNow(), P = PROVIDERS[p], items = [];
    for (var id in PROVIDERS) items.push([id, PROVIDERS[id].name]);
    fillSelect($('provider'), items, p);
    $('keybox').style.display = $('modelbox').style.display = P.local ? 'none' : '';
    if (P.local) {
      say($('keystat'), p === 'apple' ? 'Runs on this Mac at no cost. Needs macOS 26 with Apple Intelligence switched on. It reads the transcript a page at a time, so its clip picks are rougher than the others.'
        : 'Clip suggestions and proofreading go through a chat (claude.ai, ChatGPT or Gemini) by copy and paste.', '');
      return;
    }
    $('key').placeholder = P.hint; $('key').value = '';
    var ids = modelList(p), cur = modelOf(p);
    fillSelect($('model'), ids.map(function (m) { return [m, m]; }), cur);
    $('model').size = Math.max(2, Math.min(7, ids.length || 2));
    $('modelother').value = '';
    say($('keystat'), keyOf(p) ? 'A key is saved on this Mac.' : 'No key saved yet. Until there is one, these steps go through a chat by copy and paste.', keyOf(p) ? 'ok' : '');
    say($('modelstat'), cur ? 'Using ' + cur + '.' : (keyOf(p) ? 'Press "Refresh list" and pick a model.' : 'Save the key, then pick a model.'), cur ? 'ok' : '');
  }
  function refreshModels() {
    var p = providerNow();
    say($('modelstat'), 'Loading the model list…');
    listModels(p, function (err, ids) {
      if (err) return say($('modelstat'), err, 'err');
      store('bulwark_models_' + p, JSON.stringify(ids));
      showProvider();
      say($('modelstat'), ids.length + ' models listed.' + (modelOf(p) ? ' Using ' + modelOf(p) + '.' : ' Pick one.'), modelOf(p) ? 'ok' : '');
    });
  }
  $('provider').addEventListener('change', function () { store('bulwark_provider', $('provider').value); showProvider(); });
  $('model').addEventListener('change', function () { store('bulwark_model_' + providerNow(), $('model').value); showProvider(); });
  $('modelother').addEventListener('change', function () {
    var v = $('modelother').value.replace(/\s+/g, '');
    if (v) { store('bulwark_model_' + providerNow(), v); showProvider(); }
  });
  $('loadmodels').addEventListener('click', refreshModels);
  $('savekey').addEventListener('click', function () {
    var v = $('key').value.replace(/\s+/g, ''), p = providerNow();
    if (!v) return say($('keystat'), 'Paste the key into the box first.', 'err');
    store('bulwarkKey_' + p, v); showProvider(); refreshModels();
  });
  $('clearkey').addEventListener('click', function () {
    var p = providerNow();
    try { localStorage.removeItem('bulwarkKey_' + p); if (p === 'anthropic') localStorage.removeItem('bulwarkClaudeKey'); } catch (e) {}
    showProvider();
  });
  showProvider();

  // ---- 1. find clips ----
  var found = null;   // { info, clips }
  function busy(on) { var b = ['find', 'cut', 'caption', 'heads']; for (var i = 0; i < b.length; i++) $(b[i]).disabled = on; }
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
      ask({ box: $('fmanual'), what: 'the transcript', field: 'clips', effort: 'high', schema: E.clipSchema, parts: E.clipParts(info.words, sents), join: E.joinClips,
        system: E.clipSystem(cmin, cmax), user: 'Episode: ' + info.name + '\nLength: ' + E.clock(info.total) + '\n\nTranscript:\n' + E.transcriptText(info.words, sents),
        shape: '{"clips": [{"first_line": 12, "last_line": 31, "title": "three to six words", "headline": "four to eight words", "why": "one sentence"}]}',
        status: function (t) { say(st, t); }, waiting: lead + 'Claude is analyzing the transcript (a minute or two)…', manual: lead + 'Follow the three steps below.' }, function (e2, res, more) {
        if (e2 === 'cancel') { busy(false); return say(st, 'Cancelled. The transcript is saved, so starting again is quick.'); }
        busy(false);
        if (e2) return say(st, e2, 'err');
        found = { info: info, clips: E.clipTimes(res.clips, info.words, sents, info.total) };
        showClips();
        st.className = 'status ok';
        st.textContent = found.clips.length ? found.clips.length + ' clip' + (found.clips.length === 1 ? '' : 's') + ' suggested from "' + info.name + '". Untick any you do not want, rename them, then cut. ' : 'No clip worth cutting was found. ';
        if (more) st.textContent += more + ' ';
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

  function hasFont(name) {      // a font that is installed changes the width of a test string
    var c = document.createElement('canvas').getContext('2d'), t = 'MMMiiiWWWlll0123';
    c.font = '72px monospace'; var a = c.measureText(t).width;
    c.font = '72px "' + name + '", monospace';
    return c.measureText(t).width !== a;
  }
  // ---- IG headlines for the open clip ----
  $('heads').addEventListener('click', function () {
    var st = $('hstat'), list = $('headlist');
    busy(true); list.innerHTML = '';
    transcribe(function (t) { say(st, t); }, false, function (err, info) {
      if (err) { busy(false); return say(st, err, 'err'); }
      if (info.total > 900) { busy(false); return say(st, 'This sequence is ' + E.clock(info.total) + ' long. Headlines are for one clip: open a cut clip, not the full episode.', 'err'); }
      var text = info.words.map(function (w) { return w.w; }).join(' ');
      ask({ box: $('hmanual'), what: 'the clip\'s transcript', field: 'headlines', effort: 'medium', schema: E.headSchema, parts: E.headParts(info.words),
        system: E.headSystem(), user: 'Clip: ' + info.name + ' (' + E.clock(info.total) + ')\n\nTranscript:\n' + text,
        shape: '{"headlines": ["First Headline of Four to Eight Words", "Second Headline Option Here"]}',
        status: function (t) { say(st, t); }, waiting: 'Claude is writing headlines…', manual: 'Transcribed ' + info.words.length + ' words. Follow the three steps below.' }, function (e2, res, more) {
        busy(false);
        if (e2 === 'cancel') return say(st, 'Cancelled.');
        if (e2) return say(st, e2, 'err');
        var heads = E.cleanHeads(res.headlines);
        if (!heads.length) return say(st, 'No usable headlines came back (they must be 4 to 8 words). Try again.', 'err');
        heads.forEach(function (h) {
          var row = document.createElement('div'), sp = document.createElement('span'), b = document.createElement('button');
          row.className = 'head'; sp.textContent = h; b.className = 'secondary'; b.textContent = 'Copy';
          b.addEventListener('click', function () {
            clip(true, h, function (e3) { b.textContent = e3 ? 'Failed' : 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); });
          });
          var tb = document.createElement('button'); tb.className = 'secondary'; tb.textContent = 'Thumbnail';
          tb.addEventListener('click', function () { $('thead').value = h; window.bulwarkShowTab('thumb'); listTemplates(); drawThumb(); });
          row.appendChild(sp); row.appendChild(b); row.appendChild(tb); list.appendChild(row);
        });
        say(st, heads.length + ' headlines for "' + info.name + '".' + (more ? ' ' + more : ''), 'ok');
      });
    });
  });

  // ---- thumbnail ----
  // A template is a folder with template.json (windows, headline style) and overlay.png (artwork with see-through
  // windows). Templates ship in the panel (templates/thumbs) and can be added on this Mac (Bulwark Tools/thumbnail
  // templates). See "HOW TO ADD A THUMBNAIL TEMPLATE.txt".
  var TPL_SHIPPED = EXT + '/templates/thumbs', TPL_LOCAL = WORK + '/thumbnail templates';
  var thumb = { tpls: [], tpl: null, pics: [], slot: 0, name: '', pulls: 0 };      // pics[i]: { img, source, kind, region }
  function imageFrom(b64, cb) {
    var img = new Image(); img.onload = function () { cb(img); }; img.onerror = function () { cb(null); };
    img.src = 'data:image/png;base64,' + String(b64).replace(/\s+/g, '');
  }
  function loadImage(path, cb) {
    var r = cep.fs.readFile(path, cep.encoding.Base64);
    if (r.err || !r.data) return cb(null);
    imageFrom(r.data, cb);
  }
  function readTemplates() {
    var out = [];
    [TPL_SHIPPED, TPL_LOCAL].forEach(function (root, local) {
      var d = cep.fs.readdir(root);
      if (d.err) return;
      d.data.slice().sort().forEach(function (id) {
        var j = cep.fs.readFile(root + '/' + id + '/template.json');
        if (j.err) return;
        try {
          var t = JSON.parse(j.data);
          if (!t.windows || !t.windows.length) return;
          t.id = (local ? 'mine/' : '') + id; t.dir = root + '/' + id; t.local = !!local;
          t.name = String(t.name || id) + (local ? ' (mine)' : '');
          out.push(t);
        } catch (e) {}
      });
    });
    return out;
  }
  function overlayOf(t, cb) {
    if (t.overlayImg !== undefined) return cb(t.overlayImg);
    var name = t.overlay || 'overlay.png', asText = cep.fs.readFile(t.dir + '/' + name + '.b64');
    function done(img) { t.overlayImg = img; cb(img); }
    if (!asText.err && asText.data) return imageFrom(asText.data, done);
    loadImage(t.dir + '/' + name, done);
  }
  function showOnReframe() { try { return $('show').value || ''; } catch (e) { return ''; } }
  function pickTemplate(id) {
    var t = null;
    for (var i = 0; i < thumb.tpls.length; i++) if (thumb.tpls[i].id === id) t = thumb.tpls[i];
    if (!t) t = thumb.tpls[0] || null;
    if (!t) return;
    var same = thumb.tpl && thumb.tpl.windows.length === t.windows.length;
    thumb.tpl = t; store('bulwark_thumbtpl', t.id);
    if (!same) { thumb.pics = thumb.pics.slice(0, t.windows.length); thumb.slot = 0; }
    // a chip per window
    var chips = $('tslots'); chips.innerHTML = '';
    t.windows.forEach(function (w, i) {
      var c = document.createElement('span'); c.textContent = w.name || ('Window ' + (i + 1));
      c.addEventListener('click', function () { thumb.slot = i; markSlots(); });
      chips.appendChild(c);
    });
    markSlots();
    overlayOf(t, function () { drawThumb(); });
  }
  function markSlots() {
    var c = $('tslots').children;
    for (var i = 0; i < c.length; i++) c[i].className = 'chip' + (i === thumb.slot ? ' on' : '') + (thumb.pics[i] ? ' filled' : '');
    // the sliders belong to the marked window's picture
    var pic = thumb.pics[thumb.slot], w = thumb.tpl && thumb.tpl.windows[thumb.slot];
    $('tadj').textContent = 'Adjust: ' + (w ? (w.name || 'Window ' + (thumb.slot + 1)) : '') + (pic ? '' : ' (no picture yet)');
    $('tmx').value = pic ? pic.mx : 0; $('tmy').value = pic ? pic.my : 0; $('tz').value = pic ? Math.round(pic.zoom * 100) : 100;
    $('tmx').disabled = $('tmy').disabled = $('tz').disabled = !pic;
    drawThumb();
  }
  function listTemplates() {
    thumb.tpls = readTemplates();
    var show = showOnReframe(), saved = store('bulwark_thumbtpl'), first = null, items = [];
    // the show picked on the Reframe tab comes first
    thumb.tpls.sort(function (x, y) { return ((y.show === show && show ? 1 : 0) - (x.show === show && show ? 1 : 0)) || (x.local - y.local) || (x.name < y.name ? -1 : 1); });
    thumb.tpls.forEach(function (t) { items.push([t.id, t.name + (t.show ? '  [' + t.show.replace(/^9x16\s+/i, '') + ']' : '')]); if (!first && (t.show === show || !t.show)) first = t.id; });
    var want = saved, ok = false;
    for (var i = 0; i < thumb.tpls.length; i++) if (thumb.tpls[i].id === want) ok = true;
    if (!ok) want = first || (thumb.tpls[0] && thumb.tpls[0].id);
    fillSelect($('ttpl'), items, want);
    $('ttpl').size = Math.max(2, Math.min(6, items.length));
    pickTemplate(want);
  }
  // Where in a picture the wanted part is: a person's own camera frame is used whole; a rendered vertical frame has
  // the windows of whatever layout was on screen (2-up, 3-UP / PIP)
  function regionOf(pic) {
    var img = pic.img, f = img.height / 1920;
    if (pic.source || pic.region === 'whole' || pic.kind === 1) return [0, img.height];
    if (pic.kind === 2) return pic.region === 'top' ? [0, 944 * f] : [977 * f, 943 * f];
    if (pic.region === 'top') return [0, 607 * f];
    if (pic.region === 'middle') return [640 * f, 623 * f];
    return [1295 * f, 625 * f];
  }
  // The crop of a picture that fills a window: { sx, sy, cw, ch, slackX, slackY } in the picture's own pixels.
  // pic.mx / pic.my (-100..100) slide it left-right and up-down within whatever room there is; pic.zoom adds room.
  function cropOf(pic, win) {
    var img = pic.img, reg = regionOf(pic), sy = reg[0], sh = reg[1], sw = img.width;
    var scale = Math.max(win.w / sw, win.h / sh) * Math.max(1, pic.zoom || 1), cw = win.w / scale, ch = win.h / scale;
    var slackX = sw - cw, slackY = sh - ch;
    var fy0 = pic.source ? 0.35 : (pic.kind === 1 && pic.region === 'whole' ? 0.3 : 0.5);
    var fx = Math.max(0, Math.min(1, 0.5 - (pic.mx || 0) / 200)), fy = Math.max(0, Math.min(1, fy0 - (pic.my || 0) / 200));
    return { sx: slackX * fx, sy: sy + slackY * fy, cw: cw, ch: ch, slackX: slackX, slackY: slackY, scale: scale };
  }
  function drawPicture(ctx, pic, win) {
    var c = cropOf(pic, win);
    ctx.drawImage(pic.img, c.sx, c.sy, c.cw, c.ch, win.x, win.y, win.w, win.h);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function drawHeadline(ctx, t, W) {
    var H = t.headline || {}, text = $('thead').value.replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (H.uppercase !== false) text = text.toUpperCase();
    if (!text) return;
    var one = H.oneLine || { size: 96, maxWidth: 890, padX: 45, padTop: 50, padBottom: 50 }, two = H.twoLines || { size: 84, maxWidth: 928, padX: 25, padTop: 34, padBottom: 36, gap: 46 };
    function font(px) { ctx.font = (H.weight || 600) + ' ' + px + 'px "' + (H.font || 'Special Gothic Condensed') + '", "Arial Narrow", sans-serif'; }
    function width(s2, px) { font(px); return ctx.measureText(s2).width; }
    var lines = [text], size = one.size, L = one;
    if (width(text, one.size) > one.maxWidth) {
      var w = text.split(' '), best = null;
      for (var i = 1; i < w.length; i++) {
        var a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), wide = Math.max(width(a, 100), width(b, 100));
        // a colon or dash is where a headline wants to break, as long as neither line gets too long for a readable size
        if (/[:—–-]$/.test(w[i - 1]) && wide <= two.maxWidth / 60 * 100) { best = { a: a, b: b, wide: wide }; break; }
        if (!best || wide < best.wide) best = { a: a, b: b, wide: wide };
      }
      if (best) { lines = [best.a, best.b]; size = Math.min(two.size, two.maxWidth / best.wide * 100); L = two; }
      else size = one.maxWidth / width(text, 100) * 100;
    }
    size = Math.round(size);
    var cap = (H.capHeight || 0.722) * size, widest = 0, k, gap = L.gap || 0, top = H.top === undefined ? 860 : H.top;
    for (k = 0; k < lines.length; k++) widest = Math.max(widest, width(lines[k], size));
    var bw = Math.min(W - 40, widest + 2 * L.padX), bh = L.padTop + cap * lines.length + gap * (lines.length - 1) + L.padBottom;
    if (H.box) { ctx.fillStyle = H.box; roundRect(ctx, (W - bw) / 2, top, bw, bh, H.radius || 0); ctx.fill(); }
    ctx.fillStyle = H.text || '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; font(size);
    for (k = 0; k < lines.length; k++) ctx.fillText(lines[k], W / 2, top + L.padTop + cap * (k + 1) + gap * k);
  }
  function drawThumb() {
    var t = thumb.tpl, cv = $('tcanvas');
    if (!t) return;
    var W = (t.size && t.size[0]) || 1080, Hh = (t.size && t.size[1]) || 1920, any = false, ctx = cv.getContext('2d'), i;
    for (i = 0; i < t.windows.length; i++) if (thumb.pics[i]) any = true;
    if (cv.width !== W) cv.width = W; if (cv.height !== Hh) cv.height = Hh;
    $('tsave').disabled = !any;
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(0, 0, W, Hh);
    for (i = 0; i < t.windows.length; i++) {
      if (!thumb.pics[i]) {              // an empty window: its name, so it is clear what goes where
        var ew = t.windows[i];
        ctx.fillStyle = i === thumb.slot ? '#3d4a6b' : '#333'; ctx.fillRect(ew.x, ew.y, ew.w, ew.h);
        ctx.fillStyle = '#9a9a9a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '48px -apple-system, Helvetica, Arial, sans-serif';
        ctx.fillText(ew.name || ('Window ' + (i + 1)), ew.x + ew.w / 2, ew.y + ew.h / 2);
        continue;
      }
      ctx.save(); ctx.beginPath(); ctx.rect(t.windows[i].x, t.windows[i].y, t.windows[i].w, t.windows[i].h); ctx.clip();
      drawPicture(ctx, thumb.pics[i], t.windows[i]);
      ctx.restore();
    }
    if (t.overlayImg) ctx.drawImage(t.overlayImg, 0, 0, W, Hh);
    drawHeadline(ctx, t, W);
  }
  function setPicture(pic) {
    if (!thumb.tpl) return;
    var i = thumb.slot, n = thumb.tpl.windows.length;
    pic.mx = 0; pic.my = 0; pic.zoom = pic.source ? 1.15 : 1;
    thumb.pics[i] = pic;
    // move on to the next empty window, if there is one
    for (var k = 1; k <= n; k++) if (!thumb.pics[(i + k) % n]) { thumb.slot = (i + k) % n; break; }
    markSlots(); drawThumb();
  }
  function waitImage(path, cb) {                       // Premiere writes the file a moment after it answers
    var tries = 0;
    (function again() { loadImage(path, function (img) { if (img) return cb(img); if (++tries > 30) return cb(null); setTimeout(again, 200); }); })();
  }
  // -- one frame, from the playhead --
  $('tgrab').addEventListener('click', function () {
    var st = $('tstat'), slot = thumb.slot, base = WORK + '/thumb-grab-' + slot;
    if (!thumb.tpl) return say(st, 'No thumbnail template was found. Reinstall the panel.', 'err');
    cep.fs.makedir(WORK); say(st, 'Grabbing the frame…');
    jsx('$.bulwark.playhead()', function (rp) {
      var t = +rp.split('|')[2] || 0;
      jsx('$.bulwark.shotMap()', function (rm) {
        var pm = rm.split('|'), kind = pm[0] === 'OK' ? E.kindAt(E.shots(pm[1], pm[2]).segs, t) : 1;
        jsx('$.bulwark.grabFrame(' + q(base) + ',' + (kind === 1) + ')', function (r) {
          var p = r.split('|');
          if (p[0] !== 'OK') return say(st, p.slice(1).join('|') || 'Premiere did not answer.', 'err');
          if (+p[2] > +p[3]) return say(st, 'This sequence is 16x9. Open the vertical clip to make a thumbnail from it.', 'err');
          thumb.name = p.slice(5).join('|');
          waitImage(base + '.png', function (img) {
            if (!img) return say(st, 'Premiere did not save the frame. Try again.', 'err');
            // on a 2-up / 3-UP shot the first window takes the top picture and the last window the bottom one
            var region = kind === 1 ? 'whole' : (slot === thumb.tpl.windows.length - 1 ? 'bottom' : 'top');
            thumb.slot = slot; setPicture({ img: img, source: p[4] === 'source', kind: kind, region: region });
            say(st, 'Picture set from ' + E.clock(t) + (p[4] === 'source' ? ' (solo shot: the full camera picture)' : kind === 1 ? '' : ' (the ' + region + ' window of that shot)') + '.', 'ok');
          });
        });
      });
    });
  });
  // -- several frames of everyone in the clip, to choose from --
  $('tpicksbtn').addEventListener('click', function () {
    var st = $('tstat'), box = $('tpicks'), dir = WORK + '/picks';
    if (!thumb.tpl) return say(st, 'No thumbnail template was found. Reinstall the panel.', 'err');
    cep.fs.makedir(WORK); cep.fs.makedir(dir);
    $('tpicksbtn').disabled = true; box.innerHTML = '';
    say(st, 'Pulling pictures of everyone in this clip (Premiere flips through its sequences for a moment)…');
    jsx('$.bulwark.seqInfo()', function (ri) { thumb.name = ri.split('|').slice(6).join('|') || thumb.name; });
    setTimeout(function () {
      // each pull takes different moments: the first from the middle of each stretch, later ones slid along
      var phases = [0.5, 0.2, 0.8, 0.35, 0.65, 0.05, 0.95], phase = phases[thumb.pulls % phases.length];
      jsx('$.bulwark.subjectFrames(' + q(dir) + ',8,' + phase + ')', function (r) {
        $('tpicksbtn').disabled = false;
        var lines = r.split('\n');
        if (lines[0] !== 'OK') return say(st, r.split('|').slice(1).join('|') || 'Premiere did not answer.', 'err');
        lines.shift();
        thumb.pulls++; $('tpicksbtn').textContent = 'Give me more options';
        var groups = {}, order = [], left = lines.length, shown = 0;
        lines.forEach(function (line) {
          var f = line.split('\t'), who = f[1] || 'Picture';
          if (!groups[who]) {
            var title = document.createElement('div'); title.className = 'who'; title.textContent = who;
            var grid = document.createElement('div'); grid.className = 'grid';
            box.appendChild(title); box.appendChild(grid); groups[who] = grid; order.push(who);
          }
          var cell = document.createElement('div'); groups[who].appendChild(cell);
          waitImage(f[0], function (img) {
            if (img) {
              var pic = { img: img, source: f[3] === 'source', kind: +f[4] || 1, region: f[5] || 'whole' }, reg = regionOf(pic);
              var cv = document.createElement('canvas'), tm = document.createElement('div');
              cv.width = 320; cv.height = Math.round(320 * reg[1] / img.width);
              cv.getContext('2d').drawImage(img, 0, reg[0], img.width, reg[1], 0, 0, cv.width, cv.height);
              cv.title = 'Click to put this in the marked window';
              cv.addEventListener('click', function () { setPicture(pic); say(st, who + ' at ' + E.clock(+f[2]) + ' is in the thumbnail.', 'ok'); });
              cv.addEventListener('dblclick', function () { jsx('$.bulwark.jump(' + (+f[2]) + ')', function () {}); });
              tm.className = 'tm'; tm.textContent = E.clock(+f[2]);
              cell.appendChild(cv); cell.appendChild(tm); shown++;
            }
            if (!--left) say(st, shown + ' pictures of ' + order.join(', ') + '. Click one to put it in the marked window.', shown ? 'ok' : 'err');
          });
        });
      });
    }, 60);
  });
  // sliders for the marked window's picture
  ['tmx', 'tmy', 'tz'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var pic = thumb.pics[thumb.slot]; if (!pic) return;
      pic.mx = +$('tmx').value; pic.my = +$('tmy').value; pic.zoom = +$('tz').value / 100;
      drawThumb();
    });
  });
  // the preview itself: click a window to mark it as the next one to fill; drag a picture to move it
  (function () {
    var cv = $('tcanvas'), drag = null;
    function at(ev) {
      var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * cv.width / r.width, y = (ev.clientY - r.top) * cv.height / r.height, t = thumb.tpl;
      if (!t) return -1;
      for (var i = 0; i < t.windows.length; i++) { var w = t.windows[i]; if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return i; }
      return -1;
    }
    cv.addEventListener('mousedown', function (ev) {
      var i = at(ev); if (i < 0) return;
      thumb.slot = i; markSlots();
      var pic = thumb.pics[i];
      drag = pic ? { x: ev.clientX, y: ev.clientY, mx: pic.mx, my: pic.my, pic: pic, win: thumb.tpl.windows[i], k: cv.width / cv.getBoundingClientRect().width } : null;
      ev.preventDefault();
    });
    window.addEventListener('mousemove', function (ev) {
      if (!drag) return;
      var c = cropOf(drag.pic, drag.win), dx = (ev.clientX - drag.x) * drag.k / c.scale, dy = (ev.clientY - drag.y) * drag.k / c.scale;
      // a picture dragged right shows more of its left side, and so on; 200 slider units span the room there is
      if (c.slackX > 1) drag.pic.mx = Math.max(-100, Math.min(100, drag.mx + dx / c.slackX * 200));
      if (c.slackY > 1) drag.pic.my = Math.max(-100, Math.min(100, drag.my + dy / c.slackY * 200));
      $('tmx').value = drag.pic.mx; $('tmy').value = drag.pic.my;
      drawThumb();
    });
    window.addEventListener('mouseup', function () { drag = null; });
  })();
  $('ttpl').addEventListener('change', function () { pickTemplate($('ttpl').value); });
  $('thead').addEventListener('input', drawThumb);
  $('ttplfolder').addEventListener('click', function () {
    cep.fs.makedir(WORK); cep.fs.makedir(TPL_LOCAL);
    var how = cep.fs.readFile(TPL_SHIPPED + '/HOW TO ADD A THUMBNAIL TEMPLATE.txt');
    if (!how.err) cep.fs.writeFile(TPL_LOCAL + '/HOW TO ADD A THUMBNAIL TEMPLATE.txt', how.data);
    cep.process.createProcess('/usr/bin/open', TPL_LOCAL);
    say($('tstat'), 'Put a template folder in there, then reopen the panel (or switch tabs and back) to see it in the list.');
  });
  $('tsave').addEventListener('click', function () {
    var st = $('tstat'), dir = WORK.split('/Library/')[0] + '/Desktop/Bulwark Thumbnails';
    cep.fs.makedir(dir);
    var name = (thumb.name || 'thumbnail').replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, ''), path = dir + '/' + name + ' thumbnail.png';
    var data = $('tcanvas').toDataURL('image/png').split(',')[1];
    if (cep.fs.writeFile(path, data, cep.encoding.Base64).err) return say(st, 'Could not save to ' + dir + '.', 'err');
    st.className = 'status ok'; st.textContent = 'Saved to Desktop > Bulwark Thumbnails > ' + name + ' thumbnail.png  ';
    var a = document.createElement('a'); a.className = 'link'; a.textContent = 'Show in Finder';
    a.addEventListener('click', function () { cep.process.createProcess('/usr/bin/open', '-R', path); }); st.appendChild(a);
  });
  listTemplates();
  // templates may have been added, or the show changed on the Reframe tab, since the panel opened
  document.querySelector('#tabs span[data-tab=thumb]').addEventListener('click', listTemplates);

  // ---- 2. captions ----
  function shadowLabel() { $('shadowval').textContent = num('shadowamt', 0, 100, 50); }
  function capStyle() { shadowLabel(); $('capstyle').textContent = 'Size ' + num('size', 10, 200, 54) + ', stroke ' + num('stroke', 0, 100, 7) + (($('fix').checked) ? ', words proofread' : '') + ' (change on the Settings tab).'; $('binname').textContent = binName(); }
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
  $('shadowamt').addEventListener('input', shadowLabel);
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

  // ---- caption editor: every caption as an ordinary text box ----
  // While the list is showing, the caption under the playhead is marked and kept in view (also during playback).
  var capRows = [], capSeq = '', capNow = null, capTyped = 0;
  $('caplist').addEventListener('input', function () { capTyped = Date.now(); });
  setInterval(function () {
    if (!capRows.length || $('tab-captions').className.indexOf('on') < 0 || document.hidden) return;
    jsx('$.bulwark.playhead()', function (r) {
      var p = r.split('|'), t = +p[2], hit = null;
      if (p[0] !== 'OK' || p[1] !== capSeq) { if (capNow) capNow.className = 'cap'; capNow = null; return; }
      for (var i = 0; i < capRows.length; i++) if (t >= capRows[i].c.s - 0.001 && t < capRows[i].c.e - 0.001) { hit = capRows[i].row; break; }
      if (hit === capNow) return;
      if (capNow) capNow.className = 'cap';
      capNow = hit;
      if (!hit) return;
      hit.className = 'cap now';
      var list = $('caplist');
      if (Date.now() - capTyped < 4000) return;      // hold still only while someone is actually typing (a clicked box alone does not count)
      // keep the playing caption in the middle of the list...
      var top = hit.offsetTop - list.offsetTop;
      list.scrollTop = Math.max(0, top - (list.clientHeight - hit.offsetHeight) / 2);
      // ...and, when the list is on screen but the caption is not (a short panel), bring the panel along too.
      // If the list is scrolled out of sight the panel is left alone: you are doing something else.
      var lr = list.getBoundingClientRect(), hr = hit.getBoundingClientRect(), H = window.innerHeight;
      if (lr.bottom > 0 && lr.top < H && (hr.top < 0 || hr.bottom > H)) window.scrollBy(0, hr.top - (H - hr.height) / 2);
    });
  }, 400);
  $('loadcaps').addEventListener('click', function () {
    var st = $('estat'), list = $('caplist');
    say(st, 'Reading the captions…'); list.innerHTML = ''; capRows = []; capNow = null;
    jsx('$.bulwark.seqInfo()', function (ri) { capSeq = ri.split('|')[1] || ''; });
    jsx('$.bulwark.listCaptions()', function (r) {
      var lines = r.split('\n');
      if (lines[0] !== 'OK') return say(st, r.split('|').slice(1).join('|') || 'Premiere did not answer.', 'err');
      lines.shift();
      if (!lines.length) return say(st, 'No captions in this sequence yet.');
      lines.forEach(function (line) {
        var f = line.split('\t'), c = { track: +f[0], s: +f[1], e: +f[2], text: f[3] || '', timing: f[4] || '' };
        var row = document.createElement('div'), tm = document.createElement('span'), inp = document.createElement('input');
        row.className = 'cap'; tm.textContent = E.clock(c.s); inp.type = 'text'; inp.value = c.text;
        inp.addEventListener('focus', function () { jsx('$.bulwark.jump(' + (c.s + 0.02) + ')', function () {}); });
        function save() {
          var text = inp.value.replace(/\s+/g, ' ').replace(/^ | $/g, '').toUpperCase();
          if (text === c.text) return;
          if (!text) { inp.value = c.text; return say(st, 'A caption cannot be empty. To remove one, delete its clip in the timeline.', 'err'); }
          var timing = c.timing ? E.retime(c.timing, text.split(' ').length, c.e - c.s) : '';
          inp.value = text;
          jsx('$.bulwark.setCaption(' + [c.track, c.s, q(text), q(timing)].join(',') + ')', function (r2) {
            if (r2 !== 'OK') { inp.className = 'bad'; return say(st, r2.split('|').slice(1).join('|') || 'Premiere did not answer.', 'err'); }
            c.text = text; c.timing = timing || c.timing; inp.className = 'saved';
            say(st, 'Saved: ' + text, 'ok');
          });
        }
        inp.addEventListener('change', save);
        inp.addEventListener('keydown', function (ev) { if (ev.keyCode === 13) inp.blur(); });
        row.appendChild(tm); row.appendChild(inp); list.appendChild(row); capRows.push({ c: c, row: row });
      });
      say(st, lines.length + ' captions. The one under the playhead is marked as you play or scrub.', 'ok');
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
  $('oShadow').addEventListener('click', function () {
    var o = $('oOut'); $('oShadow').disabled = true; say(o, 'Working…');
    jsx('$.bulwark.shadowCaptions(-1,' + num('shadowamt', 0, 100, 50) + ')', function (r) {
      $('oShadow').disabled = false;
      var p = r.split('|');
      if (p[0] !== 'OK') return say(o, p[1] || 'Premiere did not answer.', 'err');
      say(o, +p[1] ? 'Drop shadow at strength ' + num('shadowamt', 0, 100, 50) + ' is on ' + p[1] + ' caption' + (+p[1] === 1 ? '' : 's') + '.' : 'No captions found in this sequence.', +p[1] ? 'ok' : '');
    });
  });
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
        say(st, 'Reading the cuts in this sequence…');
        jsx('$.bulwark.shotMap()', function (rm) {
          var pm = rm.split('|'), shots = pm[0] === 'OK' ? E.shots(pm[1], pm[2]) : { cuts: [], segs: [] };
          if (pm[0] !== 'OK' && ($('splitcuts').checked || $('autopos').checked)) notes.push('The cuts in this sequence could not be read, so captions were not split or repositioned by shot.');
          var caps = E.captions(info.words, info.frame, info.total), i = 0, track = -1, placed = 0;
          if ($('splitcuts').checked) caps = E.splitAtCuts(caps, shots.cuts, info.frame);
          // auto reposition: solo shot 80% down, 2-up on the join between the windows (50%), 3-UP / PIP on the lower join (67%)
          var auto = $('autopos').checked && shots.segs.length, HEIGHTS = { 1: 0.8, 2: 0.5, 3: 0.667 }, kinds = { 1: 0, 2: 0, 3: 0 };
          function finish() {
            busy(false);
            if (auto) notes.push('Placed by shot: ' + kinds[1] + ' on solo shots (80%), ' + kinds[2] + ' on 2-ups (50%), ' + kinds[3] + ' on 3-UPs (67%).');
            say(st, placed + ' captions placed on V' + (track + 1) + ' of "' + info.name + '".' + (notes.length ? '\n' + notes.join('\n') : '') +
              '\nPlay it through once: fix any wrong word in the Caption field of that clip.', 'ok');
          }
          (function batch() {
            if (i >= caps.length) {
              if (!$('shadow').checked) return finish();
              say(st, 'Adding the drop shadow…');
              return jsx('$.bulwark.shadowCaptions(' + track + ',' + num('shadowamt', 0, 100, 50) + ')', function (rs) {
                if (rs.split('|')[0] !== 'OK') notes.push('The drop shadow could not be added: ' + (rs.split('|')[1] || 'Premiere did not answer') + '.');
                finish();
              });
            }
            var lines = [];
            for (var n = 0; n < 30 && i < caps.length; n++, i++) {
              var kind = E.kindAt(shots.segs, caps[i].s + info.frame / 2), h = auto ? HEIGHTS[kind] || 0.8 : y / 100;
              kinds[kind] = (kinds[kind] || 0) + 1;
              lines.push([caps[i].s.toFixed(5), caps[i].e.toFixed(5), caps[i].text.replace(/[\t\n]/g, ' '), caps[i].timing, h].join('\t'));
            }
            say(st, 'Placing captions: ' + Math.min(i, caps.length) + ' of ' + caps.length + '…');
            jsx('$.bulwark.placeCaptions(' + [q(MOGRT), track, q(lines.join('\n')), size, stroke, y / 100].join(',') + ')', function (r) {
              var p = r.split('|');
              if (p[0] !== 'OK') { busy(false); return say(st, (p[1] || 'Premiere did not answer.') + (placed ? '\n' + placed + ' captions were placed before that.' : ''), 'err'); }
              track = +p[1]; placed += +p[2];
              setTimeout(batch, 30);
            });
          })();
        });
      }
      if (!hasFont('SpecialGothicCondensed-SemiBold') && !hasFont('Special Gothic Condensed')) notes.push('The font Special Gothic Condensed SemiBold is not installed on this Mac, so the captions show in a stand-in font. Activate it in Adobe Fonts (Creative Cloud), then restart Premiere.');
      if (info.apple) notes.push('The Parakeet speech model could not be used, so Apple\'s recogniser did the words: expect more misheard words.');
      if (!info.tight) notes.push('This Mac is older than macOS 26, so word timing is a little looser: check the highlight after pauses.');
      else if (info.timed < 0.6) notes.push('Word timing could only be pinned down on ' + Math.round(info.timed * 100) + '% of words (noisy audio or music): check the highlight.');
      if ($('nofill').checked) {
        var cl = E.cleanWords(info.words);
        info.words = cl.words;
        if (cl.dropped) notes.push(cl.dropped + ' filler word' + (cl.dropped === 1 ? '' : 's') + ' and stutter' + (cl.dropped === 1 ? '' : 's') + ' left out of the captions.');
      }
      if (!$('fix').checked) return place();
      var names = $('names').value.replace(/^\s+|\s+$/g, '');
      ask({ box: $('kmanual'), what: 'the words', field: 'fixes', effort: 'medium', schema: E.fixSchema, skip: 'Skip proofreading', parts: E.fixParts(info.words),
        system: E.fixSystem(), user: 'Clip: ' + info.name + (names ? '\nNames that may come up: ' + names : '') + '\n\nWords:\n' + E.numbered(info.words),
        shape: '{"fixes": [{"n": 14, "word": "Putin"}]}',
        status: function (t) { say(st, t); }, waiting: 'Claude is proofreading ' + info.words.length + ' words…', manual: 'Transcribed ' + info.words.length + ' words. Follow the three steps below to have them proofread, or skip.' }, function (e2, res, more) {
        if (e2 === 'cancel') { busy(false); return say(st, 'Cancelled. No captions were placed.'); }
        if (e2 === 'skip') { notes.push('Words were not proofread.'); return place(); }
        if (e2) notes.push('Words were not proofread: ' + e2);
        else { var n = E.applyFixes(info.words, res.fixes); notes.push(n ? 'Proofreading corrected ' + n + ' word' + (n === 1 ? '' : 's') + '.' : 'Proofreading found nothing to correct.'); if (more) notes.push(more); }
        place();
      });
    });
  });
})();
