// Bulwark Caption Tools - runs inside Premiere Pro.
// Sets the "Outline Width" control on every Motion Graphics Template clip that has one.
$.bulwark = $.bulwark || {};
$.bulwark.setOutline = function (width, scope) {
    var updated = 0, noControl = 0, notGraphic = 0;
    try {
        var seq = app.project.activeSequence;
        if (!seq) return "0|0|0|No sequence is open.";
        var clips = [];
        if (scope === "selected") {
            var sel = [];
            try { sel = seq.getSelection(); } catch (e) {}
            for (var i = 0; i < sel.length; i++) clips.push(sel[i]);
            if (!clips.length) return "0|0|0|Nothing is selected in the timeline.";
        } else {
            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                var tr = seq.videoTracks[t];
                for (var c = 0; c < tr.clips.numItems; c++) clips.push(tr.clips[c]);
            }
        }
        for (var k = 0; k < clips.length; k++) {
            var mgt = null;
            try { mgt = clips[k].getMGTComponent(); } catch (e2) {}
            if (!mgt) { notGraphic++; continue; }
            var props = mgt.properties, done = false;
            for (var q = 0; q < props.numItems; q++) {
                if (props[q].displayName === "Outline Width") { props[q].setValue(width, 1); done = true; break; }
            }
            if (done) updated++; else noControl++;
        }
        return updated + "|" + noControl + "|" + notGraphic + "|";
    } catch (err) {
        return updated + "|" + noControl + "|" + notGraphic + "|" + String(err);
    }
};

// ---------------------------------------------------------------------------------------------------------
// Clips and captions (v2). Everything below talks to the panel in plain "OK|..." / "ERR|message" strings.
// ---------------------------------------------------------------------------------------------------------
(function () {
    var TICKS = 254016000000;

    function seqById(id) {
        for (var i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].sequenceID === id) return app.project.sequences[i];
        return null;
    }
    function frameSecs(seq) { return Number(seq.timebase) / TICKS; }
    function onFrame(seq, secs) { var tb = Number(seq.timebase); return Math.round(secs * TICKS / tb) * tb / TICKS; }
    function timeAt(secs) { var t = new Time(); t.ticks = String(Math.round(secs * TICKS)); return t; }
    function clean(s) { return String(s).replace(/[|\r\n]/g, " "); }

    // ---- the open sequence ----
    $.bulwark.seqInfo = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var st = seq.getSettings();
            return "OK|" + seq.sequenceID + "|" + (Number(seq.end) / TICKS) + "|" + frameSecs(seq) + "|" + st.videoFrameWidth + "|" + st.videoFrameHeight + "|" + clean(seq.name);
        } catch (e) { return "ERR|" + e; }
    };

    // Writes the open sequence's sound to a small mono WAV for the transcriber. Premiere is busy while it exports.
    $.bulwark.exportAudio = function (outPath) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var names = ["Contents/Settings/EncoderPresets/", "Settings/EncoderPresets/"], preset = null;
            for (var i = 0; i < names.length && !preset; i++) {
                var f = new File(app.path + names[i] + "WAV_Mono_16bit_16kHz.epr");
                if (!f.exists) f = new File(app.path + "/" + names[i] + "WAV_Mono_16bit_16kHz.epr");
                if (f.exists) preset = f;
            }
            if (!preset) return "ERR|Premiere's WAV export preset was not found.";
            var out = new File(outPath);
            if (out.exists) out.remove();
            var r = seq.exportAsMediaDirect(outPath, preset.fsName, 0);
            if (!new File(outPath).exists) return "ERR|Premiere could not export the audio (" + r + ").";
            return "OK";
        } catch (e) { return "ERR|" + e; }
    };

    $.bulwark.jump = function (secs) {
        try { app.project.activeSequence.setPlayerPosition(String(Math.round(secs * TICKS))); return "OK"; } catch (e) { return "ERR|" + e; }
    };
    $.bulwark.openSeq = function (id) {
        try { app.project.openSequence(id); return "OK"; } catch (e) { return "ERR|" + e; }
    };

    // ---- cut one clip: a trimmed duplicate of the source sequence, filed in its own bin ----
    function binNamed(name) {
        var root = app.project.rootItem;
        for (var i = 0; i < root.children.numItems; i++) {
            var c = root.children[i];
            if (c.type === 2 && c.name === name) return c;
        }
        return root.createBin(name);
    }
    function eachTrack(seq, fn) {
        var t;
        for (t = 0; t < seq.videoTracks.numTracks; t++) fn(seq.videoTracks[t], true);
        for (t = 0; t < seq.audioTracks.numTracks; t++) fn(seq.audioTracks[t], false);
    }
    $.bulwark.cutClip = function (srcId, name, inSecs, outSecs, binName) {
        try {
            var src = seqById(srcId);
            if (!src) return "ERR|The episode sequence is no longer in the project.";
            var before = {}, i;
            for (i = 0; i < app.project.sequences.numSequences; i++) before[app.project.sequences[i].sequenceID] = 1;
            src.clone();
            var seq = null;
            for (i = 0; i < app.project.sequences.numSequences; i++) if (!before[app.project.sequences[i].sequenceID]) seq = app.project.sequences[i];
            if (!seq) return "ERR|Premiere did not duplicate the sequence.";
            seq.name = name;
            app.project.openSequence(seq.sequenceID);
            app.enableQE();
            var q = qe.project.getActiveSequence();
            seq = app.project.activeSequence;
            if (!q || seq.name !== name) return "ERR|Could not open the duplicate to trim it.";
            eachTrack(seq, function (tr) { try { tr.setTargeted(true, true); } catch (e1) {} });

            var fr = frameSecs(seq), end = Number(seq.end) / TICKS;
            var a = onFrame(seq, Math.max(0, inSecs)), b = Math.min(onFrame(seq, outSecs), end);
            if (b - a < fr * 2) return "ERR|That clip has no length.";
            if (b < end - fr / 2) { seq.setInPoint(b); seq.setOutPoint(end + 10); q.extract(); }      // tail first
            if (a > fr / 2) { seq.setInPoint(0); seq.setOutPoint(a); q.extract(); }                    // then the head

            // Extract can leave a one-frame gap at the head and sound running a frame past the picture: tidy both.
            var vStart = 1e9, vEnd = 0;
            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                var vt = seq.videoTracks[t];
                for (var c = 0; c < vt.clips.numItems; c++) {
                    vStart = Math.min(vStart, vt.clips[c].start.seconds); vEnd = Math.max(vEnd, vt.clips[c].end.seconds);
                }
            }
            if (vStart === 1e9) return "ERR|Nothing was left after trimming.";
            if (vStart > 0.0005) {
                eachTrack(seq, function (tr) {
                    for (var j = 0; j < tr.clips.numItems; j++) {
                        var st = tr.clips[j].start.seconds;
                        tr.clips[j].move(-(j === 0 && st < vStart + fr ? st : vStart));     // the first clip of a track goes exactly to 0
                    }
                });
                vEnd -= vStart;
            }
            for (var at = 0; at < seq.audioTracks.numTracks; at++) {
                var tr2 = seq.audioTracks[at];
                for (var k = tr2.clips.numItems - 1; k >= 0; k--) {
                    var cl = tr2.clips[k];
                    if (cl.start.seconds >= vEnd - 0.0005) { cl.remove(false, false); continue; }
                    if (cl.end.seconds > vEnd + 0.0005) { var e2 = cl.end; e2.seconds = vEnd; cl.end = e2; }
                }
            }
            try { seq.setInPoint(0); seq.setOutPoint(vEnd); } catch (e3) {}
            try { seq.projectItem.moveBin(binNamed(binName)); } catch (e4) {}
            return "OK|" + seq.sequenceID + "|" + vEnd;
        } catch (e) { return "ERR|" + e + (e.line ? " (line " + e.line + ")" : ""); }
    };

    // ---- captions: the Bulwark Word Fill template, one clip per caption, on its own track ----
    function toJSON(v) {
        if (v === null || v === undefined) return "null";
        if (typeof v === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        var parts = [], k;
        if (v instanceof Array) { for (k = 0; k < v.length; k++) parts.push(toJSON(v[k])); return "[" + parts.join(",") + "]"; }
        for (k in v) if (v.hasOwnProperty(k)) parts.push(toJSON(k) + ":" + toJSON(v[k]));
        return "{" + parts.join(",") + "}";
    }
    function fromJSON(s) { return eval("(" + s + ")"); }

    // data: one caption per line, "start<TAB>end<TAB>TEXT<TAB>word timings". track: -1 on the first batch (a new top track
    // is made if the top one is in use), afterwards the track the first batch reported.
    $.bulwark.placeCaptions = function (mogrtPath, track, data, size, outline, yShare) {
        var placed = 0;
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var mogrt = new File(mogrtPath);
            if (!mogrt.exists) return "ERR|The caption template is missing. Reinstall the panel.";
            if (track < 0) {
                track = seq.videoTracks.numTracks - 1;
                if (seq.videoTracks[track].clips.numItems > 0) {
                    app.enableQE();
                    qe.project.getActiveSequence().addTracks(1, seq.videoTracks.numTracks, 0, 0, 0, 0, 0);
                    seq = app.project.activeSequence;
                    track = seq.videoTracks.numTracks - 1;
                    if (seq.videoTracks[track].clips.numItems > 0) return "ERR|Could not add an empty track for the captions. Add a video track on top and try again.";
                }
            }
            var tr = seq.videoTracks[track], fr = frameSecs(seq);
            var binItem = tr.clips.numItems ? tr.clips[0].projectItem : null;
            var lines = String(data).split("\n"), docs = {}, index = null;

            function prm(props, name) { return index[name] === undefined ? null : props[index[name]]; }
            function setText(props, name, text, fontSize) {
                var pr = prm(props, name);
                if (!pr) return false;
                if (!docs[name]) docs[name] = fromJSON(pr.getValue());
                var v = docs[name];
                v.textEditValue = text;
                v.capPropTextRunCount = 1;
                v.fontTextRunLength = v.fontTextRunLength instanceof Array ? [text.length] : text.length;
                if (fontSize) v.fontSizeEditValue = [fontSize];
                pr.setValue(toJSON(v), 1);
                return true;
            }
            function colour(pr, r, g, b) { if (pr) try { pr.setColorValue(255, r, g, b, 1); } catch (e0) {} }
            function plain(pr, v) { if (pr) try { pr.setValue(v, 1); } catch (e0) {} }

            for (var i = 0; i < lines.length; i++) {
                var f = lines[i].split("\t");
                if (f.length < 4) continue;
                var s = Number(f[0]), e = Number(f[1]), clip = null;
                if (!binItem) {
                    clip = seq.importMGT(mogrt.fsName, timeAt(s).ticks, track, 0);
                    if (!clip) return "ERR|Premiere could not place the caption template.";
                    binItem = clip.projectItem;
                    tr = seq.videoTracks[track];
                } else {
                    // from the project item: no "loading template" window for every caption
                    binItem.setOutPoint(Math.max(fr, e - s + fr / 2), 4);
                    tr.overwriteClip(binItem, timeAt(s));
                    var n = tr.clips.numItems;
                    for (var k = n - 1; k >= 0 && !clip; k--) if (Math.abs(tr.clips[k].start.seconds - s) < fr / 2) clip = tr.clips[k];
                    if (!clip) return "ERR|A caption at " + s.toFixed(2) + "s was not placed.|" + track + "|" + placed;
                }
                if (Math.abs(clip.end.seconds - e) > 0.0005) { var en = clip.end; en.seconds = e; clip.end = en; }
                var mgt = clip.getMGTComponent();
                if (!mgt) return "ERR|The caption template did not load as a Motion Graphics Template.";
                var props = mgt.properties;
                if (!index) { index = {}; for (var q = 0; q < props.numItems; q++) index[props[q].displayName] = q; }
                if (!setText(props, "Caption", f[2], size)) return "ERR|The template has no Caption text control.";
                if (!setText(props, "Word Timing", f[3])) return "ERR|The template has no Word Timing control, so the highlight cannot follow the words.";
                plain(prm(props, "Outline Width"), outline);
                plain(prm(props, "Position"), [0.5, yShare]);
                plain(prm(props, "Blur In"), false);
                colour(prm(props, "Text Color"), 255, 255, 255);
                colour(prm(props, "Highlight Color"), 255, 186, 46);
                colour(prm(props, "Highlight Color 2"), 255, 186, 46);
                colour(prm(props, "Outline Color"), 0, 0, 0);
                placed++;
            }
            return "OK|" + track + "|" + placed;
        } catch (err) { return "ERR|" + err + (err.line ? " (line " + err.line + ")" : "") + "|" + track + "|" + placed; }
    };
})();
