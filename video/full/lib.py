"""Style C (documentary) scene builders for the full-length Jomm. videos."""
import json, os, shutil
SERIF = "'Playfair Display', serif"
HAND_FACE = "@font-face { font-family: 'Caveat'; src: url('assets/fonts/caveat-600.woff2') format('woff2'); font-weight: 600; }"
LOGO_CSS = """
.jomm { display: inline-flex; align-items: baseline; font-family: Inter, sans-serif; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
.jomm .ring { display: inline-block; width: 0.6em; height: 0.6em; border: 0.15em solid #e0592a; border-radius: 50%; margin: 0 0.02em; position: relative; top: 0.02em; box-sizing: border-box; }
.jomm .dot { display: inline-block; width: 0.24em; height: 0.24em; border-radius: 50%; background: #e0592a; margin-left: 0.05em; }"""
LOGO = '<span class="jomm" aria-label="Jomm."><span>J</span><span class="ring"></span><span>mm</span><span class="dot"></span></span>'
BASE = """
.ph { position: absolute; inset: 0; overflow: hidden; }
.ph img, .ph video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,14,10,0.80) 0%, rgba(20,14,10,0.42) 52%, rgba(20,14,10,0.08) 100%); }
.shadeb { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(20,14,10,0.78) 0%, rgba(20,14,10,0.15) 45%, rgba(20,14,10,0) 70%); }
.kick { position: absolute; left: 140px; font-family: Caveat, cursive; font-size: 68px; color: #ffb38f; }
.title { position: absolute; left: 140px; width: 1240px; font-family: SERIFX; font-size: 100px; line-height: 1.05; color: #fff; }
.title i { color: #ffb38f; }
.sub { position: absolute; left: 144px; width: 1120px; font-size: 38px; line-height: 1.4; color: rgba(255,255,255,0.85); }
.note { position: absolute; font-family: Caveat, cursive; font-size: 92px; color: #fff; }
.w { display: inline-block; }
.cap { position: absolute; left: 0; right: 0; bottom: 64px; text-align: center; }
.cap span { display: inline-block; max-width: 1500px; padding: 14px 30px; background: rgba(20,14,10,0.85); color: #fff; font-size: 40px; line-height: 1.3; border-radius: 12px; }
.tag { position: absolute; right: 80px; top: 56px; padding: 12px 22px; border-radius: 999px; background: #0b2a5c; color: #fff; font-size: 28px; font-weight: 700; }
.chap { position: absolute; left: 80px; top: 56px; padding: 10px 22px; border-radius: 999px; background: rgba(20,14,10,0.85); color: #fff; font-size: 28px; }
.chap b { color: #ffb38f; font-family: Caveat, cursive; font-size: 40px; font-weight: 600; margin-right: 8px; }
""".replace("SERIFX", SERIF)

def words(t, cls="w"):
    out = []
    for w in t.split(" "):
        if w.startswith("*") and w.endswith("*"):
            out.append(f'<i class="{cls}">{w[1:-1]}</i>')
        else:
            out.append(f'<span class="{cls}">{w}</span>')
    return " ".join(out)

class Scene:
    def __init__(self, sid, dur, ground="#141010"):
        self.sid, self.dur, self.css, self.body, self.js = sid, round(dur, 2), [BASE, HAND_FACE, LOGO_CSS], [], []
        self.ground = ground
        self.n = 0
    def uid(self, p):
        self.n += 1
        return f"{self.sid}-{p}{self.n}"
    def add(self, html): self.body.append("    " + html)
    def tl(self, js): self.js.append("    " + js)
    # --- primitives -------------------------------------------------------
    def el(self, tag, cls, inner, start=0.0, dur=None, style="", extra=""):
        i = self.uid(tag[0])
        d = round((self.dur - start) if dur is None else dur, 2)
        self.add(f'<{tag} id="{i}" class="{cls} clip" data-start="{round(start,2)}" data-duration="{d}" style="{style}" {extra}>{inner}</{tag}>')
        return "#" + i
    def blurin(self, sel, t, d=0.2):
        self.tl(f'tl.fromTo("{sel}", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: {d}, ease: "power4.out" }}, {round(t,2)});')
    def wordsin(self, sel, t, gap=0.11):
        self.tl(f'tl.fromTo("{sel} .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: {gap}, ease: "power4.out" }}, {round(t,2)});')
    def fadeout(self, sels, t=None):
        t = self.dur - 0.25 if t is None else t
        self.tl(f'tl.to({json.dumps(sels)}, {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {round(t,2)});')
    def photo(self, src, start=0.0, dur=None, push=(1.1, 1.0), pos="50% 50%", shade="shade"):
        d = (self.dur - start) if dur is None else dur
        sel = self.el("div", "ph", f'<img src="assets/img/{src}" alt="" style="object-position:{pos}" />', start, d)
        self.tl(f'tl.fromTo("{sel} img", {{ scale: {push[0]} }}, {{ scale: {push[1]}, duration: {round(d,2)}, ease: "none" }}, {round(start,2)});')
        if shade: self.el("div", shade, "", start, d, extra="data-layout-ignore")
        return sel
    def video_full(self, src, start=0.0, dur=None, mstart=0, rate=1, shade="shade", push=(1.0, 1.06)):
        d = (self.dur - start) if dur is None else dur
        i = self.uid("v")
        self.add(f'<div class="ph" id="{i}w"><video id="{i}" class="clip" src="assets/{src}" muted playsinline data-start="{round(start,2)}" data-duration="{round(d,2)}" data-media-start="{mstart}" data-playback-rate="{rate}"></video></div>')
        self.tl(f'tl.fromTo("#{i}w", {{ scale: {push[0]} }}, {{ scale: {push[1]}, duration: {round(self.dur,2)}, ease: "none" }}, 0);')
        if shade: self.el("div", shade, "", start, d, extra="data-layout-ignore")
    def html(self):
        return f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: Inter, sans-serif; background: {self.ground}; }}
{''.join(self.css)}
  </style>
  <div id="root" data-composition-id="{self.sid}" data-width="1920" data-height="1080">
{chr(10).join(self.body)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{chr(10).join(self.js)}
    window.__timelines["{self.sid}"] = tl;
  </script>
</template>
"""

# ---------------- beat kinds -----------------
def k_photo(s, imgs, title=None, kicker=None, sub=None, notes=(), top=380, title_at=0.0, sub_at=None, shade="shade", size=100):
    """imgs: list of (src, start, pos)."""
    for idx, (src, st, pos) in enumerate(imgs):
        end = imgs[idx + 1][1] if idx + 1 < len(imgs) else s.dur
        s.photo(src, st, end - st, pos=pos, shade=shade, push=(1.1, 1.0) if idx % 2 == 0 else (1.0, 1.08))
    sels = []
    if kicker:
        k = s.el("p", "kick", kicker, style=f"top:{top-90}px"); s.blurin(k, max(title_at - 0.3, 0.05)); sels.append(k)
    if title:
        t = s.el("h2", "title", words(title), style=f"top:{top}px;font-size:{size}px"); s.wordsin(t, title_at); sels.append(t)
    if sub:
        n_lines = (len(title or "") * size * 0.5) // 1240 + 1
        sb = s.el("p", "sub", sub, style=f"top:{int(top + n_lines * size * 1.1 + 40)}px")
        s.blurin(sb, sub_at if sub_at is not None else title_at + 1.2); sels.append(sb)
    for (txt, t, d, x, y) in notes:
        n = s.el("p", "note", txt, t, d, style=f"left:{x}px;top:{y}px"); s.blurin(n, t, 0.15)
    if sels: s.fadeout(sels)

def k_phone(s, video, mstart=0, rate=1, title="", sub="", notes=(), left=True, ground="#f6f1ea", chapter=None):
    s.ground = ground
    s.css.append(f"""
    .phone {{ position: absolute; top: 60px; width: 560px; height: 960px; border-radius: 64px; background: #111; padding: 14px; box-shadow: 0 40px 80px rgba(43,33,26,0.32); }}
    .phone .scr {{ position: relative; width: 100%; height: 100%; border-radius: 52px; overflow: hidden; background: #000; }}
    .phone video {{ position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0%; }}
    .ptitle {{ position: absolute; width: 620px; font-family: {SERIF}; font-size: 68px; line-height: 1.08; color: #2b211a; }}
    .psub {{ position: absolute; width: 600px; font-size: 34px; line-height: 1.4; color: #6b5a4c; }}
    .pnote {{ position: absolute; font-family: Caveat, cursive; font-size: 54px; color: #6b4a2b; }}
    .pnote b {{ color: #e0592a; font-weight: 600; }}""")
    px = 1220 if left else 140
    tx = 140 if left else 820
    i = s.uid("ph")
    s.add(f'<div class="phone" id="{i}" style="left:{px}px"><div class="scr"><video id="{i}v" class="clip" src="assets/{video}" muted playsinline data-start="0" data-duration="{s.dur}" data-media-start="{mstart}" data-playback-rate="{rate}"></video></div></div>')
    s.tl(f'tl.fromTo("#{i}", {{ opacity: 0, y: 80 }}, {{ opacity: 1, y: 0, duration: 0.8, ease: "expo.out" }}, 0.05);')
    sels = [f"#{i}"]
    if chapter:
        c = s.el("p", "kick", chapter, style=f"left:{tx}px;top:110px;color:#e0592a"); s.blurin(c, 0.1); sels.append(c)
    t = s.el("h2", "ptitle", words(title), style=f"left:{tx}px;top:200px"); s.wordsin(t, 0.25, 0.09); sels.append(t)
    if sub:
        b = s.el("p", "psub", sub, style=f"left:{tx+4}px;top:{200 + 80 * (len(title)//18 + 1) + 40}px"); s.blurin(b, 1.4); sels.append(b)
    for (txt, t0, x, y) in notes:
        n = s.el("p", "pnote", txt, t0, style=f"left:{x}px;top:{y}px")
        s.tl(f'tl.fromTo("{n}", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.35, ease: "expo.out" }}, {t0});'); sels.append(n)
    s.fadeout(sels)

def k_screen(s, segs, cams=(), caps=(), tag=False, chapter=None, ground="#f6f1ea"):
    """segs: (src, start, dur, mstart, rate). cams: (t, dur, scale, x, y, ease). caps: (t, dur, text)."""
    s.ground = ground
    cam = s.uid("cam")
    vids = "".join(f'<video id="{cam}v{k}" class="clip" src="assets/{src}" muted playsinline data-start="{st}" data-duration="{d}" data-media-start="{ms}" data-playback-rate="{r}" style="position:absolute;left:0;top:0;width:1920px;height:1080px;object-fit:cover"></video>' for k, (src, st, d, ms, r) in enumerate(segs))
    s.add(f'<div id="{cam}" style="position:absolute;inset:0">{vids}</div>')
    first = True
    for (t, d, sc, x, y, ease) in cams:
        if first:
            s.tl(f'tl.set("#{cam}", {{ scale: {sc}, x: {x}, y: {y} }}, 0);'); first = False
            if d: pass
        else:
            s.tl(f'tl.to("#{cam}", {{ scale: {sc}, x: {x}, y: {y}, duration: {d}, ease: "{ease}" }}, {t});')
    for (t, d, txt) in caps:
        c = s.el("p", "cap", f"<span>{txt}</span>", t, d)
        s.tl(f'tl.fromTo("{c}", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "expo.out" }}, {t});')
    if tag:
        s.el("p", "tag", "PayPal Sandbox · test money")
    if chapter:
        s.el("p", "chap", chapter)

def k_cards(s, kicker, title, cards, ground="#f6f1ea", hi=None):
    """cards: list of (big, small). A row of up to 4 cards on paper."""
    s.ground = ground
    s.css.append(f"""
    .ck {{ position: absolute; left: 140px; top: 150px; font-family: Caveat, cursive; font-size: 64px; color: #e0592a; }}
    .ct {{ position: absolute; left: 140px; top: 230px; width: 1640px; font-family: {SERIF}; font-size: 84px; line-height: 1.08; color: #2b211a; }}
    .card {{ position: absolute; top: 560px; height: 330px; border-radius: 28px; background: #fffdf9; box-shadow: 0 20px 50px rgba(43,33,26,0.12); padding: 34px 36px; }}
    .card b {{ display: block; font-family: {SERIF}; font-size: 54px; color: #2b211a; font-weight: 400; }}
    .card span {{ display: block; margin-top: 16px; font-size: 30px; line-height: 1.4; color: #6b5a4c; }}
    .card em {{ display: block; font-family: Caveat, cursive; font-style: normal; font-size: 46px; color: #e0592a; }}""")
    sels = []
    if kicker:
        k = s.el("p", "ck", kicker); s.blurin(k, 0.1); sels.append(k)
    t = s.el("h2", "ct", words(title)); s.wordsin(t, 0.3, 0.09); sels.append(t)
    n = len(cards); w = (1640 - (n - 1) * 30) // n
    for idx, (when, big, small, num) in enumerate(cards):
        c = s.el("div", "card", f"<em>{num}</em><b>{big}</b><span>{small}</span>", style=f"left:{140 + idx * (w + 30)}px;width:{w}px")
        s.tl(f'tl.fromTo("{c}", {{ opacity: 0, y: 50 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }}, {when});'); sels.append(c)
    s.fadeout(sels)

def k_end(s, lines, url="jomm.onrender.com · github.com/ttiu-cs/jomm"):
    s.ground = "#f6f1ea"
    s.css.append(f"""
    .lg {{ position: absolute; left: 0; right: 0; top: 280px; text-align: center; font-size: 220px; color: #2b211a; }}
    .l1 {{ position: absolute; left: 0; right: 0; top: 570px; text-align: center; font-family: {SERIF}; font-size: 60px; color: #2b211a; }}
    .l2 {{ position: absolute; left: 0; right: 0; top: 670px; text-align: center; font-family: Caveat, cursive; font-size: 58px; color: #e0592a; }}
    .l3 {{ position: absolute; left: 0; right: 0; top: 790px; text-align: center; font-size: 32px; color: #8a7868; }}""")
    lg = s.el("div", "lg", LOGO)
    s.tl(f'tl.fromTo("{lg}", {{ opacity: 0, filter: "blur(12px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "power3.out" }}, 0.1);')
    a = s.el("p", "l1", words(lines[0])); s.wordsin(a, 1.0, 0.16)
    if len(lines) > 1:
        b = s.el("p", "l2", lines[1]); s.blurin(b, 2.6, 0.3)
    c = s.el("p", "l3", url); s.blurin(c, 3.6)
