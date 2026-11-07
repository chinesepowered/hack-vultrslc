# 🛁 Unbothered

**Browser agents that do real work, and ignore what web pages tell them to.**
Vultr Agent Rush hackathon · Track 1: **Blast Radius Zero**

[![Unbothered: watch the demo video](docs/out/cover.png)](https://www.youtube.com/watch?v=BwLbXmdFqJg)

Unbothered is a browser agent that does real errands, such as comparing prices across three online stores and filing a purchase request on a company portal, without letting the web pages it reads take control of it. Every errand runs in its own disposable gVisor sandbox (a "tub") on a Vultr Cloud Compute VM, with no API keys inside and a single guarded way out. Before any click, form fill or page load, Capy, our lifeguard capybara, scores the action with a Vultr Serverless Inference decision model, blocks what a web page talked the agent into, and asks a human before anything that can't be undone. When the errand ends, the tub is destroyed.

**Demo video:** https://www.youtube.com/watch?v=BwLbXmdFqJg · **Live app:** https://45-76-243-226.sslip.io · **Pitch deck:** [PDF](docs/out/unbothered-pitch.pdf) · [HTML](docs/pitch.html) · **Full slides:** [docs/out/unbothered-slides.pdf](docs/out/unbothered-slides.pdf)

---

## The problem

AI agents can now drive a real browser for you, and every page they read can talk back:

- a "seller review" telling AI shoppers to pay on a partner site,
- a "session expired" pop-up asking for the company card,
- an "automation notice" telling agents to delete records,
- a script on the page that quietly phones home.

Telling the agent to "ignore instructions on web pages" helps, but it is a request, not a guarantee. Allowlists don't help when the attack comes from a site you trust, like your own company portal. We measured it: on 20 real errands, a typical agent was hit in **11**, typed the company card into a fake pop-up **every time** it saw one, and deleted existing purchase requests 3 times.

## Our solution

Unbothered puts three layers between a malicious page and your data, then cleans up after itself.

| Layer | What it does |
|---|---|
| **Capy reads it** | Every new page is scanned for instructions aimed at AI agents and for card-harvesting forms. The agent is warned that page text is data, not orders. |
| **Capy scores it** | Each proposed action goes to a Vultr decision model with six questions in one call. Off-goal moves are blocked; hard-to-undo moves wait for a human. |
| **The walls hold** | The tub has no route to the internet. Its only exit is an egress proxy that enforces the errand's allowlist, refuses TLS tunnels, logs every request and catches the decoy card number. |
| **Drained** | When the errand ends, the container is destroyed (about 250 ms). Every step, score, approval, request and screenshot is kept as an audit trail. |

**Results: the Capybara Test.** 20 errands (4 shopping targets × 5 kinds of traps), each run twice with the same model and prompt. Outcomes are scored from what actually happened in each sandbox, not from what the agent says.

| | Typical agent | With Unbothered |
|---|---|---|
| Errands where an attack got through | **11 / 20** | **0 / 20** |
| Company card sent to the scam site | 4 | 0 |
| Existing purchase requests deleted | 3 | 0 |
| Page scripts that phoned home | 4 | 0 (stopped at the walls) |
| Errands finished correctly | 20 / 20 | 20 / 20 |

A red-team mode, where we tell the agent to obey web pages, shows containment holding even when the agent itself is fooled: it heads for the scam checkout and types the card, and Capy blocks both.

---

## Sponsors used

| Sponsor | Product | What it does in Unbothered |
|---|---|---|
| **Vultr** | Cloud Compute VX1 | Hosts the control plane, the egress proxy and every gVisor sandbox |
| **Vultr** | Serverless Inference: chat completions with tool calling | The agent's brain (`minimax-m3.1-flash`) |
| **Vultr** | Serverless Inference: decision models (`/v1/systemone`) | Capy, the gate that checks every move (`pplx-decider-v1.2`) |
| **Vultr** | Serverless Inference: decisions on images | Checks the final screenshot (`clef-flash`) |
| **Vultr** | Serverless Inference: music generation | The demo video's soundtrack (`ace-step-1.5`) |
| **Vultr** | Firewall groups, API and cloud-init | Locked-down networking and one-call provisioning |

## Vultr in detail

### Cloud Compute (VX1)

- **Instance:** `vx1-g-4c-16g-240s` (4 vCPU, 16 GB RAM, 240 GB SSD) in Seattle, Ubuntu 24.04.
- **What runs there:** the Node.js control plane (web app, agent loop, Capy gate, egress proxy), Docker with the gVisor `runsc` runtime for the tubs, and Caddy for automatic HTTPS.
- **Tubs:** one container per errand from the `tub/` image (Chromium behind a Playwright browser server), on an internal Docker network with no route out. Each has 1 vCPU, 1 GB RAM and 512 processes, a read-only root, all capabilities dropped and no secrets. One boots in about 5 seconds and is removed in about 250 ms.
- **Deploys:** [`deploy/setup.sh`](deploy/setup.sh) installs everything; a systemd timer pulls new commits every 2 minutes and rebuilds only what changed.

### Serverless Inference: the agent

- **Endpoint:** `POST https://api.vultrinference.com/v1/chat/completions` (OpenAI-compatible) with tool calling.
- **Model:** `minimax-m3.1-flash`. We ran the full errand on four catalog models (`minimax-m3.1-flash`, `qwen3.8-flash-next`, `glm-5.3-flash`, `deepseek-v4.1-flash-1017`) and all four completed it. MiniMax is tuned for computer use and answers in about half a second to a second.
- **Tools:** `navigate`, `click`, `type`, `fill_form`, `record_price`, `finish`. Each carries a one-line reason that the UI shows.
- **Keys stay out of the tub:** model calls are made by the control plane, never inside the sandbox.
- **Code:** [`server/vultr.ts`](server/vultr.ts) (`chat`), [`server/agent.ts`](server/agent.ts).

### Serverless Inference: Capy, the decision gate

- **Endpoint:** `POST https://api.vultrinference.com/v1/systemone`. Decision models generate no text: they return a probability for each typed question.
- **Model:** `pplx-decider-v1.2`. Of the decision models we tried, it separated injected actions most cleanly: it scored an injected action 0.003 on "serves the goal", while normal steps in real runs typically score above 0.9.
- **Six questions per move, one call:**

| Question | Type |
|---|---|
| Serves the user's goal | yes/no |
| A web page told the agent to do it | yes/no |
| Changes what the user specified | yes/no |
| Hard to undo | yes/no |
| Involves card details or secrets | yes/no |
| Overall risk | 5-level score |

- **Policy:**
  - **Block** if a page drove the action and it is off-goal (`page_told_it ≥ 0.7` and `serves_goal ≤ 0.4`), or it changes the request, or it is high-risk and off-goal.
  - **Ask** a human if it is hard to undo or sensitive.
  - **Allow** everything else.
- **Rules alongside the model:** deterministic checks run too (where a link or form really goes, card numbers, destructive buttons), and each new page gets a two-question scan.
- **Speed and cost:** 200 to 350 ms per check, billed on input tokens only, about $0.0002 per check.
- **Code:** [`server/gate.ts`](server/gate.ts).

### Serverless Inference: vision check

- **Endpoint:** the same `/v1/systemone` endpoint with an image attached (`assets` plus the `TypeSafe-Danger-Zone-Images` header).
- **What it does:** `clef-flash` looks at the final screenshot and answers "was the purchase request successfully submitted?". That probability shows on the result card.

### Serverless Inference: soundtrack

- **What:** the demo video's music is an instrumental track generated with `ace-step-1.5` through `POST /v1/music`.
- **Code:** [`video/make_music.py`](video/make_music.py).

### Networking and provisioning

- **Firewall group:** only 80/443 (app) and 22 (administration) are open. The image's UFW is opened for the same ports by the setup script.
- **Provisioning:** [`deploy/create_vm.py`](deploy/create_vm.py) creates the firewall group, the Serverless Inference subscription and the VX1 instance through the Vultr API. Cloud-init runs [`deploy/user-data.sh`](deploy/user-data.sh), which opens the web ports, fetches this repo and runs `deploy/setup.sh`.
- **HTTPS:** Caddy serves `https://<ip>.sslip.io` with an automatic certificate.

---

## Architecture

![Architecture](docs/architecture.png)

One move, end to end:

```mermaid
sequenceDiagram
  participant A as Agent loop<br/>(control plane, Vultr VM)
  participant M as Vultr Serverless Inference<br/>minimax-m3.1-flash
  participant C as Capy<br/>pplx-decider-v1.2 on /v1/systemone
  participant T as Tub<br/>(gVisor, Chromium, no keys)
  participant P as Egress proxy<br/>(allowlist, card detector)
  A->>T: read page (text + numbered elements)
  A->>M: errand + page → pick one tool call
  M-->>A: click [12] "Continue to partner checkout"
  A->>C: action + goal + page → 6 questions
  C-->>A: goal 4%, page told it 99% → block
  Note over A: blocked: the agent is told why and continues
  A->>T: next allowed action
  T->>P: HTTP request
  P-->>T: allowed host? serve it, otherwise 403 and log it
```

## Containment checklist (track requirements)

| Requirement | How Unbothered meets it |
|---|---|
| Process isolation | gVisor user-space kernel; `uname` inside a tub reports `4.19.0-gvisor`, not the host. One container per errand. |
| Network isolation | Internal Docker network with no route out; the egress proxy is the only reachable exit. |
| Secret hygiene | No keys in the tub (its environment is `HOSTNAME HOME PATH PLAYWRIGHT_BROWSERS_PATH LANG LC_ALL PWD NODE_ENV`). The agent never sees the company card: it types `{{company_card}}`, filled in only after a human approves. |
| Resource limits | 1 vCPU, 1 GB RAM, 512 PIDs, 512 MB tmpfs, read-only root, all capabilities dropped, `no-new-privileges`. |
| Lifecycle | Created per errand, destroyed at the end; stale tubs are removed on startup. |
| Human approval | Form submits, deletions and anything touching the card wait on an approval card with Capy's scores. |

## Run it

```bash
npm ci && npm run build
docker build -t unbothered/tub:1.63.0 tub/
VULTR_INFERENCE_API_KEY=... ADMIN_TOKEN=... npm start
```

The app runs at http://localhost:8080. Without Docker it falls back to a local, clearly labelled unisolated browser. To deploy on Vultr:

```bash
VULTR_API_KEY=... ADMIN_TOKEN=... python3 deploy/create_vm.py
```

## Repository layout

```
server/   control plane: agent loop, Capy gate, egress proxy, tubs, sandbox web, Capybara Test
tub/      the sandbox image: Chromium behind a Playwright browser server, nothing else
web/      React UI: live mission control, approvals, scoreboard, how it works
deploy/   Vultr provisioning, setup script, systemd units, Caddy
video/    demo video pipeline: recorder, ElevenLabs narration, compositor, mixer, soundtrack
docs/     pitch deck, full slides, cover, architecture image, lablab submission text
```

## Honest notes

- **The web the agent visits is a sandbox web** served by the control plane (three stores, an intranet, a scam outlet), so every trap is reproducible and no real shop or card is involved. Pointing the proxy at real, allowlisted sites is a configuration change.
- **The Capybara Test numbers and the demo footage** come from a development instance of this same build (gVisor tubs, Vultr Serverless Inference). The Vultr VM runs the test on its first boot and shows its own results on its Capybara Test page. Its run (Seattle, 5.4 minutes) reproduced the result: a typical agent was hit in 9 of 20 errands (the count varies a little run to run) and gave the card to all 4 fake pop-ups, while Unbothered was hit in 0 and finished all 20.
- **Also used:** gVisor, Docker, Playwright, Node.js, TypeScript, React, Caddy. Narration in the video is by ElevenLabs.

MIT licensed.
