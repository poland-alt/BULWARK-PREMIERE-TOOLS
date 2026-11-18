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
        if (tr.clips.numItems <= n) throw new Error("Premiere would not place \"" + item.name + "\" in \"" + seq.name + "\".");
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
            var people = [], frame = null, t, S = app.project.sequences;
            function isSeq(item) { if (!item) return false; for (var i = 0; i < S.numSequences; i++) if (S[i].projectItem && S[i].projectItem.nodeId === item.nodeId) return true; return false; }
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var tr = seq.videoTracks[t];
                if (!tr.clips.numItems) continue;
                var cl = tr.clips[0];
                if (isSeq(cl.projectItem)) { var m = readMotion(cl); m.track = t + 1; m.was = String(cl.name); people.push(m); }
                else if (/\.(png|psd|tiff?|jpe?g)$/i.test(String(cl.name))) { frame = { name: String(cl.name), scale: readMotion(cl).scale, track: t + 1 }; }
            }
            if (people.length < 1) return "ERR|\"" + seq.name + "\" has no nested cameras on its tracks. Open the wide shot sequence (for example \"WS\").";
            people.sort(function (a, b) { return (a.pos[0] - b.pos[0]) || (a.pos[1] - b.pos[1]); });
            return "OK|" + str({ from: seq.name, people: people, frame: frame ? frame.name : "", frameScale: frame ? frame.scale : 100 });
        } catch (err) { return "ERR|" + String(err); }
    };

    // ---- the setup itself ----
    // cfg (JSON file): { fps, mainName, bins: { main, nests, footage, media }, people: [{ name, path, offset }] left to
    //   right, master: { path, offset } | null, media: [path], wide: layout | null, mediaLayout: layout | null,
    //   mixer: saved mixer | null }
    // A person's offset is where their recording starts on the shared clock, in seconds (0 for raw video).
    $.bulwark.setupRun = function (cfgPath) {
        var notes = [], made = [];
        try {
            if (!app.project) return "ERR|Open a project first.";
            var cfg = parse(readFile(cfgPath)), i, P = cfg.people || [];
            if (!P.length) return "ERR|Add at least one person's video.";
            for (i = 0; i < P.length; i++) {
                if (!new File(P[i].path).exists) return "ERR|File not found: " + P[i].path;
                if (seqNamed(P[i].name)) return "ERR|This project already has a sequence named \"" + P[i].name + "\". Rename that person here, or the sequence, and run it again.";
            }
            var bins = cfg.bins || {}, footage = binPath(bins.footage || "01-media"), nests = binPath(bins.nests || "NESTS"), mainBin = binPath(bins.main || "*SEQUENCES");
            var fps = cfg.fps || "23.976";

            // 1. bring the files in (one already in the project is used as it is)
            var need = [], all = [];
            for (i = 0; i < P.length; i++) all.push(P[i].path);
            if (cfg.master) all.push(cfg.master.path);
            for (i = 0; i < all.length; i++) if (!itemByPath(all[i])) need.push(all[i]);
            if (need.length) app.project.importFiles(need, true, footage, false);
            var mediaNeed = [];
            for (i = 0; i < (cfg.media || []).length; i++) if (!itemByPath(cfg.media[i])) mediaNeed.push(cfg.media[i]);
            if (mediaNeed.length) app.project.importFiles(mediaNeed, true, binPath(bins.media || "01-media/MEDIA"), false);
            for (i = 0; i < P.length; i++) { P[i].item = itemByPath(P[i].path); if (!P[i].item) return "ERR|Premiere could not import " + P[i].path; }
            var masterItem = cfg.master ? itemByPath(cfg.master.path) : null;
            if (cfg.master && !masterItem) return "ERR|Premiere could not import " + cfg.master.path;

            // 2. the shared clock starts where the earliest person's recording starts
            var base = null;
            for (i = 0; i < P.length; i++) { P[i].offset = +P[i].offset || 0; if (base === null || P[i].offset < base) base = P[i].offset; }

            // 3. a nest per person
            var longest = 0;
            for (i = 0; i < P.length; i++) {
                var ps = newSequence(P[i].name, fps, nests, 1, 1);
                made.push(ps.name);
                var at = P[i].offset - base, vc = place(ps, 0, P[i].item, at);
                P[i].seq = ps;
                if (vc.end.seconds > longest) longest = vc.end.seconds;
                if (at > 0.0005) notes.push(P[i].name + " starts " + at.toFixed(2) + "s in, to line up with the others.");
            }

            // which track each person sits on (the layout says; otherwise left to right, bottom up)
            function trackOf(layout, k) { return layout && layout.people && layout.people[k] && layout.people[k].track ? layout.people[k].track - 1 : k; }
            function build(name, layout, emptyTrack) {      // a layout nest: everyone placed, frame on top
                var lp = layout.people || [], top = 0, k;
                if (lp.length !== P.length) { notes.push("\"" + name + "\" was not built: its layout is for " + lp.length + " people and there are " + P.length + "."); return null; }
                for (k = 0; k < P.length; k++) top = Math.max(top, trackOf(layout, k) + 1);
                var frameTrack = top + (emptyTrack ? 1 : 0);
                var s = newSequence(name, fps, nests, frameTrack + 1, P.length);
                made.push(s.name);
                for (k = 0; k < P.length; k++) setMotion(place(s, trackOf(layout, k), P[k].seq.projectItem, 0), lp[k]);
                var frame = layout.frame ? itemByName(layout.frame) : null;
                if (layout.frame && !frame) notes.push("\"" + name + "\": the frame \"" + layout.frame + "\" is not in this project, so none was added. Import it and drop it on V" + (frameTrack + 1) + ".");
                if (frame) {
                    var fc = place(s, frameTrack, frame, 0);
                    try { fc.end = secs(longest); } catch (eEnd) { notes.push("\"" + name + "\": stretch the frame to the full length by hand."); }
                    setMotion(fc, { scale: layout.frameScale || 100 });
                    dropAudio(s, frameTrack);
                }
                return s;
            }
            var wide = cfg.wide ? build(freeName("WS"), cfg.wide, false) : null;
            if (cfg.mediaLayout) build(freeName("WS MEDIA"), cfg.mediaLayout, true);

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
                var mt = main.videoTracks.numTracks - 1, mc;
                // the master's own clock runs from its first frame; person k starts at P[k].offset on it
                if (base >= 0) {
                    mc = place(main, mt, masterItem, 0);
                    var a = main.audioTracks[Math.min(mt, main.audioTracks.numTracks - 1)], ac = lastClip(a);
                    var len = mc.end.seconds - base;
                    if (base > 0.0005 && len > 1) {
                        mc.inPoint = secs(base); mc.end = secs(len);
                        if (ac) { ac.inPoint = secs(base); ac.end = secs(len); }
                    } else if (base > 0.0005) notes.push("The master recording is shorter than the sync point, so it was left untrimmed: check its position by hand.");
                } else mc = place(main, mt, masterItem, -base);
                try { main.videoTracks[mt].setMute(1); } catch (eM) {}
                try { main.audioTracks[Math.min(mt, main.audioTracks.numTracks - 1)].setMute(1); } catch (eM2) {}
                notes.push("The master recording is on V" + (mt + 1) + ", switched off, as a reference to check sync against.");
            }

            // 5. the voice tracks' effects, on any voice track the template did not already cover
            if (cfg.mixer && cfg.mixer.tracks && cfg.mixer.tracks.length) applyMixer(main, cfg.mixer, 1, P.length, notes, true);

            app.project.openSequence(main.sequenceID);
            return "OK|" + str({ made: made, main: main.name, notes: notes });
        } catch (err) {
            return "ERR|" + String(err) + (err.line ? " (line " + err.line + ")" : "") + (made.length ? " Already made: " + made.join(", ") + "." : "");
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
