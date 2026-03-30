FROM node:trixie-slim AS build

WORKDIR /app

ENV DATABASE_URL=/data/pokerbot.sqlite
ENV ORIGIN=http://localhost:4892
ENV BETTER_AUTH_SECRET=docker-build-secret

RUN mkdir -p /data

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4892

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

RUN mkdir -p /data

EXPOSE 4892

CMD ["node", "build/index.js"]
