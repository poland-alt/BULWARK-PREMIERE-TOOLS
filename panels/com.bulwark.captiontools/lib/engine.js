// Bulwark Clips & Captions: the parts that are plain logic (no Premiere, no network), so they can be tested alone.
// words = [{ s: start seconds, e: end seconds, w: "text" }] from the transcriber.
(function (root) {
  var E = {};

  E.clock = function (secs) {
    secs = Math.max(0, Math.round(secs));
    var h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60), s = secs % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
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
  E.clipSystem = function (count) {
    return 'You pick social video clips for The Bulwark, a political news and commentary outlet, from the transcript of a full episode. ' +
      'Editors cut each pick into its own 16x9 sequence and then reformat it to vertical for Instagram, TikTok and YouTube Shorts.\n\n' +
      'The transcript is numbered by sentence, each with the time it starts. It was made by speech recognition, so names and some words are misheard; read through that. There are no speaker labels.\n\n' +
      'Pick the ' + count + ' strongest clips. What makes a clip work:\n' +
      '- It stands on its own. Someone who has not seen the episode understands it from the first sentence, so start where the thought starts (the question or the setup), not at the punchline.\n' +
      '- It runs about 1:30 to 2:30. Include the setup and the follow-through; a 40 second punchline on its own is too short. Never under 1:15 or over 2:45.\n' +
      '- It ends on a landed point, a laugh or a clean conclusion, not mid-argument and not on a throwaway "anyway".\n' +
      '- It has a reason to be shared: a sharp argument, real news, a strong emotional beat, a very funny exchange.\n' +
      '- Clips do not overlap, and sponsor reads, housekeeping, intros and sign-offs are never clips.\n\n' +
      'For each clip give: first_line and last_line (the sentence numbers it starts and ends on, inclusive); title (3 to 6 plain words naming the moment, used as the sequence name, no punctuation); ' +
      'headline (the on-screen headline: 4 to 8 words, punchy, accurate to what is said, no hashtags or emoji); why (one sentence on why it works). Order them best first. ' +
      'If the episode has fewer good clips than asked for, return fewer.';
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
      if (cur.length && (cur.length >= 4 || len + 1 + t.length > 26 || w.s - cur[cur.length - 1].e > 0.7)) flush();
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

  root.BulwarkEngine = E;
})(typeof window !== 'undefined' ? window : this);
