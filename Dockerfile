FROM node:trixie-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/build ./build

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "build/index.js"]
