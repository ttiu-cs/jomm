#!/usr/bin/env python3
"""Builds the three full-length style C versions: python3 build_full.py [v1 v2 v3]"""
import os, sys, json, shutil, subprocess, re
from lib import *
from scripts_data import VERSIONS
HERE = os.path.dirname(os.path.abspath(__file__)); V = os.path.dirname(HERE); REPO = os.path.dirname(V)
VO = json.load(open(os.path.join(HERE, "vo", "index.json")))

def cam(fx, fy, s):
    """translate so (fx, fy) of the 1920x1080 frame is centred at scale s, clamped to keep the frame covered."""
    tx = -(fx - 960) * s; ty = -(fy - 540) * s
    mx = 960 * (s - 1); my = 540 * (s - 1)
    return round(max(-mx, min(mx, tx))), round(max(-my, min(my, ty)))
def C(t, d, fx, fy, s, ease="power2.inOut"):
    x, y = cam(fx, fy, s); return (t, d, s, x, y, ease)

# footage shorthands (file, mstart, length-in-source) -------------------------
DEAL, POP, REX, TEACH, CLOSET, FRUIT = "rec/deal.mp4", "rec/popup.mp4", "rec/rex.mp4", "rec/teach.mp4", "rec/closet.mp4", "rec/fruitphone.mp4"
NOTE_ROSA = [("$2.89 / lb", 1.6, 140, 640), ("never below $2.35 🔒", 3.2, 140, 730), ("supermarket: $3.49", 5.0, 140, 820), ("keeps two weeks", 6.6, 140, 910)]
NOTE_MINA = [("new on Channel3: $63–$85", 1.8, 820, 640), ("fair resale: $13–$19", 3.6, 820, 730), ("lowest $14 🔒", 5.2, 820, 820)]

def seq(*parts):
    """parts: (src, mstart, src_len, rate) placed back to back from t=0.2. returns segs + end time."""
    t = 0.0; segs = []
    for src, ms, ln, r in parts:
        d = round(ln / r, 2); segs.append((src, round(t, 2), d, ms, r)); t += d
    return segs, t

def b_intent(s, chapter=None, cap="A shopper types what they want. Their own AI agent takes it from here."):
    segs, _ = seq((DEAL, 0.3, 4.9, 1.0), (DEAL, 7.2, 30, 1.0))
    k_screen(s, segs, cams=[C(0, 0, 950, 880, 1.55), C(4.9, 0, 440, 480, 1.45)], caps=[(1.0, 4.4, cap)], chapter=chapter)

def b_haggle(s, chapter=None, caps=None):
    segs, _ = seq((DEAL, 9.5, 19, 1.25), (DEAL, 28.5, 10, 1.0))
    d = s.dur
    k_screen(s, segs, cams=[C(0, 0, 440, 520, 1.5), C(d * 0.33, 0.8, 1040, 380, 1.65), C(d * 0.62, 0.8, 440, 760, 1.5)],
             caps=caps or [(0.5, d * 0.33 - 0.6, "The shopper’s OpenAI agent haggles with Rosa’s agent"),
                           (d * 0.33 + 0.3, d * 0.29 - 0.5, "Every call: an ACP-style checkout session, PayPal as payment provider"),
                           (d * 0.62 + 0.3, d * 0.38 - 0.6, "🔒 Rosa’s lowest price never leaves her side")], chapter=chapter)

def b_approve(s, chapter=None):
    segs, _ = seq((DEAL, 24.2, 3.0, 1.0), (POP, 3.8, 1.0, 1.0), (POP, 5.8, 1.3, 1.0), (DEAL, 42.6, 20, 1.0))
    k_screen(s, segs, cams=[C(0, 0, 440, 860, 1.55), C(3.2, 0, 960, 330, 1.6), C(5.5, 0, 440, 860, 1.5), C(7.4, 0.9, 1040, 330, 1.6)],
             caps=[(0.3, 2.8, "Agents can’t pay on their own"), (3.3, 2.1, "The shopper approves in PayPal"), (5.7, s.dur - 7.6, "PayPal Orders v2: created server-side, amount from the locked deal")], tag=True, chapter=chapter)

def b_paid(s, chapter=None):
    segs, _ = seq((DEAL, 44.0, 20, 1.0))
    k_screen(s, segs, cams=[C(0, 0, 1040, 420, 1.65), C(s.dur * 0.45, 0.9, 1550, 420, 1.7)],
             caps=[(0.3, s.dur * 0.45 - 0.4, "Captured · verified · checked with the PayPal Agent Toolkit (get_order)"), (s.dur * 0.45 + 0.4, s.dur * 0.55 - 0.7, "Rosa’s phone: “You received $16.35”")], tag=True, chapter=chapter)

def b_rex(s, chapter=None):
    segs, _ = seq((REX, 21.0, 12, 1.3))
    k_screen(s, segs, cams=[C(0, 0, 440, 760, 1.5), C(s.dur * 0.55, 0.8, 1550, 420, 1.6)],
             caps=[(0.3, s.dur - 0.6, "A lowball agent: Rosa’s agent holds the line. No deal, nothing charged.")], chapter=chapter)

def lg(f, h, text=""):
    t = f'<strong style="font-family:Inter,sans-serif;font-weight:700;font-size:{int(h*0.9)}px;letter-spacing:-0.02em;color:#2b211a;margin-left:12px">{text}</strong>' if text else ""
    return f'<div style="display:flex;align-items:center;height:64px;margin:6px 0 2px"><img src="assets/img/{f}" alt="{text or f}" style="height:{h}px;width:auto" />{t}</div>'
STACK = [(0.6, lg("paypal.svg", 56), "Orders v2 · Agent Toolkit · ACP-style checkout sessions", "pays"),
         (1.2, lg("openai.svg", 44), "the shopper’s buyer agent, with tool calling", "shops"),
         (1.8, lg("channel3.png", 46, "Channel3"), "new-item prices for second-hand goods", "prices"),
         (2.4, lg("render.svg", 40, "Render"), "deployed live at jomm.onrender.com", "runs")]

# ---------------------------------------------------------------- versions
def v1(b, s):
    if b == "hook": k_photo(s, [("gen-flower.jpg", 0, "50% 50%")], title="Shopping is changing.", sub="Soon, people won’t browse. They’ll send an AI agent to shop for them.", top=360, sub_at=1.4)
    elif b == "big": k_cards(s, "big retailers have", "They’ll plug into AI shopping fast.", [(1.2, "Catalog APIs", "products, stock and prices for agents", "1"), (1.8, "Checkout", "integrations with agent protocols", "2"), (2.4, "Tech teams", "engineers to build and run it", "3")])
    elif b == "small": k_photo(s, [("gen-dawn.jpg", 0, "50% 50%"), ("gen-closet.jpg", 3.3, "50% 40%"), ("gen-ceramics.jpg", 4.4, "50% 40%")], title="But most of the world’s sellers are small.", top=110, size=56,
                              notes=[("a fruit stall.", 2.1, 1.2, 140, 820), ("a closet.", 3.3, 1.1, 140, 820), ("one person.", 4.4, None, 140, 820)], sub="No website. No tech team.", sub_at=6.0)
    elif b == "mission": k_photo(s, [("gen-foodcart.jpg", 0, "50% 50%")], kicker="our mission", title="Every small seller, ready for the *AI era.*", sub="PayPal has always believed everyone deserves a place in the digital economy. We’re carrying that into the age of AI agents.", top=330, sub_at=0.3, title_at=4.2)
    elif b == "promise": k_photo(s, [("apples-box.jpg", 0, "50% 60%")], title="Your own AI selling agent. *In minutes. Just by talking.*", sub="No code. No website. No forms.", top=340, sub_at=3.6)
    elif b == "rosa": k_phone(s, FRUIT, 8, 1.6, title="Rosa teaches her stall by talking.", sub="Her agent asks until it can haggle like her.", notes=NOTE_ROSA[:2] + [("supermarket: $3.49", 6.5, 140, 820), ("keeps two weeks", 9.0, 140, 910)])
    elif b == "mina": k_phone(s, CLOSET, 9, 1.25, title="Mina’s closet, priced with Channel3.", sub="New prices online → a fair resale range.", notes=NOTE_MINA, left=False)
    elif b == "intent": b_intent(s)
    elif b == "haggle": b_haggle(s)
    elif b == "approve": b_approve(s)
    elif b == "paid": b_paid(s)
    elif b == "rex": b_rex(s)
    elif b == "stack": k_cards(s, "built with", "Real rails. Real agents. Live.", STACK)
    elif b == "end": k_end(s, ["Every small seller, ready for the AI era.", "Teach your stall. It haggles with AI. PayPal pays."])

def v2(b, s):
    if b == "dawn": k_photo(s, [("gen-dawn.jpg", 0, "60% 50%"), ("strawberries-market.jpg", 4.2, "50% 50%")], kicker="6:00 a.m.", title="Rosa sets out three crates.", sub="No website. No app. No tech team.", top=400, sub_at=4.4)
    elif b == "shift": k_photo(s, [("seller-setup.jpg", 0, "50% 50%")], title="Her next customer might be an *AI agent.*", sub="And agents only talk to stores that speak their language.", top=380, sub_at=5.0)
    elif b == "mission": k_photo(s, [("hero-vendor.jpg", 0, "50% 30%"), ("gen-flower.jpg", 2.0, "50% 50%"), ("gen-ceramics.jpg", 3.8, "50% 40%"), ("gen-foodcart.jpg", 5.6, "50% 50%"), ("stall-live.jpg", 7.4, "50% 50%")], kicker="our mission", title="A place in the AI economy, *for every small seller.*", sub="PayPal believes everyone deserves a place in the digital economy. With Jomm, any small seller creates their own selling agent in minutes, just by talking.", top=330, sub_at=0.3, title_at=3.8)
    elif b == "teach": k_phone(s, FRUIT, 8, 1.7, title="She teaches her stall like a new helper.", notes=NOTE_ROSA, chapter="6:10 a.m.")
    elif b == "intent": b_intent(s, chapter="<b>2:00 p.m.</b>Jun’s agent", cap="Jun: “3 boxes of strawberries for a party tonight, under $17.”")
    elif b == "haggle": b_haggle(s, chapter="<b>2:01 p.m.</b>agents haggle", caps=[(0.5, s.dur * 0.33 - 0.6, "Jun’s agent finds Rosa’s stall through its product feed"), (s.dur * 0.33 + 0.3, s.dur * 0.29 - 0.5, "Strawberries must go tonight, so Rosa’s agent gives a little, with a reason"), (s.dur * 0.62 + 0.3, s.dur * 0.38 - 0.6, "🔒 Her lowest price stays private")])
    elif b == "approve": b_approve(s, chapter="<b>2:02 p.m.</b>Jun approves")
    elif b == "paid": b_paid(s, chapter="<b>2:02 p.m.</b>paid")
    elif b == "rex": b_rex(s, chapter="<b>4:00 p.m.</b>a lowball")
    elif b == "mina": k_phone(s, CLOSET, 9, 1.3, title="Across town, Mina does the same with her closet.", notes=NOTE_MINA, left=False, chapter="meanwhile")
    elif b == "stack": k_cards(s, "6:00 p.m.", "Built on PayPal’s rails.", STACK)
    elif b == "end": k_end(s, ["Teach your stall. It haggles with AI.", "…and PayPal pays."])

def v3(b, s):
    if b == "question": k_photo(s, [("gen-ceramics.jpg", 0, "50% 40%")], title="What would it take for a one-person shop to sell to an *AI agent?*", top=360)
    elif b == "today": k_cards(s, "today, it takes", "The smallest sellers have none of this.", [(0.8, "Catalog API", "so agents can read your products", "1"), (1.6, "Checkout integration", "in an agent protocol", "2"), (2.4, "Payments team", "to take the money safely", "3")])
    elif b == "mission": k_photo(s, [("gen-closet.jpg", 0, "50% 40%"), ("gen-foodcart.jpg", 4.0, "50% 50%")], kicker="our mission", title="Put every small seller on PayPal’s agentic rails. *Just by talking.*", sub="PayPal believes everyone deserves a place in the digital economy. That should include the AI economy.", top=300, title_at=0.3, sub_at=5.6, size=92)
    elif b == "steps": k_cards(s, "Jomm. in three steps", "Teach. Negotiate. Get paid.", [(1.0, "Teach", "camera + voice; Channel3 price check", "step 1"), (1.6, "Negotiate", "ACP-style checkout session + negotiation", "step 2"), (2.2, "Get paid", "PayPal Orders v2 · Agent Toolkit", "step 3")])
    elif b == "mina": k_phone(s, CLOSET, 9, 1.25, title="Mina points her phone at a Levi’s jacket.", notes=NOTE_MINA, left=False, chapter="step 1 · teach")
    elif b == "rosa":
        segs, _ = seq((TEACH, 20, 40, 3.0))
        k_screen(s, segs, cams=[C(0, 0, 960, 560, 1.12), C(s.dur * 0.45, 1.0, 1350, 420, 1.55)], caps=[(0.4, s.dur - 0.8, "Prices, a private lowest price 🔒, and her reasons")], chapter="<b>step 1</b>teach")
    elif b == "feed":
        segs, _ = seq((DEAL, 5.8, 14, 1.0))
        k_screen(s, segs, cams=[C(0, 0, 1040, 330, 1.7)], caps=[(0.4, s.dur - 0.8, "GET /agentic/feed: items, prices, the owner’s words. No floors.")], chapter="<b>step 2</b>negotiate")
    elif b == "checkout":
        segs, _ = seq((DEAL, 14, 12, 1.2), (DEAL, 56.3, 6.4, 1.0))
        k_screen(s, segs, cams=[C(0, 0, 1040, 420, 1.6), C(10.0, 0, 1040, 640, 1.7)], caps=[(0.4, 9.3, "POST /agentic/checkout_sessions · payment_provider: paypal · negotiation"), (10.1, s.dur - 10.4, "The checkout session, as the buyer agent sees it")], chapter="<b>step 2</b>negotiate")
    elif b == "guard":
        segs, _ = seq((DEAL, 8.5, 4, 1.0), (DEAL, 22, 6, 1.0))
        k_screen(s, segs, cams=[C(0, 0, 440, 560, 1.6), C(4.0, 0, 1550, 560, 1.6)], caps=[(0.3, 3.6, "The shopper’s budget: a mandate the server enforces"), (4.2, s.dur - 4.5, "Only Rosa sees why her agent priced it this way")], chapter="<b>guardrails</b>")
    elif b == "pay": b_approve(s, chapter="<b>step 3</b>get paid")
    elif b == "toolkit": b_paid(s, chapter="<b>step 3</b>verified")
    elif b == "stack": k_cards(s, "built with", "Try it live: jomm.onrender.com", STACK)
    elif b == "end": k_end(s, ["Every small seller, ready for the AI era.", "Teach your stall. It haggles with AI. PayPal pays."])

def v4(b, s):
    if b == "mission":
        v2(b, s)
        s.css.append("""
    .pp-pill { position: absolute; left: 140px; top: 590px; padding: 14px 26px; border-radius: 18px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
    .pp-pill img { display: block; height: 52px; }
    .jm-logo { position: absolute; left: 136px; top: 120px; font-size: 120px; color: #fff; }""")
        pp = s.el("div", "pp-pill", '<img src="assets/img/paypal.svg" alt="PayPal" />', 0.0, 4.0)
        s.tl(f'tl.fromTo("{pp}", {{ opacity: 0, y: 16 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }}, 0.25);')
        s.tl(f'tl.to("{pp}", {{ opacity: 0, duration: 0.25 }}, 3.7);')
        jm = s.el("div", "jm-logo", LOGO, 4.2)
        s.tl(f'tl.fromTo("{jm}", {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }}, 4.2);')
        s.fadeout([jm])
        return
    if b == "end": return k_end(s, ["Teach your stall. It haggles with AI.", "and…|PayPal pays!"], spread=True, cues=(END_AND, END_PP))
    if b in ("dawn", "shift", "teach", "intent", "rex", "mina", "stack"): return v2(b, s)
    if b == "listing":
        segs, _ = seq((TEACH, 20, 40, 3.0))
        k_screen(s, segs, cams=[C(0, 0, 960, 560, 1.12), C(s.dur * 0.4, 1.0, 1350, 420, 1.55)], caps=[(0.4, s.dur - 0.8, "Listings with a private lowest price 🔒 and her reasons")], chapter="<b>6:12 a.m.</b>her stall, taught")
    elif b == "feed":
        segs, _ = seq((DEAL, 5.8, 14, 1.0))
        k_screen(s, segs, cams=[C(0, 0, 1040, 330, 1.7)], caps=[(0.4, s.dur - 0.8, "GET /agentic/feed · items, prices, Rosa’s words. No floors.")], chapter="<b>2:00 p.m.</b>discover")
    elif b == "checkout":
        segs, _ = seq((DEAL, 9.5, 14, 1.25), (DEAL, 56.3, 6.4, 1.0))
        d = s.dur; j = 11.2
        k_screen(s, segs, cams=[C(0, 0, 1040, 420, 1.6), C(5.2, 0.8, 440, 600, 1.5), C(j, 0, 1040, 640, 1.7)],
                 caps=[(0.4, 4.6, "POST /agentic/checkout_sessions · payment_provider: paypal"), (5.4, j - 5.8, "The agents haggle: each counter carries a reason"), (j + 0.2, d - j - 0.5, "The session, as Jun’s agent sees it: totals set by the server")], chapter="<b>2:01 p.m.</b>negotiate")
    elif b == "guard":
        segs, _ = seq((DEAL, 8.5, 4, 1.0), (DEAL, 22, 8, 1.0))
        k_screen(s, segs, cams=[C(0, 0, 440, 560, 1.6), C(4.0, 0, 1550, 560, 1.6)], caps=[(0.3, 3.6, "Jun’s budget: a mandate the server enforces"), (4.2, s.dur - 4.5, "🔒 Only Rosa sees why her agent priced it this way")], chapter="<b>2:01 p.m.</b>guardrails")
    elif b == "approve": b_approve(s, chapter="<b>2:02 p.m.</b>pay with PayPal")
    elif b == "paid": b_paid(s, chapter="<b>2:02 p.m.</b>verified")

FNS = {"v1": v1, "v2": v2, "v3": v3, "v4": v4}
PAD = {"end": 3.8, "intent": 1.2, "haggle": 1.0, "approve": 1.4, "paid": 1.2, "rex": 0.8, "feed": 1.2, "checkout": 1.0, "rosa": 1.0, "mina": 1.0, "teach": 1.0}
MINLEN = {"approve": 11.0, "checkout": 17.0, "guard": 10.0}

# the ending line: "...It haggles with AI." a beat of silence, then "And... PayPal pays!"
VO_OVERRIDE = {"v4/end": {"file": "end/combined.mp3", "dur": 6.7}}
END_AND, END_PP = 0.25 + 4.40, 0.25 + 5.42   # on-screen cue times within the end beat

def build(vid):
    name, beats = [(n, b) for v, n, b in VERSIONS if v == vid][0]
    d = os.path.join(HERE, vid)
    if os.path.exists(os.path.join(d, "compositions")): shutil.rmtree(os.path.join(d, "compositions"))
    for sub in ("compositions", "assets/vo", "assets/img", "assets/fonts", "assets/rec"): os.makedirs(os.path.join(d, sub), exist_ok=True)
    for f in ("package.json", "hyperframes.json"): shutil.copy(os.path.join(V, "hf", f), d)
    json.dump({"id": f"jomm-{vid}", "name": f"Jomm {vid}: {name}"}, open(os.path.join(d, "meta.json"), "w"))
    shutil.copy(os.path.join(V, "hf", "assets", "gsap.min.js"), os.path.join(d, "assets"))
    shutil.copy(os.path.join(V, "shared", "caveat-600.woff2"), os.path.join(d, "assets", "fonts"))
    for f in os.listdir(os.path.join(REPO, "public", "photos")):
        if f.endswith(".jpg"): shutil.copy(os.path.join(REPO, "public", "photos", f), os.path.join(d, "assets", "img"))
    for f in ("paypal.svg", "openai.svg", "render.svg", "channel3.png"):
        shutil.copy(os.path.join(V, "shared", "logos", f), os.path.join(d, "assets", "img", f))
    gen = os.path.join(HERE, "gen")
    if os.path.isdir(gen):
        for f in os.listdir(gen): shutil.copy(os.path.join(gen, f), os.path.join(d, "assets", "img"))
    for src, dst in (("shopEN/smooth.mp4", "deal.mp4"), ("shopEN/popup.mp4", "popup.mp4"), ("rex/smooth.mp4", "rex.mp4"), ("teach1/smooth.mp4", "teach.mp4"), ("closet1/smooth.mp4", "closet.mp4"), ("fruitphone/smooth.mp4", "fruitphone.mp4")):
        t = os.path.join(d, "assets", "rec", dst)
        if os.path.exists(t): os.remove(t)
        os.link(os.path.join(V, "raw", src), t)
    hosts, auds, t = [], [], 0.0
    for i, (b, _) in enumerate(beats):
        v = VO_OVERRIDE.get(f"{vid}/{b}", VO[f"{vid}/{b}"])
        shutil.copy(os.path.join(HERE, "vo", v["file"]), os.path.join(d, "assets", "vo", f"{i:02d}-{b}.mp3"))
        dur = round(max(v["dur"] + PAD.get(b, 0.6) + 0.25, MINLEN.get(b, 0)), 2)
        sid = f"{vid}-{b}"
        s = Scene(sid, dur); FNS[vid](b, s)
        open(os.path.join(d, "compositions", f"{b}.html"), "w").write(s.html())
        hosts.append(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{b}.html" data-start="{round(t,2)}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
        auds.append(f'      <audio id="vo-{b}" class="clip" src="assets/vo/{i:02d}-{b}.mp3" data-start="{round(t + 0.25, 2)}" data-duration="{v["dur"]}" data-volume="1" data-track-index="{5 + i % 2}"></audio>')
        t += dur
    total = round(t, 2)
    mu = os.path.join(V, "shared", "music")
    starts = {}; tt = 0.0
    for i, (bb, _) in enumerate(beats):
        starts[bb] = tt; tt += float(re.search(r'data-start="([0-9.]+)" data-duration="([0-9.]+)"', hosts[i]).group(2))
    if "mina" in starts:
        # bright track for the story, then a change of mood when Mina's closet appears
        sw = round(starts["mina"], 2); tail = round(total - sw + 0.75, 2)
        fc = (f"[0]atrim=0:{sw + 0.75},asetpts=N/SR/TB,afade=t=in:d=1.0,loudnorm=I=-27:TP=-2:LRA=11[a];"
              f"[1]atrim=0:{tail},asetpts=N/SR/TB,loudnorm=I=-27:TP=-2:LRA=11[b];"
              f"[a][b]acrossfade=d=1.5:c1=tri:c2=tri,atrim=0:{total},afade=t=out:st={total - 4.5}:d=4.5")
        srcs = ["-i", os.path.join(mu, "Carefree.mp3"), "-i", os.path.join(mu, "Bossa_Antigua.mp3")]
    else:
        fc = f"[0]atrim=0:{total},afade=t=in:d=1.0,afade=t=out:st={total - 4.5}:d=4.5,loudnorm=I=-27:TP=-2:LRA=11"
        srcs = ["-i", os.path.join(mu, "Carefree.mp3")]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *srcs, "-filter_complex", fc, "-ar", "48000", "-ac", "2", "-b:a", "192k", os.path.join(d, "assets", "bgm.mp3")], check=True)
    auds.append(f'      <audio id="bgm" class="clip" src="assets/bgm.mp3" data-start="0" data-duration="{total}" data-volume="1" data-track-index="8"></audio>')
    open(os.path.join(d, "index.html"), "w").write(f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #141010; }}
      #root {{ position: relative; width: 100%; height: 100%; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
{chr(10).join(auds)}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
""")
    print(vid, name, "total", total, "s")

if __name__ == "__main__":
    for v in (sys.argv[1:] or ["v1", "v2", "v3", "v4"]): build(v)
