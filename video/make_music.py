"""Generate the demo video's background track with Vultr Serverless Inference (ACE-Step)."""
import json, os, sys, time, urllib.request

BASE = "https://api.vultrinference.com/v1"
KEY = os.environ["VULTR_INFERENCE_API_KEY"]
OUT = sys.argv[1]  # usage: VULTR_INFERENCE_API_KEY=... python3 video/make_music.py video/work/music.mp3
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def call(method, path, body=None, raw=False):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None, method=method, headers=H)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
        return data if raw else json.loads(data)


job = call("POST", "/music", {
    "model": "ace-step-1.5",
    "prompt": "warm playful lo-fi hip hop instrumental for a friendly tech product demo, soft electric piano chords, mellow round bass, "
              "light brushed drums, gentle marimba and kalimba accents, calm and optimistic, cozy hot spring vibe, clean modern mix, no vocals",
    "instrumental": True, "duration": 200, "bpm": 88, "key": "F major", "time_signature": "4/4",
    "quality": "hifi", "response_format": "mp3", "seed": 4242,
})
jid = job["id"]
print("job", jid, job.get("status"), flush=True)
for _ in range(120):
    time.sleep(10)
    j = call("GET", f"/music/{jid}")
    st = j.get("status")
    print("status", st, flush=True)
    if st in ("completed", "succeeded", "done"):
        break
    if st in ("failed", "cancelled", "expired"):
        raise SystemExit(json.dumps(j)[:600])
audio = call("GET", f"/music/{jid}/content", raw=True)
open(OUT, "wb").write(audio)
print("saved", OUT, len(audio), "bytes")
