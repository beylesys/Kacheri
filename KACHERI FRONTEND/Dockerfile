# ── Stage 1: Build React app ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Build arguments for API URL configuration (S17)
# Defaults work with nginx proxy topology (frontend + backend behind same origin)
ARG VITE_API_URL=/api
ARG VITE_WS_URL=/yjs
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Serve via nginx ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Replace default nginx config with our SPA + proxy config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
