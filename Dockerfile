FROM node:trixie-slim AS build

WORKDIR /app

ENV DATABASE_URL=/data/pokerbot.sqlite
ENV ORIGIN=http://localhost:3000
ENV BETTER_AUTH_SECRET=docker-build-secret

COPY package.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

FROM node:trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/data/pokerbot.sqlite
ENV ORIGIN=http://localhost:3000
ENV BETTER_AUTH_SECRET=change-me-in-production

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/build ./build

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "build/index.js"]
