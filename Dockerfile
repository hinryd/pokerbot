FROM oven/bun:slim AS deps

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN bun install

FROM deps AS build

COPY . .
RUN bun run build

FROM oven/bun:slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app /app

RUN mkdir -p /data

EXPOSE 3000

CMD ["sh", "-c", "bun run db:push -- --force && bun build/index.js"]
