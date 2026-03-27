FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV VITE_API_URL=http://192.168.1.22:30002

RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM nginx:1.28-alpine

# ── Patch all system packages at build time ───────────────────
RUN apk upgrade --no-cache

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s \
            --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
