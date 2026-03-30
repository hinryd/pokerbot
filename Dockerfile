FROM oven/bun:slim AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json pnpm-lock.yaml ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/build ./build

RUN mkdir -p /data

EXPOSE 3000

CMD ["bun", "build/index.js"]
