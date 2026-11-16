// Bulwark Vertical Reformat - "Reformat to 9x16".
// Copies the active 16x9 sequence into a 1080x1920 sequence and applies the Bulwark vertical layout.
// The original sequence is never changed. Runs inside Premiere Pro (ExtendScript, ES3).
$.bulwark = $.bulwark || {};

// House values, measured from the finished TNL vertical sequences and the 9x16 frame PNGs.
$.bulwark.vert = {
    width: 1080,
    height: 1920,
    speakerPos: [0.5, 0.26],          // camera in the top window of the 2-up frame (scale left as it was)
    backgroundPos: [0.5, 0.78],       // "Background - Light" behind the media in the bottom window
    mediaPos: [0.5, 0.754],           // centre of the bottom window (y 977-1919)
    mediaMaxW: 994,                   // media is fitted inside this box in the bottom window
    mediaMaxH: 800,
    mediaFallbackFactor: 0.6,         // used only when Premiere will not report the media's pixel size
    // stacked layouts: centre of each window as a fraction of 1920, and the picture height that just covers a window
    rows3: [0.1604, 0.4974, 0.8370],  // 3-UP and PIP frames (windows ~0-608 / 640-1263 / 1296-1919)
    rowH3: 648,
    stackScale3: 66,                  // % scale of a 1080-high camera in a 3-row stack (cropped back to the row)
    rows2: [0.2458, 0.7542],          // 2-up frame (windows 0-944 / 977-1919)
    rowH2: 950,
    midMediaMaxW: 1000,               // media in the middle window of the 3-UP / PIP frame
    midMediaMaxH: 540,
    pipX: [0.2528, 0.7676],           // bottom-left and bottom-right windows of the PIP frame
    pipEdge: [561, 564],              // x (px) where the bottom-left window ends and the bottom-right window starts
    pipCrop: [25, 27],                // % cropped off the inner edge of the bottom-left / bottom-right camera
    faceSamples: 5,                   // frames looked at per camera when centring people on their faces
    blurAmount: 20,                   // Gaussian Blur on the copy that fills the frame behind a full-screen image
    blurEdge: 0,                      // Gaussian Blur "Edge Behavior": 0 keeps the blurred copy solid to its edges (1, the default, fades out)
    framesBin: "9x16 Frames",
    endCards169Bin: "16x9 END CARDS",
    endCards916Bin: "9x16 SOCIAL END CARDS",
    // show bin -> start of its 9x16 end card name (letters only), where the names don't line up on their own
    showEndCards: { "9x16 Reciepts": "RECEIPTS", "9x16 TNL": "NEXTLEVEL" },
    removeNames: /^(logo overlay|16x9 watermark)/i,
    backgroundNames: /background/i,
    stillExt: /\.(png|jpe?g|tiff?|psd|gif|webp|bmp|heic)$/i
};

(function () {
    var CFG = $.bulwark.vert;
    var EPS = 0.02; // seconds

    function findBin(parent, name) {
        if (!parent || !parent.children) return null;
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c.type === ProjectItemType.BIN) {
                if (c.name === name) return c;
                var hit = findBin(c, name);
                if (hit) return hit;
            }
        }
        return null;
    }
    // Like findBin, but ignores case and a trailing "S" ("9x16 SOCIAL END CARD" or "...END CARDS").
    function findBinLike(parent, name) {
        var want = String(name).toUpperCase().replace(/S$/, "");
        if (!parent || !parent.children) return null;
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c.type === ProjectItemType.BIN) {
                if (String(c.name).toUpperCase().replace(/\s+$/, "").replace(/S$/, "") === want) return c;
                var hit = findBinLike(c, name);
                if (hit) return hit;
            }
        }
        return null;
    }
    function firstItemStarting(bin, prefix) {   // searches sub-bins too
        for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i];
            if (c.type === ProjectItemType.BIN) { var hit = firstItemStarting(c, prefix); if (hit) return hit; }
            else if (String(c.name).toUpperCase().indexOf(prefix) === 0) return c;
        }
        return null;
    }
    function isIn(bin, item) {
        if (!bin || !item) return false;
        for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i];
            if (c.type === ProjectItemType.BIN ? isIn(c, item) : c.nodeId === item.nodeId) return true;
        }
        return false;
    }
    function childMatching(bin, re) {
        if (!bin) return null;
        for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i];
            if (c.type !== ProjectItemType.BIN && re.test(c.name)) return c;
        }
        return null;
    }
    function seqFor(item) {
        if (!item) return null;
        var isSeq = false;
        try { isSeq = item.isSequence(); } catch (e) {}
        if (!isSeq) return null;
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (s.projectItem && s.projectItem.nodeId === item.nodeId) return s;
        }
        return null;
    }
    function pixelSize(item) {
        var s = seqFor(item);
        if (s) return [s.frameSizeHorizontal, s.frameSizeVertical];
        try {
            var m = /VideoInfo>\s*(\d+)\s*x\s*(\d+)/.exec(item.getProjectMetadata());
            if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
        } catch (e) {}
        return null;
    }
    function populatedTracks(seq) {
        var n = 0;
        for (var t = 0; t < seq.videoTracks.numTracks; t++) if (seq.videoTracks[t].clips.numItems) n++;
        return n;
    }
    function motion(clip) {
        try {
            for (var i = 0; i < clip.components.numItems; i++) {
                var c = clip.components[i];
                if (c.matchName === "AE.ADBE Motion" || c.displayName === "Motion") return c;
            }
        } catch (e) {}
        return null;
    }
    function prop(comp, name) {
        if (!comp) return null;
        for (var i = 0; i < comp.properties.numItems; i++) if (comp.properties[i].displayName === name) return comp.properties[i];
        return null;
    }
    function getScale(clip) { var p = prop(motion(clip), "Scale"); return p ? Number(p.getValue()) : 100; }
    function setScale(clip, v) { var p = prop(motion(clip), "Scale"); if (p) p.setValue(v, true); }
    function setPos(clip, xy) { var p = prop(motion(clip), "Position"); if (p) p.setValue([xy[0], xy[1]], true); }
    function setCrop(clip, l, t, r, b) {   // Motion's built-in crop, in percent
        var m = motion(clip), names = ["Crop Left", "Crop Top", "Crop Right", "Crop Bottom"], vals = [l, t, r, b];
        var hasMotionCrop = !!prop(m, names[0]);
        for (var i = 0; i < 4; i++) { var p = prop(m, names[i]); if (p) p.setValue(vals[i], true); }
        // A separate Crop effect (e.g. "Crop (Legacy)") from the 16x9 edit would stack on top of Motion's crop,
        // so clear it; if this Premiere has no crop in Motion, put the values there instead.
        var sides = ["Left", "Top", "Right", "Bottom"];
        try {
            for (var k = 0; k < clip.components.numItems; k++) {
                var c = clip.components[k];
                if (c === m || !(/crop/i.test(c.displayName) || /crop/i.test(c.matchName))) continue;
                for (var j = 0; j < 4; j++) { var q = prop(c, sides[j]); if (q) q.setValue(hasMotionCrop ? 0 : vals[j], true); }
            }
        } catch (e) {}
    }
    function time(sec) { var t = new Time(); t.seconds = sec; return t; }
    function tc(sec) {
        var m = Math.floor(sec / 60), s = Math.floor(sec - m * 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }
    function isGraphic(clip) {
        var mgt = null;
        try { mgt = clip.getMGTComponent(); } catch (e) {}
        return !!mgt || !clip.projectItem;
    }

    // A camera inside a wide nest: a video file, or a horizontal nested sequence (camera nest / multicam).
    // Graphics, stills and vertical nests are not cameras.
    function isCameraClip(clip) {
        if (isGraphic(clip) || CFG.stillExt.test(String(clip.name))) return false;
        var s = seqFor(clip.projectItem);
        return !s || s.frameSizeHorizontal >= s.frameSizeVertical;
    }

    function newSequenceFromClone(src, name) {
        var before = {}, i;
        for (i = 0; i < app.project.sequences.numSequences; i++) before[app.project.sequences[i].sequenceID] = true;
        src.clone();
        for (i = 0; i < app.project.sequences.numSequences; i++) {
            var s = app.project.sequences[i];
            if (!before[s.sequenceID]) {
                s.name = name;
                var st = s.getSettings();
                st.videoFrameWidth = CFG.width; st.videoFrameHeight = CFG.height;
                s.setSettings(st);
                return s;
            }
        }
        return null;
    }
    function seqNamed(name) {
        for (var i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].name === name) return app.project.sequences[i];
        return null;
    }
    function audioKeys(seq) {
        var m = {};
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            for (var b = 0; b < at.clips.numItems; b++) m[a + "/" + at.clips[b].start.ticks + "/" + at.clips[b].name] = true;
        }
        return m;
    }
    function removeNewAudio(seq, had) {
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var at = seq.audioTracks[a];
            for (var b = at.clips.numItems - 1; b >= 0; b--) {
                var ac = at.clips[b];
                if (!had[a + "/" + ac.start.ticks + "/" + ac.name]) ac.remove(false, false);
            }
        }
    }
    function firstFreeTrack(seq, from, s, e) {
        for (var x = from; x < seq.videoTracks.numTracks; x++) {
            var cl = seq.videoTracks[x].clips, busy = false;
            for (var y = 0; y < cl.numItems; y++) if (cl[y].start.seconds < e - EPS && cl[y].end.seconds > s + EPS) { busy = true; break; }
            if (!busy) return x;
        }
        try {
            app.project.openSequence(seq.sequenceID);
            app.enableQE();
            var n0 = seq.videoTracks.numTracks;
            qe.project.getActiveSequence().addTracks(1, n0, 0, 0, 0, 0, 0);
            if (seq.videoTracks.numTracks > n0) return n0;
        } catch (e2) {}
        return -1;
    }
    function placeStill(seq, item, trackIdx, s, e) {
        var ft = seq.videoTracks[trackIdx];
        ft.overwriteClip(item, time(s));
        for (var c = 0; c < ft.clips.numItems; c++) {
            if (Math.abs(ft.clips[c].start.seconds - s) < EPS) { ft.clips[c].end = time(e); return ft.clips[c]; }
        }
        return null;
    }
    function overlaps(cl, s, e) { return cl.start.seconds < e - EPS && cl.end.seconds > s + EPS; }
    function trackFree(seq, idx, s, e) {
        var cl = seq.videoTracks[idx].clips;
        for (var y = 0; y < cl.numItems; y++) if (overlaps(cl[y], s, e)) return false;
        return true;
    }
    // A video track at index idx that is empty between s and e: the one already there, or a new one inserted at idx
    // (tracks above move up one, so titles and captions stay on top).
    function openTrackAt(seq, idx, s, e) {
        if (idx < seq.videoTracks.numTracks && trackFree(seq, idx, s, e)) return true;
        try {
            var n0 = seq.videoTracks.numTracks;
            app.enableQE();
            qe.project.getActiveSequence().addTracks(1, Math.min(idx, n0), 0, 0, 0, 0, 0);
            return seq.videoTracks.numTracks > n0 && trackFree(seq, idx, s, e);
        } catch (e1) {}
        return false;
    }
    function addBlur(seq, trackIdx, clip) {
        try {
            app.enableQE();
            var qt = qe.project.getActiveSequence().getVideoTrackAt(trackIdx), fx = qe.project.getVideoEffectByName("Gaussian Blur");
            if (!fx) return false;
            for (var k = 0; k < qt.numItems; k++) {
                var it = qt.getItemAt(k);
                if (it.type === "Clip" && Math.abs(it.start.secs - clip.start.seconds) < EPS) { it.addVideoEffect(fx); break; }
            }
            for (var a = 0; a < clip.components.numItems; a++) {
                var cp = clip.components[a];
                if (cp.matchName !== "AE.Impact_Blur_FX" && !/gaussian blur/i.test(String(cp.displayName))) continue;
                var amt = prop(cp, "Amount") || prop(cp, "Blurriness");
                if (amt) amt.setValue(CFG.blurAmount, true);
                // without this the blur fades to see-through at the picture's edges and the cameras show through
                var edge = prop(cp, "Edge Behavior"), rep = prop(cp, "Repeat Edge Pixels");
                if (edge) edge.setValue(CFG.blurEdge, true); else if (rep) rep.setValue(true, true);
                return true;
            }
        } catch (e) {}
        return false;
    }
    // Full-screen image: a sharp copy fitted to the frame over a blurred copy that fills it, both placed above
    // everything else on screen (below titles/captions). The original clip is switched off, not deleted.
    // o: { track, s, e, name }. seq must be the sequence open in the timeline. Returns true when both copies are in.
    function blurBehind(seq, o, review) {
        var orig = null, cl = seq.videoTracks[o.track].clips, i, t, where = tc(o.s) + "  " + o.name + ": ";
        for (i = 0; i < cl.numItems; i++) if (Math.abs(cl[i].start.seconds - o.s) < EPS) orig = cl[i];
        if (!orig || !orig.projectItem) return false;
        var item = orig.projectItem, size = pixelSize(item);
        if (seqFor(item) || !CFG.stillExt.test(o.name)) { review.push(where + "not a still image, so no blurred background was made (images only for now)."); return false; }
        if (!size) { review.push(where + "could not read its size, so no blurred background was made."); return false; }
        var top = o.track;
        for (t = o.track + 1; t < seq.videoTracks.numTracks; t++) {
            var tcl = seq.videoTracks[t].clips;
            for (i = 0; i < tcl.numItems; i++) if (overlaps(tcl[i], o.s, o.e) && !isGraphic(tcl[i])) { top = t; break; }
        }
        if (!openTrackAt(seq, top + 1, o.s, o.e) || !openTrackAt(seq, top + 2, o.s, o.e)) { review.push(where + "no room for the blurred background; add two empty video tracks above it and try again."); return false; }
        var W = seq.frameSizeHorizontal, H = seq.frameSizeVertical;
        var back = placeStill(seq, item, top + 1, o.s, o.e), front = placeStill(seq, item, top + 2, o.s, o.e);
        if (!back || !front) { review.push(where + "could not place the copies for the blurred background."); return false; }
        setScale(back, Math.max(W / size[0], H / size[1]) * 100);
        setScale(front, Math.min(W / size[0], H / size[1]) * 100);
        orig.disabled = true;
        if (!addBlur(seq, top + 1, back)) review.push(where + "the background copy is in place on V" + (top + 2) + " but Premiere would not add Gaussian Blur; drop it on by hand.");
        return true;
    }
    function hasBlur(clip) {
        try { for (var a = 0; a < clip.components.numItems; a++) if (clip.components[a].matchName === "AE.Impact_Blur_FX" || /gaussian blur/i.test(String(clip.components[a].displayName))) return true; } catch (e) {}
        return false;
    }
    // Undo of blurBehind for the image at o: removes the blurred copy and the sharp copy above it and switches the
    // original back on. Returns false when the image has no blurred copy (so it is not full screen yet).
    function unblur(seq, o) {
        var set = [], t, i, blurAt = -1;
        for (t = 0; t < seq.videoTracks.numTracks; t++) {
            var cl = seq.videoTracks[t].clips;
            for (i = 0; i < cl.numItems; i++) {
                if (Math.abs(cl[i].start.seconds - o.s) < EPS && Math.abs(cl[i].end.seconds - o.e) < EPS && cl[i].projectItem && cl[i].projectItem.nodeId === o.nodeId) {
                    set.push(cl[i]);
                    if (blurAt < 0 && hasBlur(cl[i])) blurAt = set.length - 1;
                }
            }
        }
        if (blurAt < 0) return false;
        if (blurAt > 0) set[blurAt - 1].disabled = false;
        if (blurAt + 1 < set.length) set[blurAt + 1].remove(false, false);
        set[blurAt].remove(false, false);
        return true;
    }
    // The vertical layer someone already built inside a wide nest (a 1080x1920 sequence on one of its tracks).
    function verticalLayerIn(wide) {
        for (var t = wide.videoTracks.numTracks - 1; t >= 0; t--) {
            for (var c = 0; c < wide.videoTracks[t].clips.numItems; c++) {
                var cl = wide.videoTracks[t].clips[c], inner = seqFor(cl.projectItem);
                if (inner && inner.frameSizeVertical > inner.frameSizeHorizontal) return { seq: inner, offset: cl.inPoint.seconds - cl.start.seconds };
            }
        }
        return null;
    }
    // Is this timeline clip a multicam clip (it shows one angle of its nest, not all the tracks)? seq must be the open sequence.
    function multicamOn(seq, trackIdx, clip) {
        try {
            app.enableQE();
            var qt = qe.project.getActiveSequence().getVideoTrackAt(trackIdx);
            for (var k = 0; k < qt.numItems; k++) {
                var it = qt.getItemAt(k);
                if (it.type !== "Empty" && Math.abs(it.start.secs - clip.start.seconds) < EPS) return it.multicamEnabled === true;
            }
        } catch (e) {}
        return false;
    }
    // What a clip shows of the frame it sits in: its box in pixels (after Motion crops, clipped to the frame),
    // and u = where the middle of that box falls across the clip's own picture (0.5 = its centre).
    function visRect(cl, W, H) {
        var sz = pixelSize(cl.projectItem) || [1920, 1080], m = motion(cl), k = getScale(cl) / 100, pos = [0.5, 0.5];
        try { pos = prop(m, "Position").getValue(); } catch (e) {}
        function crop(n) { var q = prop(m, n), v = 0; try { v = q ? Number(q.getValue()) : 0; } catch (e1) {} return v / 100; }
        var w = sz[0] * k, h = sz[1] * k, left = pos[0] * W - w / 2, top = pos[1] * H - h / 2;
        var x0 = Math.max(0, left + crop("Crop Left") * w), x1 = Math.min(W, left + w - crop("Crop Right") * w);
        var y0 = Math.max(0, top + crop("Crop Top") * h), y1 = Math.min(H, top + h - crop("Crop Bottom") * h);
        return { x: pos[0], y: pos[1], area: Math.max(0, x1 - x0) * Math.max(0, y1 - y0), u: w > 0 ? ((x0 + x1) / 2 - left) / w : 0.5 };
    }
    // Sorts what is inside a wide nest: the people (one per camera track), the media (if the nest has media in it,
    // as in a "react" frame: people small, media big), and everything else (frames, dividers, switched-off clips).
    // W, H: the frame the layout was made for (a vertical copy of a 16x9 nest is still measured as 16x9).
    function nestParts(seq, W, H) {
        W = W || seq.frameSizeHorizontal; H = H || seq.frameSizeVertical;
        var cams = [], stills = [], junk = [], end = 0, t, c, i;
        for (t = 0; t < seq.videoTracks.numTracks; t++) {
            var tr = seq.videoTracks[t], first = null;
            for (c = 0; c < tr.clips.numItems; c++) {
                var cl = tr.clips[c];
                if (cl.disabled) { junk.push(cl); continue; }
                if (!isCameraClip(cl)) {
                    if (!isGraphic(cl) && CFG.stillExt.test(String(cl.name)) && !/frame|background|logo|divider|watermark|overlay/i.test(String(cl.name))) stills.push({ track: t, clip: cl });
                    else junk.push(cl);
                    continue;
                }
                if (!first) first = cl;
                end = Math.max(end, cl.end.seconds);
            }
            if (first) { var v = visRect(first, W, H); cams.push({ track: t, x: v.x, y: v.y, area: v.area, u: v.u, name: String(first.name), item: first.projectItem }); }
        }
        var media = null;
        for (i = 0; i < cams.length && !media; i++) if (isMediaName(cams[i].name)) media = cams[i];
        if (!media && cams.length > 2) {
            // no telling name: media is the picture that is clearly bigger than every camera
            var bySize = cams.slice(0).sort(function (p, q) { return q.area - p.area; });
            if (bySize[0].area > bySize[1].area * 1.4) media = bySize[0];
        }
        if (media) { var ppl = []; for (i = 0; i < cams.length; i++) if (cams[i] !== media) ppl.push(cams[i]); cams = ppl; }
        // an image that covers part of the frame (not a full-frame overlay) is media too
        for (i = 0; i < stills.length; i++) {
            var sv = visRect(stills[i].clip, W, H), part = sv.area / (W * H);
            if (!media && cams.length && part > 0.04 && part < 0.8) { media = { track: stills[i].track, still: true, name: String(stills[i].clip.name) }; end = Math.max(end, stills[i].clip.end.seconds); }
            else junk.push(stills[i].clip);
        }
        return { cams: cams, media: media, junk: junk, end: end };
    }
    function isMediaName(n) { return /media|screen ?share/i.test(String(n)); }
    function shortName(n) { return String(n).replace(/\.[A-Za-z0-9]+$/, "").replace(/[-_ ]+[0-9a-f]{6,}[-_0-9a-zA-Z ]*$/, ""); }

    // Builds "<wide> VERT": a 1080x1920 copy of the wide nest with its cameras stacked inside the show's frame.
    // order: "auto" (every camera; left to right in the 16x9 becomes top to bottom) or track numbers top to bottom,
    // e.g. "3,1,2". Only the cameras named are stacked, so "3,1" on a three-camera wide makes a two-person 2-up.
    // A nest with media in it becomes: 2 people + media -> 3-UP with the media in the middle; 1 person + media -> 2-up.
    function buildVerticalNest(wide, showBin, review, order) {
        var nestName = wide.name + " VERT", nn = 2;
        while (seqNamed(nestName)) nestName = wide.name + " VERT " + (nn++);
        var nest = newSequenceFromClone(wide, nestName);
        if (!nest) return null;
        var wideW = wide.frameSizeHorizontal, wideH = wide.frameSizeVertical;
        // Measure the layout on the 16x9 original (Premiere shifts Position values when the copy's frame size changes),
        // then pair each clip of the copy with its original: same track, same place in the track.
        var parts = nestParts(wide), cams = parts.cams, media = parts.media, junk = [], keep = {}, t, c, j, end = parts.end;
        for (t = 0; t < nest.videoTracks.numTracks; t++) {
            var role = media && media.track === t ? "media" : "";
            for (j = 0; j < cams.length; j++) if (cams[j].track === t) role = "cam";
            var nc = nest.videoTracks[t].clips, oc = t < wide.videoTracks.numTracks ? wide.videoTracks[t].clips : null;
            for (c = 0; c < nc.numItems; c++) {
                var orig = oc && c < oc.numItems ? oc[c] : null, ok = false;
                if (role && orig && !orig.disabled) ok = (role === "media" && media.still) ? CFG.stillExt.test(String(orig.name)) : isCameraClip(orig);
                if (!ok) { junk.push(nc[c]); continue; }
                if (!keep[t]) keep[t] = [];
                keep[t].push({ clip: nc[c], at: nc[c].start.seconds, v: visRect(orig, wideW, wideH), k16: getScale(orig) / 100 });
            }
        }
        if (media && cams.length > 2) {
            review.push("\"" + wide.name + "\" has " + cams.length + " people and media in it; the media was left out of \"" + nest.name + "\". Add it by hand.");
            for (c = 0; keep[media.track] && c < keep[media.track].length; c++) junk.push(keep[media.track][c].clip);
            media = null;
        }
        for (c = junk.length - 1; c >= 0; c--) { try { junk[c].remove(false, false); } catch (e1) {} }
        // clip handles can go stale once others on the track are removed: find each kept clip again by its start time
        for (var kt in keep) {
            var live = nest.videoTracks[parseInt(kt, 10)].clips;
            for (c = 0; c < keep[kt].length; c++) for (j = 0; j < live.numItems; j++) if (Math.abs(live[j].start.seconds - keep[kt][c].at) < EPS) keep[kt][c].clip = live[j];
        }
        for (t = 0; t < nest.audioTracks.numTracks; t++) {
            var at = nest.audioTracks[t];
            for (c = at.clips.numItems - 1; c >= 0; c--) at.clips[c].remove(false, false);
        }
        if (cams.length === 0 || (cams.length < 2 && !media)) {
            if (cams.length === 0) {
                // nothing usable inside: don't put an empty nest on the timeline, keep the centre-cropped wide instead
                review.push("\"" + wide.name + "\" has no camera clips inside it, so no vertical wide was built; the wide shots stay a centre crop.");
                try { app.project.deleteSequence(nest); } catch (eDel) {}
                return null;
            }
            review.push("\"" + wide.name + "\" has 1 camera track; a stacked vertical needs 2 or 3, so \"" + nest.name + "\" was left unarranged.");
            return { seq: nest, offset: 0 };
        }
        var want = /^\d+(,\d+)*$/.test(String(order)) ? String(order).split(",") : null;
        if (want) {
            var picked = [], w;
            for (w = 0; w < want.length; w++) {
                for (j = 0; j < cams.length; j++) if (cams[j].track === parseInt(want[w], 10) - 1 && !cams[j].used) { cams[j].used = true; picked.push(cams[j]); }
            }
            if (picked.length < (media ? 1 : 2)) want = null;   // the order names tracks this wide does not have: stack everyone
        }
        var nCols = cams.length;                  // people side by side in the 16x9 wide
        // the framing maths below needs each camera's column in the 16x9 wide, which is its left-to-right rank
        var byX = cams.slice(0).sort(function (a, b) { return a.x - b.x; });
        for (j = 0; j < byX.length; j++) byX[j].col = j;
        if (want) {
            // cameras left out of the order are not in this vertical wide at all
            for (j = 0; j < cams.length; j++) if (!cams[j].used) {
                var dk = keep[cams[j].track] || [];
                for (c = 0; c < dk.length; c++) { try { dk[c].clip.remove(false, false); } catch (eRm) {} }
            }
            cams = picked;
        } else {
            // left to right in 16x9 becomes top to bottom; people already one above the other keep that order
            var stackedAlready = byX.length > 1 && byX[byX.length - 1].x - byX[0].x < 0.08;
            cams.sort(function (a, b) { return stackedAlready ? a.y - b.y : a.x - b.x; });
        }
        if (cams.length > 3) { review.push("\"" + wide.name + "\" has " + cams.length + " camera tracks; only the first three were stacked."); cams.length = 3; }
        if (media && cams.length > 2) cams.length = 2;
        // rows: 3 people, or 2 people around the media -> 3-UP frame; 2 people, or 1 person over the media -> 2-up frame
        var n = cams.length, three = media ? n === 2 : n !== 2, rowH = three ? CFG.rowH3 : CFG.rowH2, top = 0;
        var rows = media ? (three ? [CFG.rows3[0], CFG.rows3[2]] : [CFG.rows2[0]]) : (three ? CFG.rows3 : CFG.rows2);
        for (var k = 0; k < n; k++) {
            var trk = keep[cams[k].track] || [];
            top = Math.max(top, cams[k].track);
            for (c = 0; c < trk.length; c++) {
                var cl2 = trk[c].clip, sz = pixelSize(cl2.projectItem) || [1920, 1080];
                var px = trk[c].v.x, old16 = trk[c].k16;
                var sc = Math.max(rowH / sz[1], three ? CFG.stackScale3 / 100 * 1080 / sz[1] : 0);
                // where this person sits in the camera's own frame (0.5 = centre): in a nest with media each camera is a
                // small window, so it is the middle of what shows; in a plain wide it is the middle of the person's column
                var u = media ? trk[c].v.u : 0.5 + ((cams[k].col + 0.5) / nCols * wideW - px * wideW) / (sz[0] * old16);
                var slack = Math.max(0, (sz[0] * sc - CFG.width) / 2 / CFG.width);
                var nx = 0.5 - (u - 0.5) * sz[0] * sc / CFG.width;
                nx = Math.max(0.5 - slack, Math.min(0.5 + slack, nx));
                var cropTB = Math.max(0, (sz[1] * sc - rowH) / 2 / (sz[1] * sc) * 100);
                setScale(cl2, sc * 100);
                setPos(cl2, [nx, rows[k]]);
                setCrop(cl2, 0, cropTB, 0, cropTB);
            }
        }
        if (media) {
            var mtr = keep[media.track] || [], shortfall = false;
            top = Math.max(top, media.track);
            for (c = 0; c < mtr.length; c++) {
                var mc = mtr[c].clip, ms = pixelSize(mc.projectItem);
                if (!ms) { review.push("\"" + nest.name + "\": could not read the size of " + mc.name + ", check its scale."); ms = [1920, 1080]; }
                var ratio = ms[0] / ms[1], msc;
                if (three && ratio > 1.6 && ratio < 1.95) {
                    // close to the shape of the middle window: fill it, trimming the few pixels that spill over
                    msc = Math.max(CFG.width / ms[0], CFG.rowH3 / ms[1]);
                    var mcrop = Math.max(0, (ms[1] * msc - CFG.rowH3) / 2 / (ms[1] * msc) * 100);
                    setCrop(mc, 0, mcrop, 0, mcrop);
                } else {
                    msc = three ? Math.min(CFG.midMediaMaxW / ms[0], CFG.midMediaMaxH / ms[1]) : Math.min(CFG.mediaMaxW / ms[0], CFG.mediaMaxH / ms[1]);
                    setCrop(mc, 0, 0, 0, 0);
                    shortfall = true;
                }
                setScale(mc, msc * 100);
                setPos(mc, three ? [0.5, CFG.rows3[1]] : CFG.mediaPos);
                // labelled so the editor can see which clip is the media, and so face centring leaves it alone
                if (!isMediaName(mc.name)) { try { mc.name = "MEDIA " + mc.name; } catch (eN) {} }
            }
            if (shortfall) review.push("\"" + nest.name + "\": the media does not fill its window, so there is nothing behind its edges. Add a background plate under it if needed.");
        }
        var frame = three ? childMatching(showBin, /^9x16\s*3\s*-\s*up/i) : childMatching(showBin, /2\s*-\s*up/i);
        if (!frame) review.push("\"" + showBin.name + "\" has no " + (three ? "3-UP" : "2-up") + " frame, so \"" + nest.name + "\" has no frame on it.");
        else {
            var ft = firstFreeTrack(nest, top + 1, 0, end);
            if (ft < 0 || !placeStill(nest, frame, ft, 0, end)) review.push("Could not place " + frame.name + " in \"" + nest.name + "\"; add it on the top track.");
        }
        return { seq: nest, offset: 0, made: true, media: !!media };
    }

    // Shows = the sub-bins of "9x16 Frames" that hold at least one frame.
    $.bulwark.listShows = function () {
        try {
            if (!app.project) return "ERR|No project is open.";
            var bin = findBin(app.project.rootItem, CFG.framesBin);
            if (!bin) return "ERR|This project has no \"" + CFG.framesBin + "\" bin (BULWARK VIDEO ASSETS > 9x16 Assets).";
            var out = [];
            for (var i = 0; i < bin.children.numItems; i++) {
                var c = bin.children[i];
                if (c.type === ProjectItemType.BIN && c.children.numItems) out.push(c.name);
            }
            return "OK|" + out.join("|");
        } catch (err) { return "ERR|" + String(err); }
    };

    // Camera tracks of the wide nest used by the open sequence, each with the name of the single-camera nest
    // built on the same footage ("JVL", "Tim", ...). Returns "OK|<wide name>|<track no>:<name>|...".
    $.bulwark.listCameras = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var wide = null, singles = [], seen = {}, t, c;
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                for (c = 0; c < seq.videoTracks[t].clips.numItems; c++) {
                    var ns = seqFor(seq.videoTracks[t].clips[c].projectItem);
                    if (!ns || seen[ns.sequenceID]) continue;
                    seen[ns.sequenceID] = true;
                    if (ns.frameSizeVertical > ns.frameSizeHorizontal) continue;
                    if (populatedTracks(ns) > 1) { if (!wide && !multicamOn(seq, t, seq.videoTracks[t].clips[c])) wide = ns; } else singles.push(ns);
                }
            }
            if (!wide) return "ERR|No wide-shot nest in \"" + seq.name + "\".";
            function nestNameFor(item) {
                for (var i = 0; i < singles.length; i++) {
                    for (var a = 0; a < singles[i].videoTracks.numTracks; a++) {
                        var cl = singles[i].videoTracks[a].clips;
                        for (var b = 0; b < cl.numItems; b++) if (cl[b].projectItem && cl[b].projectItem.nodeId === item.nodeId) return singles[i].name;
                    }
                }
                return null;
            }
            // people only: media inside the nest and switched-off clips are not part of the order
            var out = [], parts = nestParts(wide);
            for (t = 0; t < parts.cams.length; t++) {
                var nm = nestNameFor(parts.cams[t].item) || shortName(parts.cams[t].name);
                out.push((parts.cams[t].track + 1) + ":" + nm.replace(/[|:]/g, " "));
            }
            if (parts.media) out.push("0:media");
            return "OK|" + wide.name.replace(/[|]/g, " ") + "|" + out.join("|");
        } catch (err) { return "ERR|" + String(err); }
    };

    // Selected image clips in the open sequence go full screen over a blurred copy of themselves.
    $.bulwark.blurSelected = function () {
        var review = [];
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var sel = [], picked = [], t, c, i;
            try { sel = seq.getSelection(); } catch (e) {}
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var cl = seq.videoTracks[t].clips;
                for (c = 0; c < cl.numItems; c++) {
                    for (i = 0; i < sel.length; i++) {
                        if (sel[i].nodeId === cl[c].nodeId) { if (!isGraphic(cl[c]) && cl[c].projectItem) picked.push({ track: t, s: cl[c].start.seconds, e: cl[c].end.seconds, name: String(cl[c].name), nodeId: cl[c].projectItem.nodeId }); break; }
                    }
                }
            }
            if (!picked.length) return "ERR|Select the image clip (or clips) in the timeline first.";
            // toggle: an image that already has its blurred copy goes back to how it was
            var done = 0, undone = 0, seen = {}, msg = [];
            for (i = 0; i < picked.length; i++) {
                var key = picked[i].nodeId + "@" + Math.round(picked[i].s * 100);
                if (seen[key]) continue;
                seen[key] = true;
                if (unblur(seq, picked[i])) undone++;
                else if (blurBehind(seq, picked[i], review)) done++;
            }
            if (!done && !undone) return "ERR|" + (review.join("\n") || "Nothing was changed.");
            if (done) msg.push(done + " image" + (done === 1 ? "" : "s") + " now full screen over a blurred copy. Click again with it selected to put it back.");
            if (undone) msg.push(undone + " image" + (undone === 1 ? "" : "s") + " put back: blurred copy removed, original switched on.");
            return "OK|" + msg.join("\n") + "|" + review.join("\n");
        } catch (err) { return "ERR|" + String(err) + (err && err.line ? " (line " + err.line + ")" : ""); }
    };

    // Stretches of the timeline covered by a background plate, touching plates merged. plates: [{s, e, track}].
    function mergeSegs(plates) {
        var segs = [];
        for (var i = 0; i < plates.length; i++) {
            var merged = false;
            for (var k = 0; k < segs.length; k++) {
                if (plates[i].s <= segs[k].e + EPS && plates[i].e >= segs[k].s - EPS) {
                    segs[k].s = Math.min(segs[k].s, plates[i].s); segs[k].e = Math.max(segs[k].e, plates[i].e);
                    segs[k].bgTrack = Math.min(segs[k].bgTrack, plates[i].track); merged = true; break;
                }
            }
            if (!merged) segs.push({ s: plates[i].s, e: plates[i].e, bgTrack: plates[i].track, top: plates[i].track });
        }
        return segs;
    }

    // Media sections of the open sequence, for the per-section layout picker.
    // Returns "OK|<start sec>~<end sec>~<media clip names>|..." in timeline order.
    $.bulwark.listMedia = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            var plates = [], others = [], t, c, i, k;
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var cl = seq.videoTracks[t].clips;
                for (c = 0; c < cl.numItems; c++) {
                    var nm = String(cl[c].name);
                    if (isGraphic(cl[c]) || CFG.removeNames.test(nm)) continue;
                    var o = { s: cl[c].start.seconds, e: cl[c].end.seconds, track: t, name: nm };
                    if (CFG.backgroundNames.test(nm)) plates.push(o); else others.push(o);
                }
            }
            var segs = mergeSegs(plates), out = [];
            segs.sort(function (a, b) { return a.s - b.s; });
            for (k = 0; k < segs.length; k++) {
                var names = [], seen = {};
                for (i = 0; i < others.length; i++) {
                    var mid = (others[i].s + others[i].e) / 2;
                    if (others[i].track > segs[k].bgTrack && mid >= segs[k].s - EPS && mid <= segs[k].e + EPS && !seen[others[i].name]) { seen[others[i].name] = true; names.push(others[i].name.replace(/[|~]/g, " ")); }
                }
                out.push(segs[k].s.toFixed(2) + "~" + segs[k].e.toFixed(2) + "~" + names.join(", "));
            }
            return "OK|" + out.join("|");
        } catch (err) { return "ERR|" + String(err); }
    };

    // ---- Centre people on their faces -------------------------------------------------------------------
    // The panel does this in three steps, because face detection runs outside Premiere:
    //   1. faceFrames() exports a few frames of every camera nest used by the open vertical sequence
    //   2. the panel finds the faces in those frames (macOS Vision, lib/faces.js)
    //   3. centre(result) moves every clip sideways so that person's face sits in the middle of their window
    // One measurement per camera is used for all of its clips, so the framing does not jump between cuts.
    function hhmmss(sec) {
        var s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
        function p(n) { return (n < 10 ? "0" : "") + n; }
        return p(h) + ":" + p(m) + ":" + p(r) + ":00";
    }
    function seqById(id) {
        for (var i = 0; i < app.project.sequences.numSequences; i++) if (app.project.sequences[i].sequenceID === id) return app.project.sequences[i];
        return null;
    }
    // "single": a 16x9 nest of one camera. "nest": a stacked vertical wide this panel built ("<wide> VERT").
    function faceKind(s) {
        if (!s) return null;
        if (s.frameSizeHorizontal > s.frameSizeVertical) return populatedTracks(s) === 1 ? "single" : null;
        return (/ VERT( \d+)?$/.test(s.name) && populatedTracks(s) > 1) ? "nest" : null;
    }
    function clamp(v, lo, hi) { return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)); }
    function median(a) { a.sort(function (p, q) { return p - q; }); return a[Math.floor(a.length / 2)]; }

    $.bulwark.faceFrames = function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERR|No sequence is open.";
            if (seq.frameSizeVertical <= seq.frameSizeHorizontal) return "ERR|Open the vertical (9x16) sequence first.";
            var srcs = {}, order = [], t, c, i, k;
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var cl = seq.videoTracks[t].clips;
                for (c = 0; c < cl.numItems; c++) {
                    var s = seqFor(cl[c].projectItem), kind = faceKind(s);
                    if (!kind) continue;
                    if (!srcs[s.sequenceID]) { srcs[s.sequenceID] = { kind: kind, times: [] }; order.push(s.sequenceID); }
                    srcs[s.sequenceID].times.push(cl[c].inPoint.seconds + (cl[c].end.seconds - cl[c].start.seconds) / 2);
                }
            }
            if (!order.length) return "ERR|No camera nests in this sequence to centre.";
            app.enableQE();
            var dir = Folder.temp.fsName, jobs = {}, paths = [], stamp = new Date().getTime();
            for (i = 0; i < order.length; i++) {
                var src = srcs[order[i]], times = src.times.sort(function (a, b) { return a - b; }), n = Math.min(CFG.faceSamples, times.length);
                app.project.openSequence(order[i]);
                var q = qe.project.getActiveSequence();
                for (k = 0; k < n; k++) {
                    var at = times[n === 1 ? 0 : Math.round(k * (times.length - 1) / (n - 1))];
                    var base = dir + "/bulwark_face_" + stamp + "_" + paths.length + ".png";
                    q.exportFramePNG(hhmmss(at), base);
                    var real = new File(base + ".png").exists ? base + ".png" : base;   // Premiere adds its own .png
                    if (!new File(real).exists) continue;
                    jobs[real] = { id: order[i], kind: src.kind };
                    paths.push(real);
                }
            }
            app.project.openSequence(seq.sequenceID);
            $.bulwark._faceJobs = { seqID: seq.sequenceID, jobs: jobs };
            if (!paths.length) return "ERR|Premiere would not export frames to look for faces.";
            return "OK|" + paths.join("|");
        } catch (err) { return "ERR|" + String(err) + (err && err.line ? " (line " + err.line + ")" : ""); }
    };

    // Moves one camera clip sideways so the face (u = its x in the camera picture, 0..1) is centred in the clip's window,
    // never so far that the picture stops covering the window. Returns "moved", "crop" (side crop from the 16x9 edit,
    // left alone) or "".
    function centreClip(clip, u, srcW, W) {
        var m = motion(clip), pp = prop(m, "Position"), sp = prop(m, "Scale");
        if (!pp || !sp) return "";
        try { if (pp.isTimeVarying()) return ""; } catch (e) {}
        var pos = pp.getValue(), picW = srcW * Number(sp.getValue()) / 100, half = picW / 2, pcx;
        var pl = prop(m, "Crop Left"), pr = prop(m, "Crop Right"), cL = pl ? Number(pl.getValue()) : 0, cR = pr ? Number(pr.getValue()) : 0;
        var L = CFG.pipEdge[0], R = CFG.pipEdge[1], bottomRow = Math.abs(pos[1] - CFG.rows3[2]) < 0.02;
        if (cL > 0.5 || cR > 0.5) {
            if (!bottomRow || (cL > 0.5 && cR > 0.5)) return "crop";
            if (cR > 0.5) {            // PIP bottom-left window: x 0..L
                pcx = clamp(L / 2 - (u - 0.5) * picW, L - half, half);
                pr.setValue(Math.max(0, (pcx + half - L) / picW * 100), true);
            } else {                   // PIP bottom-right window: x R..W
                pcx = clamp((R + W) / 2 - (u - 0.5) * picW, W - half, R + half);
                pl.setValue(Math.max(0, (R - (pcx - half)) / picW * 100), true);
            }
        } else {
            if (picW < W) return "";
            pcx = clamp(W / 2 - (u - 0.5) * picW, W - half, half);
        }
        pp.setValue([pcx / W, pos[1]], true);
        return "moved";
    }
    // A stacked vertical wide: each face found in a row moves that row's camera so the face is centred.
    function centreNest(nest, frames) {
        var W = nest.frameSizeHorizontal, rows = [], t, c, i, k, moved = 0;
        for (t = 0; t < nest.videoTracks.numTracks; t++) {
            var cl = nest.videoTracks[t].clips;
            for (c = 0; c < cl.numItems; c++) {
                if (!isCameraClip(cl[c]) || isMediaName(cl[c].name)) continue;   // media in a window is not a person
                var pp = prop(motion(cl[c]), "Position"), y = 0.5, hit = null;
                try { y = pp.getValue()[1]; } catch (e) {}
                for (i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 0.03) hit = rows[i];
                if (!hit) { hit = { y: y, clips: [], xs: [] }; rows.push(hit); }
                hit.clips.push(cl[c]);
            }
        }
        for (i = 0; i < frames.length; i++) {
            for (k = 0; k < frames[i].length; k++) {
                var f = frames[i][k], best = null;
                for (t = 0; t < rows.length; t++) if (Math.abs(rows[t].y - f.y) < 0.13 && (!best || Math.abs(rows[t].y - f.y) < Math.abs(best.y - f.y))) best = rows[t];
                if (best) best.xs.push(f.x);
            }
        }
        for (i = 0; i < rows.length; i++) {
            if (!rows[i].xs.length) continue;
            var shift = (0.5 - median(rows[i].xs)) * W;
            for (c = 0; c < rows[i].clips.length; c++) {
                var clip = rows[i].clips[c], p2 = prop(motion(clip), "Position"), sz = pixelSize(clip.projectItem);
                if (!p2) continue;
                var pos = p2.getValue(), pcx = pos[0] * W + shift;
                if (sz) { var half = sz[0] * getScale(clip) / 100 / 2; pcx = clamp(pcx, W - half, half); }
                p2.setValue([pcx / W, pos[1]], true);
            }
            moved++;
        }
        return moved;
    }
    // found: the output of lib/faces.js, one line per frame: "<path>|cx,cy,w,h;cx,cy,w,h" (fractions of the picture).
    $.bulwark.centre = function (found) {
        var review = [], notes = [];
        try {
            var seq = app.project.activeSequence, job = $.bulwark._faceJobs, path;
            if (job && job.jobs) for (path in job.jobs) { try { new File(path).remove(); } catch (e0) {} }
            if (!seq || !job || job.seqID !== seq.sequenceID) return "ERR|The open sequence changed; run it again with the vertical sequence open.";
            var lines = String(found).split("\n"), per = {}, i, k, id;
            for (i = 0; i < lines.length; i++) {
                var bar = lines[i].indexOf("|"), jb = bar > 0 ? job.jobs[lines[i].slice(0, bar)] : null;
                if (!jb) continue;
                var faces = [], parts = lines[i].slice(bar + 1).split(";");
                for (k = 0; k < parts.length; k++) {
                    var f = parts[k].split(",");
                    if (f.length === 4 && !isNaN(parseFloat(f[0]))) faces.push({ x: parseFloat(f[0]), y: parseFloat(f[1]), w: parseFloat(f[2]) });
                }
                if (!per[jb.id]) per[jb.id] = { kind: jb.kind, frames: [] };
                per[jb.id].frames.push(faces);
            }
            $.bulwark._faceJobs = null;
            var U = {}, names = [], nMoved = 0, nCrop = 0, nNoFace = 0, W = seq.frameSizeHorizontal, t, c;
            for (id in per) {
                var s = seqById(id);
                if (!s) continue;
                if (per[id].kind === "nest") {
                    var rowsMoved = centreNest(s, per[id].frames);
                    if (rowsMoved) notes.push("\"" + s.name + "\": " + rowsMoved + (rowsMoved === 1 ? " person" : " people") + " centred in their windows.");
                    else review.push("No faces found in \"" + s.name + "\"; it was left as it was.");
                    continue;
                }
                var xs = [];
                for (i = 0; i < per[id].frames.length; i++) {
                    var big = null;
                    for (k = 0; k < per[id].frames[i].length; k++) if (!big || per[id].frames[i][k].w > big.w) big = per[id].frames[i][k];
                    if (big) xs.push(big.x);
                }
                if (xs.length) { U[id] = median(xs); names.push(s.name); }
                else { nNoFace++; review.push("No face found in \"" + s.name + "\"; its clips were left as they were."); }
            }
            for (t = 0; t < seq.videoTracks.numTracks; t++) {
                var cl = seq.videoTracks[t].clips;
                for (c = 0; c < cl.numItems; c++) {
                    var cs = seqFor(cl[c].projectItem);
                    if (!cs || U[cs.sequenceID] === undefined) continue;
                    var res = centreClip(cl[c], U[cs.sequenceID], cs.frameSizeHorizontal, W);
                    if (res === "moved") nMoved++; else if (res === "crop") nCrop++;
                }
            }
            if (nMoved) notes.unshift(nMoved + " camera clips centred on the face (" + names.join(", ") + ").");
            if (nCrop) review.push(nCrop + " camera clips have a side crop from the 16x9 edit and were not moved.");
            if (!notes.length) return "ERR|" + (review.join("\n") || "No faces were found, so nothing was moved.");
            return "OK|" + notes.join("\n") + "|" + review.join("\n");
        } catch (err) { return "ERR|" + String(err) + (err && err.line ? " (line " + err.line + ")" : ""); }
    };

    // perSection: layouts for single media sections, "<section start sec>=<layout>;...", e.g. "15.35=pip;79.95=full".
    $.bulwark.reformat = function (showBinName, layout, order, rebuild, blur, perSection) {
        if (layout !== "mid3" && layout !== "pip" && layout !== "full") layout = "2up";
        function isStacked(l) { return l === "mid3" || l === "pip"; }
        function nameOf(l) { return l === "pip" ? "3-person PIP" : (l === "mid3" ? "3-UP with media in the middle" : (l === "full" ? "full screen over a blurred copy" : "2-up")); } // ExtendScript mis-parses chained ?: without brackets
        var notes = [], review = [];
        try {
            var src = app.project.activeSequence;
            if (!src) return "ERR|Open the 16x9 sequence you want to convert first.";
            var srcW = src.frameSizeHorizontal, srcH = src.frameSizeVertical;
            if (srcH >= srcW) return "ERR|\"" + src.name + "\" is already vertical (" + srcW + "x" + srcH + "). Open the 16x9 version.";

            var framesBin = findBin(app.project.rootItem, CFG.framesBin);
            var showBin = framesBin ? findBin(framesBin, showBinName) : null;
            if (!showBin) return "ERR|Could not find the \"" + showBinName + "\" bin inside \"" + CFG.framesBin + "\".";
            function frameFor(l) { return childMatching(showBin, l === "pip" ? /PIP/i : (l === "mid3" ? /^9x16\s*3\s*-\s*up/i : /2\s*-\s*up/i)); } // frame laid over a media section
            var cards169 = findBinLike(app.project.rootItem, CFG.endCards169Bin);
            var cards916 = findBinLike(app.project.rootItem, CFG.endCards916Bin);

            function match916(cardName) {
                var prefix = cardName.replace(/[-_ ]*(4K|16[x.:]*9).*$/i, "").toUpperCase();
                if (!cards916 || prefix.length < 3) return null;
                return firstItemStarting(cards916, prefix);
            }
            // The 9x16 end card for the show picked in the panel: "9x16 BULWARK TAKES" -> BULWARK-TAKES-9-16-..., letters only.
            function letters(s) { return String(s).toUpperCase().replace(/^9X16\s*/, "").replace(/[^A-Z]/g, ""); }
            function showCardFor(binName) {
                if (!cards916) return null;
                var key = CFG.showEndCards[binName] || letters(binName);
                if (key.length < 3) return null;
                function walk(bin) {
                    for (var z = 0; z < bin.children.numItems; z++) {
                        var ch = bin.children[z];
                        if (ch.type === ProjectItemType.BIN) { var h = walk(ch); if (h) return h; }
                        else if (letters(ch.name).indexOf(key) === 0) return ch;
                    }
                    return null;
                }
                return walk(cards916);
            }
            var showCard = showCardFor(showBinName);

            // 1. Copy the sequence and make the copy vertical.
            var before = {};
            for (var i = 0; i < app.project.sequences.numSequences; i++) before[app.project.sequences[i].sequenceID] = true;
            src.clone();
            var seq = null;
            for (i = 0; i < app.project.sequences.numSequences; i++) {
                if (!before[app.project.sequences[i].sequenceID]) { seq = app.project.sequences[i]; break; }
            }
            if (!seq) return "ERR|Premiere did not create a copy of the sequence.";
            seq.name = src.name + " VERT";
            var st = seq.getSettings();
            st.videoFrameWidth = CFG.width;
            st.videoFrameHeight = CFG.height;
            seq.setSettings(st);
            if (seq.frameSizeHorizontal !== CFG.width || seq.frameSizeVertical !== CFG.height) {
                return "ERR|Made \"" + seq.name + "\" but Premiere refused to change its frame size to " + CFG.width + "x" + CFG.height + ". Nothing else was done.";
            }
            app.project.openSequence(seq.sequenceID);
            var fill = CFG.height / srcH; // 1.7778 for a 1080-high source: fills the vertical frame top to bottom

            // 2. Sort every clip into a role.
            var all = [], T = seq.videoTracks.numTracks, t, c;
            for (t = 0; t < T; t++) {
                var tr = seq.videoTracks[t];
                for (c = 0; c < tr.clips.numItems; c++) {
                    var clip = tr.clips[c], item = clip.projectItem, name = String(clip.name);
                    var o = { clip: clip, track: t, s: clip.start.seconds, e: clip.end.seconds, name: name, item: item, role: "camera" };
                    if (isGraphic(clip)) o.role = "graphic";
                    else if (CFG.removeNames.test(name)) o.role = "remove";
                    else if (isIn(cards169, item) || (/\.(mp4|mov)$/i.test(name) && /4K|16[x.:]*9/i.test(name) && match916(name))) o.role = "endcard";
                    else if (CFG.backgroundNames.test(name)) o.role = "background";
                    else if (!seqFor(item) && CFG.stillExt.test(name)) o.role = "still";
                    all.push(o);
                }
            }

            // 3. Media segments = stretches covered by a background plate. Everything above the plate is media.
            var plates = [];
            for (i = 0; i < all.length; i++) if (all[i].role === "background") plates.push(all[i]);
            var segs = mergeSegs(plates), picks = String(perSection || "").split(";"), anyStacked = false, used = {};
            segs.sort(function (a, b) { return a.s - b.s; });
            for (var k = 0; k < segs.length; k++) {
                segs[k].layout = layout;
                for (var pk = 0; pk < picks.length; pk++) {
                    var pr = picks[pk].split("=");
                    if (pr.length === 2 && /^(2up|mid3|pip|full)$/.test(pr[1]) && Math.abs(parseFloat(pr[0]) - segs[k].s) < 0.05) segs[k].layout = pr[1];
                }
                if (isStacked(segs[k].layout)) anyStacked = true;
                used[segs[k].layout] = (used[segs[k].layout] || 0) + 1;
            }
            function segAt(o) {
                var mid = (o.s + o.e) / 2;
                for (var q = 0; q < segs.length; q++) if (mid >= segs[q].s - EPS && mid <= segs[q].e + EPS) return segs[q];
                return null;
            }

            // 4. Apply the layout.
            var nFull = 0, nMulticam = 0, nTop = 0, nMedia = 0, nRemoved = 0, nCards = 0, nGraphics = 0;
            var toRemove = [], cardsToSwap = [], wideClips = [], fullStills = [], wantBlur = !(blur === false || blur === "false");
            for (i = 0; i < all.length; i++) {
                var o2 = all[i], sg = segAt(o2);
                if (o2.role === "graphic") { nGraphics++; continue; }
                if (o2.role === "remove") { toRemove.push(o2); continue; }
                if (o2.role === "endcard") { cardsToSwap.push(o2); continue; }
                if (o2.role === "background") {
                    var bl = sg ? sg.layout : layout;
                    if (bl === "full") setScale(o2.clip, getScale(o2.clip) * fill);
                    else if (isStacked(bl)) { setScale(o2.clip, getScale(o2.clip) * CFG.rowH3 / srcH); setPos(o2.clip, [0.5, CFG.rows3[1]]); }
                    else setPos(o2.clip, CFG.backgroundPos);
                    continue;
                }
                if (sg && o2.track > sg.bgTrack) {
                    // media in the bottom window (2-up) or the middle window (3-UP / PIP)
                    var stacked = isStacked(sg.layout), full = sg.layout === "full";
                    var size = pixelSize(o2.item), boxW = full ? CFG.width : (stacked ? CFG.midMediaMaxW : CFG.mediaMaxW), boxH = full ? CFG.height : (stacked ? CFG.midMediaMaxH : CFG.mediaMaxH);
                    if (size) setScale(o2.clip, Math.min(boxW / size[0], boxH / size[1]) * 100);
                    else { setScale(o2.clip, getScale(o2.clip) * CFG.mediaFallbackFactor); review.push(tc(o2.s) + "  " + o2.name + ": could not read its size, check the scale."); }
                    setPos(o2.clip, full ? [0.5, 0.5] : (stacked ? [0.5, CFG.rows3[1]] : CFG.mediaPos));
                    if (full) fullStills.push(o2);   // sharp copy over a blurred copy, placed in step 10
                    sg.top = Math.max(sg.top, o2.track);
                    nMedia++;
                    continue;
                }
                if (sg && sg.layout !== "full") {
                    // camera under the media: placed in step 5
                    o2.inSeg = sg;
                    o2.base = getScale(o2.clip);
                    if (o2.s < sg.s - 0.1 || o2.e > sg.e + 0.1) review.push(tc(o2.s) + "  " + o2.name + " (V" + (o2.track + 1) + ") runs past the media at " + tc(sg.s) + "-" + tc(sg.e) + "; trim it or the frame.");
                    nTop++;
                    continue;
                }
                if (o2.role === "still") {
                    var sz = pixelSize(o2.item);
                    if (sz) setScale(o2.clip, CFG.width / sz[0] * 100);
                    if (wantBlur) fullStills.push(o2);
                    else review.push(tc(o2.s) + "  " + o2.name + ": full-screen image with no background plate. Fitted to width; nothing behind it.");
                    continue;
                }
                setScale(o2.clip, getScale(o2.clip) * fill);
                var wseq = seqFor(o2.item);
                if (wseq && populatedTracks(wseq) > 1 && multicamOn(seq, o2.track, o2.clip)) { nFull++; nMulticam++; }
                else if (wseq && populatedTracks(wseq) > 1) wideClips.push(o2); else nFull++;
            }

            // 5. In each media section, switch on the cameras the layout needs and put each in its window.
            function isWide(o) { var s = seqFor(o.item); return !!s && populatedTracks(s) > 1; }
            function byLiveThenTrack(a, b) { return (a.wasOff - b.wasOff) || (a.track - b.track); }
            var k3 = CFG.rowH3 / srcH;
            for (i = 0; i < all.length; i++) if (all[i].inSeg) { all[i].wide = isWide(all[i]); all[i].wasOff = all[i].clip.disabled ? 1 : 0; }
            for (var g = 0; g < segs.length; g++) {
                var L5 = segs[g].layout, need = L5 === "pip" ? 3 : (L5 === "mid3" ? 2 : 1);
                if (L5 === "full") continue;
                var cams = [], cuts = [segs[g].s, segs[g].e];
                for (i = 0; i < all.length; i++) if (all[i].inSeg === segs[g]) { cams.push(all[i]); cuts.push(all[i].s); cuts.push(all[i].e); }
                cuts.sort(function (a, b) { return a - b; });
                for (var u = 0; u + 1 < cuts.length; u++) {
                    if (cuts[u + 1] - cuts[u] < EPS) continue;
                    var mid = (cuts[u] + cuts[u + 1]) / 2, singles = [], wides = [];
                    for (i = 0; i < cams.length; i++) {
                        if (mid < cams[i].s || mid > cams[i].e) continue;
                        if (cams[i].wide) wides.push(cams[i]); else singles.push(cams[i]);
                    }
                    if (!singles.length) continue;
                    singles.sort(byLiveThenTrack);
                    if (singles[0].wasOff && L5 === "2up") review.push(tc(cuts[u]) + "  No single camera was on over the media, so " + singles[0].name + " was turned on. Switch it if someone else is talking.");
                    if (singles.length < need) review.push(tc(cuts[u]) + "  The " + nameOf(L5) + " layout needs " + need + " single cameras; only " + singles.length + " here.");
                    for (i = 0; i < singles.length; i++) {
                        var cam = singles[i];
                        cam.clip.disabled = i >= need;
                        if (i >= need) continue;
                        if (L5 === "2up") { setPos(cam.clip, CFG.speakerPos); continue; }
                        setScale(cam.clip, cam.base * k3);
                        if (i === 0) { setPos(cam.clip, [0.5, CFG.rows3[0]]); setCrop(cam.clip, 0, 0, 0, 0); }
                        else if (L5 === "mid3") { setPos(cam.clip, [0.5, CFG.rows3[2]]); setCrop(cam.clip, 0, 0, 0, 0); }
                        else if (i === 1) { setPos(cam.clip, [CFG.pipX[0], CFG.rows3[2]]); setCrop(cam.clip, 0, 0, CFG.pipCrop[0], 0); }
                        else { setPos(cam.clip, [CFG.pipX[1], CFG.rows3[2]]); setCrop(cam.clip, CFG.pipCrop[1], 0, 0, 0); }
                    }
                    for (i = 0; i < wides.length; i++) wides[i].clip.disabled = true;
                }
            }
            if (anyStacked) review.push("In 3-UP and PIP media sections the camera that was live is on top, the others follow track order. Swap positions if needed.");

            // 6. Remove the 16x9 logo overlay.
            for (i = 0; i < toRemove.length; i++) { try { toRemove[i].clip.remove(false, false); nRemoved++; } catch (e1) {} }

            // 7. Swap 16x9 end cards for the 9x16 version with the same name prefix (NEXT-LEVEL, BULWARK-DAILY, ...).
            function audioSnapshot() {
                var m = {};
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    var at = seq.audioTracks[a];
                    for (var b = 0; b < at.clips.numItems; b++) m[a + "/" + at.clips[b].start.ticks + "/" + at.clips[b].name] = true;
                }
                return m;
            }
            for (i = 0; i < cardsToSwap.length; i++) {
                var card = cardsToSwap[i];
                var repl = showCard || match916(card.name);
                if (!repl) { review.push(tc(card.s) + "  No 9x16 end card for " + showBinName.replace(/^9x16\s+/i, "") + " or matching " + card.name + "; swap it by hand."); continue; }
                if (!showCard) review.push(tc(card.s) + "  " + showBinName.replace(/^9x16\s+/i, "") + " has no 9x16 end card in \"" + (cards916 ? cards916.name : CFG.endCards916Bin) + "\", so " + repl.name + " (matching the 16x9 card) was used.");
                var track = seq.videoTracks[card.track], hadAudio = audioSnapshot();
                var oldHasAudio = false, key;
                for (key in hadAudio) if (key.indexOf("/" + card.name) > 0) oldHasAudio = true;
                card.clip.remove(false, false);
                track.overwriteClip(repl, time(card.s));
                var placed = null;
                for (c = 0; c < track.clips.numItems; c++) if (Math.abs(track.clips[c].start.seconds - card.s) < EPS) placed = track.clips[c];
                if (!placed) { review.push(tc(card.s) + "  Could not place " + repl.name + "; add it by hand."); continue; }
                if (placed.end.seconds > card.e + EPS) placed.end = time(card.e);
                var rs = pixelSize(repl);
                setScale(placed, rs ? Math.max(CFG.width / rs[0], CFG.height / rs[1]) * 100 : 50);
                // the old card's audio is still on the timeline, so drop the copy that came in with the new one
                if (oldHasAudio) {
                    for (var a2 = 0; a2 < seq.audioTracks.numTracks; a2++) {
                        var at2 = seq.audioTracks[a2];
                        for (var b2 = at2.clips.numItems - 1; b2 >= 0; b2--) {
                            var ac = at2.clips[b2];
                            if (!hadAudio[a2 + "/" + ac.start.ticks + "/" + ac.name] && Math.abs(ac.start.seconds - card.s) < EPS) ac.remove(false, false);
                        }
                    }
                }
                nCards++;
            }

            // 8. Lay the show's 2-up frame over every media segment, on the first free track above the media.
            var nFrames = 0;
            function freeTrack(sg2) {
                for (var x = sg2.top + 1; x < seq.videoTracks.numTracks; x++) {
                    var cl = seq.videoTracks[x].clips, busy = false;
                    for (var y = 0; y < cl.numItems; y++) if (cl[y].start.seconds < sg2.e - EPS && cl[y].end.seconds > sg2.s + EPS) { busy = true; break; }
                    if (!busy) return x;
                }
                return -1;
            }
            {
                for (g = 0; g < segs.length; g++) {
                    if (segs[g].layout === "full") continue;
                    var frame2up = frameFor(segs[g].layout);
                    if (!frame2up) { review.push(tc(segs[g].s) + "  \"" + showBinName + "\" has no " + nameOf(segs[g].layout) + " frame, so no frame was placed over this media section."); continue; }
                    var ti = freeTrack(segs[g]);
                    if (ti < 0) {
                        try {
                            app.enableQE();
                            var n0 = seq.videoTracks.numTracks;
                            qe.project.getActiveSequence().addTracks(1, n0, 0, 0, 0, 0, 0);
                            if (seq.videoTracks.numTracks > n0) ti = n0;
                        } catch (e2) {}
                    }
                    if (ti < 0) { review.push(tc(segs[g].s) + "  No empty video track above the media for the frame. Add a track and drop in " + frame2up.name + "."); continue; }
                    var ft = seq.videoTracks[ti];
                    ft.overwriteClip(frame2up, time(segs[g].s));
                    for (c = 0; c < ft.clips.numItems; c++) {
                        if (Math.abs(ft.clips[c].start.seconds - segs[g].s) < EPS) { ft.clips[c].end = time(segs[g].e); nFrames++; break; }
                    }
                }
            }

            // 9. Wide shots: swap each wide clip for the vertical version of that nest, building the nest if it does not exist.
            var nests = {}, nWide = 0, madeNests = [], usedNests = [];
            for (i = 0; i < wideClips.length; i++) {
                var wc = wideClips[i], wsq = seqFor(wc.item), nid = wsq.sequenceID;
                if (!(nid in nests)) {
                    var fresh = CFG.forceBuild || rebuild === true || rebuild === "true";
                    var vn = fresh ? null : verticalLayerIn(wsq);
                    if (!vn && !(rebuild === true || rebuild === "true")) { var ex = seqNamed(wsq.name + " VERT"); if (ex && ex.sequenceID !== seq.sequenceID) vn = { seq: ex, offset: 0 }; }
                    if (!vn) { vn = buildVerticalNest(wsq, showBin, review, order); if (vn && vn.made) madeNests.push(vn.seq.name); }
                    else usedNests.push(vn.seq.name);
                    nests[nid] = vn;
                }
                var nst = nests[nid];
                if (!nst) { review.push(tc(wc.s) + "  Could not build a vertical version of \"" + wsq.name + "\"; the wide shot is a centre crop."); continue; }
                var inSec = wc.clip.inPoint.seconds + nst.offset, wasOff = wc.clip.disabled, wtrack = seq.videoTracks[wc.track];
                var pi = nst.seq.projectItem, hadA = audioKeys(seq);
                wc.clip.remove(false, false);
                pi.setInPoint(inSec, 4);
                pi.setOutPoint(inSec + (wc.e - wc.s), 4);
                wtrack.overwriteClip(pi, time(wc.s));
                removeNewAudio(seq, hadA);
                var put = null;
                for (c = 0; c < wtrack.clips.numItems; c++) if (Math.abs(wtrack.clips[c].start.seconds - wc.s) < EPS) put = wtrack.clips[c];
                if (!put) { review.push(tc(wc.s) + "  Could not place the vertical wide shot; add \"" + nst.seq.name + "\" by hand."); continue; }
                if (Math.abs(put.end.seconds - wc.e) > EPS) put.end = time(wc.e);
                put.disabled = wasOff;
                nWide++;
            }
            for (var nk in nests) if (nests[nk]) { try { nests[nk].seq.projectItem.clearInPoint(4); nests[nk].seq.projectItem.clearOutPoint(4); } catch (e3) {} }
            app.project.openSequence(seq.sequenceID);

            // 10. Full-screen images (no background plate): sharp copy over a blurred copy that fills the frame.
            var nBlur = 0;
            for (i = 0; i < fullStills.length; i++) if (blurBehind(seq, fullStills[i], review)) nBlur++;

            notes.push("Created \"" + seq.name + "\" (" + CFG.width + "x" + CFG.height + ").");
            notes.push(nFull + " camera clips scaled to fill.");
            if (nMulticam) review.push(nMulticam + " multicam clip" + (nMulticam === 1 ? " was" : "s were") + " scaled to fill like a single camera. The panel cannot read which angle a multicam clip shows: if one shows a 2-box or media, lay that one out by hand.");
            if (nWide) notes.push(nWide + " wide shots now use \"" + (madeNests.length ? madeNests.join(", ") : usedNests.join(", ")) + "\"" + (madeNests.length ? " (new: check each person's framing in it once)." : "."));
            var usedNames = [];
            for (var un in used) usedNames.push((segs.length > 1 ? used[un] + " " : "") + nameOf(un));
            if (segs.length) notes.push(segs.length + " media section" + (segs.length === 1 ? "" : "s") + " (" + usedNames.join(", ") + "): " + nMedia + " media clips fitted, " + nFrames + " frame" + (nFrames === 1 ? "" : "s") + " added.");
            if (nBlur) notes.push(nBlur + " full-screen image" + (nBlur === 1 ? "" : "s") + " put over a blurred copy.");
            if (nRemoved) notes.push(nRemoved + " logo overlay clips removed.");
            if (nCards) notes.push(nCards + " end card" + (nCards === 1 ? "" : "s") + " swapped to 9x16.");
            if (nGraphics) notes.push(nGraphics + " text/graphic clips left as they were.");
            return "OK|" + notes.join("\n") + "|" + review.join("\n");
        } catch (err) {
            return "ERR|" + String(err) + (err && err.line ? " (line " + err.line + ")" : "") + (notes.length ? "\n" + notes.join("\n") : "");
        }
    };
})();
