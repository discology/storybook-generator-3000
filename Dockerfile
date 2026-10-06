# The hosted app (Fly.io): one container where the API also serves the built
# web app. The database and every saved file live on a volume at /data.
FROM node:24-bookworm-slim

# Prisma needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV DATABASE_URL=file:/data/storybook.db

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["sh", "deploy/start.sh"]
