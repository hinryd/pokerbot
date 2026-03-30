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

ARG BETTER_AUTH_SECRET
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

EXPOSE 4892

CMD ["pnpm", "db:push", "&&", "node", "build/index.js"]
