#!/usr/bin/env python3
"""Builds three HyperFrames style samples (a, b, c) sharing one narration and timing."""
import os, shutil, json
HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.dirname(HERE)
REPO = os.path.dirname(V)

# scene id, start, duration ; narration start
SC = [("hook", 0, 5.6), ("small", 5.6, 9.0), ("mission", 14.6, 7.4), ("how", 22.0, 8.2), ("sell", 30.2, 7.4), ("end", 37.6, 6.9)]
VO = [(1, 0.2, 5.21), (2, 5.8, 8.62), (3, 14.8, 7.01), (4, 22.2, 7.76), (5, 30.4, 6.92), (6, 37.8, 5.62)]
TOTAL = 44.5

LOGO_CSS = """
.jomm { display: inline-flex; align-items: baseline; font-family: Inter, sans-serif; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
.jomm .ring { display: inline-block; width: 0.6em; height: 0.6em; border: 0.15em solid #e0592a; border-radius: 50%; margin: 0 0.02em; position: relative; top: 0.02em; box-sizing: border-box; }
.jomm .dot { display: inline-block; width: 0.24em; height: 0.24em; border-radius: 50%; background: #e0592a; margin-left: 0.05em; }
"""
LOGO = '<span class="jomm" aria-label="Jomm."><span>J</span><span class="ring"></span><span>mm</span><span class="dot"></span></span>'
HAND_FACE = "@font-face { font-family: 'Caveat'; src: url('assets/fonts/caveat-600.woff2') format('woff2'); font-weight: 600; }"

def scene(sid, css, body, js):
    return f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: Inter, sans-serif; }}
    {HAND_FACE}
    {LOGO_CSS}
    .w {{ display: inline-block; }}
{css}
  </style>
  <div id="root" data-composition-id="{sid}" data-width="1920" data-height="1080">
{body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{js}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
"""

def words(text, cls="w"):
    return " ".join(f'<span class="{cls}">{w}</span>' for w in text.split(" "))

def root(ground, footage_html, footage_js):
    hosts = "\n".join(
        f'      <div id="{s}" data-composition-id="{s}" data-composition-src="compositions/{s}.html" data-start="{a}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:{5 if s in ("sell",) else 1}"></div>'
        for s, a, d in SC)
    aud = "\n".join(f'      <audio id="vo{i}" class="clip" src="assets/vo/v{i}.mp3" data-start="{a}" data-duration="{d}" data-volume="1" data-track-index="{6+i%2}"></audio>' for i, a, d in VO)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: {ground}; }}
      #root {{ position: relative; width: 100%; height: 100%; font-family: Inter, sans-serif; }}
      .bg {{ position: absolute; inset: 0; background: {ground}; }}
      .fw {{ position: absolute; overflow: hidden; }}
      .fw video {{ position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
      <div class="bg"></div>
{hosts}
{footage_html}
{aud}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
{footage_js}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""

# ---- shared footage for the "sell" beat (real recording of jomm.onrender.com/demo) ----
# deal.mp4: 8s..23s negotiation (play 2x), 48.6s.. paid + PayPal panel + Rosa's phone
def sell_footage(frame_css="left:0;top:0;width:1920px;height:1080px", z=3):
    a = 30.2
    html = f"""      <div class="fw" id="sellw" style="{frame_css};z-index:{z}">
        <div id="sellcam" style="position:absolute;inset:0">
          <video id="sellv1" class="clip" src="assets/deal.mp4" muted playsinline data-start="{a}" data-duration="3.6" data-media-start="9" data-playback-rate="2" data-track-index="2"></video>
          <video id="sellv2" class="clip" src="assets/deal.mp4" muted playsinline data-start="{a+3.6}" data-duration="3.8" data-media-start="48.8" data-track-index="2"></video>
        </div>
      </div>"""
    js = f"""      tl.set("#sellcam", {{ scale: 1.35, x: 300, y: -40 }}, 0);
      tl.to("#sellcam", {{ y: -200, duration: 3.4, ease: "power1.inOut" }}, {a+0.1});
      tl.set("#sellcam", {{ scale: 1.3, x: -40, y: 60 }}, {a+3.6});
      tl.to("#sellcam", {{ scale: 1.45, x: -330, y: 120, duration: 0.8, ease: "power3.inOut" }}, {a+4.6});"""
    return html, js

def teach_footage(frame_css, z=3, cam=None, vstyle=""):
    a = 22.0
    html = f"""      <div class="fw" id="teachw" style="{frame_css};z-index:{z}">
        <div id="teachcam" style="position:absolute;inset:0">
          <video id="teachv" class="clip" src="assets/teach.mp4" muted playsinline data-start="{a+0.6}" data-duration="7.6" data-media-start="4" data-playback-rate="{TEACH_RATE}" data-track-index="2" style="{vstyle}"></video>
        </div>
      </div>"""
    js = cam or ""
    return html, js

TEACH_RATE = 6

def write(style, ground, scenes, footage_html, footage_js):
    d = os.path.join(HERE, style)
    os.makedirs(os.path.join(d, "compositions"), exist_ok=True)
    os.makedirs(os.path.join(d, "assets", "vo"), exist_ok=True)
    os.makedirs(os.path.join(d, "assets", "img"), exist_ok=True)
    os.makedirs(os.path.join(d, "assets", "fonts"), exist_ok=True)
    for f in ("package.json", "hyperframes.json"):
        shutil.copy(os.path.join(V, "hf", f), d)
    json.dump({"id": f"jomm-style-{style}", "name": f"Jomm style {style}"}, open(os.path.join(d, "meta.json"), "w"))
    shutil.copy(os.path.join(V, "hf", "assets", "gsap.min.js"), os.path.join(d, "assets"))
    for i in range(1, 7):
        shutil.copy(os.path.join(V, "shared", "vo", f"v{i}.mp3"), os.path.join(d, "assets", "vo"))
    for f in os.listdir(os.path.join(REPO, "public", "photos")):
        if f.endswith(".jpg"):
            shutil.copy(os.path.join(REPO, "public", "photos", f), os.path.join(d, "assets", "img"))
    for f in ("rosa-strawberries.mp4", "rosa-peaches.mp4", "mina-coat.mp4"):
        shutil.copy(os.path.join(REPO, "public", "videos", f), os.path.join(d, "assets", "img"))
    shutil.copy(os.path.join(V, "shared", "caveat-600.woff2"), os.path.join(d, "assets", "fonts"))
    shutil.copy(os.path.join(V, "raw", "shop1", "main.mp4"), os.path.join(d, "assets", "deal.mp4"))
    shutil.copy(os.path.join(V, "raw", "teach1", "teach.mp4"), os.path.join(d, "assets", "teach.mp4"))
    open(os.path.join(d, "index.html"), "w").write(root(ground, footage_html, footage_js))
    for sid, (css, body, js) in scenes.items():
        open(os.path.join(d, "compositions", f"{sid}.html"), "w").write(scene(sid, css, body, js))

def blurin(sel, t, d=0.2):
    return f'    tl.fromTo("{sel}", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: {d}, ease: "power4.out" }}, {t});'
def wordsin(sel, t, gap=0.1):
    return f'    tl.fromTo("{sel} .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: {gap}, ease: "power4.out" }}, {t});'
def out(sels, t):
    return f'    tl.to({json.dumps(sels)}, {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {t});'
def clip(id_, tag, cls, inner, dur, extra=""):
    return f'    <{tag} id="{id_}" class="{cls} clip" data-start="0" data-duration="{dur}" {extra}>{inner}</{tag}>'

if __name__ == "__main__":
    import sys
    for s in (sys.argv[1:] or ["a", "b", "c"]):
        __import__(f"style_{s}").build()
