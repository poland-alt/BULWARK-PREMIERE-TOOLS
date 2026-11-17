// Bulwark transcriber (Parakeet via FluidAudio): word-timed transcript of an audio file, on this Mac.
// usage: ptranscribe <audio file> <output json> <models dir> [v2|v3]
// Writes {"words":[{"s":start,"e":end,"w":"text"}...]} or {"error":"..."}; progress in <out>.progress.
import Foundation
import FluidAudio

func finish(_ out: String, _ obj: [String: Any], _ code: Int32) -> Never {
    if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: URL(fileURLWithPath: out)) }
    print(obj["error"] as? String ?? "OK")
    exit(code)
}
let a = CommandLine.arguments
guard a.count >= 4 else { print("usage: ptranscribe <audio> <out.json> <models dir> [v2|v3]"); exit(2) }
let out = a[2]
@Sendable func note(_ t: String) { try? t.write(toFile: out + ".progress", atomically: true, encoding: .utf8) }
do {
    let t0 = Date()
    let version: AsrModelVersion = a.count > 4 && a[4] == "v3" ? .v3 : .v2
    note("download 0")
    let dir = URL(fileURLWithPath: a[3]).appendingPathComponent(a.count > 4 ? a[4] : "v2")
    let models = try await AsrModels.downloadAndLoad(to: dir, version: version, progressHandler: { p in note("download \(p.fractionCompleted)") })
    note("load")
    let asr = AsrManager(config: .default)
    try await asr.loadModels(models)
    let t1 = Date()
    note("transcribe 0")
    let samples = try AudioConverter().resampleAudioFile(URL(fileURLWithPath: a[1]))
    var state = TdtDecoderState.make(decoderLayers: await asr.decoderLayerCount)
    let result = try await asr.transcribe(samples, decoderState: &state)
    // Words with times. The text is the truth for where words begin and end (numbers and names are re-spelled after
    // decoding, so the word pieces no longer mark every space); each word takes the times of the pieces it uses up.
    var words: [[String: Any]] = []
    let toks = (result.tokenTimings ?? []).filter { !$0.token.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty }
    func letters(_ t: String) -> Int { return t.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) && $0 != "\u{2581}" }.count }
    let total = toks.reduce(0) { $0 + letters($1.token) }
    let textWords = result.text.split(whereSeparator: { $0 == " " || $0 == "\n" }).map(String.init)
    let textTotal = textWords.reduce(0) { $0 + letters($1) }
    var ti = 0, used = 0, seen = 0            // token index, letters of it used, letters of text seen
    for w in textWords {
        let n = letters(w)
        if n == 0 || ti >= toks.count { continue }
        // where this word starts and ends, as a share of all the letters (the re-spelling changes counts a little)
        let a0 = Double(seen) / Double(max(1, textTotal)) * Double(total), a1 = Double(seen + n) / Double(max(1, textTotal)) * Double(total)
        var acc = 0, first = -1, last = -1
        for (k, t) in toks.enumerated() {
            let l = letters(t.token), mid = Double(acc) + Double(l) / 2
            if mid >= a0 && mid < a1 { if first < 0 { first = k }; last = k }
            acc += l
        }
        if first < 0 { first = min(ti, toks.count - 1); last = first }
        ti = last + 1; used = 0; seen += n
        words.append(["s": (toks[first].startTime * 1000).rounded() / 1000, "e": (toks[last].endTime * 1000).rounded() / 1000, "w": w])
    }
    _ = used
    finish(out, ["words": words, "loadSecs": t1.timeIntervalSince(t0), "runSecs": Date().timeIntervalSince(t1)], 0)
} catch {
    finish(out, ["error": "Transcription failed: \(error.localizedDescription)"], 1)
}
