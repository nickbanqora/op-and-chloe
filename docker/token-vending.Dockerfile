# syntax=docker/dockerfile:1.6
FROM node:22-slim

RUN groupadd --gid 1500 vending \
 && useradd --uid 1500 --gid vending --create-home vending

WORKDIR /app

COPY token-vending/package.json token-vending/package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY token-vending/server.js token-vending/config.js ./
COPY token-vending/providers/ ./providers/

RUN mkdir -p /var/run/token-vending && chown vending:vending /var/run/token-vending

USER vending

CMD ["node", "server.js"]
