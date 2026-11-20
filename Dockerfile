# Stage 1: build the BreatheWise web app (React + Vite) into static files.
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# The form imports the profile schema shared with the server (../shared from /web).
COPY shared/ /shared/
RUN npm run build

# Stage 2: the API server. Zero runtime dependencies, so it is just Node + source + built app.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node shared ./shared
COPY --chown=node:node --from=web /web/dist ./web/dist

# Run as the unprivileged user that ships with the official image.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
