'use strict';
// O início do motor na imagem (U21, M37): deploy/inicio.sh rodado num diretório
// temporário, com `litestream` e `node` falsos no PATH, nos dois ramos (com e
// sem bucket) e com e sem semente; e a leitura cruzada do Dockerfile, do
// uv.lock, do fly.toml e do .dockerignore. Nada toca a rede nem o Fly.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOTOR = path.join(__dirname, '..');
const INICIO = path.join(MOTOR, 'deploy', 'inicio.sh');
const le = (...p) => fs.readFileSync(path.join(MOTOR, ...p), 'utf8');

const LITESTREAM_FALSO = `#!/bin/sh
case "$1" in
  restore)
    echo "litestream:restore $*" >> "$FAKE_LOG"
    if [ "\${FAKE_RESTAURA:-}" = 1 ]; then
      saida=""
      while [ $# -gt 0 ]; do [ "$1" = "-o" ] && saida="$2"; shift; done
      echo restaurado-do-bucket > "$saida"
    fi
    ;;
  replicate) echo "litestream:replicate $*" >> "$FAKE_LOG" ;;
esac
`;
// O node falso: com -e é a conferência de integridade (o último argumento é a semente).
const NODE_FALSO = `#!/bin/sh
if [ "$1" = "-e" ]; then
  eval "ultimo=\\\${$#}"
  echo "node:integridade $ultimo" >> "$FAKE_LOG"
  exit "\${FAKE_INTEGRIDADE:-0}"
fi
echo "node:servidor $*" >> "$FAKE_LOG"
`;

function ambiente(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finde-inicio-'));
  const bin = path.join(dir, 'bin');
  const dados = path.join(dir, 'dados');
  fs.mkdirSync(bin);
  fs.mkdirSync(dados);
  for (const [nome, corpo] of [['litestream', LITESTREAM_FALSO], ['node', NODE_FALSO]]) {
    fs.writeFileSync(path.join(bin, nome), corpo, { mode: 0o755 });
  }
  const log = path.join(dir, 'chamadas.log');
  fs.writeFileSync(log, '');
  const env = {
    PATH: `${bin}:/usr/bin:/bin`,
    FINDE_DADOS: dados,
    FINDE_BANCO: path.join(dados, 'finde.sqlite3'),
    LITESTREAM_CONFIG: path.join(dir, 'litestream.yml'),
    FAKE_LOG: log,
    ...extra,
  };
  return {
    dir, dados, env, banco: env.FINDE_BANCO, semente: path.join(dados, 'semente.sqlite3'),
    chamadas: () => fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    roda: () => spawnSync('sh', [INICIO], { env, encoding: 'utf8' }),
    limpa: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
const COM_BUCKET = { BUCKET_NAME: 'bucket-falso', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b', AWS_ENDPOINT_URL_S3: 'https://s3.exemplo.invalid' };

test('sem bucket e sem semente: só o servidor, sem Litestream nem conferência', () => {
  const a = ambiente();
  try {
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(a.chamadas(), ['node:servidor /app/servidor.js']);
    assert.match(r.stderr, /sem bucket/);
  } finally {
    a.limpa();
  }
});

test('sem bucket e com semente: a semente vira o banco, -wal e -shm velhos somem, a semente sai do lugar', () => {
  const a = ambiente();
  try {
    fs.writeFileSync(a.banco, 'banco-velho');
    fs.writeFileSync(`${a.banco}-wal`, 'wal-velho');
    fs.writeFileSync(`${a.banco}-shm`, 'shm-velho');
    fs.writeFileSync(a.semente, 'semente-boa');
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(a.banco, 'utf8'), 'semente-boa');
    assert.equal(fs.existsSync(`${a.banco}-wal`), false);
    assert.equal(fs.existsSync(`${a.banco}-shm`), false);
    assert.equal(fs.existsSync(a.semente), false);
    assert.match(fs.readFileSync(path.join(a.dados, 'semente.aplicada'), 'utf8'), /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(a.chamadas(), [`node:integridade ${a.semente}`, 'node:servidor /app/servidor.js']);
  } finally {
    a.limpa();
  }
});

test('a semente não é aplicada duas vezes: no segundo boot o banco fica como está', () => {
  const a = ambiente();
  try {
    fs.writeFileSync(a.semente, 'semente-boa');
    assert.equal(a.roda().status, 0);
    fs.writeFileSync(a.banco, 'banco-que-o-servidor-mexeu');
    assert.equal(a.roda().status, 0);
    assert.equal(fs.readFileSync(a.banco, 'utf8'), 'banco-que-o-servidor-mexeu');
    assert.equal(a.chamadas().filter((c) => c.startsWith('node:integridade')).length, 1);
  } finally {
    a.limpa();
  }
});

test('semente que não passa na integridade vira .invalida e o banco que havia segue', () => {
  const a = ambiente({ FAKE_INTEGRIDADE: '1' });
  try {
    fs.writeFileSync(a.banco, 'banco-atual');
    fs.writeFileSync(a.semente, 'semente-quebrada');
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(a.banco, 'utf8'), 'banco-atual');
    assert.equal(fs.existsSync(a.semente), false);
    assert.equal(fs.readFileSync(`${a.semente}.invalida`, 'utf8'), 'semente-quebrada');
    assert.equal(fs.existsSync(path.join(a.dados, 'semente.aplicada')), false);
    assert.match(r.stderr, /integridade/);
  } finally {
    a.limpa();
  }
});

test('com bucket e sem banco: restaura (apagando o .restaurando de um boot que caiu) e replica', () => {
  const a = ambiente({ ...COM_BUCKET, FAKE_RESTAURA: '1' });
  try {
    fs.writeFileSync(`${a.banco}.restaurando`, 'resto-de-um-boot-que-caiu');
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(a.banco, 'utf8').trim(), 'restaurado-do-bucket', 'o .restaurando velho não vira banco');
    assert.equal(fs.existsSync(`${a.banco}.restaurando`), false);
    const c = a.chamadas();
    assert.match(c[0], /^litestream:restore .*-if-replica-exists .*-o .*finde\.sqlite3\.restaurando /);
    assert.match(c[1], /^litestream:replicate .*-exec node \/app\/servidor\.js$/);
  } finally {
    a.limpa();
  }
});

test('com bucket sem réplica: banco novo, e o .restaurando velho não sobra', () => {
  const a = ambiente(COM_BUCKET);
  try {
    fs.writeFileSync(`${a.banco}.restaurando`, 'resto');
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(a.banco), false);
    assert.equal(fs.existsSync(`${a.banco}.restaurando`), false);
    assert.match(r.stderr, /não tem réplica/);
    assert.equal(a.chamadas().length, 2);
  } finally {
    a.limpa();
  }
});

test('com bucket e com semente: a semente vira o banco e o restore nem roda', () => {
  const a = ambiente({ ...COM_BUCKET, FAKE_RESTAURA: '1' });
  try {
    fs.writeFileSync(`${a.banco}-wal`, 'wal-velho');
    fs.writeFileSync(a.semente, 'semente-boa');
    const r = a.roda();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(a.banco, 'utf8'), 'semente-boa');
    assert.equal(fs.existsSync(`${a.banco}-wal`), false);
    const c = a.chamadas();
    assert.equal(c.some((x) => x.startsWith('litestream:restore')), false);
    assert.match(c[c.length - 1], /^litestream:replicate /);
  } finally {
    a.limpa();
  }
});

test('com bucket já com banco: não restaura por cima', () => {
  const a = ambiente({ ...COM_BUCKET, FAKE_RESTAURA: '1' });
  try {
    fs.writeFileSync(a.banco, 'banco-do-volume');
    assert.equal(a.roda().status, 0);
    assert.equal(fs.readFileSync(a.banco, 'utf8'), 'banco-do-volume');
    assert.equal(a.chamadas().some((x) => x.startsWith('litestream:restore')), false);
  } finally {
    a.limpa();
  }
});

// ---------------------------------------------------------------- leitura cruzada

test('Dockerfile e uv.lock: Pillow fixado nos dois, Python 3.12, lock respeitado, base fixada', () => {
  const docker = le('Dockerfile');
  const pyproject = le('coletores', 'paginas', 'pyproject.toml');
  const lock = le('coletores', 'paginas', 'uv.lock');
  assert.match(docker, /^FROM node:24-bookworm-slim$/m);
  assert.match(docker, /ENV[\s\S]*UV_NO_SYNC=1/);
  assert.match(docker, /UV_FROZEN=1/);
  assert.match(docker, /COPY coletores\/paginas\/pyproject\.toml coletores\/paginas\/uv\.lock/);
  assert.match(docker, /uv sync --frozen --python 3\.12 --no-dev/);
  const fixado = pyproject.match(/"pillow==([0-9.]+)"/i);
  assert.ok(fixado, 'o pyproject fixa o Pillow com ==');
  const noLock = lock.match(/\[\[package\]\]\nname = "pillow"\nversion = "([0-9.]+)"/);
  assert.ok(noLock, 'o uv.lock traz o Pillow');
  assert.equal(noLock[1], fixado[1], 'a versão do lock é a do pyproject');
  assert.match(lock, /requires-python = ">=3\.12, <3\.14"/, 'o 3.12 do Dockerfile cabe no lock');
  assert.match(pyproject, /requires-python = ">=3\.12,<3\.14"/);
  // O worker de imagem tem de estar na imagem: o COPY . . traz coletores/paginas/imagens.py.
  assert.doesNotMatch(le('.dockerignore'), /^coletores\/?$/m);
});

test('fly.toml: uma máquina, kill_timeout, FINDE_POC, imagens e perfis no volume', () => {
  const fly = le('fly.toml');
  assert.match(fly, /^kill_timeout = 30$/m);
  assert.match(fly, /^\s+FINDE_POC = "1"$/m);
  assert.match(fly, /^\s+FINDE_IMAGENS = "\/data\/imagens"$/m);
  assert.match(fly, /^\s+FINDE_INSTAGRAM_PERFIS = "\/data\/entrada\/contatos\.json"$/m);
  assert.match(fly, /^\s+FINDE_HORARIOS = "padrao"$/m);
  assert.match(fly, /min_machines_running = 1/);
  assert.match(fly, /auto_stop_machines = "off"/);
  assert.match(fly, /destination = "\/data"/);
  // kill_timeout é chave de topo: tem de vir antes da primeira tabela.
  assert.ok(fly.indexOf('kill_timeout') < fly.indexOf('[build]'));
  // Os tetos continuam os atuais: nada de variável de teto no [env] (D1, sem subir teto).
  assert.doesNotMatch(fly, /FINDE_TETO/);
  // Nenhum segredo no arquivo.
  assert.doesNotMatch(fly, /(TOKEN|API_KEY|SECRET)\s*=/);
});

test('.dockerignore: libera entrada/indicacoes e deixa contatos.json, curadoria e o banco fora', () => {
  const linhas = le('.dockerignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(linhas.includes('entrada/*'));
  assert.ok(linhas.includes('!entrada/indicacoes'));
  assert.ok(linhas.includes('entrada/grupo'), 'a lista de perfis fica fora');
  assert.ok(linhas.includes('var'));
  assert.ok(linhas.includes('node_modules'));
  assert.ok(linhas.indexOf('entrada/*') < linhas.indexOf('!entrada/indicacoes'), 'a exceção vem depois da regra');
  assert.equal(linhas.includes('!entrada/grupo'), false);
});

test('Plano B e README batem com os arquivos', () => {
  for (const a of ['LEIA-ME.md', 'preparar-copia.sh', 'rodar.sh', 'modelo.plist']) {
    assert.ok(fs.existsSync(path.join(MOTOR, 'deploy', 'mac-reserva', a)), a);
  }
  const readme = le('README.md');
  for (const trecho of ['--ha=false', 'fly ssh sftp', 'semente', 'FINDE_POC', 'expurgar', 'imagem ocultar', 'relatorio', 'FINDE_APP_TOKEN', 'mac-reserva', 'fly machine restart', 'kill_timeout']) {
    assert.ok(readme.includes(trecho), `o README cita ${trecho}`);
  }
  // O modelo de LaunchAgent aponta para fora de ~/Documents e roda o script que existe.
  const plist = le('deploy', 'mac-reserva', 'modelo.plist');
  assert.match(plist, /Library\/Application Support\/finde-motor\/motor\/deploy\/mac-reserva\/rodar\.sh/);
  assert.doesNotMatch(plist, /<string>[^<]*Documents[^<]*<\/string>/, 'nenhum caminho do agente em ~/Documents');
  // Nenhum segredo nos scripts do plano B.
  for (const a of ['preparar-copia.sh', 'rodar.sh']) assert.doesNotMatch(fs.readFileSync(path.join(MOTOR, 'deploy', 'mac-reserva', a), 'utf8'), /(API_KEY|TOKEN)=[A-Za-z0-9]/);
});
