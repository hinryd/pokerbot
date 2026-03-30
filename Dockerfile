FROM node:24-slim

WORKDIR /app

COPY . .
RUN mkdir -p /data

RUN npm install -g pnpm@latest-10
RUN pnpm install
RUN pnpm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4892
ENV DATABASE_URL=/data/pokerbot.sqlite

EXPOSE 4892

CMD ["pnpm", "db:push", "&&", "node", "build/index.js"]
