# syntax=docker/dockerfile:1
# The "tub": a disposable browser sandbox. One container per task, destroyed afterwards.
# It holds no API keys, no agent code and no model access: just Chromium behind a
# Playwright browser server that the control plane drives over the sandbox network.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /tub
# An optional build secret "ca" lets builds work behind a TLS-intercepting proxy without
# baking that certificate into the image. Normal builds (e.g. on the Vultr VM) skip it.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund playwright@1.63.0 && npm cache clean --force
COPY server.mjs /tub/server.mjs

# Unprivileged user that ships with the Playwright image.
USER pwuser
ENV HOME=/tmp NODE_ENV=production
EXPOSE 3000
CMD ["node", "/tub/server.mjs"]
