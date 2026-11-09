import os, subprocess, hashlib, urllib.parse, json
from scripts_data import VERSIONS
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo"); os.makedirs(D, exist_ok=True)
out = {}
for vid, _, beats in VERSIONS:
    for bid, text in beats:
        h = hashlib.sha1(text.encode()).hexdigest()[:10]
        f = os.path.join(D, f"{h}.mp3")
        if not os.path.exists(f) or os.path.getsize(f) < 1000:
            url = "https://jomm.onrender.com/api/voice?" + urllib.parse.urlencode({"role": "agent", "text": text})
            subprocess.run(["curl", "-sf", "-o", f, url], check=True)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).decode())
        out[f"{vid}/{bid}"] = {"file": f"{h}.mp3", "dur": round(dur, 3)}
json.dump(out, open(os.path.join(D, "index.json"), "w"), indent=1)
for vid, name, beats in VERSIONS:
    tot = sum(out[f"{vid}/{b}"]["dur"] for b, _ in beats)
    print(vid, name, "speech", round(tot, 1), "s, with gaps ~", round(tot + 0.55 * len(beats) + 2, 1))
