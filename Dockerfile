# Adventure Park website: production image
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install only production dependencies, exactly as locked.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App files stay owned by root (read-only for the app user).
COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Only the data folder is writable, by the unprivileged "node" user.
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
