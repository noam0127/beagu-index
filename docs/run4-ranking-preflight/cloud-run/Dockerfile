# Review-only build; use the allowlisted context, never repository root.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=pwuser:pwuser game/ game/
COPY --chown=pwuser:pwuser artifact.json factory.cjs server.cjs replay-engine.cjs replay-protocol.cjs replay-worker.cjs smoke.cjs ./
ENV NODE_ENV=production PORT=8080
USER pwuser
EXPOSE 8080
CMD ["node","server.cjs"]
