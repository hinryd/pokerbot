FROM node:trixie-slim AS build

WORKDIR /app

ENV DATABASE_URL=/data/pokerbot.sqlite
ENV ORIGIN=http://localhost:3000
ENV BETTER_AUTH_SECRET=docker-build-secret

RUN mkdir -p /data

COPY package.json ./
RUN npm install --ignore-scripts \
	&& npm rebuild better-sqlite3

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/data/pokerbot.sqlite
ENV ORIGIN=http://localhost:3000
ENV BETTER_AUTH_SECRET=change-me-in-production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "build/index.js"]
