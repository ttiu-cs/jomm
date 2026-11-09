"""Style A: Warm editorial. Paper ground, real photos, persimmon accent, handwritten notes."""
from build import *

INK = "#2b211a"; BR = "#e0592a"; PAPER = "#f6f1ea"

def build():
    sc = {}
    sc["hook"] = ("""
    #root { background: #f6f1ea; color: #2b211a; }
    .chip { position: absolute; left: -420px; padding: 14px 26px; border-radius: 999px; background: #fffdf9; box-shadow: 0 8px 24px rgba(43,33,26,0.10); font-size: 30px; white-space: nowrap; }
    #a-store { position: absolute; left: 1300px; top: 290px; width: 440px; height: 500px; border-radius: 36px; background: #fffdf9; box-shadow: 0 30px 60px rgba(43,33,26,0.14); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
    #a-store b { font-size: 52px; } #a-store span { font-size: 30px; color: #8a7868; }
    #a-t1 { position: absolute; left: 160px; top: 360px; width: 1060px; font-size: 96px; line-height: 1.02; font-weight: 700; letter-spacing: -0.035em; }
    #a-t2 { position: absolute; left: 160px; top: 610px; font-size: 44px; color: #6b5a4c; }
    #a-t1 .acc { color: #e0592a; }""",
    f"""    <div id="a-chips" data-layout-ignore>
      <div class="chip" id="ac1" style="top:130px">🤖 “3 boxes of strawberries”</div>
      <div class="chip" id="ac2" style="top:880px">🤖 “a wool coat under $120”</div>
      <div class="chip" id="ac3" style="top:210px">🤖 “cheapest peaches”</div>
      <div class="chip" id="ac4" style="top:960px">🤖 “running shoes, size 9”</div>
    </div>
{clip("a-store","div","","<b>Big store</b><span>API · catalog · checkout</span>",5.6)}
{clip("a-t1","h1","",words("Shopping is moving to") + ' <span class="w acc">AI&nbsp;agents.</span>',5.6)}
{clip("a-t2","p","","Big stores will plug in fast.",5.6)}""",
    "\n".join([wordsin("#a-t1", 0.0, 0.1),
      '    tl.fromTo("#a-store", { opacity: 1, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.8, ease: "expo.out" }, 0);',
      *[f'    tl.fromTo("#ac{i}", {{ x: 0, y: 0, opacity: 1 }}, {{ x: 1720, y: {[220,-520,140,-600][i-1]}, opacity: 1, duration: 2.3, ease: "power2.in" }}, {0.9+i*0.3});\n    tl.to("#ac{i}", {{ opacity: 0, duration: 0.15 }}, {3.05+i*0.3});' for i in range(1,5)],
      blurin("#a-t2", 2.9), out(["#a-t1","#a-t2","#a-store"], 5.35)]))

    sc["small"] = ("""
    #root { background: #f6f1ea; color: #2b211a; }
    .card { position: absolute; top: 250px; width: 500px; height: 560px; border-radius: 32px; overflow: hidden; box-shadow: 0 30px 60px rgba(43,33,26,0.18); }
    .card img { width: 100%; height: 100%; object-fit: cover; }
    .card p { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 28px; font-family: Caveat, cursive; font-size: 54px; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,0.6)); }
    #a-c1 { left: 160px; } #a-c2 { left: 710px; } #a-c3 { left: 1260px; }
    #a-s1 { position: absolute; left: 160px; top: 110px; font-size: 64px; font-weight: 700; letter-spacing: -0.03em; }
    #a-s2 { position: absolute; left: 160px; top: 870px; font-size: 56px; font-weight: 700; letter-spacing: -0.03em; color: #e0592a; }""",
    "\n".join([clip("a-s1","h2","","But most of the world’s sellers are small.",9),
      clip("a-c1","div","card",'<img src="assets/img/stall-live.jpg" alt="" /><p>a fruit stall</p>',9),
      clip("a-c2","div","card",'<img src="assets/img/closet-bedroom.jpg" alt="" /><p>a closet</p>',9),
      clip("a-c3","div","card",'<img src="assets/img/hero-vendor.jpg" alt="" /><p>one person</p>',9),
      clip("a-s2","h2","","No website. No tech team.",9)]),
    "\n".join([blurin("#a-s1",0.2),
      *[f'    tl.fromTo("#a-c{i}", {{ opacity: 0, y: 80 }}, {{ opacity: 1, y: 0, duration: 0.7, ease: "expo.out" }}, {[2.3,3.3,4.2][i-1]});' for i in (1,2,3)],
      blurin("#a-s2",6.1), out(["#a-s1","#a-s2","#a-c1","#a-c2","#a-c3"], 8.75)]))

    sc["mission"] = ("""
    #root { background: #f6f1ea; color: #2b211a; }
    #a-mk { position: absolute; left: 160px; top: 210px; font-family: Caveat, cursive; font-size: 72px; color: #e0592a; }
    #a-mt { position: absolute; left: 160px; top: 300px; width: 1600px; font-size: 128px; line-height: 1.0; font-weight: 700; letter-spacing: -0.045em; }
    #a-mt .acc { color: #e0592a; }
    #a-ms { position: absolute; left: 160px; top: 740px; width: 1300px; font-size: 40px; line-height: 1.35; color: #6b5a4c; }
    #a-ms b { color: #0b2a5c; }
    #a-ul { position: absolute; left: 160px; top: 548px; width: 980px; height: 14px; border-radius: 7px; background: #e0592a; transform-origin: left center; }""",
    "\n".join([clip("a-mk","p","","our mission",7.4),
      clip("a-mt","h2","", words("Bring every small seller") + "<br/>" + words("into the") + ' <span class="w acc">AI&nbsp;era.</span>',7.4),
      clip("a-ul","div","","",7.4,'data-layout-ignore'),
      clip("a-ms","p","","<b>PayPal</b> believes everyone deserves a place in the digital economy. We’re carrying that into the age of AI shopping agents.",7.4)]),
    "\n".join([blurin("#a-ms",0.2), blurin("#a-mk",2.6), wordsin("#a-mt",3.0,0.12),
      '    tl.fromTo("#a-ul", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "expo.out" }, 4.1);',
      out(["#a-mk","#a-mt","#a-ms","#a-ul"], 7.15)]))

    sc["how"] = ("""
    #root { color: #2b211a; }
    #a-ht { position: absolute; left: 140px; top: 250px; width: 620px; font-size: 76px; line-height: 1.04; font-weight: 700; letter-spacing: -0.035em; }
    #a-ht .acc { color: #e0592a; }
    #a-hc { position: absolute; left: 140px; top: 620px; width: 620px; display: flex; flex-wrap: wrap; gap: 14px; }
    #a-hc span { padding: 12px 22px; border-radius: 999px; background: #fffdf9; font-size: 32px; box-shadow: 0 6px 16px rgba(43,33,26,0.08); }
    #a-hn { position: absolute; left: 140px; top: 820px; font-family: Caveat, cursive; font-size: 46px; color: #6b4a2b; }""",
    "\n".join([clip("a-ht","h2","", words("Make your own AI agent in minutes.") + "<br/>" + '<span class="w acc">Just</span> <span class="w acc">by</span> <span class="w acc">talking.</span>', 8.2),
      clip("a-hc","div","",'<span>No code</span><span>No website</span><span>No tech team</span>',8.2),
      clip("a-hn","p","","↗ Rosa teaches her stall with her phone camera",8.2)]),
    "\n".join([wordsin("#a-ht",0.3,0.09), '    tl.fromTo("#a-hc span", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.25, ease: "expo.out" }, 4.6);', blurin("#a-hn",1.4), out(["#a-ht","#a-hc","#a-hn"],7.95)]))

    sc["sell"] = ("""
    .cap { position: absolute; left: 120px; bottom: 90px; padding: 22px 32px; border-radius: 22px; background: rgba(43,33,26,0.9); color: #fff; font-size: 42px; font-weight: 700; letter-spacing: -0.02em; }
    .cap small { display: block; font-size: 30px; font-weight: 400; color: rgba(255,255,255,0.7); margin-top: 6px; }
    #a-tag { position: absolute; left: 120px; top: 60px; padding: 12px 22px; border-radius: 999px; background: #0b2a5c; color: #fff; font-size: 28px; font-weight: 700; }""",
    "\n".join([f'    <p id="a-sc1" class="cap clip" data-start="0.2" data-duration="3.4">Sells to any shopper’s AI agent<small>haggling the way the owner would</small></p>',
      f'    <p id="a-sc2" class="cap clip" data-start="3.8" data-duration="3.6">And PayPal pays them.<small>approved by the shopper · captured · verified</small></p>',
      f'    <p id="a-tag" class="clip" data-start="3.8" data-duration="3.6">PayPal Sandbox · test money</p>']),
    "\n".join(['    tl.fromTo("#a-sc1", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, 0.2);',
      '    tl.fromTo("#a-sc2", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, 3.8);']))

    sc["end"] = ("""
    #root { background: #f6f1ea; color: #2b211a; }
    #a-logo { position: absolute; left: 0; right: 0; top: 330px; text-align: center; font-size: 230px; }
    #a-tg { position: absolute; left: 0; right: 0; top: 620px; text-align: center; font-size: 52px; font-weight: 700; letter-spacing: -0.03em; }
    #a-url { position: absolute; left: 0; right: 0; top: 730px; text-align: center; font-size: 34px; color: #8a7868; }""",
    "\n".join([f'    <div id="a-logo" class="clip" data-start="0" data-duration="6.9">{LOGO}</div>',
      clip("a-tg","p","", words("Teach your stall. It haggles with AI.") + ' <span class="w" style="color:#0b2a5c">PayPal</span> <span class="w" style="color:#0b2a5c">pays.</span>',6.9),
      clip("a-url","p","","jomm.onrender.com",6.9)]),
    "\n".join(['    tl.fromTo("#a-logo", { opacity: 0, scale: 1.12, filter: "blur(10px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }, 0.1);',
      '    tl.fromTo("#a-logo .dot", { y: -300 }, { y: 0, duration: 0.6, ease: "back.out(1.6)" }, 0.5);',
      wordsin("#a-tg", 1.3, 0.2), blurin("#a-url", 4.4)]))

    th, tj = teach_footage("left:820px;top:240px;width:960px;height:570px;border-radius:28px;box-shadow:0 30px 60px rgba(43,33,26,0.18)", z=3, vstyle="left:-96px;top:-78px;width:1152px;height:648px;object-fit:fill",
        cam='      tl.set("#teachcam", { scale: 1.0, x: 0, y: 0 }, 0);\n      tl.fromTo("#teachw", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.7, ease: "expo.out" }, 22.6);\n      tl.to("#teachw", { opacity: 0, duration: 0.2 }, 29.95);')
    sh, sj = sell_footage()
    write("a", PAPER, sc, th + "\n" + sh, tj + "\n" + sj)
