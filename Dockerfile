FROM node:24-slim

WORKDIR /app

COPY . .

RUN npm install -g pnpm@latest-10
RUN pnpm install

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4892

ARG BETTER_AUTH_SECRET
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

ARG ORIGIN
ENV ORIGIN=$ORIGIN

RUN sh -c "echo 'NODE_ENV: $NODE_ENV'"
RUN sh -c "echo 'HOST: $HOST'"
RUN sh -c "echo 'PORT: $PORT'"
RUN sh -c "echo 'ORIGIN: $ORIGIN'"
RUN sh -c "echo 'BETTER_AUTH_SECRET: $BETTER_AUTH_SECRET'"
RUN sh -c "echo 'DATABASE_URL: $DATABASE_URL'"

RUN pnpm run build
RUN pnpm run db:push --force

EXPOSE 4892

CMD ["node", "build/index.js"]
