// Bulwark transcriber: word-timed transcript of an audio file, on this Mac (Apple SpeechAnalyzer, macOS 26+).
// usage: transcribe <audio file> <output json> [tight]
// Writes {"words":[{"s":start,"e":end,"w":"text"}...],"timed":share of words with tight timing} or {"error":"..."}.
//
// Two recognisers run over the same audio. SpeechTranscriber hears the words best but its word times include the
// silence before a word (a word after a pause "starts" when the pause does). DictationTranscriber mishears more
// but times each word tightly. So the words come from the first and the times from the second wherever they agree
// on a word; the words in between are spaced between those anchors.
import Foundation
import AVFoundation
import Speech

struct W { var s: Double; var e: Double; var w: String }

func finish(_ out: String, _ obj: [String: Any], _ code: Int32) -> Never {
    if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: URL(fileURLWithPath: out)) }
    print(obj["error"] as? String ?? "OK")
    exit(code)
}
func key(_ s: String) -> String { return String(s.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }) }

@available(macOS 26.0, *)
func collect<S: AsyncSequence>(_ results: S, _ text: @escaping (S.Element) -> AttributedString) async throws -> [W] {
    var words: [W] = []
    for try await r in results {
        let t = text(r)
        for run in t.runs {
            guard let tr = run.audioTimeRange else { continue }
            let parts = String(t[run.range].characters).split(whereSeparator: { $0 == " " || $0 == "\n" }).map(String.init).filter { !key($0).isEmpty }
            if parts.isEmpty { continue }
            let s = tr.start.seconds, d = (tr.end.seconds - s) / Double(parts.count)     // "a lot" in one run: share its time
            for (i, p) in parts.enumerated() { words.append(W(s: s + d * Double(i), e: s + d * Double(i + 1), w: p)) }
        }
    }
    return words
}

// Words from `a`, times from `b` where both heard the same word at about the same moment.
func alike(_ x: String, _ y: String) -> Bool {            // "starlink"/"starling", "they've"/"they"
    if x == y { return true }
    let n = zip(x, y).prefix { $0 == $1 }.count
    return n >= 3 && Double(n) >= 0.6 * Double(min(x.count, y.count))
}
func merge(_ a: [W], _ b0: [W]) -> ([W], Double) {
    if a.isEmpty || b0.isEmpty { return (a, 0) }
    var b: [W] = []                                    // "Ukraine" + "'s" arrive as two pieces: join them
    for w in b0 { if w.w.hasPrefix("'") || w.w.hasPrefix("\u{2019}"), var p = b.popLast() { p.w += w.w; p.e = w.e; b.append(p) } else { b.append(w) } }
    let lead = 0.04                                    // the tight times run a touch early
    var out = a, at = [Int](repeating: -1, count: a.count), j = 0
    let bk = b.map { key($0.w) }
    for i in 0..<a.count {
        // the word really starts inside the stretch the first recogniser gave it (which begins early, ends about right)
        let k = key(a[i].w); var m = -1, near = -1
        while j < b.count && b[j].s < a[i].s - 0.25 { j += 1 }
        var n = j
        while n < b.count && b[n].s <= a[i].e + 0.1 {
            if bk[n] == k { m = n; break }
            if near < 0 && alike(bk[n], k) { near = n }
            n += 1
        }
        if m < 0 { m = near }
        if m >= 0 { at[i] = m; j = m + 1 }
    }
    var i = 0
    while i < a.count {                                // stretches where they disagree
        if at[i] >= 0 { i += 1; continue }
        var r = i; while r < a.count && at[r] < 0 { r += 1 }
        let lo = i > 0 ? at[i - 1] + 1 : 0, hi = r < a.count ? at[r] : b.count
        if hi - lo == r - i { for q in i..<r { at[q] = lo + (q - i) } }      // same number of words: pair them off in order
        i = r
    }
    for q in 0..<a.count where at[q] >= 0 { out[q].s = b[at[q]].s + lead; out[q].e = b[at[q]].e + lead }
    i = 0
    while i < a.count {                                // what is left keeps its own spacing, squeezed between its neighbours
        if at[i] >= 0 { i += 1; continue }
        var r = i; while r < a.count && at[r] < 0 { r += 1 }
        let l = i - 1
        let s0 = l >= 0 ? a[l].e : a[i].s, s1 = r < a.count ? a[r].s : a[r - 1].e
        let t0 = l >= 0 ? out[l].e : a[i].s, t1 = r < a.count ? out[r].s : t0 + (s1 - s0)
        let scale = s1 > s0 && t1 > t0 ? (t1 - t0) / (s1 - s0) : 1
        for q in i..<r { out[q].s = t0 + (a[q].s - s0) * scale; out[q].e = t0 + (a[q].e - s0) * scale }
        // Their ends are about right but they start early (the pause before a word counts as the word):
        // a word that comes out far longer than it could be said starts late in its stretch, not at the front.
        for q in i..<r {
            let most = 0.15 + 0.08 * Double(key(a[q].w).count)
            if out[q].e - out[q].s > most { out[q].s = out[q].e - most }
        }
        i = r
    }
    for q in 0..<out.count {                           // even the tight times can swallow a long pause before a word
        let most = 0.15 + 0.08 * Double(key(out[q].w).count)
        if out[q].e - out[q].s > 2 * most { out[q].s = out[q].e - most }
    }
    for q in 0..<out.count {                           // keep it strictly in order
        if q > 0 && out[q].s < out[q - 1].s + 0.03 { out[q].s = out[q - 1].s + 0.03 }
        if q > 0 && out[q - 1].e > out[q].s { out[q - 1].e = out[q].s }
        if out[q].e < out[q].s + 0.03 { out[q].e = out[q].s + 0.03 }
    }
    return (out, Double(at.filter { $0 >= 0 }.count) / Double(a.count))
}

@main
struct Main {
    static func main() async {
        let a = CommandLine.arguments
        guard a.count >= 3 else { print("usage: transcribe <audio> <out.json>"); exit(2) }
        let out = a[2]
        guard #available(macOS 26.0, *) else { finish(out, ["error": "Transcribing needs macOS 26 or later on this Mac."], 3) }
        do {
            let locale = Locale(identifier: "en-US"), url = URL(fileURLWithPath: a[1])
            let speech = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange])
            let dictation = DictationTranscriber(locale: locale, contentHints: [], transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange])
            if let req = try await AssetInventory.assetInstallationRequest(supporting: [speech, dictation]) { try await req.downloadAndInstall() }

            @Sendable func run(_ module: any SpeechModule, _ words: Task<[W], Error>) async throws -> [W] {
                let analyzer = SpeechAnalyzer(modules: [module])
                let file = try AVAudioFile(forReading: url)
                if let last = try await analyzer.analyzeSequence(from: file) { try await analyzer.finalizeAndFinish(through: last) }
                else { await analyzer.cancelAndFinishNow() }
                return try await words.value
            }
            func r(_ x: Double) -> Double { return (x * 1000).rounded() / 1000 }
            func js(_ ws: [W]) -> [[String: Any]] { return ws.map { ["s": r($0.s), "e": r($0.e), "w": $0.w] } }
            if a.count > 3 && a[3] == "tight" {        // only the tightly timed words: the panel pairs them with WhisperKit's words
                finish(out, ["words": js(try await run(dictation, Task { try await collect(dictation.results) { $0.text } }))], 0)
            }
            async let heard = run(speech, Task { try await collect(speech.results) { $0.text } })
            async let timed = run(dictation, Task { try await collect(dictation.results) { $0.text } })
            let h = try await heard, t = (try? await timed) ?? []
            let (words, share) = merge(h, t)
            var res: [String: Any] = ["words": js(words), "timed": r(share)]
            if a.count > 3 && a[3] == "debug" { res["heard"] = js(h); res["tight"] = js(t) }
            finish(out, res, 0)
        } catch {
            finish(out, ["error": "Transcription failed: \(error.localizedDescription)"], 1)
        }
    }
}
