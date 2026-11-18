// Prints the text Vision can read in each image given: one line per piece of text,
// "path|centre y (fraction from the top)|height (fraction)|centre x|the text". Biggest text first within a picture.
ObjC.import('Foundation'); ObjC.import('Vision');
function run(argv) {
  var out = [];
  for (var i = 0; i < argv.length; i++) {
    try {
      var url = $.NSURL.fileURLWithPath(argv[i]);
      var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $());
      var req = $.VNRecognizeTextRequest.alloc.init;
      req.recognitionLevel = 0;            // accurate
      req.usesLanguageCorrection = true;
      handler.performRequestsError($.NSArray.arrayWithObject(req), $());
      var res = req.results, rows = [];
      for (var k = 0; k < res.count; k++) {
        var o = res.objectAtIndex(k), c = o.topCandidates(1);
        if (!c.count) continue;
        var b = o.boundingBox;
        rows.push({ y: 1 - b.origin.y - b.size.height / 2, h: b.size.height, x: b.origin.x + b.size.width / 2, t: ObjC.unwrap(c.objectAtIndex(0).string) });
      }
      rows.sort(function (a, b2) { return b2.h - a.h; });
      for (var r = 0; r < rows.length; r++) out.push([argv[i], rows[r].y.toFixed(4), rows[r].h.toFixed(4), rows[r].x.toFixed(4), String(rows[r].t).replace(/[|\n\r]/g, ' ')].join('|'));
    } catch (e) { out.push(argv[i] + '|ERR|' + e); }
  }
  return out.join('\n');
}
