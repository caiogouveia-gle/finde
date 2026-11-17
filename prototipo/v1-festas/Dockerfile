# Finde, protótipo visual (prototipo/v1-festas). Node 24 sem dependências.
# A mesma imagem serve os dois apps do Fly: a landing (fly.toml) e o app
# (fly.app.toml). O que sobe vem de FINDE_SITE, no [env] de cada um; sem ele,
# sobe tudo junto, como no desenvolvimento.
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
