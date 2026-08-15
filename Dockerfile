FROM oven/bun:1.3.11 AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.11
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun assets ./assets
RUN bun run build:web
USER bun
CMD ["bun", "run", "src/server.ts"]
