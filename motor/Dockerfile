# Finde, motor de coleta (motor/). Pronto para o Fly; nada foi publicado.
# Node 24 do protótipo; o banco é SQLite do próprio Node (node:sqlite).
FROM node:24-slim

WORKDIR /app

# Litestream: copia cada commit do banco para o bucket (Tigris no Fly), o mesmo
# esquema do Phoenix (amberos/modules/spike-pagamentos). Versão e sha256 fixos;
# hash diferente derruba o build.
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
RUN node -e "const c=require('node:crypto'),fs=require('node:fs');(async()=>{ \
const u='https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz'; \
const b=Buffer.from(await (await fetch(u)).arrayBuffer()); \
const h=c.createHash('sha256').update(b).digest('hex'); \
if(h!=='${LITESTREAM_SHA256}'){console.error('litestream sha256 diferente: '+h);process.exit(1)} \
fs.writeFileSync('/tmp/litestream.tar.gz',b)})()" \
    && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
    && rm /tmp/litestream.tar.gz && chmod 0755 /usr/local/bin/litestream && litestream version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

ENV FINDE_DADOS=/data \
    FINDE_BANCO=/data/finde.sqlite3 \
    FINDE_MOTOR_PORTA=8080 \
    FINDE_HORARIOS=padrao \
    NODE_ENV=production
RUN mkdir -p /data

EXPOSE 8080
CMD ["/bin/sh", "/app/deploy/inicio.sh"]
