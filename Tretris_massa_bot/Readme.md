# Tetris Massa Bot

## Installation

cd tetris-massa-bot

Crée un fichier .env dans le dossier avec le contenu suivant :
TELEGRAM_TOKEN=123456:ABC-TONTOKENICI
CONTRACT_ADDRESS=AS1...TON_CONTRAT
CALLER_ADDRESS=AU1...TON_ADRESSE_MASSA
ALERT_CHAT_ID=123456789  # Ton ID Telegram ou celui du groupe.

Lancer le bot
docker compose up --build -d

Vérifier que ça tourne
docker ps

Puis pour voir les logs :
docker logs -f tetris-massa-bot

Pour redémarrer le bot :
docker compose restart

Pour le stopper :
docker compose down
