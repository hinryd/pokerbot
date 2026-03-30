FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN mkdir -p /data
RUN pnpm build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4892
ENV DATABASE_URL=/data/pokerbot.sqlite

EXPOSE 4892

CMD ["sh", "-c", "pnpm db:push && node build/index.js"]
