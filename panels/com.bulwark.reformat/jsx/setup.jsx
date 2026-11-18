// Bulwark Premiere Tools: project setup. Takes the raw recordings and builds the working structure the team uses:
// a nest per person, the wide shot, the media layout, the main sequence with everyone stacked, and the voice
// tracks' track-mixer effects. ExtendScript (ES3).
if (typeof $.bulwark === "undefined") $.bulwark = {};

(function () {
    var TICKS = 254016000000;

    // ---- small helpers ----
    function str(v) {                                  // a value as JSON text
        var t = typeof v, i, a = [];
        if (v === null || v === undefined) return "null";
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
        if (v instanceof Array) { for (i = 0; i < v.length; i++) a.push(str(v[i])); return "[" + a.join(",") + "]"; }
        for (var k in v) if (v.hasOwnProperty(k)) a.push(str(String(k)) + ":" + str(v[k]));
        return "{" + a.join(",") + "}";
    }
    function parse(s) {                                // JSON text as a value; refuses anything that is not plain JSON
        s = String(s);
        var bare = s.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:\s*\[)+/g, "");
        if (!/^[\],:{}\s]*$/.test(bare)) throw new Error("Not valid JSON.");
        return eval("(" + s + ")");
    }
    function readFile(path) { var f = new File(path); f.encoding = "UTF-8"; if (!f.open("r")) throw new Error("Could not read " + path); var t = f.read(); f.close(); return t; }
    function secs(n) { var t = new Time(); t.seconds = n; return t; }
    function childBin(parent, name) {
        for (var i = 0; i < parent.children.numItems; i++) { var c = parent.children[i]; if (c.type === ProjectItemType.BIN && String(c.name).toLowerCase() === name.toLowerCase()) return c; }
        return parent.createBin(name);
    }
    function binPath(path) { var b = app.project.rootItem, p = path.split("/"); for (var i = 0; i < p.length; i++) if (p[i]) b = childBin(b, p[i]); return b; }
    function eachItem(parent, fn) {                    // every non-bin item in the project; fn returns true to stop
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c.type === ProjectItemType.BIN) { if (eachItem(c, fn)) return true; }
            else if (fn(c)) return true;
        }
        return false;
    }
    function itemByPath(path) { var hit = null; eachItem(app.project.rootItem, function (c) { try { if (c.getMediaPath() === path) { hit = c; return true; } } catch (e) {} return false; }); return hit; }
    function itemByName(name) {
        var hit = null, want = String(name).toLowerCase();
        eachItem(app.project.rootItem, function (c) { if (String(c.name).toLowerCase() === want) { hit = c; return true; } return false; });
        return hit;
    }
    function loose(s) { return String(s).toLowerCase().replace(/\.[a-z0-9]{2,4}$/, "").replace(/[^a-z0-9]/g, ""); }
    function stillLike(name) {                         // a still whose name matches but for capitals, spacing or extension
        var hit = null, want = loose(name);
        eachItem(app.project.rootItem, function (c) { if (/\.(png|psd|tiff?|jpe?g|webp)$/i.test(String(c.name)) && loose(c.name) === want) { hit = c; return true; } return false; });
        return hit;
    }
    function seqNamed(name) { var S = app.project.sequences; for (var i = 0; i < S.numSequences; i++) if (S[i].name === name) return S[i]; return null; }
    function freeName(name) { if (!seqNamed(name)) return name; var n = 2; while (seqNamed(name + " " + n)) n++; return name + " " + n; }
    function prop(clip, comp, name) {
        for (var i = 0; i < clip.components.numItems; i++) {
            var c = clip.components[i];
            if (c.displayName !== comp) continue;
            for (var j = 0; j < c.properties.numItems; j++) if (c.properties[j].displayName === name) return c.properties[j];
        }
        return null;
    }
    function setMotion(clip, m) {                      // m: { pos: [x, y], scale, cropL, cropR, cropT, cropB }
        var p;
        if (m.scale !== undefined && (p = prop(clip, "Motion", "Scale"))) p.setValue(m.scale, true);
        if (m.pos && (p = prop(clip, "Motion", "Position"))) p.setValue([m.pos[0], m.pos[1]], true);
        var crops = [["cropL", "Crop Left"], ["cropR", "Crop Right"], ["cropT", "Crop Top"], ["cropB", "Crop Bottom"]];
        for (var i = 0; i < crops.length; i++) if (m[crops[i][0]] && (p = prop(clip, "Motion", crops[i][1]))) p.setValue(m[crops[i][0]], true);
    }
    function readMotion(clip) {
        var out = {}, p, v;
        if ((p = prop(clip, "Motion", "Scale"))) out.scale = Math.round(p.getValue() * 100) / 100;
        if ((p = prop(clip, "Motion", "Position"))) { v = p.getValue(); out.pos = [Math.round(v[0] * 100000) / 100000, Math.round(v[1] * 100000) / 100000]; }
        var crops = [["cropL", "Crop Left"], ["cropR", "Crop Right"], ["cropT", "Crop Top"], ["cropB", "Crop Bottom"]];
        for (var i = 0; i < crops.length; i++) if ((p = prop(clip, "Motion", crops[i][1])) && p.getValue()) out[crops[i][0]] = Math.round(p.getValue() * 100) / 100;
        return out;
    }
    function lastClip(track) { return track.clips.numItems ? track.clips[track.clips.numItems - 1] : null; }

    // A new sequence from one of Premiere's own presets (1080p, stereo), filed in a bin and made tall enough.
    function newSequence(name, fps, bin, vTracks, aTracks) {
        app.enableQE();
        var preset = app.path + "Contents/Settings/SequencePresets/HD 1080p/HD 1080p " + fps + " fps.sqpreset";
        if (!new File(preset).exists) throw new Error("Premiere's \"HD 1080p " + fps + " fps\" sequence preset was not found.");
        var S = app.project.sequences, before = {}, i, seq = null;
        for (i = 0; i < S.numSequences; i++) before[S[i].sequenceID] = true;
        qe.project.newSequence(name, preset);
        for (i = 0; i < S.numSequences; i++) if (!before[S[i].sequenceID]) { seq = S[i]; break; }
        if (!seq) throw new Error("Premiere did not make the sequence \"" + name + "\".");
        if (bin) seq.projectItem.moveBin(bin);
        var addV = Math.max(0, vTracks - seq.videoTracks.numTracks), addA = Math.max(0, aTracks - seq.audioTracks.numTracks);
        if (addV || addA) {
            app.project.openSequence(seq.sequenceID);
            qe.project.getActiveSequence().addTracks(addV, seq.videoTracks.numTracks, addA, 1, seq.audioTracks.numTracks);
        }
        return seq;
    }
    // The main sequence, from the saved mixer template: a small project file holding one empty sequence whose audio
    // tracks and Mix track carry the team's effects. Scripts cannot reach the Mix track, and cannot copy effect
    // settings exactly, so the whole sequence is brought in ready-made.
    function fromTemplate(tpl, name, bin, vTracks, aTracks) {
        var S = app.project.sequences, before = {}, i, seq = null;
        for (i = 0; i < S.numSequences; i++) before[S[i].sequenceID] = true;
        app.project.importSequences(tpl.path, [tpl.id]);
        for (i = 0; i < S.numSequences; i++) if (!before[S[i].sequenceID]) { seq = S[i]; break; }
        if (!seq) return null;
        seq.name = name;
        if (bin) seq.projectItem.moveBin(bin);
        var addV = Math.max(0, vTracks - seq.videoTracks.numTracks), addA = Math.max(0, aTracks - seq.audioTracks.numTracks);
        if (addV || addA) {
            app.enableQE(); app.project.openSequence(seq.sequenceID);
            qe.project.getActiveSequence().addTracks(addV, seq.videoTracks.numTracks, addA, 1, seq.audioTracks.numTracks);
        }
        return seq;
    }
    // Saves the open sequence as the mixer template: a copy with every clip taken out, written as its own project.
    $.bulwark.templateSave = function (path) {
        var cp = null, act = app.project.activeSequence;
        try {
            if (!act) return "ERR|Open the sequence whose track mixer you want to keep as the template.";
            var S = app.project.sequences, before = {}, i, t, c, pos = act.getPlayerPosition().ticks;
            for (i = 0; i < S.numSequences; i++) before[S[i].sequenceID] = true;
            act.clone();
            for (i = 0; i < S.numSequences; i++) if (!before[S[i].sequenceID]) { cp = S[i]; break; }
            if (!cp) return "ERR|Premiere did not copy the sequence.";
            cp.name = "MAIN TEMPLATE";
            for (t = 0; t < cp.videoTracks.numTracks; t++) for (c = cp.videoTracks[t].clips.numItems - 1; c >= 0; c--) cp.videoTracks[t].clips[c].remove(false, false);
            for (t = 0; t < cp.audioTracks.numTracks; t++) for (c = cp.audioTracks[t].clips.numItems - 1; c >= 0; c--) cp.audioTracks[t].clips[c].remove(false, false);
            for (t = 0; t < cp.videoTracks.numTracks; t++) { try { cp.videoTracks[t].setMute(0); } catch (e1) {} }
            for (t = 0; t < cp.audioTracks.numTracks; t++) { try { cp.audioTracks[t].setMute(0); } catch (e2) {} }
            app.project.openSequence(cp.sequenceID);
            var fx = $.bulwark.mixerList(), id = cp.sequenceID, v = cp.videoTracks.numTracks, a = cp.audioTracks.numTracks;
            var ok = cp.exportAsProject(path);
            app.project.openSequence(act.sequenceID);
            app.project.deleteSequence(cp); cp = null;
            try { app.project.activeSequence.setPlayerPosition(pos); } catch (e3) {}
            if (!ok) return "ERR|Premiere could not write the template to " + path;
            return "OK|" + str({ id: id, from: act.name, video: v, audio: a, fx: fx.replace(/^OK\|/, "").split("|") });
        } catch (err) {
            try { if (cp) { app.project.openSequence(act.sequenceID); app.project.deleteSequence(cp); } } catch (e4) {}
            return "ERR|" + String(err);
        }
    };
    // Lays an item on a video track at a time; its sound lands on the audio track of the same number.
    // In and out marks left on the item would cut it short and shift it, so they are lifted while it is placed.
    function place(seq, trackIndex, item, at) {
        var tr = seq.videoTracks[trackIndex], n = tr.clips.numItems, ip = null, op = null;
        try { ip = item.getInPoint().seconds; op = item.getOutPoint().seconds; item.clearInPoint(); item.clearOutPoint(); } catch (eMarks) {}
        tr.overwriteClip(item, at || 0);
        try { if (ip !== null && (ip > 0 || op < item.getOutPoint().seconds - 0.001)) { item.setInPoint(ip, 4); item.setOutPoint(op, 4); } } catch (eMarks2) {}
        if (tr.clips.numItems <= n) throw new Error("Premiere would not place \"" + item.name + "\" in \"" + seq.name + "\". A person's file needs a picture: a sound-only file can only be the Master or Media.");
        return lastClip(tr);
    }
    function dropAudio(seq, trackIndex) {              // takes the sound that came along with a clip off its track
        if (trackIndex >= seq.audioTracks.numTracks) return;
        var tr = seq.audioTracks[trackIndex];
        for (var i = tr.clips.numItems - 1; i >= 0; i--) tr.clips[i].remove(false, false);
    }

    // ---- the track mixer ----
    // Effects on a sequence's audio tracks are only reachable through QE. Each control is set by its 0..1 value,
    // given as text. Premiere will not read those back precisely (two decimal places, and the readout shown in the
    // mixer is not refreshed after a scripted change), so a saved set carries the exact values taken from a
    // project file, and a change is confirmed by the two-place reading.
    function fxOf(qeTrack) {
        var out = [];
        for (var i = 0; i < qeTrack.numComponents; i++) {
            var c = qeTrack.getComponentAt(i), m = /^Fx Slot (\d+): (.+)$/.exec(String(c.name));
            if (m) out.push({ slot: +m[1], name: m[2], comp: c });
        }
        return out;
    }
    function took(comp, name, want) {                  // does the control now read as the value that was set?
        var got; try { got = String(comp.getParamValue(name)); } catch (e) { return false; }
        if (want === "true" || want === "false") return got === want;
        return Math.abs(parseFloat(got) - parseFloat(want)) <= 0.0051;
    }
    // Puts a saved set of track effects on audio tracks `first`..`first + count - 1` (1-based) of a sequence.
    // Every voice track gets the set saved for track 1, unless the save is per track and holds one for that track.
    function applyMixer(seq, mixer, first, count, notes, quiet) {
        app.enableQE();
        app.project.openSequence(seq.sequenceID);
        var q = qe.project.getActiveSequence(), byTrack = {}, i, missed = [], done = 0;
        for (i = 0; i < mixer.tracks.length; i++) byTrack[mixer.tracks[i].track] = mixer.tracks[i];
        var fallback = mixer.tracks[0];
        for (var t = first; t < first + count && t <= q.numAudioTracks; t++) {
            var want = mixer.perTrack ? (byTrack[t - first + 1] || fallback) : fallback, tr = q.getAudioTrackAt(t - 1);
            if (fxOf(tr).length) { if (!quiet) notes.push("Audio " + t + " already has track effects, so it was left alone."); continue; }
            for (i = 0; i < want.fx.length; i++) {
                var f = want.fx[i], effect = qe.project.getAudioEffectByName(f.name);
                if (!effect) { missed.push(f.name + " (not installed)"); continue; }
                tr.addAudioEffect(effect, f.slot - 1);
                var have = fxOf(tr), comp = null;
                for (var h = 0; h < have.length; h++) if (have[h].slot === f.slot) comp = have[h].comp;
                if (!comp) { missed.push(f.name + " on Audio " + t); continue; }
                for (var p = 0; p < f.params.length; p++) {
                    var name = f.params[p][0], val = String(f.params[p][1]);
                    if (took(comp, name, val)) continue;            // already there (the effect's own default)
                    try { comp.setParamValue(name, val); } catch (eSet) {}
                    if (!took(comp, name, val)) missed.push(f.name + " > " + name + " on Audio " + t);
                }
            }
            done++;
        }
        if (done) notes.push("Track mixer: " + fallback.fx.length + " effect" + (fallback.fx.length === 1 ? "" : "s") + " set on " + done + " voice track" + (done === 1 ? "" : "s") + ". Opening the effect in the Audio Track Mixer may show the old readouts until you touch a control; the sound is right.");
        if (missed.length) notes.push("Track mixer: check these by hand: " + missed.slice(0, 8).join("; ") + (missed.length > 8 ? " and " + (missed.length - 8) + " more" : "") + ".");
        return missed.length;
    }
    // What is on the open sequence's audio tracks: "OK|Audio 1: Parametric Equalizer, Dynamics|..."
    $.bulwark.mixerList = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            app.enableQE();
            var q = qe.project.getActiveSequence(), out = [];
            for (var t = 0; t < q.numAudioTracks; t++) {
                var list = fxOf(q.getAudioTrackAt(t)), n = [];
                for (var i = 0; i < list.length; i++) n.push(list[i].name);
                if (n.length) out.push("Audio " + (t + 1) + ": " + n.join(", "));
            }
            return "OK|" + out.join("|");
        } catch (err) { return "ERR|" + String(err); }
    };
    $.bulwark.mixerApply = function (cfgPath, first, count) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|Open the sequence to put the track mixer settings on.";
            var notes = [], mixer = parse(readFile(cfgPath));
            applyMixer(seq, mixer, +first || 1, +count || 3, notes);
            return "OK|" + notes.join("\n");
        } catch (err) { return "ERR|" + String(err) + (err.line ? " (line " + err.line + ")" : ""); }
    };

    // ---- reading a layout back out of a finished project ----
    // The open sequence is taken as a wide shot or media layout: the people are the nests on its tracks, the frame
    // is the still on top. Returns { people: [{ pos, scale, crop..., track }] left to right, frame, frameScale, mediaTrack }.
    $.bulwark.layoutRead = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|Open the wide shot (or media layout) sequence to copy its layout.";
            var people = [], frame = null, mediaWin = null, t, S = app.project.sequences;
            function isSeq(item) { if (!item) return false; for (var i = 0; i < S.numSequences; i++) if (S[i].projectItem && S[i].projectItem.nodeId === item.nodeId) return true; return false; }
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var tr = seq.videoTracks[t];
                if (!tr.clips.numItems) continue;
                var cl = tr.clips[0];
                if (isSeq(cl.projectItem)) { var m = readMotion(cl); m.track = t + 1; m.was = String(cl.name); people.push(m); }
                else if (/\.(png|psd|tiff?|jpe?g)$/i.test(String(cl.name))) { frame = { name: String(cl.name), scale: readMotion(cl).scale, track: t + 1 }; }
                else { var mm = readMotion(cl); if (mm.pos && mm.scale) mediaWin = { pos: mm.pos, scale: mm.scale }; }      // a video sitting in the media window: where media goes
            }
            if (people.length < 1) return "ERR|\"" + seq.name + "\" has no nested cameras on its tracks. Open the wide shot sequence (for example \"WS\").";
            people.sort(function (a, b) { return (a.pos[0] - b.pos[0]) || (a.pos[1] - b.pos[1]); });
            var res = { from: seq.name, people: people, frame: frame ? frame.name : "", frameScale: frame ? frame.scale : 100 };
            if (mediaWin) res.media = mediaWin;
            return "OK|" + str(res);
        } catch (err) { return "ERR|" + String(err); }
    };

    // ---- the project's 16x9 frames, to choose from ----
    // Every still inside a bin named for 16x9 frames ("16x9 Frames", "16x9 Simple Frames", ...), sub-bins included.
    // Returns "OK|<bin>\t<name>|..." in the order they sit in the project.
    function squash(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
    $.bulwark.setupFrames = function () {
        try {
            if (!app.project) return "ERR|No project is open.";
            var out = [], seen = {};
            function take(bin, label) {
                for (var j = 0; j < bin.children.numItems; j++) {
                    var x = bin.children[j];
                    if (x.type === ProjectItemType.BIN) take(x, x.name);
                    else if (/\.(png|psd|tiff?|jpe?g|webp)$/i.test(String(x.name)) && !seen[x.name]) { seen[x.name] = true; out.push(label + "\t" + x.name); }
                }
            }
            (function walk(parent) {
                for (var i = 0; i < parent.children.numItems; i++) {
                    var c = parent.children[i];
                    if (c.type !== ProjectItemType.BIN) continue;
                    var k = squash(c.name);
                    if (/frame/.test(k) && /16x9|169/.test(k) && !/9x16/.test(k.replace(/16x9/g, ""))) take(c, c.name); else walk(c);
                }
            })(app.project.rootItem);
            return "OK|" + out.join("|");
        } catch (err) { return "ERR|" + String(err); }
    };
    // The scale that makes a still as wide as a 1920 sequence (a 3840 frame comes out at 50), if its size can be read.
    function fitScale(item) {
        try { var m = /VideoInfo>\s*(\d+)\s*x\s*(\d+)/.exec(item.getProjectMetadata()); if (m && +m[1] > 0) return Math.round(1920 / +m[1] * 10000) / 100; } catch (e) {}
        return null;
    }

    // ---- the setup itself ----
    // cfg (JSON file): { fps, mainName, bins: { main, nests, footage, media }, people: [{ name, path, offset }] left to
    //   right, master: { path, offset } | null, media: [path], wide: layout | null, mediaLayout: layout | null,
    //   mixer: saved mixer | null }
    // A person's offset is where their recording starts on the shared clock, in seconds (0 for raw video).
    $.bulwark.setupRun = function (cfgPath) {
        var notes = [], made = [];
        try {
            if (!app.project) return "ERR|Open a project first.";
            var cfg = parse(readFile(cfgPath)), i, k, P = cfg.people || [], M = cfg.media || [];
            if (!P.length) return "ERR|Add at least one person's video.";
            // a person is one recording or several (someone who dropped off the stream and came back): { name, parts: [{ path, offset }] }
            for (i = 0; i < P.length; i++) {
                if (!P[i].parts) P[i].parts = [{ path: P[i].path, offset: P[i].offset }];
                for (k = 0; k < P[i].parts.length; k++) if (!new File(P[i].parts[k].path).exists) return "ERR|File not found: " + P[i].parts[k].path;
                if (seqNamed(P[i].name)) return "ERR|This project already has a sequence named \"" + P[i].name + "\". Rename that person here, or the sequence, and run it again.";
            }
            for (i = 0; i < M.length; i++) if (typeof M[i] === "string") M[i] = { path: M[i] };
            var bins = cfg.bins || {}, footage = binPath(bins.footage || "01-media"), nests = binPath(bins.nests || "NESTS"), mainBin = binPath(bins.main || "*SEQUENCES");
            var fps = cfg.fps || "23.976";

            // 1. bring the files in (one already in the project is used as it is)
            var need = [], all = [];
            for (i = 0; i < P.length; i++) for (k = 0; k < P[i].parts.length; k++) all.push(P[i].parts[k].path);
            if (cfg.master) all.push(cfg.master.path);
            for (i = 0; i < all.length; i++) if (!itemByPath(all[i])) need.push(all[i]);
            if (need.length) app.project.importFiles(need, true, footage, false);
            var mediaNeed = [];
            for (i = 0; i < M.length; i++) if (!itemByPath(M[i].path)) mediaNeed.push(M[i].path);
            if (mediaNeed.length) app.project.importFiles(mediaNeed, true, binPath(bins.media || "01-media/MEDIA"), false);
            for (i = 0; i < P.length; i++) for (k = 0; k < P[i].parts.length; k++) { P[i].parts[k].item = itemByPath(P[i].parts[k].path); if (!P[i].parts[k].item) return "ERR|Premiere could not import " + P[i].parts[k].path; }
            var masterItem = cfg.master ? itemByPath(cfg.master.path) : null;
            if (cfg.master && !masterItem) return "ERR|Premiere could not import " + cfg.master.path;

            // 2. the shared clock starts where the earliest person's recording starts
            var base = null, timed = false;
            for (i = 0; i < P.length; i++) for (k = 0; k < P[i].parts.length; k++) {
                var pt = P[i].parts[k];
                if (pt.offset !== undefined && pt.offset !== null) timed = true;
                pt.offset = +pt.offset || 0;
                if (base === null || pt.offset < base) base = pt.offset;
            }

            // 3. a nest per person. Each clip is made to fill the picture, whatever size it was recorded at.
            function fill(clip, item) {
                try {
                    var m = /VideoInfo>\s*(\d+)\s*x\s*(\d+)/.exec(item.getProjectMetadata());
                    if (!m || !(+m[1] > 0) || !(+m[2] > 0)) return;
                    var sc = Math.round(Math.max(1920 / +m[1], 1080 / +m[2]) * 10000) / 100;
                    if (Math.abs(sc - 100) > 0.05) setMotion(clip, { scale: sc, pos: [0.5, 0.5] });
                } catch (eFill) {}
            }
            var longest = 0;
            for (i = 0; i < P.length; i++) {
                var ps = newSequence(P[i].name, fps, nests, 1, 1), parts = P[i].parts, cursor = 0;
                made.push(ps.name);
                P[i].seq = ps;
                parts.sort(function (a, b) { return a.offset - b.offset; });
                for (k = 0; k < parts.length; k++) {
                    // with no sync to go by, a second recording simply follows the first
                    var at = timed ? parts[k].offset - base : cursor;
                    if (at < cursor - 0.0005) { notes.push(P[i].name + ": \"" + parts[k].item.name + "\" overlaps the recording before it, so it starts where that one ends. Check it by hand."); at = cursor; }
                    var vc = place(ps, 0, parts[k].item, at);
                    fill(vc, parts[k].item);
                    cursor = vc.end.seconds;
                    if (vc.end.seconds > longest) longest = vc.end.seconds;
                    if (k === 0 && at > 0.0005) notes.push(P[i].name + " starts " + at.toFixed(2) + "s in, to line up with the others.");
                }
                if (parts.length > 1) notes.push(P[i].name + " is " + parts.length + " recordings" + (timed ? ", each put where it belongs on the stream" : ", one after the other") + ".");
            }

            // livestream media that was matched to the master, in the order it played: [{ path, offset, item, at }]
            var timedMedia = [];
            for (i = 0; i < M.length; i++) if (M[i].offset !== undefined && M[i].offset !== null) { M[i].item = itemByPath(M[i].path); M[i].at = M[i].offset - base; if (M[i].item && M[i].at >= 0) timedMedia.push(M[i]); }
            timedMedia.sort(function (a, b) { return a.at - b.at; });
            var mediaSpans = [];                         // where media sits in the media layout nest: [{ at, end }]
            function fitInside(item) {                   // 100 for a 1920x1080 clip; smaller or larger ones are brought to that size
                try { var m = /VideoInfo>\s*(\d+)\s*x\s*(\d+)/.exec(item.getProjectMetadata()); if (m && +m[1] > 0 && +m[2] > 0) return Math.min(1920 / +m[1], 1080 / +m[2]) * 100; } catch (e) {}
                return 100;
            }

            // which track each person sits on (the layout says; otherwise left to right, bottom up)
            function trackOf(layout, k) { return layout && layout.people && layout.people[k] && layout.people[k].track ? layout.people[k].track - 1 : k; }
            function build(name, layout, emptyTrack) {      // a layout nest: everyone placed, frame on top
                var lp = layout.people || [], top = 0, k;
                if (lp.length !== P.length) { notes.push("\"" + name + "\" was not built: its layout is for " + lp.length + " people and there are " + P.length + "."); return null; }
                for (k = 0; k < P.length; k++) top = Math.max(top, trackOf(layout, k) + 1);
                var frameTrack = top + (emptyTrack ? 1 : 0);
                var s = newSequence(name, fps, nests, frameTrack + 1, Math.max(P.length, frameTrack + 1));
                made.push(s.name);
                for (k = 0; k < P.length; k++) setMotion(place(s, trackOf(layout, k), P[k].seq.projectItem, 0), lp[k]);
                if (emptyTrack && timedMedia.length) {
                    // The media goes in its window, each clip where it played. This nest then carries the media's sound
                    // only: the voices are already on the main sequence's own tracks, and would double up.
                    var win = layout.media || { pos: [0.6432, 0.5], scale: 65 }, lastEnd = 0;
                    for (k = 0; k < P.length; k++) dropAudio(s, trackOf(layout, k));
                    for (k = 0; k < timedMedia.length; k++) {
                        if (timedMedia[k].at < lastEnd - 0.0005) continue;         // overlaps the clip before it: left for the editor
                        try {
                            var mcl = place(s, top, timedMedia[k].item, timedMedia[k].at);
                            setMotion(mcl, { pos: win.pos, scale: Math.round(win.scale * fitInside(timedMedia[k].item)) / 100 });
                            lastEnd = mcl.end.seconds;
                            mediaSpans.push({ at: timedMedia[k].at, end: mcl.end.seconds });
                        } catch (eM) {}
                    }
                }
                // The layout's frame, by name. Projects differ in what the same frame is called, so the name is read
                // loosely (capitals, spaces, extension), and a layout can list other names it goes by.
                var frame = null, wanted = layout.frame ? [layout.frame].concat(layout.frameAlt || []) : [], usedAlt = false;
                for (k = 0; k < wanted.length && !frame; k++) { frame = itemByName(wanted[k]) || stillLike(wanted[k]); usedAlt = k > 0; }
                if (frame && usedAlt) notes.push("\"" + name + "\": this project has no \"" + layout.frame + "\", so \"" + frame.name + "\" was used as the frame.");
                if (layout.frame && !frame) notes.push("\"" + name + "\": the frame \"" + layout.frame + "\" is not in this project, so none was added. Import it and drop it on V" + (frameTrack + 1) + ".");
                if (frame) {
                    var fc = place(s, frameTrack, frame, 0);
                    try { fc.end = secs(longest); } catch (eEnd) { notes.push("\"" + name + "\": stretch the frame to the full length by hand."); }
                    // a frame picked from the project's own list is sized to fill the picture; the layout's own frame keeps its saved size
                    setMotion(fc, { scale: (layout.frameFit || usedAlt ? fitScale(frame) : null) || layout.frameScale || 100 });
                    dropAudio(s, frameTrack);
                }
                return s;
            }
            var wide = cfg.wide ? build(freeName("WS"), cfg.wide, false) : null;
            var mediaNest = cfg.mediaLayout ? build(freeName("WS MEDIA"), cfg.mediaLayout, true) : null;

            // 4. the main sequence: everyone stacked, the wide shot above them, the master recording on top
            var nV = P.length + (wide ? 1 : 0), vTracks = Math.max(7, nV + (masterItem ? 1 : 0) + 2), aTracks = Math.max(7, P.length + (masterItem ? 1 : 0));
            if (masterItem) { vTracks = Math.max(vTracks, 8); aTracks = Math.max(aTracks, 8); }      // the master sits on track 8, clear of the tracks used for editing
            var mainName = freeName(cfg.mainName || "MAIN SEQUENCE"), main = null;
            if (cfg.template && cfg.template.path && new File(cfg.template.path).exists) {
                try { main = fromTemplate(cfg.template, mainName, mainBin, vTracks, aTracks); } catch (eTpl) { main = null; }
                if (main) notes.push("The main sequence came from the mixer template (" + (cfg.template.from || "saved template") + "), so its voice tracks and Mix track have the usual effects.");
                else notes.push("The mixer template could not be brought in, so the main sequence was made plain: the Mix track has no limiter. Add it by hand, or save the template again on the Setup tab.");
            }
            if (!main) main = newSequence(mainName, fps, mainBin, vTracks, aTracks);
            made.push(main.name);
            for (i = 0; i < P.length; i++) place(main, trackOf(cfg.wide, i), P[i].seq.projectItem, 0);
            if (wide) {
                var wt = 0;
                for (i = 0; i < P.length; i++) wt = Math.max(wt, trackOf(cfg.wide, i) + 1);
                place(main, wt, wide.projectItem, 0);
                dropAudio(main, wt);                    // its sound is the same voices again
            }
            if (masterItem) {
                // The master's own clock runs from its first frame; the earliest person starts at `base` on it. It goes
                // on the top track, trimmed (or pushed later) so it lines up, and switched off. A sound-only master
                // has no picture to place, so it goes straight onto the audio track.
                var mt = main.videoTracks.numTracks - 1, at8 = Math.min(mt, main.audioTracks.numTracks - 1), aTrack = main.audioTracks[at8];
                var startAt = base >= 0 ? 0 : -base, mc = null, hadA = aTrack.clips.numItems, ip0 = null, op0 = null;
                try { mc = place(main, mt, masterItem, startAt); } catch (eNoPic) { mc = null; }
                if (!mc) {
                    try { ip0 = masterItem.getInPoint().seconds; op0 = masterItem.getOutPoint().seconds; masterItem.clearInPoint(); masterItem.clearOutPoint(); } catch (eMk) {}
                    aTrack.overwriteClip(masterItem, startAt);
                    if (aTrack.clips.numItems <= hadA) throw new Error("Premiere would not place the master recording \"" + masterItem.name + "\" in \"" + main.name + "\".");
                }
                var ac = aTrack.clips.numItems > hadA ? lastClip(aTrack) : null, ref = mc || ac;
                if (base > 0.0005) {
                    var len = ref.end.seconds - base;
                    if (len > 1) {
                        if (mc) { mc.inPoint = secs(base); mc.end = secs(len); }
                        if (ac) { ac.inPoint = secs(base); ac.end = secs(len); }
                    } else notes.push("The master recording is shorter than the sync point, so it was left untrimmed: check its position by hand.");
                }
                try { main.videoTracks[mt].setMute(1); } catch (eM) {}
                try { aTrack.setMute(1); } catch (eM2) {}
                notes.push("The master recording is on " + (mc ? "V" + (mt + 1) + " / " : "") + "A" + (at8 + 1) + ", switched off, as a reference to check sync against.");
            }

            // 4b. livestream media on the main sequence, on the track above the wide shot. With a media layout, the
            //     media-frame nest is shown for as long as each clip plays (the people beside the media); without one,
            //     the clips themselves go on, full screen.
            var placedMedia = 0, skipped = 0, mTrack = P.length + (wide ? 1 : 0), ends = [0, 0], topUsable = main.videoTracks.numTracks - (masterItem ? 1 : 0);
            for (i = 0; i < P.length; i++) mTrack = Math.max(mTrack, trackOf(cfg.wide, i) + 1 + (wide ? 1 : 0));
            if (mediaNest && mediaSpans.length && mTrack < topUsable) {
                var mAudio = main.audioTracks[Math.min(mTrack, main.audioTracks.numTracks - 1)];
                for (i = 0; i < mediaSpans.length; i++) {
                    try {
                        var hadA2 = mAudio.clips.numItems, nc = place(main, mTrack, mediaNest.projectItem, mediaSpans[i].at);
                        // the whole nest lands from its start: trim it to the stretch this clip covers, so the nest's
                        // own time still matches the main sequence's
                        var startsAt = nc.start.seconds;                  // where it actually landed (on a frame)
                        nc.inPoint = secs(startsAt); nc.end = secs(mediaSpans[i].end);
                        if (mAudio.clips.numItems > hadA2) { var na = lastClip(mAudio); na.inPoint = secs(na.start.seconds); na.end = secs(mediaSpans[i].end); }
                        placedMedia++;
                    } catch (eNest) { skipped++; }
                }
                skipped += timedMedia.length - mediaSpans.length;
                if (placedMedia) notes.push("\"" + mediaNest.name + "\" has the " + mediaSpans.length + " media clip" + (mediaSpans.length === 1 ? "" : "s") + " in its window, and is on V" + (mTrack + 1) + " of the main sequence for as long as each one plays.");
            } else {
                for (i = 0; i < timedMedia.length; i++) {
                    var mAt = timedMedia[i].at, lane = mAt >= ends[0] - 0.0005 ? 0 : (mAt >= ends[1] - 0.0005 ? 1 : -1);
                    if (lane < 0 || mTrack + lane >= topUsable) { skipped++; continue; }
                    try { var mcl2 = place(main, mTrack + lane, timedMedia[i].item, mAt); ends[lane] = mcl2.end.seconds; placedMedia++; } catch (eMedia) { skipped++; }
                }
                if (placedMedia) notes.push(placedMedia + " media clip" + (placedMedia === 1 ? "" : "s") + " placed full screen on V" + (mTrack + 1) + (ends[1] ? " and V" + (mTrack + 2) : "") + " of the main sequence, where " + (placedMedia === 1 ? "it" : "they") + " played in the stream. Choose a media layout to have them in the media frame instead.");
            }
            if (skipped) notes.push(skipped + " media clip" + (skipped === 1 ? " was" : "s were") + " imported but not placed (it overlaps another, or there was no room): place by hand.");

            // 5. the voice tracks' effects, on any voice track the template did not already cover
            if (cfg.mixer && cfg.mixer.tracks && cfg.mixer.tracks.length) applyMixer(main, cfg.mixer, 1, P.length, notes, true);

            app.project.openSequence(main.sequenceID);
            return "OK|" + str({ made: made, main: main.name, notes: notes });
        } catch (err) {
            // leave nothing half-built behind: take back the sequences this run made, so it can simply be run again
            var undone = 0;
            try { var S2 = app.project.sequences; for (var d = S2.numSequences - 1; d >= 0; d--) for (var m = 0; m < made.length; m++) if (S2[d].name === made[m]) { if (app.project.deleteSequence(S2[d])) undone++; break; } } catch (eUndo) {}
            return "ERR|" + String(err).replace(/^Error: /, "") + (err.line && !/would not place|not found|already has/.test(String(err)) ? " (line " + err.line + ")" : "") + (made.length ? (undone === made.length ? " Nothing was left half-built." : " Some of what it made is still in the project: " + made.join(", ") + ".") : "");
        }
    };

    // Removes what a run made (sequences by name), for trying again. Imported footage stays.
    $.bulwark.setupUndo = function (namesJson) {
        try {
            var names = parse(namesJson), S = app.project.sequences, n = 0;
            for (var i = S.numSequences - 1; i >= 0; i--) for (var k = 0; k < names.length; k++) if (S[i].name === names[k]) { if (app.project.deleteSequence(S[i])) n++; break; }
            return "OK|" + n;
        } catch (err) { return "ERR|" + String(err); }
    };
})();
