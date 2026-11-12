// Prints, for each image path given, the faces Vision finds: "path|cx,cy,w,h;cx,cy,w,h" (fractions of the picture, cy from the top).
ObjC.import('Foundation'); ObjC.import('Vision');
function run(argv) {
  var out = [];
  for (var i = 0; i < argv.length; i++) {
    var line = argv[i] + '|';
    try {
      var url = $.NSURL.fileURLWithPath(argv[i]);
      var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $());
      var req = $.VNDetectFaceRectanglesRequest.alloc.init;
      var err = $();
      handler.performRequestsError($.NSArray.arrayWithObject(req), err);
      var res = req.results, faces = [];
      for (var k = 0; k < res.count; k++) {
        var b = res.objectAtIndex(k).boundingBox;
        faces.push([(b.origin.x + b.size.width / 2).toFixed(4), (1 - b.origin.y - b.size.height / 2).toFixed(4), b.size.width.toFixed(4), b.size.height.toFixed(4)].join(','));
      }
      line += faces.join(';');
    } catch (e) { line += 'ERR ' + e; }
    out.push(line);
  }
  return out.join('\n');
}
