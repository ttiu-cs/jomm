"""Style B: Bold kinetic. Near-black ground, huge type, persimmon flood, monospace agent calls."""
from build import *

def build():
    sc = {}
    MONO = "'JetBrains Mono', monospace"
    sc["hook"] = (f"""
    #root {{ background: #141010; color: #fff; }}
    .big {{ position: absolute; left: 120px; font-size: 210px; font-weight: 900; letter-spacing: -0.055em; line-height: 0.9; }}
    #b-h1 {{ top: 200px; }} #b-h2 {{ top: 400px; color: #e0592a; }}
    #b-h3 {{ position: absolute; left: 128px; top: 700px; font-size: 48px; color: rgba(255,255,255,0.6); }}
    #b-log {{ position: absolute; right: 120px; top: 120px; width: 640px; font-family: {MONO}; font-size: 28px; line-height: 1.7; color: rgba(255,255,255,0.45); text-align: right; }}""",
    "\n".join([clip("b-h1","h1","big",words("Shoppers now"),5.6), clip("b-h2","h1","big",words("send AI agents."),5.6),
      clip("b-h3","p","","Big stores will plug in fast.",5.6),
      clip("b-log","div","",'<p class="w">GET /feed</p><br/><p class="w">POST /checkout</p><br/><p class="w">agent → store</p><br/><p class="w">agent → store</p><br/><p class="w">agent → store</p>',5.6,'data-layout-ignore')]),
    "\n".join([wordsin("#b-h1",0.0,0.12), wordsin("#b-h2",0.5,0.14),
      '    tl.fromTo("#b-log .w", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.25, stagger: 0.35, ease: "expo.out" }, 1.4);',
      blurin("#b-h3",3.0), out(["#b-h1","#b-h2","#b-h3","#b-log"],5.35)]))

    sc["small"] = (f"""
    #root {{ background: #141010; color: #fff; }}
    #b-s0 {{ position: absolute; left: 120px; top: 150px; font-size: 64px; font-weight: 700; letter-spacing: -0.03em; color: rgba(255,255,255,0.7); }}
    .slot {{ position: absolute; left: 110px; top: 290px; font-size: 250px; font-weight: 900; letter-spacing: -0.06em; line-height: 1; color: #e0592a; }}
    #b-s4 {{ position: absolute; left: 120px; top: 720px; font-size: 80px; font-weight: 900; letter-spacing: -0.04em; }}
    #b-s4 .w {{ position: relative; }}
    .strike {{ position: absolute; left: -6px; right: -6px; top: 52%; height: 10px; background: #e0592a; transform-origin: left center; }}""",
    "\n".join([clip("b-s0","p","","But most of the world’s sellers are small.",9),
      '    <h2 id="b-sl1" class="slot clip" data-start="2.2" data-duration="1.1">a fruit stall.</h2>',
      '    <h2 id="b-sl2" class="slot clip" data-start="3.3" data-duration="1.0">a closet.</h2>',
      '    <h2 id="b-sl3" class="slot clip" data-start="4.3" data-duration="4.7">one person.</h2>',
      clip("b-s4","p","",'<span class="w">website<i class="strike"></i></span>&nbsp;&nbsp;<span class="w">tech team<i class="strike"></i></span>&nbsp;&nbsp;<span class="w">developer<i class="strike"></i></span>',9)]),
    "\n".join([blurin("#b-s0",0.1),
      '    tl.fromTo("#b-sl1", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "expo.out" }, 2.2);',
      '    tl.fromTo("#b-sl2", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "expo.out" }, 3.3);',
      '    tl.fromTo("#b-sl3", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "expo.out" }, 4.3);',
      '    tl.fromTo("#b-s4 .w", { opacity: 0 }, { opacity: 1, duration: 0.15, stagger: 0.2 }, 6.0);',
      '    tl.fromTo("#b-s4 .strike", { scaleX: 0 }, { scaleX: 1, duration: 0.25, stagger: 0.25, ease: "power3.out" }, 6.5);',
      out(["#b-s0","#b-sl3","#b-s4"],8.75)]))

    sc["mission"] = (f"""
    #root {{ background: #141010; color: #141010; }}
    #b-fl {{ position: absolute; inset: 0; background: #e0592a; transform-origin: 50% 100%; }}
    #b-mk {{ position: absolute; left: 120px; top: 160px; font-family: {MONO}; font-size: 34px; font-weight: 700; letter-spacing: 0.1em; }}
    #b-mt {{ position: absolute; left: 110px; top: 230px; width: 1720px; font-size: 168px; font-weight: 900; letter-spacing: -0.055em; line-height: 0.92; }}
    #b-mt .wh {{ color: #fff; }}
    #b-ms {{ position: absolute; left: 120px; top: 830px; width: 1500px; font-size: 38px; line-height: 1.35; font-weight: 700; }}""",
    "\n".join([clip("b-fl","div","","",7.4,'data-layout-ignore'), clip("b-mk","p","","OUR MISSION",7.4),
      clip("b-mt","h2","", words("Every small seller,") + "<br/>" + '<span class="w wh">ready</span> <span class="w wh">for</span> <span class="w wh">the</span> <span class="w wh">AI</span> <span class="w wh">era.</span>',7.4),
      clip("b-ms","p","","PayPal believes everyone deserves a place in the digital economy. We carry that into the age of AI agents.",7.4)]),
    "\n".join(['    tl.fromTo("#b-fl", { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: "power2.inOut" }, 0);',
      blurin("#b-ms",0.4), blurin("#b-mk",2.7), wordsin("#b-mt",2.9,0.1), out(["#b-mk","#b-mt","#b-ms"],7.15)]))

    sc["how"] = (f"""
    #root {{ background: #141010; color: #fff; }}
    #b-ht {{ position: absolute; left: 120px; top: 90px; font-size: 92px; font-weight: 900; letter-spacing: -0.045em; }}
    #b-ht .acc {{ color: #e0592a; }}
    #b-hl {{ position: absolute; left: 120px; top: 930px; font-family: {MONO}; font-size: 30px; color: rgba(255,255,255,0.6); }}""",
    "\n".join([clip("b-ht","h2","", words("Talk to your stall.") + ' <span class="w acc">Get</span> <span class="w acc">an</span> <span class="w acc">agent.</span>',8.2),
      clip("b-hl","p","","price · lowest price 🔒 · sell-by · prices elsewhere · bulk deals · leftovers",8.2)]),
    "\n".join([wordsin("#b-ht",0.2,0.09), blurin("#b-hl",3.0), out(["#b-ht","#b-hl"],7.95)]))

    sc["sell"] = (f"""
    .log {{ position: absolute; right: 80px; width: 760px; padding: 16px 22px; border-radius: 14px; background: rgba(20,16,16,0.92); color: #fff; font-family: {MONO}; font-size: 28px; }}
    .log b {{ color: #e0592a; }} .log.pp b {{ color: #7fb2ff; }}
    #b-l1 {{ top: 120px; }} #b-l2 {{ top: 200px; }} #b-l3 {{ top: 280px; }} #b-l4 {{ top: 120px; }}
    #b-tag {{ position: absolute; left: 80px; top: 60px; padding: 12px 22px; border-radius: 999px; background: #0b2a5c; color: #fff; font-size: 28px; font-weight: 700; }}
    #b-big {{ position: absolute; left: 80px; bottom: 70px; padding: 18px 30px; background: #e0592a; color: #fff; font-size: 64px; font-weight: 900; letter-spacing: -0.04em; }}""",
    "\n".join(['    <p id="b-l1" class="log clip" data-start="0.2" data-duration="3.4"><b>GET</b> /agentic/feed</p>',
      '    <p id="b-l2" class="log clip" data-start="0.9" data-duration="2.7"><b>POST</b> /checkout_sessions · offer</p>',
      '    <p id="b-l3" class="log clip" data-start="1.6" data-duration="2.0"><b>200</b> counter $5.45 · agreed</p>',
      '    <p id="b-l4" class="log pp clip" data-start="3.8" data-duration="3.6"><b>PayPal</b> Orders v2 capture · COMPLETED</p>',
      '    <p id="b-tag" class="clip" data-start="3.8" data-duration="3.6">PayPal Sandbox · test money</p>',
      '    <p id="b-big" class="clip" data-start="4.2" data-duration="3.2">PayPal pays.</p>']),
    "\n".join([*[f'    tl.fromTo("#b-l{i}", {{ opacity: 0, x: 40 }}, {{ opacity: 1, x: 0, duration: 0.25, ease: "expo.out" }}, {[0.2,0.9,1.6,3.8][i-1]});' for i in (1,2,3,4)],
      '    tl.fromTo("#b-big", { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: 0.3, ease: "expo.out" }, 4.2);']))

    sc["end"] = ("""
    #root { background: #141010; color: #fff; }
    #b-logo { position: absolute; left: 0; right: 0; top: 330px; text-align: center; font-size: 240px; }
    #b-tg { position: absolute; left: 0; right: 0; top: 630px; text-align: center; font-size: 54px; font-weight: 900; letter-spacing: -0.035em; }
    #b-tg .acc { color: #e0592a; }
    #b-url { position: absolute; left: 0; right: 0; top: 740px; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 32px; color: rgba(255,255,255,0.55); }""",
    "\n".join([f'    <div id="b-logo" class="clip" data-start="0" data-duration="6.9">{LOGO}</div>',
      clip("b-tg","p","", words("Teach your stall.") + ' <span class="w acc">It</span> <span class="w acc">haggles</span> <span class="w acc">with</span> <span class="w acc">AI.</span> ' + words("PayPal pays."),6.9),
      clip("b-url","p","","jomm.onrender.com",6.9)]),
    "\n".join(['    tl.fromTo("#b-logo", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.4)" }, 0.1);',
      wordsin("#b-tg",1.3,0.18), blurin("#b-url",4.4)]))

    th, tj = teach_footage("left:120px;top:220px;width:1680px;height:680px;border:3px solid #e0592a", z=3, vstyle="left:-140px;top:-120px;width:1960px;height:1103px;object-fit:fill",
        cam='      tl.fromTo("#teachw", { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.3, ease: "expo.out" }, 22.6);\n      tl.to("#teachw", { opacity: 0, duration: 0.15 }, 30.0);')
    sh, sj = sell_footage()
    write("b", "#141010", sc, th + "\n" + sh, tj + "\n" + sj)
