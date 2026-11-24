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

# Leitor de páginas (prova acadêmica, KTD15): Python 3.12 pelo uv, o Scrapling e
# o Chromium do patchright, que é o que o Scrapling 0.5.1 usa. Versões fixas pelo
# uv.lock; o navegador e as bibliotecas do sistema vêm do próprio patchright.
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_PROJECT_ENVIRONMENT=/opt/finde-paginas \
    PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
COPY coletores/paginas/pyproject.toml coletores/paginas/uv.lock ./coletores/paginas/
RUN cd coletores/paginas && uv sync --frozen --python 3.12 --no-dev \
    && uv run --python 3.12 python -m patchright install --with-deps chromium \
    && rm -rf /root/.cache/uv

COPY . .

ENV FINDE_DADOS=/data \
    FINDE_BANCO=/data/finde.sqlite3 \
    FINDE_MOTOR_PORTA=8080 \
    FINDE_HORARIOS=padrao \
    NODE_ENV=production
RUN mkdir -p /data

EXPOSE 8080
CMD ["/bin/sh", "/app/deploy/inicio.sh"]
