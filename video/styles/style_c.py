"""Style C: Documentary. Full-bleed photos with slow pushes, handwritten notes, quiet type."""
from build import *

def build():
    sc = {}
    SERIF = "'Playfair Display', serif"
    full = """
    .ph { position: absolute; inset: 0; overflow: hidden; }
    .ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(20,14,10,0.78) 0%, rgba(20,14,10,0.35) 55%, rgba(20,14,10,0.1) 100%); }"""
    sc["hook"] = (full + f"""
    #c-t1 {{ position: absolute; left: 140px; top: 380px; width: 1100px; font-family: {SERIF}; font-size: 104px; line-height: 1.05; color: #fff; }}
    #c-t1 i {{ color: #ffb38f; }}
    #c-t2 {{ position: absolute; left: 144px; top: 640px; font-size: 40px; color: rgba(255,255,255,0.8); }}""",
    "\n".join([clip("c-p1","div","ph",'<img src="assets/img/seller-setup.jpg" alt="" />',5.6), clip("c-sh","div","shade","",5.6,'data-layout-ignore'),
      clip("c-t1","h1","", words("Shopping is moving to") + ' <i class="w">AI</i> <i class="w">agents.</i>',5.6), clip("c-t2","p","","Big stores will plug in fast.",5.6)]),
    "\n".join(['    tl.fromTo("#c-p1 img", { scale: 1.12 }, { scale: 1.0, duration: 5.6, ease: "none" }, 0);', wordsin("#c-t1",0.0,0.12), blurin("#c-t2",2.9), out(["#c-t1","#c-t2"],5.35)]))

    sc["small"] = (full + """
    .note { position: absolute; left: 140px; bottom: 150px; font-family: Caveat, cursive; font-size: 96px; color: #fff; }
    #c-st { position: absolute; left: 140px; top: 120px; font-size: 52px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
    #c-sb { position: absolute; left: 140px; top: 190px; font-size: 40px; color: #ffb38f; }""",
    "\n".join(['    <div id="c-q1" class="ph clip" data-start="0" data-duration="3.4"><img src="assets/img/stall-live.jpg" alt="" /></div>',
      '    <div id="c-q2" class="ph clip" data-start="3.4" data-duration="1.0"><img src="assets/img/closet-bedroom.jpg" alt="" style="object-position:50% 40%" /></div>',
      '    <div id="c-q3" class="ph clip" data-start="4.4" data-duration="4.6"><img src="assets/img/hero-vendor.jpg" alt="" style="object-position:50% 30%" /></div>',
      clip("c-sh2","div","shade","",9,'data-layout-ignore'),
      clip("c-st","p","","But most of the world’s sellers are small.",9),
      '    <p id="c-n1" class="note clip" data-start="2.2" data-duration="1.2">a fruit stall.</p>',
      '    <p id="c-n2" class="note clip" data-start="3.4" data-duration="1.0">a closet.</p>',
      '    <p id="c-n3" class="note clip" data-start="4.4" data-duration="4.6">one person.</p>',
      '    <p id="c-sb" class="clip" data-start="6.0" data-duration="3.0">No website. No tech team.</p>']),
    "\n".join(['    tl.fromTo("#c-q1 img", { scale: 1.0 }, { scale: 1.08, duration: 3.4, ease: "none" }, 0);',
      '    tl.fromTo("#c-q3 img", { scale: 1.08 }, { scale: 1.0, duration: 4.6, ease: "none" }, 4.4);',
      blurin("#c-st",0.2), *[blurin(f"#c-n{i}", t, 0.15) for i, t in ((1,2.2),(2,3.4),(3,4.4))], blurin("#c-sb",6.0), out(["#c-st","#c-sb","#c-n3"],8.75)]))

    sc["mission"] = (full + f"""
    #c-mk {{ position: absolute; left: 140px; top: 250px; font-family: Caveat, cursive; font-size: 72px; color: #ffb38f; }}
    #c-mt {{ position: absolute; left: 140px; top: 340px; width: 1200px; font-family: {SERIF}; font-size: 112px; line-height: 1.04; color: #fff; }}
    #c-ms {{ position: absolute; left: 144px; top: 760px; width: 1100px; font-size: 36px; line-height: 1.4; color: rgba(255,255,255,0.82); }}""",
    "\n".join([clip("c-mp","div","ph",'<img src="assets/img/peaches-hand.jpg" alt="" />',7.4), clip("c-sh3","div","shade","",7.4,'data-layout-ignore'),
      clip("c-mk","p","","our mission",7.4),
      clip("c-mt","h2","", words("Bring every small seller into the AI era."),7.4),
      clip("c-ms","p","","PayPal believes everyone deserves a place in the digital economy. We carry that into the age of AI shopping agents.",7.4)]),
    "\n".join(['    tl.fromTo("#c-mp img", { scale: 1.1 }, { scale: 1.0, duration: 7.4, ease: "none" }, 0);', blurin("#c-ms",0.3), blurin("#c-mk",2.6), wordsin("#c-mt",2.9,0.13), out(["#c-mk","#c-mt","#c-ms"],7.15)]))

    sc["how"] = (f"""
    #root {{ background: #f6f1ea; color: #2b211a; }}
    #c-phone {{ position: absolute; left: 720px; top: 90px; width: 480px; height: 900px; border-radius: 56px; background: #111; padding: 14px; box-shadow: 0 40px 80px rgba(43,33,26,0.3); }}
    #c-phone .scr {{ position: relative; width: 100%; height: 100%; border-radius: 44px; overflow: hidden; }}
    #c-phone video {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}
    .hn {{ position: absolute; font-family: Caveat, cursive; font-size: 58px; color: #6b4a2b; }}
    .hn b {{ color: #e0592a; font-weight: 600; }}
    #c-ht {{ position: absolute; left: 120px; top: 120px; width: 560px; font-family: {SERIF}; font-size: 70px; line-height: 1.08; }}
    #c-hs {{ position: absolute; left: 120px; top: 440px; width: 520px; font-size: 34px; line-height: 1.4; color: #6b5a4c; }}""",
    "\n".join([clip("c-ht","h2","", words("Make your own AI agent. Just by talking."),8.2),
      clip("c-hs","p","","Point the phone at the goods and talk. The agent keeps asking until it can haggle like you.",8.2),
      '    <div id="c-phone"><div class="scr"><video id="c-pv" class="clip" src="assets/img/rosa-strawberries.mp4" muted playsinline data-start="0" data-duration="8.2" data-track-index="2"></video></div></div>',
      '    <p id="c-h1" class="hn clip" data-start="2.0" data-duration="6.2" style="left:1260px;top:200px">strawberries · <b>$5.49</b>/box</p>',
      '    <p id="c-h2" class="hn clip" data-start="3.4" data-duration="4.8" style="left:1260px;top:340px">never below <b>$4.25</b> 🔒</p>',
      '    <p id="c-h3" class="hn clip" data-start="4.6" data-duration="3.6" style="left:1260px;top:480px">must go <b>tonight</b></p>',
      '    <p id="c-h4" class="hn clip" data-start="5.6" data-duration="2.6" style="left:1260px;top:620px">supermarket: $4.99</p>']),
    "\n".join([wordsin("#c-ht",0.2,0.1), blurin("#c-hs",1.6), '    tl.fromTo("#c-phone", { opacity: 0, y: 80 }, { opacity: 1, y: 0, duration: 0.8, ease: "expo.out" }, 0.1);',
      *[f'    tl.fromTo("#c-h{i}", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.35, ease: "expo.out" }}, {t});' for i, t in ((1,2.0),(2,3.4),(3,4.6),(4,5.6))],
      out(["#c-ht","#c-hs","#c-phone"],7.95)]))

    sc["sell"] = ("""
    .cap { position: absolute; left: 0; right: 0; bottom: 70px; text-align: center; }
    .cap span { display: inline-block; padding: 14px 28px; background: rgba(20,14,10,0.82); color: #fff; font-size: 40px; border-radius: 12px; }
    #c-tag { position: absolute; right: 80px; top: 60px; padding: 12px 22px; border-radius: 999px; background: #0b2a5c; color: #fff; font-size: 28px; font-weight: 700; }""",
    "\n".join(['    <p id="c-s1" class="cap clip" data-start="0.2" data-duration="3.4"><span>Her agent sells to any shopper’s AI agent, the way she would.</span></p>',
      '    <p id="c-s2" class="cap clip" data-start="3.8" data-duration="3.6"><span>And PayPal pays her.</span></p>',
      '    <p id="c-tag" class="clip" data-start="3.8" data-duration="3.6">PayPal Sandbox · test money</p>']),
    "\n".join([blurin("#c-s1",0.2), blurin("#c-s2",3.8)]))

    sc["end"] = ("""
    #root { background: #f6f1ea; color: #2b211a; }
    #c-logo { position: absolute; left: 0; right: 0; top: 300px; text-align: center; font-size: 220px; }
    #c-tg { position: absolute; left: 0; right: 0; top: 590px; text-align: center; font-family: 'Playfair Display', serif; font-size: 58px; }
    #c-hand { position: absolute; left: 0; right: 0; top: 700px; text-align: center; font-family: Caveat, cursive; font-size: 54px; color: #e0592a; }
    #c-url { position: absolute; left: 0; right: 0; top: 800px; text-align: center; font-size: 32px; color: #8a7868; }""",
    "\n".join([f'    <div id="c-logo" class="clip" data-start="0" data-duration="6.9">{LOGO}</div>',
      clip("c-tg","p","", words("Teach your stall. It haggles with AI."),6.9),
      clip("c-hand","p","","…and PayPal pays.",6.9), clip("c-url","p","","jomm.onrender.com",6.9)]),
    "\n".join(['    tl.fromTo("#c-logo", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "power3.out" }, 0.1);',
      wordsin("#c-tg",1.3,0.2), blurin("#c-hand",3.2,0.3), blurin("#c-url",4.4)]))

    th, tj = "", ""
    sh, sj = sell_footage()
    write("c", "#f6f1ea", sc, sh, sj)
