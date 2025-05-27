FROM debian:bookworm-slim AS builder

# Installation de Node.js et mise à jour des paquets
RUN apt-get update && \
  apt-get install -y curl && \
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
  apt-get install -y nodejs && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Étape de production
FROM debian:bookworm-slim

# Installation de Node.js et mise à jour des paquets
RUN apt-get update && \
  apt-get install -y curl && \
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
  apt-get install -y nodejs && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copie uniquement les fichiers nécessaires
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ .

# Créer le dossier de logs
RUN mkdir -p /app/logs

CMD ["npm", "run", "dev"]
