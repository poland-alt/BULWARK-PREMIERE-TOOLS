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
