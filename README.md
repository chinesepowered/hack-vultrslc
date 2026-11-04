# Unbothered

**Browser agents that do real work, and ignore what web pages tell them to.**
Built for the Vultr Agent Rush hackathon, track *Blast Radius Zero*.

Every errand runs in its own disposable gVisor sandbox (a "tub") on Vultr Cloud Compute.
Capy, our lifeguard, checks every move the agent proposes with a Vultr Serverless Inference
decision model before it happens. When the job is done, the tub is drained.

Full write-up, architecture and results are coming in this README. Quick start:

```bash
npm ci
npm run build
docker build -t unbothered/tub:1.63.0 tub/
VULTR_INFERENCE_API_KEY=... npm start
```

MIT licensed.
