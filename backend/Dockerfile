# ── SeeFixit Backend Dockerfile ────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Security & environment
ENV NODE_ENV=production

# Install curl for container health check
RUN apk add --no-cache curl

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies cleanly
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Set non-root user for security
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

CMD ["npm", "start"]
