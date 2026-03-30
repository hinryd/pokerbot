FROM node:trixie-slim AS build

WORKDIR /app

ARG ORIGIN
ENV ORIGIN=$ORIGIN

ARG BETTER_AUTH_SECRET
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

RUN sudo apt-get install python3

COPY . .
RUN mkdir -p /data

RUN npm install -g pnpm@latest-10

RUN pnpm install

RUN pnpm run build

FROM node:trixie-slim AS runtime

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/build ./build
COPY --from=build /app/data ./data

EXPOSE 4892

CMD ["node", "build/index.js"]
