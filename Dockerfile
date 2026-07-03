# ============================================================
# Dockerfile — Levita Delivery (desenvolvimento local)
# Dois estágios: API (Express) e Frontend (Vite)
# Em produção o Vercel cuida de tudo, esse arquivo só serve
# pra rodar localmente sem instalar nada além do Docker.
# ============================================================

FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# ---- API (Express) ----
FROM base AS api
COPY lib/ ./lib/
COPY api/ ./api/
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.js"]

# ---- Frontend (Vite dev server) ----
FROM base AS frontend
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
