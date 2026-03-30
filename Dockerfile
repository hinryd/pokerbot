FROM node:trixie-slim AS build

WORKDIR /app

ENV DATABASE_URL=/data/pokerbot.sqlite

COPY . .
RUN mkdir -p /data

RUN npm install

RUN npm run build

FROM node:trixie-slim AS runtime

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/data ./data

EXPOSE 4892

CMD ["node", "build/index.js"]
