# Finde, protótipo visual (prototipo/v1-festas). Node 24 sem dependências.
# A mesma imagem serve os dois apps do Fly: a landing (fly.toml) e o app
# (fly.app.toml). O que sobe vem de FINDE_SITE, no [env] de cada um; sem ele,
# sobe tudo junto, como no desenvolvimento.
FROM node:24-slim

WORKDIR /app
COPY servidor.js ./
COPY nucleo ./nucleo
# dados/ leva a base fictícia, o reais.json de reserva e, quando existe,
# dados/imagens/ (os flyers das reais, copiados por ferramentas/reais.js; fora
# do git). Com o motor no ar, as imagens vêm dele para o volume (/data/imagens).
COPY dados ./dados
COPY publico ./publico

# Os convites, o cache da lista do motor, as avaliações e os flyers ficam no
# volume; o resto é imagem.
ENV FINDE_PORTA=8080 \
    FINDE_VAR=/data \
    TZ=America/Sao_Paulo \
    NODE_ENV=production

# Roda como root: o volume do Fly monta /data como root.
EXPOSE 8080
CMD ["node", "servidor.js"]
