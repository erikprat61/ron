FROM oven/bun:1.3.14-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json bun.lock tsconfig.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY apps/demo-ui/package.json ./apps/demo-ui/package.json
COPY packages ./packages

RUN bun install --frozen-lockfile --production

EXPOSE 8080

CMD ["bun", "run", "apps/api/src/server.ts"]
