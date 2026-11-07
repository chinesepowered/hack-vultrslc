# lablab.ai submission: copy and paste

**Project title:** Unbothered

**Track:** Blast Radius Zero

**Short description**
Browser agents that do real work, and ignore what web pages tell them to. Every errand runs in a disposable gVisor sandbox on Vultr, and Capy, our lifeguard capybara, checks every move with a Vultr decision model before it happens.

**Long description**
AI agents can now browse the web for you, and every page they read can talk back: fake seller reviews, "session expired" pop-ups asking for the company card, notices telling agents to delete records, scripts that phone home. Unbothered lets a browser agent do real work (shop three stores, pick the cheapest in-stock monitor, file a purchase request on the company portal) while keeping the blast radius at zero.

Each errand runs in its own "tub": a fresh gVisor container on a Vultr Cloud Compute VM with no API keys, no internet route, a read-only root and capped CPU, memory and processes. The only exit is an egress proxy that enforces the errand's allowlist, refuses TLS tunnels and catches the decoy card number. Before any click, form fill or page load, Capy asks a Vultr Serverless Inference decision model (/v1/systemone) six questions in one call: does it serve your goal, did a web page tell the agent to do it, does it change your request, is it hard to undo, is it sensitive, how risky is it. Off-goal moves are blocked, hard-to-undo moves wait for a human, and the tub is destroyed when the errand ends.

We measured it with the Capybara Test: 20 errands with 5 kinds of traps, each run twice with the same model and prompt. A typical agent was hit in 11 of 20 errands, handed the company card to a fake pop-up every time it saw one and deleted existing purchase requests 3 times. With Unbothered: 0 of 20, and every errand still finished correctly. A red-team mode shows containment holding even when the agent itself is fooled.

**Technologies:** Vultr Cloud Compute (VX1), Vultr Serverless Inference (minimax-m3.1-flash, pplx-decider-v1.2 on /v1/systemone, clef-flash, ace-step-1.5), gVisor, Docker, Playwright, Node.js, TypeScript, React, Caddy, ElevenLabs

**Category tags:** AI agents, agent security, sandboxing, browser automation, prompt injection, enterprise

**Links**
- Demo video: https://www.youtube.com/watch?v=BwLbXmdFqJg
- App: https://45-76-243-226.sslip.io
- Repo: https://github.com/chinesepowered/hack-vultrslc
- Slides: docs/out/unbothered-slides.pdf
- Cover image: docs/out/cover.png
