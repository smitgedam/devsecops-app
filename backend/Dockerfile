FROM node:20-alpine

# ── Patch all system packages at build time ───────────────────
RUN apk upgrade --no-cache

# ── Non-root user ─────────────────────────────────────────────
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && \
    npm cache clean --force

COPY --chown=appuser:appgroup . .

RUN rm -f .env

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=30s \
            --retries=3 \
  CMD wget -qO- \
    http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
