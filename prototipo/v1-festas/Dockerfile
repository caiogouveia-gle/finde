# Finde, protótipo visual (prototipo/v1-festas). Node 24 sem dependências.
FROM node:24-slim

WORKDIR /app
COPY servidor.js ./
COPY nucleo ./nucleo
COPY dados ./dados
COPY publico ./publico

# Os convites ficam no volume; o resto é imagem.
ENV FINDE_PORTA=8080 \
    FINDE_VAR=/data \
    TZ=America/Sao_Paulo \
    NODE_ENV=production

# Roda como root: o volume do Fly monta /data como root.
EXPOSE 8080
CMD ["node", "servidor.js"]
