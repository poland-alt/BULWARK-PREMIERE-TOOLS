// Bulwark Clips & Captions: the parts that are plain logic (no Premiere, no network), so they can be tested alone.
// words = [{ s: start seconds, e: end seconds, w: "text" }] from the transcriber.
(function (root) {
  var E = {};

  E.clock = function (secs) {
    secs = Math.max(0, Math.round(secs));
    var h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };

  // ---- word timing ----
  // Parakeet hears the words, but times them in coarse 80 ms steps (and any recogniser can count a pause as part of the
  // next word). Apple's dictation recogniser mishears more but times each word tightly.
  // So: words from Parakeet, times from the tight list wherever both heard the same word at about the same moment.
  function key(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function alike(x, y) {            // "starlink"/"starling", "they've"/"they"
    if (x === y) return true;
    var n = 0;
    while (n < x.length && n < y.length && x.charAt(n) === y.charAt(n)) n++;
    return n >= 3 && n >= 0.6 * Math.min(x.length, y.length);
  }
  function capLong(w) {             // a word far longer than it could be said starts late in its stretch, not at the front
    var most = 0.15 + 0.08 * key(w.w).length;
    if (w.e - w.s > 2 * most) w.s = w.e - most;
  }
  function inOrder(out) {
    for (var q = 0; q < out.length; q++) {
      if (q > 0 && out[q].s < out[q - 1].s + 0.03) out[q].s = out[q - 1].s + 0.03;
      if (q > 0 && out[q - 1].e > out[q].s) out[q - 1].e = out[q].s;
      if (out[q].e < out[q].s + 0.03) out[q].e = out[q].s + 0.03;
      out[q].s = Math.round(out[q].s * 1000) / 1000; out[q].e = Math.round(out[q].e * 1000) / 1000;
    }
    return out;
  }
  // Returns { words, timed: share of words that got a tight time }
  var EARLY = 0.07;      // Parakeet's own word times run about this much early
  E.mergeTimes = function (heard, tight0) {
    var tight = [], i, q;
    for (i = 0; i < tight0.length; i++) {            // "Ukraine" + "'s" arrive as two pieces: join them
      var t = tight0[i];
      if (!key(t.w)) continue;
      if (/^['\u2019]/.test(t.w) && tight.length) { tight[tight.length - 1].w += t.w; tight[tight.length - 1].e = t.e; }
      else tight.push({ s: t.s, e: t.e, w: t.w });
    }
    var out = [], at = [], j = 0, lead = 0.04, hit = 0;
    for (i = 0; i < heard.length; i++) { out.push({ s: heard[i].s, e: heard[i].e, w: heard[i].w }); at.push(-1); }
    for (i = 0; i < heard.length; i++) {
      // the word really starts inside the stretch WhisperKit gave it (which begins early and ends about right)
      var k = key(heard[i].w), m = -1, near = -1;
      while (j < tight.length && tight[j].s < heard[i].s - 0.25) j++;
      for (var n = j; n < tight.length && tight[n].s <= heard[i].e + 0.1; n++) {
        var tk = key(tight[n].w);
        if (tk === k) { m = n; break; }
        if (near < 0 && alike(tk, k)) near = n;
      }
      if (m < 0) m = near;
      if (m >= 0) { at[i] = m; j = m + 1; }
    }
    for (i = 0; i < heard.length;) {                 // stretches where they disagree: same number of words, pair them off
      if (at[i] >= 0) { i++; continue; }
      var r = i; while (r < heard.length && at[r] < 0) r++;
      var lo = i > 0 ? at[i - 1] + 1 : 0, hi = r < heard.length ? at[r] : tight.length;
      if (hi - lo === r - i) for (q = i; q < r; q++) at[q] = lo + (q - i);
      i = r;
    }
    for (q = 0; q < out.length; q++) {
      if (at[q] >= 0) { out[q].s = tight[at[q]].s + lead; out[q].e = tight[at[q]].e + lead; hit++; }
      else { out[q].s += EARLY; out[q].e += EARLY; }
      capLong(out[q]);
    }
    return { words: inOrder(out), timed: out.length ? hit / out.length : 0 };
  };
  // Parakeet on its own (a Mac without the tight recogniser): shift, and pull over-long words to their end.
  E.wordsAlone = function (heard) {
    var out = [];
    for (var i = 0; i < heard.length; i++) {
      var w = { s: heard[i].s + EARLY, e: heard[i].e + EARLY, w: heard[i].w };
      capLong(w); out.push(w);
    }
    return { words: inOrder(out), timed: 0 };
  };

  // ---- clips ----
  // Sentences the model can point at by number: [{ a: first word index, b: last word index, text }]
  E.sentences = function (words) {
    var out = [], a = 0;
    for (var i = 0; i < words.length; i++) {
      var last = i === words.length - 1;
      var stop = /[.?!]["'”’)\]]*$/.test(words[i].w), pause = !last && words[i + 1].s - words[i].e > 1.5, long = i - a >= 44;
      if (last || stop || pause || long) {
        var t = [];
        for (var k = a; k <= i; k++) t.push(words[k].w);
        out.push({ a: a, b: i, text: t.join(' ') });
        a = i + 1;
      }
    }
    return out;
  };
  E.transcriptText = function (words, sents) {
    var lines = [];
    for (var i = 0; i < sents.length; i++) lines.push('[' + (i + 1) + '] ' + E.clock(words[sents[i].a].s) + ' ' + sents[i].text);
    return lines.join('\n');
  };
  E.clipSystem = function (min, max) {
    min = min || 90; max = max || 150;
    var lo = E.clock(min), hi = E.clock(max), floor = E.clock(Math.max(10, min - 15)), ceil = E.clock(max + 15);
    return 'You pick social video clips for The Bulwark, a political news and commentary outlet, from the transcript of a full episode. ' +
      'Editors cut each pick into its own 16x9 sequence and then reformat it to vertical for Instagram, TikTok and YouTube Shorts.\n\n' +
      'The transcript is numbered by sentence, each with the time it starts. It was made by speech recognition, so names and some words are misheard; read through that. There are no speaker labels.\n\n' +
      'Suggest every moment in the episode that would make a strong clip. You decide how many: an episode may have two or it may have ten. Do not pad the list with weak ones to reach a number, and do not leave a good one out. What makes a clip work:\n' +
      '- It stands on its own. Someone who has not seen the episode understands it from the first sentence, so start where the thought starts (the question or the setup), not at the punchline.\n' +
      '- It runs about ' + lo + ' to ' + hi + '. Include the setup and the follow-through; a punchline on its own is too short. Never under ' + floor + ' or over ' + ceil + '.\n' +
      '- It ends on a landed point, a laugh or a clean conclusion, not mid-argument and not on a throwaway "anyway".\n' +
      '- It has a reason to be shared: a sharp argument, real news, a strong emotional beat, a very funny exchange.\n' +
      '- Clips do not overlap, and sponsor reads, housekeeping, intros and sign-offs are never clips.\n\n' +
      'For each clip give: first_line and last_line (the sentence numbers it starts and ends on, inclusive); title (3 to 6 plain words naming the moment, used as the sequence name, no punctuation); ' +
      'headline (the on-screen headline: 4 to 8 words, punchy, accurate to what is said, no hashtags or emoji); why (one sentence on why it works). Order them best first. ' +
      'If nothing in the episode is worth cutting, return an empty list.';
  };
  E.clipSchema = {
    type: 'object', additionalProperties: false, required: ['clips'],
    properties: { clips: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['first_line', 'last_line', 'title', 'headline', 'why'],
      properties: { first_line: { type: 'integer' }, last_line: { type: 'integer' }, title: { type: 'string' }, headline: { type: 'string' }, why: { type: 'string' } }
    } } }
  };
  // Turn the model's picks into cut points. In: just before the first word. Out: a little into the pause after the
  // last word (word end times land before the audible tail of the word, so err long).
  E.clipTimes = function (picks, words, sents, total) {
    var out = [];
    for (var i = 0; i < (picks || []).length; i++) {
      var p = picks[i], fa = sents[p.first_line - 1], fb = sents[p.last_line - 1];
      if (!fa || !fb || p.last_line < p.first_line) continue;
      var a = fa.a, b = fb.b;
      var gapIn = a > 0 ? words[a].s - words[a - 1].e : 1, gapOut = b < words.length - 1 ? words[b + 1].s - words[b].e : 2;
      var tin = Math.max(0, words[a].s - Math.min(0.25, Math.max(0.03, gapIn * 0.6)));
      var tout = Math.min(total, words[b].e + Math.min(0.85, Math.max(0.15, gapOut - 0.05)));
      out.push({ s: tin, e: tout, title: String(p.title || 'Clip ' + (i + 1)).replace(/[\\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, ''), headline: String(p.headline || ''), why: String(p.why || ''),
        first: sents[p.first_line - 1].text, last: sents[p.last_line - 1].text });
    }
    return out;
  };

  // ---- captions ----
  E.fixSystem = function () {
    return 'You proofread a speech-recognition transcript of a clip from The Bulwark (US politics commentary) before it becomes on-screen captions. ' +
      'The words are numbered. Find words the recogniser clearly misheard: names of people, places and organisations, homophones, and words that make no sense where they stand. ' +
      'Each fix replaces exactly one numbered word with exactly one word (no spaces), keeping any punctuation that was attached to it, because each word carries its own timing. ' +
      'If the right fix would need a different number of words, pick the closest one-for-one fix or leave it. Do not rephrase, do not fix grammar or style, do not censor swearing, and leave anything you are not confident about. ' +
      'Return only the changes; an empty list is a fine answer.';
  };
  E.fixSchema = {
    type: 'object', additionalProperties: false, required: ['fixes'],
    properties: { fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'word'], properties: { n: { type: 'integer' }, word: { type: 'string' } } } } }
  };
  E.numbered = function (words) {
    var t = [];
    for (var i = 0; i < words.length; i++) t.push((i + 1) + ':' + words[i].w);
    return t.join(' ');
  };
  E.applyFixes = function (words, fixes) {
    var n = 0;
    for (var i = 0; i < (fixes || []).length; i++) {
      var f = fixes[i], w = words[f.n - 1], nw = String(f.word || '').replace(/\s+/g, '');
      if (!w || !nw || nw === w.w) continue;
      w.w = nw; n++;
    }
    return n;
  };
  // Captions the way the team's finished verticals read: up to 4 words, a new caption after a sentence ends or a pause.
  // Each caption: { s, e, text (capitals), timing: "0.000,0.160,..." (each word's start, counted from the caption's start) }
  E.captions = function (words, frame, total) {
    var groups = [], cur = [], len = 0;
    function flush() { if (cur.length) groups.push(cur); cur = []; len = 0; }
    for (var i = 0; i < words.length; i++) {
      var w = words[i], t = String(w.w);
      var closes = /[,.?!]["'\u201d\u2019)\]]*$/.test(t);     // a 5th word is allowed when it finishes the phrase, so it is not left alone
      var full = cur.length >= 5 || (cur.length === 4 && !(closes && len + 1 + t.length <= 28)) || (cur.length < 4 && len + 1 + t.length > 26);
      if (cur.length && (full || w.s - cur[cur.length - 1].e > 0.7)) flush();
      cur.push(w); len += (len ? 1 : 0) + t.length;
      if (/[.?!]["'”’)\]]*$/.test(t)) flush();
    }
    flush();
    function grid(x) { return Math.round(x / frame) * frame; }
    var out = [], prevEnd = 0;
    for (var g = 0; g < groups.length; g++) {
      var ws = groups[g], s = Math.max(prevEnd, Math.floor(ws[0].s / frame + 1e-6) * frame);     // never after its first word
      var next = g + 1 < groups.length ? Math.floor(groups[g + 1][0].s / frame + 1e-6) * frame : total;
      var e = Math.min(next, grid(ws[ws.length - 1].e + 1.0), total);
      if (e < s + 2 * frame) e = s + 2 * frame;
      var text = [], timing = [];
      for (var k = 0; k < ws.length; k++) {
        text.push(String(ws[k].w).toUpperCase());
        timing.push((k === 0 ? 0 : Math.max(0, ws[k].s - s)).toFixed(3));
      }
      out.push({ s: s, e: e, text: text.join(' '), timing: timing.join(',') });
      prevEnd = e;
    }
    return out;
  };

  // ---- Apple Intelligence reads about a page at a time: the same questions, cut into overlapping parts ----
  E.clipParts = function (words, sents) {
    var parts = [], i = 0;
    while (i < sents.length) {
      var lines = [], len = 0, j = i;
      while (j < sents.length && (len < 7000 || j === i)) {
        var l = '[' + (j + 1) + '] ' + E.clock(words[sents[j].a].s) + ' ' + sents[j].text;
        lines.push(l); len += l.length + 1; j++;
      }
      parts.push('This is one part of a longer episode (sentences ' + (i + 1) + ' to ' + j + '). Suggest at most two clips that lie fully inside this part, or none if nothing here is strong enough.\n\nTranscript:\n' + lines.join('\n'));
      if (j >= sents.length) break;
      i += Math.max(1, Math.floor((j - i) / 2));      // half a part of overlap, so a clip across a join is still seen whole
    }
    return parts;
  };
  E.joinClips = function (items) {       // the same moment turns up in two overlapping parts: keep the first of each
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var c = items[i], clash = false;
      if (!c || !(c.first_line > 0) || !(c.last_line >= c.first_line)) continue;
      for (var k = 0; k < out.length; k++) if (c.first_line <= out[k].last_line && out[k].first_line <= c.last_line) clash = true;
      if (!clash) out.push(c);
    }
    return out;
  };
  E.fixParts = function (words) {
    var parts = [];
    for (var i = 0; i < words.length; i += 150) {
      var t = [];
      for (var k = i; k < Math.min(words.length, i + 150); k++) t.push((k + 1) + ':' + words[k].w);
      parts.push('Words:\n' + t.join(' '));
    }
    return parts;
  };

  // ---- filler words and stutters ----
  // Captions read better without "um" and without the false starts of a stutter ("I, I, I think" -> "I think").
  // Only sounds that carry no meaning are dropped, and only small joining words are treated as stutters when they
  // repeat, so "no, no, no" and "very, very" stay.
  var FILLER = { um: 1, umm: 1, uh: 1, uhh: 1, uhm: 1, er: 1, erm: 1, ah: 1, ahh: 1, eh: 1, hm: 1, hmm: 1, mm: 1, mmm: 1, mhm: 1 };
  var STUTTER = {};
  ('i im ive id ill you youre he hes she shes we were weve they theyre theyve it its this that thats these those the a an and but so or if when what whats ' +
   'who where why how to of in on at for with from is was are do does did have has had can could would should will my your his her our their me him them there theres because as by not just then').split(' ').forEach(function (w) { STUTTER[w] = 1; });
  E.cleanWords = function (words) {
    var out = [], dropped = 0;
    function k(w) { return String(w.w).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    for (var i = 0; i < words.length; i++) {
      var w = words[i], key = k(w);
      if (FILLER[key]) { dropped++; continue; }
      var prev = out.length ? out[out.length - 1] : null;
      // the same small word again straight away, with no full stop between: keep the last one said
      if (prev && key && k(prev) === key && STUTTER[key] && !/[.?!]["'\u201d\u2019)\]]*$/.test(prev.w) && w.s - prev.e < 1.2) { out[out.length - 1] = w; dropped++; continue; }
      // the same two words again ("I think, I think"): keep the second pair
      if (out.length >= 3 && i + 0 < words.length) {
        var a = out[out.length - 3], b = out[out.length - 2], c = out[out.length - 1];
        if (k(a) === k(c) && k(b) === key && STUTTER[k(a)] && key && !/[.?!]["'\u201d\u2019)\]]*$/.test(b.w) && w.s - c.e < 1.2) { out.splice(out.length - 3, 2); dropped += 2; }
      }
      out.push(w);
    }
    return { words: out, dropped: dropped };
  };

  // ---- editing a caption's words ----
  // The highlight needs one start time per word. Same number of words: the times stay. More or fewer: the new words
  // are spread along the old ones' times (and the clip's length), so the highlight still runs start to end.
  E.retime = function (timing, words, dur) {
    var t = String(timing || '').split(','), old = [], i;
    for (i = 0; i < t.length; i++) if (t[i] !== '') old.push(parseFloat(t[i]) || 0);
    if (!old.length) old = [0];
    if (old.length === words) return old.map(function (x) { return x.toFixed(3); }).join(',');
    old.push(Math.max(dur, old[old.length - 1] + 0.05));       // where a word after the last one would start
    var out = [], n = old.length - 1;
    for (i = 0; i < words; i++) {
      var pos = i * n / words, a = Math.floor(pos), f = pos - a;
      out.push((old[a] + (old[a + 1] - old[a]) * f).toFixed(3));
    }
    out[0] = '0.000';
    return out.join(',');
  };

  // ---- cuts and shots ----
  // shotMap text from Premiere -> { cuts: [secs], segs: [{ s, kind }] }  (kind 1 solo, 2 2-up, 3 3-UP / PIP)
  E.shots = function (cutText, segText) {
    var cuts = [], segs = [], i;
    var a = String(cutText || '').split(','), b = String(segText || '').split(';');
    for (i = 0; i < a.length; i++) if (a[i] !== '') cuts.push(parseFloat(a[i]));
    for (i = 0; i < b.length; i++) { var p = b[i].split(':'); if (p.length === 2) segs.push({ s: parseFloat(p[0]), kind: parseInt(p[1], 10) }); }
    return { cuts: cuts, segs: segs };
  };
  E.kindAt = function (segs, t) {
    var kind = 1;
    for (var i = 0; i < segs.length && segs[i].s <= t + 1e-4; i++) kind = segs[i].kind;
    return kind;
  };
  // A caption that runs across a picture cut becomes two clips that meet at the cut, so each shot's captions can be
  // moved on their own. The second piece carries the same words; the ones already said count from its start.
  E.splitAtCuts = function (caps, cuts, frame) {
    var out = [];
    for (var i = 0; i < caps.length; i++) {
      var c = caps[i];
      for (var k = 0; k < cuts.length; k++) {
        var cut = cuts[k];
        if (cut <= c.s + 2 * frame - 1e-4) continue;       // a sliver of a frame or two is not worth its own clip
        if (cut >= c.e - 2 * frame + 1e-4) break;
        var t = c.timing.split(','), shifted = [];
        for (var q = 0; q < t.length; q++) shifted.push(Math.max(0, parseFloat(t[q]) - (cut - c.s)).toFixed(3));
        out.push({ s: c.s, e: cut, text: c.text, timing: c.timing });
        c = { s: cut, e: c.e, text: c.text, timing: shifted.join(','), cont: true };
      }
      out.push(c);
    }
    return out;
  };

  root.BulwarkEngine = E;
})(typeof window !== 'undefined' ? window : this);
