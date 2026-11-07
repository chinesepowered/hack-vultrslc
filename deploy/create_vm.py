"""Provision Unbothered on Vultr with the Vultr API.

Creates a firewall group (80/443 for the app, 22 for SSH), a Serverless Inference
subscription if you don't pass a key, and a VX1 instance whose cloud-init user data
(deploy/user-data.sh) fetches this repo and runs deploy/setup.sh. Secrets are read from
the environment and only sent to the Vultr API.

usage:
  VULTR_API_KEY=... ADMIN_TOKEN=... [VULTR_INFERENCE_API_KEY=...] python3 deploy/create_vm.py
optional: REGION (sea), PLAN (vx1-g-4c-16g-240s), BRANCH (main), LABEL (unbothered)
"""
import base64, json, os, urllib.request

API = "https://api.vultr.com/v2"
KEY = os.environ["VULTR_API_KEY"]
REGION = os.environ.get("REGION", "sea")
PLAN = os.environ.get("PLAN", "vx1-g-4c-16g-240s")
BRANCH = os.environ.get("BRANCH", "main")
LABEL = os.environ.get("LABEL", "unbothered")
HERE = os.path.dirname(os.path.abspath(__file__))


def call(method, path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def user_data(inference_key: str, admin_token: str, owner_login: str = "") -> str:
    tpl = open(os.path.join(HERE, "user-data.sh")).read()
    return (tpl.replace("__INFERENCE_KEY__", inference_key).replace("__ADMIN_TOKEN__", admin_token)
               .replace("__OWNER_LOGIN__", owner_login).replace("__REGION_LABEL__", f"Vultr {REGION}")
               .replace("__BRANCH__", BRANCH))


if __name__ == "__main__":
    # Serverless Inference: use the given key, or create a subscription and read its key
    inference_key = os.environ.get("VULTR_INFERENCE_API_KEY")
    if not inference_key:
        sub = call("POST", "/inference", {"label": LABEL})["subscription"]
        inference_key = sub["api_key"]
        print("created Serverless Inference subscription", sub["id"])

    # Firewall group: web ports for the app, SSH for administration
    fw = call("POST", "/firewalls", {"description": f"{LABEL}-web"})["firewall_group"]["id"]
    for port in ("22", "80", "443"):
        for ip_type, subnet in (("v4", "0.0.0.0"), ("v6", "::")):
            call("POST", f"/firewalls/{fw}/rules", {"ip_type": ip_type, "protocol": "tcp", "subnet": subnet, "subnet_size": 0, "port": port})
    print("firewall group", fw)

    os_id = next(o["id"] for o in call("GET", "/os?per_page=500")["os"] if o["name"].startswith("Ubuntu 24.04") and o["arch"] == "x64")
    inst = call("POST", "/instances", {
        "region": REGION, "plan": PLAN, "os_id": os_id, "label": LABEL, "hostname": LABEL,
        "firewall_group_id": fw, "enable_ipv6": True, "backups": "disabled",
        "user_data": base64.b64encode(user_data(inference_key, os.environ["ADMIN_TOKEN"]).encode()).decode(),
    })["instance"]
    print("instance", inst["id"], "is provisioning; its IP appears in the Vultr console in a minute.")
    print("Progress shows at http://<ip>/status.txt; the app comes up at https://<ip-with-dashes>.sslip.io in about 10 minutes.")
