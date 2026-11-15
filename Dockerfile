# Stage 1: build the Astro site into /app/site/dist
FROM node:24-alpine AS site
WORKDIR /app/site
COPY site/package.json site/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY site/ ./
RUN npm run build

# Stage 2: the Danet backend serving the built site
FROM denoland/deno:2.9.7
WORKDIR /app/backend
COPY backend/deno.json backend/deno.lock ./
COPY backend/src ./src
# Cache dependencies as the user that runs the server, so DENO_DIR stays writable for it
USER deno
RUN deno cache src/main.ts
COPY --from=site /app/site/dist /app/site/dist

ENV PORT=3000
EXPOSE 3000
CMD ["run", "--cached-only", "--allow-net", "--allow-read", "--allow-env", "src/main.ts"]
