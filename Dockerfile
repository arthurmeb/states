# STATES world server: Nuxt client + Nitro game server in one Node process.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx nuxi prepare && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 STATES_DATA_DIR=/app/.data
COPY --from=build /app/.output ./.output
# The simulation reads the world tables from ./public at boot.
COPY --from=build /app/public/world ./public/world
RUN mkdir -p /app/.data
VOLUME /app/.data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
