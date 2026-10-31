# Writex AI server
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production WRITEX_DB_PATH=/data/writex.db PORT=8787
COPY package.json ./
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/v1/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
