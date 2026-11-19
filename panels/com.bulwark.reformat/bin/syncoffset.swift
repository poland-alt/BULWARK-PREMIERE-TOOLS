// syncoffset: where each recording starts on a master recording's clock, found from the sound.
//
//   syncoffset <out.json> <master> <recording> [<recording> ...]
//
// For each recording the answer is `offset`: the master time, in seconds, at which that recording's first sample
// plays (negative if the recording started before the master did). Writes progress lines to stdout and the result
// to <out.json>:
//   { "master": { "path", "duration" }, "items": [ { "path", "duration", "offset", "score", "check", "ok" } ] }
// `score` is how far the best match stands above the rest (in standard deviations); `check` is the same answer
// worked out again from a later stretch of the recording, so a wrong match or a recording that drifts shows up.
//
// Method: both are read as 8 kHz mono. A coarse pass lines up the rise and fall of loudness (100 points a second)
// across the whole master with one FFT; a fine pass then slides the waveforms themselves over the last few
// hundredths of a second.

import Foundation
import AVFoundation
import Accelerate

let RATE = 8000.0
let HOP = 80                         // 10 ms

func say(_ s: String) { print(s); fflush(stdout) }

func decode(_ path: String) throws -> [Float] {
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    guard let track = asset.tracks(withMediaType: .audio).first else {
        throw NSError(domain: "syncoffset", code: 1, userInfo: [NSLocalizedDescriptionKey: "No sound in \((path as NSString).lastPathComponent)"])
    }
    let reader = try AVAssetReader(asset: asset)
    let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: RATE, AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
    ]
    let out = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    out.alwaysCopiesSampleData = false
    reader.add(out)
    guard reader.startReading() else { throw reader.error ?? NSError(domain: "syncoffset", code: 2) }
    var samples = [Float]()
    samples.reserveCapacity(Int(CMTimeGetSeconds(asset.duration) * RATE) + 8000)
    while let buf = out.copyNextSampleBuffer() {
        guard let block = CMSampleBufferGetDataBuffer(buf) else { continue }
        var len = 0
        var ptr: UnsafeMutablePointer<Int8>?
        if CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr) == noErr, let p = ptr {
            p.withMemoryRebound(to: Float.self, capacity: len / 4) { samples.append(contentsOf: UnsafeBufferPointer(start: $0, count: len / 4)) }
        }
    }
    if reader.status == .failed { throw reader.error ?? NSError(domain: "syncoffset", code: 3) }
    return samples
}

// How sharply the loudness rises, 100 times a second: what survives a different microphone mix and level.
func onsets(_ x: [Float]) -> [Float] {
    let n = x.count / HOP
    if n < 2 { return [] }
    var e = [Float](repeating: 0, count: n)
    x.withUnsafeBufferPointer { p in
        for i in 0..<n { var s: Float = 0; vDSP_svesq(p.baseAddress! + i * HOP, 1, &s, vDSP_Length(HOP)); e[i] = log(s / Float(HOP) + 1e-9) }
    }
    var d = [Float](repeating: 0, count: n)
    for i in 1..<n { d[i] = max(0, e[i] - e[i - 1]) }
    var mean: Float = 0
    vDSP_meanv(d, 1, &mean, vDSP_Length(n))
    var neg = -mean
    vDSP_vsadd(d, 1, &neg, &d, 1, vDSP_Length(n))
    return d
}

// Cross-correlation of `a` (long) with `b` (short) at every lag 0...(a.count - 1), by FFT. corr[k] = sum a[k+i] * b[i]
func correlate(_ a: [Float], _ b: [Float]) -> [Float] {
    let need = a.count + b.count
    var log2n = 1
    while (1 << log2n) < need { log2n += 1 }
    let n = 1 << log2n, half = n / 2
    guard let setup = vDSP_create_fftsetup(vDSP_Length(log2n), FFTRadix(kFFTRadix2)) else { return [] }
    defer { vDSP_destroy_fftsetup(setup) }
    func spectrum(_ x: [Float]) -> ([Float], [Float]) {
        var pad = [Float](repeating: 0, count: n)
        pad.replaceSubrange(0..<x.count, with: x)
        var re = [Float](repeating: 0, count: half), im = [Float](repeating: 0, count: half)
        re.withUnsafeMutableBufferPointer { rp in im.withUnsafeMutableBufferPointer { ip in
            var split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
            pad.withUnsafeBufferPointer { pp in
                pp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { vDSP_ctoz($0, 2, &split, 1, vDSP_Length(half)) }
            }
            vDSP_fft_zrip(setup, &split, 1, vDSP_Length(log2n), FFTDirection(FFT_FORWARD))
        } }
        return (re, im)
    }
    var (ar, ai) = spectrum(a)
    var (br, bi) = spectrum(b)
    // a * conj(b); in the packed real FFT the first slot holds two real terms (DC in re, Nyquist in im)
    let dc = ar[0] * br[0], ny = ai[0] * bi[0]
    var outR = [Float](repeating: 0, count: half), outI = [Float](repeating: 0, count: half)
    ar.withUnsafeMutableBufferPointer { arp in ai.withUnsafeMutableBufferPointer { aip in
    br.withUnsafeMutableBufferPointer { brp in bi.withUnsafeMutableBufferPointer { bip in
    outR.withUnsafeMutableBufferPointer { orp in outI.withUnsafeMutableBufferPointer { oip in
        var A = DSPSplitComplex(realp: arp.baseAddress!, imagp: aip.baseAddress!)
        var B = DSPSplitComplex(realp: brp.baseAddress!, imagp: bip.baseAddress!)
        var O = DSPSplitComplex(realp: orp.baseAddress!, imagp: oip.baseAddress!)
        vDSP_zvmul(&B, 1, &A, 1, &O, 1, vDSP_Length(half), -1)          // conj(B) * A
        orp[0] = dc; oip[0] = ny
        vDSP_fft_zrip(setup, &O, 1, vDSP_Length(log2n), FFTDirection(FFT_INVERSE))
    } } } } } }
    var res = [Float](repeating: 0, count: n)
    outR.withUnsafeMutableBufferPointer { orp in outI.withUnsafeMutableBufferPointer { oip in
        var O = DSPSplitComplex(realp: orp.baseAddress!, imagp: oip.baseAddress!)
        res.withUnsafeMutableBufferPointer { rp in
            rp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) { vDSP_ztoc(&O, 1, $0, 2, vDSP_Length(half)) }
        }
    } }
    return res                        // unscaled: only the place of the peak and its standing matter
}

struct Match { var offset: Double; var score: Double }

// Where a stretch of the recording (starting `from` seconds in, `length` seconds long) sits on the master.
// Lags run from -(stretch length) to master length, so a recording that began before the master is found too.
func locate(masterOn: [Float], master: [Float], rec: [Float], recOn: [Float], from: Double, length: Double) -> Match? {
    let f0 = Int(from * 100), f1 = min(recOn.count, f0 + Int(length * 100))
    if f1 - f0 < 1500 { return nil }                                  // under 15 s: not enough to go on
    let chunk = Array(recOn[f0..<f1])
    let lead = chunk.count                                            // quiet put in front of the master, for negative lags
    let padded = [Float](repeating: 0, count: lead) + masterOn
    let corr = correlate(padded, chunk)
    let usable = padded.count
    if corr.count < usable { return nil }
    var peak: Float = 0
    var at: vDSP_Length = 0
    corr.withUnsafeBufferPointer { vDSP_maxvi($0.baseAddress!, 1, &peak, &at, vDSP_Length(usable)) }
    var mean: Float = 0, meanSq: Float = 0
    corr.withUnsafeBufferPointer { vDSP_meanv($0.baseAddress!, 1, &mean, vDSP_Length(usable)); vDSP_measqv($0.baseAddress!, 1, &meanSq, vDSP_Length(usable)) }
    let sd = max(0, meanSq - mean * mean).squareRoot()
    let score = sd > 0 ? Double((peak - mean) / sd) : 0
    // master frame where the stretch starts, then back to where the recording's own start would be
    var start = (Double(Int(at) - lead) - Double(f0)) / 100.0

    // fine pass: slide 20 s of waveform over +/- 40 ms around the coarse answer
    let s0 = Int(from * RATE) + Int(5 * RATE), sn = Int(20 * RATE)
    if s0 + sn <= rec.count {
        let m0 = Int((start * RATE).rounded()) + s0, span = Int(0.04 * RATE)
        if m0 - span >= 0 && m0 + span + sn <= master.count {
            var best: Float = -Float.greatestFiniteMagnitude, bestLag = 0
            rec.withUnsafeBufferPointer { rp in master.withUnsafeBufferPointer { mp in
                for lag in -span...span {
                    var d: Float = 0
                    vDSP_dotpr(rp.baseAddress! + s0, 1, mp.baseAddress! + m0 + lag, 1, &d, vDSP_Length(sn))
                    if abs(d) > best { best = abs(d); bestLag = lag }          // a flipped-polarity feed still lines up
                }
            } }
            start = Double(Int((start * RATE).rounded()) + bestLag) / RATE
        }
    }
    return Match(offset: start, score: score)
}

func jsonString(_ s: String) -> String {
    let d = try! JSONSerialization.data(withJSONObject: [s], options: [])
    let t = String(data: d, encoding: .utf8)!
    return String(t.dropFirst().dropLast())
}

// Where the sound in a recording starts and stops: for media recorded on the same clock as everything else, which
// sits black and silent until the moment it was played.
//   syncoffset --sound <out.json> <file> [<file> ...]   ->   { "items": [ { "path", "duration", "start", "end", "ok" } ] }
// Sound is anything within 45 dB of the file's loudest moment (and above -60 dB), lasting at least 0.15 s.
func soundSpan(_ x: [Float]) -> (Double, Double)? {
    let n = x.count / HOP
    if n < 20 { return nil }
    var e = [Float](repeating: 0, count: n)
    x.withUnsafeBufferPointer { p in
        for i in 0..<n { var s: Float = 0; vDSP_measqv(p.baseAddress! + i * HOP, 1, &s, vDSP_Length(HOP)); e[i] = 10 * log10(s + 1e-12) }
    }
    var peak: Float = -200
    vDSP_maxv(e, 1, &peak, vDSP_Length(n))
    let floor = max(peak - 45, -60)
    if peak < -60 { return nil }
    let need = 15                                      // 0.15 s of it in a row
    var first = -1, last = -1, run = 0
    for i in 0..<n {
        if e[i] > floor { run += 1; if run >= need { if first < 0 { first = i - need + 1 }; last = i } } else { run = 0 }
    }
    if first < 0 { return nil }
    return (Double(first) * Double(HOP) / RATE, Double(last + 1) * Double(HOP) / RATE)
}

let args = CommandLine.arguments
if args.count >= 4 && args[1] == "--sound" {
    var rows = [String]()
    for p in args[3...] {
        say("read|" + (p as NSString).lastPathComponent)
        guard let x = try? decode(p) else { rows.append("{\"path\":\(jsonString(p)),\"ok\":false}"); continue }
        let dur = Double(x.count) / RATE
        if let span = soundSpan(x) { rows.append(String(format: "{\"path\":%@,\"duration\":%.3f,\"start\":%.3f,\"end\":%.3f,\"ok\":true}", jsonString(p), dur, span.0, span.1)) }
        else { rows.append(String(format: "{\"path\":%@,\"duration\":%.3f,\"ok\":false}", jsonString(p), dur)) }
    }
    try? "{\"items\":[\(rows.joined(separator: ","))]}".write(toFile: args[2], atomically: true, encoding: .utf8)
    say("done")
    exit(0)
}
if args.count < 4 {
    FileHandle.standardError.write("usage: syncoffset <out.json> <master> <recording> [<recording> ...]\n".data(using: .utf8)!)
    exit(2)
}
let outPath = args[1], masterPath = args[2], recPaths = Array(args[3...])
func fail(_ msg: String) -> Never {
    try? "{\"error\":\(jsonString(msg))}".write(toFile: outPath, atomically: true, encoding: .utf8)
    say("error|" + msg)
    exit(1)
}

say("read|" + (masterPath as NSString).lastPathComponent)
let master: [Float]
do { master = try decode(masterPath) } catch { fail("Could not read the master recording: \(error.localizedDescription)") }
if master.count < Int(30 * RATE) { fail("The master recording has under 30 seconds of sound.") }
let masterOn = onsets(master)

var items = [String]()
for (i, p) in recPaths.enumerated() {
    let name = (p as NSString).lastPathComponent
    say("read|" + name)
    let rec: [Float]
    do { rec = try decode(p) } catch {
        items.append("{\"path\":\(jsonString(p)),\"ok\":false,\"error\":\(jsonString(error.localizedDescription))}")
        continue
    }
    say("match|\(i + 1)|\(recPaths.count)|" + name)
    let dur = Double(rec.count) / RATE
    let recOn = onsets(rec)
    // a stretch from early on (past any dead air at the very start) and one from two thirds of the way through
    let len = min(600.0, max(15.0, dur * 0.4))
    let firstFrom = dur > len + 90 ? 60.0 : 0.0
    let first = locate(masterOn: masterOn, master: master, rec: rec, recOn: recOn, from: firstFrom, length: len)
    let lateFrom = max(firstFrom, dur * 0.62)
    let late = lateFrom + 30 < dur && lateFrom > firstFrom + len * 0.5 ? locate(masterOn: masterOn, master: master, rec: rec, recOn: recOn, from: lateFrom, length: min(len, dur - lateFrom)) : nil
    guard let m = first else {
        items.append("{\"path\":\(jsonString(p)),\"duration\":\(dur),\"ok\":false,\"error\":\"Too short to match.\"}")
        continue
    }
    // trusted when the match stands well clear of chance, and the later stretch (if there is one) agrees with it
    var ok = m.score >= 8
    var check = "null"
    if let l = late { check = String(format: "%.4f", l.offset); if abs(l.offset - m.offset) > 0.25 && l.score >= 8 { ok = false } }
    items.append(String(format: "{\"path\":%@,\"duration\":%.3f,\"offset\":%.4f,\"score\":%.1f,\"check\":%@,\"ok\":%@}", jsonString(p), dur, m.offset, m.score, check, ok ? "true" : "false"))
}
let json = String(format: "{\"master\":{\"path\":%@,\"duration\":%.3f},\"items\":[%@]}", jsonString(masterPath), Double(master.count) / RATE, items.joined(separator: ","))
do { try json.write(toFile: outPath, atomically: true, encoding: .utf8) } catch { fail("Could not write \(outPath)") }
say("done")
