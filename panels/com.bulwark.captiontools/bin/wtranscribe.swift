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
    var words: [[String: Any]] = []
    for r in results { for w in r.allWords {
        let t = w.word.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { continue }
        words.append(["s": (Double(w.start) * 1000).rounded() / 1000, "e": (Double(w.end) * 1000).rounded() / 1000, "w": t])
    } }
    words.sort { ($0["s"] as! Double) < ($1["s"] as! Double) }
    finish(out, ["words": words, "timed": 1, "loadSecs": t1.timeIntervalSince(t0), "runSecs": Date().timeIntervalSince(t1)], 0)
} catch {
    finish(out, ["error": "Transcription failed: \(error.localizedDescription)"], 1)
}
