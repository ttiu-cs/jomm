"""Narration for the three full-length versions (style C). Each beat: (id, kind, narration)."""

V1 = ("v1", "Mission first, then the walkthrough", [
  ("hook",    "Shopping is changing. Soon, people won't browse. They'll send an AI agent to shop for them."),
  ("big",     "Big retailers will plug into this fast. They have catalogs, APIs and engineering teams."),
  ("small",   "But most of the world's sellers are small. A fruit stall. A closet. One person, with no website and no tech team."),
  ("mission", "PayPal has always believed that everyone deserves a place in the digital economy. Our mission is to carry that into the AI era."),
  ("promise", "With Jomm, any small seller can make their own AI selling agent in minutes, just by talking to it."),
  ("rosa",    "Rosa runs a three-crate fruit stall. She points her phone at each crate and talks. Her agent keeps asking until it knows enough to haggle: the price, the lowest she'll take, how soon it must sell, and what the supermarket charges."),
  ("mina",    "Mina sells clothes from her closet. Her agent looks up what each item costs new on Channel3, and suggests a fair resale price."),
  ("intent",  "Now a shopper tells their own AI agent what they want. Strawberries for a party tonight. Three boxes, under seventeen dollars."),
  ("haggle",  "The shopper's OpenAI agent reads Rosa's product feed and opens a checkout session, in the Agentic Commerce Protocol shape that PayPal Agent Ready accepts. The agents haggle. Every counter comes with a reason, and Rosa's lowest price never leaves her side."),
  ("approve", "The agent can't pay on its own. The server creates a PayPal Orders v2 order for the agreed amount, and the shopper approves it in PayPal. This is the PayPal Sandbox, so it's test money."),
  ("paid",    "The server captures and verifies the payment, and the buyer agent double-checks it with the PayPal Agent Toolkit. On Rosa's phone: sixteen thirty-five, received."),
  ("rex",     "And when an agent lowballs, Rosa's agent holds the line. No deal, nothing charged."),
  ("stack",   "Built with PayPal Orders v2, the PayPal Agent Toolkit and ACP-style checkout sessions, with OpenAI agents and Channel3 product data, deployed on Render."),
  ("end",     "Jomm. Every small seller, ready for the AI era."),
])

V2 = ("v2", "A day at Rosa's stall", [
  ("dawn",    "Six A.M. Rosa sets out three crates. Strawberries, peaches, apples. No website. No app. No tech team."),
  ("shift",   "But more and more of her customers won't walk by. They'll send an AI agent to shop for them. And those agents only talk to stores that speak their language."),
  ("mission", "PayPal believes everyone deserves a place in the digital economy. We built Jomm so that includes Rosa, in the AI era. Any small seller can create their own selling agent in minutes, just by talking."),
  ("teach",   "Six ten. Rosa points her phone at each crate and talks, like she's training a new helper. Her agent asks what it needs to haggle like her: the price, the lowest price, when it has to go, and what the supermarket charges."),
  ("intent",  "Two P.M. Across town, Jun is planning a party. He tells his AI agent: three boxes of strawberries, under seventeen dollars."),
  ("haggle",  "Jun's agent finds Rosa's stall through its product feed and opens a checkout session. The agents haggle. Rosa's agent knows the strawberries must go tonight, so it gives a little, with a reason. Her lowest price stays private."),
  ("approve", "They agree at sixteen thirty-five. Agents can't pay on their own, so Jun approves it in PayPal. Here, in the PayPal Sandbox."),
  ("paid",    "The server captures and verifies it, and Jun's agent checks it with the PayPal Agent Toolkit. Rosa's phone buzzes. She never looked up from her crates."),
  ("rex",     "Four P.M. Another agent offers five dollars for two boxes. Rosa's agent holds the line. No deal, nothing charged."),
  ("mina",    "Across town, Mina does the same with her closet. Her agent checks new prices on Channel3 and suggests a fair resale range."),
  ("stack",   "Six P.M. Built on PayPal Orders v2, the Agent Toolkit and ACP-style checkout, with OpenAI and Channel3, running on Render."),
  ("end",     "Jomm. Teach your stall. It haggles with AI. PayPal pays."),
])

V3 = ("v3", "Three steps, under the hood", [
  ("question","What would it take for a one-person shop to sell to an AI shopping agent?"),
  ("today",   "Today, that means a catalog API, a checkout integration and a payments team. The smallest sellers have none of that."),
  ("mission", "Our mission: put every small seller on the rails PayPal is building for agentic commerce, just by talking. PayPal believes everyone deserves a place in the digital economy. That should include the AI economy."),
  ("steps",   "Jomm does it in three steps. Teach. Negotiate. Get paid."),
  ("mina",    "Step one: teach. Mina points her phone at a Levi's jacket and talks. Her agent looks up new prices on Channel3 and suggests a resale range."),
  ("rosa",    "Rosa does the same with her fruit. Her agent learns her prices, her private lowest price, and her reasons, like closing time and supermarket prices."),
  ("feed",    "Step two: negotiate. A shopper's OpenAI agent reads Rosa's product feed, modeled on PayPal Store Sync. Prices and the owner's own words, never her floor."),
  ("checkout","It opens a checkout session in the Agentic Commerce Protocol shape, with PayPal as the payment provider. Our negotiation extension adds offer, counter and final offer, and each counter carries a reason."),
  ("guard",   "The server enforces the rules. The shopper's budget is a mandate the agent can't exceed, and amounts are set by the server, never by an agent."),
  ("pay",     "Step three: get paid. Completing the session creates a PayPal Orders v2 order. The shopper approves it in the PayPal Sandbox, and the server captures and verifies it."),
  ("toolkit", "Then the buyer agent calls get order through the PayPal Agent Toolkit to confirm. Rosa's phone shows the sale."),
  ("stack",   "OpenAI, Channel3, PayPal Orders v2 and the Agent Toolkit, deployed on Render. Try it live at jomm dot onrender dot com."),
  ("end",     "Jomm. Every small seller, ready for the AI era."),
])

VERSIONS = [V1, V2, V3]

V4 = ("v4", "A day at Rosa's stall, with the tech underneath", [
  ("dawn",    V2[2][0][1]),
  ("shift",   V2[2][1][1]),
  ("why",     "Big stores sell at one fixed price. A stall haggles. But agent checkout carries a price, not a conversation. So Jomm adds one."),
  ("mission", V2[2][2][1]),
  ("teach",   V2[2][3][1]),
  ("listing", "Her words become listings: a price, a private lowest price, and her reasons, like closing time and what the supermarket charges."),
  ("intent",  V2[2][4][1]),
  ("feed",    "Jun's agent reads Rosa's product feed, modeled on PayPal Store Sync. Prices and her own words, never her floor."),
  ("checkout","It opens a checkout session in the Agentic Commerce Protocol shape, with PayPal as the payment provider. Jomm adds negotiation to that session, so the agents can haggle. The strawberries must go tonight, so Rosa's agent gives a little, with a reason."),
  ("guard",   "The server enforces the rules. Jun's budget is a mandate his agent can't exceed. Rosa's lowest price stays private, and only she sees why her agent priced it that way."),
  ("approve", "They agree at sixteen thirty-five. Agents can't pay on their own, so completing the session creates a PayPal Orders v2 order, and Jun approves it in the PayPal Sandbox."),
  ("paid",    "The server captures and verifies it, and Jun's agent confirms it with get order from the PayPal Agent Toolkit. Rosa's phone buzzes. She never looked up from her crates."),
  ("rex",     V2[2][8][1]),
  ("mina",    V2[2][9][1]),
  ("stack",   V2[2][10][1]),
  ("end",     V2[2][11][1]),
])
VERSIONS.append(V4)
