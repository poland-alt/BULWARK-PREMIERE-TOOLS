// Bulwark transcriber (WhisperKit): word-timed transcript of an audio file, on this Mac.
// usage: wtranscribe <audio file> <output json> <model folder base> [model name]
// Writes {"words":[{"s":start,"e":end,"w":"text"}...],"timed":1} or {"error":"..."}.
import Foundation
import WhisperKit

func finish(_ out: String, _ obj: [String: Any], _ code: Int32) -> Never {
    if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: URL(fileURLWithPath: out)) }
    print(obj["error"] as? String ?? "OK")
    exit(code)
}
let a = CommandLine.arguments
guard a.count >= 4 else { print("usage: wtranscribe <audio> <out.json> <models dir> [model]"); exit(2) }
let out = a[2], model = a.count > 4 ? a[4] : "openai_whisper-large-v3-v20240930_turbo_632MB"
do {
    let t0 = Date()
    let pipe = try await WhisperKit(WhisperKitConfig(model: model, downloadBase: URL(fileURLWithPath: a[3]), verbose: false, logLevel: .error, prewarm: false, load: true, download: true))
    let t1 = Date()
    let opts = DecodingOptions(language: "en", skipSpecialTokens: true, wordTimestamps: true, chunkingStrategy: .vad)
    let results: [TranscriptionResult] = try await pipe.transcribe(audioPath: a[1], decodeOptions: opts)
    if ProcessInfo.processInfo.environment["BW_DEBUG"] != nil {
        for (i, r) in results.enumerated() { for sg in r.segments {
            let ps = (sg.words ?? []).map { $0.probability }
            FileHandle.standardError.write("res \(i) seg \(sg.start)-\(sg.end) logprob \(sg.avgLogprob) nospeech \(sg.noSpeechProb) comp \(sg.compressionRatio) minp \(ps.min() ?? -1) meanp \(ps.isEmpty ? -1 : ps.reduce(0, +) / Float(ps.count)) | \(sg.text)\n".data(using: .utf8)!)
        } }
    }
    // Whisper invents short phrases ("Thank you.") over silence or music, sometimes stamped inside another chunk's
    // speech. Such a segment has unsure words: drop it when it is a stock phrase or lands on top of confident speech.
    struct Seg { var res: Int; var s: Float; var e: Float; var p: Float; var text: String; var words: [WordTiming] }
    var segs: [Seg] = []
    for (i, r) in results.enumerated() { for sg in r.segments {
        let ws = (sg.words ?? []).filter { !$0.word.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if ws.isEmpty { continue }
        segs.append(Seg(res: i, s: ws.first!.start, e: ws.last!.end, p: ws.map { $0.probability }.reduce(0, +) / Float(ws.count), text: sg.text, words: ws))
    } }
    let stock: Set<String> = ["thankyou", "thankyouforwatching", "thanksforwatching", "thankyouverymuch", "you", "bye", "byebye", "thanks", "okay", "so"]
    func plain(_ t: String) -> String { return String(t.lowercased().unicodeScalars.filter { CharacterSet.letters.contains($0) }) }
    var words: [[String: Any]] = []
    for (n, sg) in segs.enumerated() {
        if sg.p < 0.75 {
            let onTop = segs.enumerated().contains { m, o in m != n && o.res != sg.res && o.p >= 0.75 && o.s < sg.e && sg.s < o.e }
            if onTop || stock.contains(plain(sg.text)) { continue }
        }
        for w in sg.words {
            let t = w.word.trimmingCharacters(in: .whitespacesAndNewlines), e = (Double(w.end) * 1000).rounded() / 1000
            if (t.hasPrefix("-") || t.hasPrefix("%")), w.start >= sg.s, var last = words.popLast() {      // "26" + "-year" is one word
                last["w"] = (last["w"] as! String) + t; last["e"] = e; words.append(last); continue
            }
            words.append(["s": (Double(w.start) * 1000).rounded() / 1000, "e": e, "w": t])
        }
    }
    words.sort { ($0["s"] as! Double) < ($1["s"] as! Double) }
    finish(out, ["words": words, "timed": 1, "loadSecs": t1.timeIntervalSince(t0), "runSecs": Date().timeIntervalSince(t1)], 0)
} catch {
    finish(out, ["error": "Transcription failed: \(error.localizedDescription)"], 1)
}
