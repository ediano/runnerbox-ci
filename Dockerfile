# Imagem do painel RunnerBox CI. Fica na raiz porque o autobuild do Docker Hub usa o
# repositório inteiro como contexto de build.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=2141 \
    HOSTNAME=0.0.0.0

# O painel precisa falar com o socket do Docker montado pelo host. Rodar como root
# evita depender do GID do grupo `docker`, que varia entre máquinas.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Contextos de build dos motores dos runners: o painel constrói estas imagens sob
# demanda, então a ferramenta não depende de nenhuma imagem publicada em registry.
COPY docker ./docker

# Diretório dos tokens cifrados. Monte um volume aqui para que sobrevivam a um
# `docker compose down`; sem volume, editar um runner voltará a exigir o token.
ENV RUNNERBOX_DATA_DIR=/var/lib/runnerbox
RUN mkdir -p /var/lib/runnerbox && chmod 700 /var/lib/runnerbox
VOLUME ["/var/lib/runnerbox"]

EXPOSE 2141
CMD ["node", "server.js"]
