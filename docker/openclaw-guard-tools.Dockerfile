# syntax=docker/dockerfile:1.6

ARG OPENCLAW_BASE_IMAGE=ghcr.io/openclaw/openclaw:main
FROM ${OPENCLAW_BASE_IMAGE}

USER root
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG TARGETARCH

# Core CLI dependencies. Bitwarden runs in the worker only; guard has no BW or bridge.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq git \
 && rm -rf /var/lib/apt/lists/*

# Guard-control volume mount point (owned by node so Op can write pause/resume signals)
RUN mkdir -p /var/run/guard-control && chown node:node /var/run/guard-control

USER node
