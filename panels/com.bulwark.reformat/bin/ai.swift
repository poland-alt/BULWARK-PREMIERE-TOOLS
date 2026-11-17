// Bulwark on-device assistant: one question to Apple Intelligence (the model built into macOS 26), nothing leaves the Mac.
// usage: ai <prompt.json {"system": "...", "user": "..."}> <out.json>     or     ai check <out.json>
// Writes {"text": "..."} or {"error": "..."}.
import Foundation
import FoundationModels

func finish(_ out: String, _ obj: [String: Any], _ code: Int32) -> Never {
    if let d = try? JSONSerialization.data(withJSONObject: obj) { try? d.write(to: URL(fileURLWithPath: out)) }
    print(obj["error"] as? String ?? "OK")
    exit(code)
}

@main
struct Main {
    static func main() async {
        let a = CommandLine.arguments
        guard a.count >= 3 else { print("usage: ai <prompt.json> <out.json>"); exit(2) }
        let out = a[2]
        guard #available(macOS 26.0, *) else { finish(out, ["error": "Apple Intelligence needs macOS 26 or later."], 3) }
        switch SystemLanguageModel.default.availability {
        case .available: break
        case .unavailable(let why):
            var msg = "Apple Intelligence is not available on this Mac."
            switch why {
            case .appleIntelligenceNotEnabled: msg = "Apple Intelligence is switched off. Turn it on in System Settings > Apple Intelligence & Siri."
            case .deviceNotEligible: msg = "This Mac cannot run Apple Intelligence."
            case .modelNotReady: msg = "Apple Intelligence is still downloading its model. Try again in a few minutes."
            @unknown default: break
            }
            finish(out, ["error": msg], 4)
        }
        if a[1] == "check" { finish(out, ["text": "ok"], 0) }
        guard let d = FileManager.default.contents(atPath: a[1]), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let system = j["system"] as? String, let user = j["user"] as? String else { finish(out, ["error": "The question could not be read."], 2) }
        do {
            let session = LanguageModelSession(instructions: system)
            let r = try await session.respond(to: user, options: GenerationOptions(temperature: 0.2))
            finish(out, ["text": r.content], 0)
        } catch {
            finish(out, ["error": "Apple Intelligence could not answer: \(error.localizedDescription)"], 1)
        }
    }
}
