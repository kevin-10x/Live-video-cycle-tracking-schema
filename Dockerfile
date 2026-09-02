# Stage 1: build dependencies (compile native sqlite3 bindings)
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Stage 2: runtime
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production PORT=4100

# minimal runtime deps (sqlite needs some shared libs; prebuilt node binaries are self-sufficient)
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data

EXPOSE 4100

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
