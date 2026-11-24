'use strict';
// A ligação com o app (19/11/2026): a cidade vem da fonte ou fica vazia; o
// "a partir de" não sai de lote com condição; o estilo por regras não sai do
// nome; a fonte "indicacao" diz o que é, e cada página lida vai em `paginas`.
// Endereços, casas, nomes e preços inventados: nenhum dado real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItem, cidade, condicoesDoLote, ateDoNome, semCodigo } = require('../nucleo/normalizar');
const { precoAPartirDe, montarRegistro, listarRegistros, VERSAO_CONTRATO } = require('../nucleo/contrato');
const { porRegras, SISTEMA } = require('../nucleo/classificar');
const { NOME_FONTE } = require('../nucleo/catalogo');
const indicacao = require('../fontes/indicacao');
const { executar } = require('../nucleo/coleta');
const { novoBanco, relogio, logMudo } = require('./ajuda');

// ---------------------------------------------------------------- cidade

test('cidade: a do endereço com UF, nunca São Paulo por padrão', () => {
  assert.equal(cidade({ endereco: 'Rua das Amoras, 12, Vila Serena/SP (CEP 06999-000)' }), 'Vila Serena');
  assert.equal(cidade({ endereco: 'Avenida do Porto, Porto Claro - PE' }), 'Porto Claro');
  assert.equal(cidade({ endereco: 'Rua do Teste, 100 - São Paulo/SP' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'Galpão Exemplo, São Paulo' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'São Paulo' }), 'São Paulo');
  // CEP da capital, sem a cidade escrita.
  assert.equal(cidade({ endereco: 'Rua do Exemplo, 99 - Bairro Novo (CEP 04100-000)' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'Rua X, 10 - Pinheiros' }), null);
  assert.equal(cidade({}), null);
  assert.equal(cidade({ cidade: 'São Paulo/SP' }), 'São Paulo');
  assert.equal(cidade({ cidade: 'Vila Serena', endereco: 'São Paulo' }), 'Vila Serena');
});

test('cidade: bairro com UF não vira cidade, e o CEP da capital decide antes', () => {
  // Bairro de São Paulo seguido de SP é São Paulo; o CEP da capital também.
  assert.equal(cidade({ endereco: 'Rua do Teste, 500 - Consolação - SP, 01305-000' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'Rua X, 10 - Pinheiros - SP' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'Rua X, 100 - Pinheiros, SP' }), 'São Paulo');
  assert.equal(cidade({ endereco: 'Rua X, 10 São Paulo SP' }), 'São Paulo');
  // Rua com nome de cidade não engana: vale a cidade com UF.
  assert.equal(cidade({ endereco: 'Rua São Paulo, 10 - Centro, Vila Serena - SP' }), 'Vila Serena');
  // Bairro de São Paulo com outra UF não diz cidade nenhuma.
  assert.equal(cidade({ endereco: 'Rua X, 10 - Pinheiros - PR' }), null);
  // O campo cidade, em qualquer grafia comum.
  for (const c of ['SP', 'São Paulo, SP', 'São Paulo - SP', 'Sao Paulo/SP', 'são paulo']) assert.equal(cidade({ cidade: c }), 'São Paulo', c);
  assert.equal(cidade({ cidade: 'Vila Serena - SP' }), 'Vila Serena');
});

test('cidade: o registro de outra cidade sai com ela; o sem endereço sai sem endereço', () => {
  const fora = normalizarItem({ nome: 'Festa Longe', data: '2026-12-05', casa: 'Galpão Exemplo', endereco: 'Rua das Amoras, 12, Vila Serena/SP' }, 'indicacao').campos;
  assert.equal(fora.endereco.cidade, 'Vila Serena');
  const semEnd = normalizarItem({ nome: 'Festa Sem Lugar', data: '2026-12-12', endereco: null }, 'indicacao').campos;
  assert.equal(semEnd.endereco, undefined);
  const soBairro = normalizarItem({ nome: 'X', data: '2026-12-12', endereco: 'Rua Y, 1 - Pinheiros' }, 'envio').campos;
  assert.equal(soBairro.endereco.bairro, 'pinheiros');
  assert.equal(soBairro.endereco.cidade, null);
  const comUf = normalizarItem({ nome: 'X', data: '2026-12-12', endereco: 'Rua Y, 1 - Pinheiros - SP' }, 'envio').campos;
  assert.deepEqual([comUf.endereco.bairro, comUf.endereco.cidade], ['pinheiros', 'São Paulo']);
  const doMapa = normalizarItem({ nome: 'X', data: '2026-12-12', endereco: 'Rua Y, 1 - Pinheiros', cidade: 'São Paulo' }, 'mapas-culturais').campos;
  assert.equal(doMapa.endereco.cidade, 'São Paulo');
});

test('contrato: a versão subiu quando a cidade passou a vir da fonte (/2) e com a prova de conceito (/3)', () => {
  assert.equal(VERSAO_CONTRATO, 'finde-r14/3');
});

// ---------------------------------------------------------------- preço

test('lote: a condição sai do nome (meia, meia social, gênero, comissário, código)', () => {
  assert.deepEqual(condicoesDoLote('Pista, meia social (+1 kg)'), ['meia-social']);
  assert.deepEqual(condicoesDoLote('Dia único, solidário'), ['meia-social']);
  assert.deepEqual(condicoesDoLote('Meia-entrada estudante'), ['meia']);
  assert.deepEqual(condicoesDoLote('Lote 03, feminino'), ['feminino']);
  assert.deepEqual(condicoesDoLote('1º lote, masculino'), ['masculino']);
  assert.deepEqual(condicoesDoLote('Feminino (Código)'), ['feminino', 'codigo']);
  assert.deepEqual(condicoesDoLote('UNISSEX - COMISSÁRIOS'), ['comissario']);
  assert.deepEqual(condicoesDoLote('2º lote, unissex'), []);
  assert.deepEqual(condicoesDoLote('Pista, 5º lote, inteira'), []);
  assert.deepEqual(condicoesDoLote('Entrada cedo', ['codigo', 'inventada']), ['codigo']);
});

test('lote: os dois gêneros no nome é lote de todo mundo; a negação não vira meia', () => {
  assert.deepEqual(condicoesDoLote('Lote Único - Homens e Mulheres'), []);
  assert.deepEqual(condicoesDoLote('Feminino e Masculino'), []);
  assert.deepEqual(condicoesDoLote('Ingresso Mulher até 0h'), ['feminino']);
  assert.deepEqual(condicoesDoLote('Inteira (não é meia)'), []);
  assert.deepEqual(condicoesDoLote('Inteira, sem meia-entrada'), []);
});

test('lote: a hora do nome vira `ate`, com ou sem os minutos', () => {
  assert.equal(ateDoNome('Entrada cedo (até 23:30)'), '23:30');
  assert.equal(ateDoNome('Lote Ate 2h30'), '02:30');
  assert.equal(ateDoNome('Mulheres free até 0h'), '00:00');
  assert.equal(ateDoNome('até 00h'), '00:00');
  assert.equal(ateDoNome('Open bar até as 1h'), '01:00');
  assert.equal(ateDoNome('Lote até 2 pessoas'), null);
});

test('lote: a hora do nome vira `ate`, a condição vai junto, e o nome não corta em 40', () => {
  const { campos } = normalizarItem({
    nome: 'Noite Teste', data: '2026-11-28',
    lotes: [
      { nome: 'Pré venda, Entrada cedo (até 23:30)', preco: 120, disponivel: true, condicoes: ['codigo'] },
      { nome: 'Pista, 5º lote, meia social (1 kg de alimento na portaria)', preco: 220, disponivel: true },
      { nome: 'Camarote alto, inteira (lote 3)', preco: 4750, disponivel: true, taxa: 712.5 },
    ],
  }, 'indicacao');
  assert.deepEqual(campos.lotes[0], { nome: 'Pré venda, Entrada cedo (até 23:30)', preco: 120, disponivel: true, ate: '23:30', condicoes: ['codigo'] });
  assert.equal(campos.lotes[1].nome, 'Pista, 5º lote, meia social (1 kg de alimento na portaria)');
  assert.deepEqual(campos.lotes[1].condicoes, ['meia-social']);
  // 15% de um setor de R$ 4.750 é taxa de verdade, não erro.
  assert.equal(campos.lotes[2].taxa, 712.5);
});

const lotesDe = (xs) => normalizarItem({ nome: 'X', data: '2026-12-11', lotes: xs }, 'indicacao').campos.lotes;

test('a partir de: sai pela inteira, não pela meia social', () => {
  const p = precoAPartirDe(lotesDe([
    { nome: 'Pista, 5º lote, inteira', preco: 300, disponivel: true },
    { nome: 'Pista, meia social (+1 kg)', preco: 150, disponivel: true },
    { nome: 'Camarote, 6º lote, inteira', preco: 900, disponivel: true },
    { nome: 'Camarote, 6º lote, meia social (+1 kg)', preco: 450, disponivel: true },
  ]));
  assert.deepEqual(p, { valor: 300, lote: 'Pista, 5º lote, inteira', esgotadosAntes: 0 });
});

test('a partir de: só lote por gênero sai pelo mais alto, com os dois', () => {
  const p = precoAPartirDe(lotesDe([
    { nome: '1º lote, feminino', preco: 70, disponivel: true },
    { nome: '1º lote, masculino', preco: 90, disponivel: true },
  ]));
  assert.deepEqual(p, {
    valor: 90, lote: '1º lote, masculino', esgotadosAntes: 0,
    genero: { feminino: { valor: 70, lote: '1º lote, feminino' }, masculino: { valor: 90, lote: '1º lote, masculino' } },
  });
  // "Homens e Mulheres" é lote de todo mundo: ganha do setor caro.
  const unico = precoAPartirDe(lotesDe([
    { nome: 'Lote Único - Homens e Mulheres', preco: 100, disponivel: true },
    { nome: 'Camarote', preco: 300, disponivel: true },
  ]));
  assert.deepEqual(unico, { valor: 100, lote: 'Lote Único - Homens e Mulheres', esgotadosAntes: 0 });
});

test('a partir de: lote com código não é preço de todo mundo; só meia sai pela meia, dizendo', () => {
  const comCodigo = precoAPartirDe(lotesDe([
    { nome: 'Pré venda, Entrada cedo (até 23:30)', preco: 120, disponivel: true, condicoes: ['codigo'] },
    { nome: 'Segunda Chamada, Entrada livre', preco: 190, disponivel: true },
  ]));
  assert.deepEqual(comCodigo, { valor: 190, lote: 'Segunda Chamada, Entrada livre', esgotadosAntes: 0 });
  const soCodigo = precoAPartirDe(lotesDe([{ nome: 'Pista (Código)', preco: 80, disponivel: true }]));
  assert.deepEqual(soCodigo, { valor: 80, lote: 'Pista (Código)', esgotadosAntes: 0, condicoes: ['codigo'] });
  const soMeia = precoAPartirDe(lotesDe([{ nome: 'Meia social (+1 kg)', preco: 50, disponivel: true }]));
  assert.deepEqual(soMeia, { valor: 50, lote: 'Meia social (+1 kg)', esgotadosAntes: 0, condicoes: ['meia-social'] });
  // A meia esgotada mais barata não conta como "lote esgotado antes".
  const comEsgotada = precoAPartirDe(lotesDe([
    { nome: '1º lote, meia', preco: 30, disponivel: false },
    { nome: '1º lote', preco: 50, disponivel: false },
    { nome: '2º lote', preco: 70, disponivel: true },
  ]));
  assert.equal(comEsgotada.esgotadosAntes, 1);
});

test('link: o código de quem indicou sai do link de compra e da fonte', () => {
  assert.equal(semCodigo('https://ingressos.example/x/tickets?passkey=FULANA'), 'https://ingressos.example/x/tickets');
  assert.equal(semCodigo('https://ingressos.example/p?cod=AB&id=2&utm_source=zap'), 'https://ingressos.example/p?id=2');
  const c = normalizarItem({ nome: 'X', data: '2026-12-11', linkCompra: 'https://ingressos.example/x?coupon=FULANA' }, 'indicacao').campos;
  assert.equal(c.linkCompra, 'https://ingressos.example/x');
  // A produtora que manda o próprio link fica com ele como veio.
  const e = normalizarItem({ nome: 'X', data: '2026-12-11', linkCompra: 'https://ingressos.example/x?coupon=CASA' }, 'envio').campos;
  assert.equal(e.linkCompra, 'https://ingressos.example/x?coupon=CASA');
});

// ---------------------------------------------------------------- som

test('regras: o estilo não sai do nome, nem do nome repetido na descrição', () => {
  assert.deepEqual(porRegras({ nome: 'Samba Fictício', texto: 'Samba Fictício, sábado 12/12 às 20h. A página não diz o gênero.' }).estilos, []);
  assert.deepEqual(porRegras({ nome: 'Roda Fictícia do Samba - Vem 2027', texto: 'Roda Fictícia do Samba - Vem 2027, no Galpão Exemplo. A Roda Fictícia do Samba volta.' }).estilos, []);
  assert.deepEqual(porRegras({ nome: 'Pagode Fictício', texto: '' }).estilos, []);
  assert.deepEqual(porRegras({ nome: 'Noite', texto: 'Roda de samba e pagode a noite toda.', lineup: ['DJ Rock'] }).estilos, ['mpb-samba']);
  // O lineup não é descrição do som.
  assert.deepEqual(porRegras({ nome: 'Noite', texto: 'No Galpão Exemplo.', lineup: ['Rock Lobster'] }).estilos, []);
});

test('regras: nome com sufixo, com separador sem espaço, e o nome da casa também saem', () => {
  const estilos = (e) => porRegras(e).estilos;
  assert.deepEqual(estilos({ nome: 'Samba Fictício Ed. 5', texto: 'O Samba Fictício volta ao Bixiga no sábado.' }), []);
  assert.deepEqual(estilos({ nome: 'Disco Imaginária: Halloween', texto: 'A Disco Imaginária volta.' }), []);
  assert.deepEqual(estilos({ nome: 'Baile do Funk Room #3', texto: 'Funk Room de volta' }), []);
  assert.deepEqual(estilos({ nome: 'Rock Fictício Day 2', texto: 'O Rock Fictício Day volta' }), []);
  assert.deepEqual(estilos({ nome: 'Noite X', casa: 'Casa do Samba', texto: 'Noite X na Casa do Samba' }), []);
  // O que a descrição diz do som continua valendo.
  assert.deepEqual(estilos({ nome: 'Noite X', casa: 'Casa do Samba', texto: 'Noite X na Casa do Samba, com house e disco até de manhã.' }), ['house-disco']);
  assert.deepEqual(estilos({ nome: 'Label Fictícia São Paulo', texto: 'A Label Fictícia traz o DJ da casa (house e tech house).' }), ['house-disco', 'eletronica']);
});

test('Claude: o pedido diz que o nome e o lineup não bastam para o estilo', () => {
  assert.match(SISTEMA, /nome do evento e os nomes do lineup não bastam/);
});

test('ponta a ponta: festa com "Samba" no nome e sem descrição do som sai sem estilo, por regras', async () => {
  const db = novoBanco();
  const fonte = {
    id: 'indicacao',
    coletar: async () => indicacao.itensDaIndicacao({
      festas: [{
        id: 'samba-ficticio', origem: 'https://cart.example/x', nome: 'Samba Fictício', data: '2026-12-12', inicio: '20:00',
        estilos: [], ehFesta: true, leitura: [{ url: 'https://cart.example/x', lidoEm: '2026-11-16T12:00:00-03:00', campos: ['nome'] }],
        descricao: 'Samba Fictício, sábado 12/12 às 20h. A página não diz o gênero.',
      }, {
        id: 'roda', origem: 'https://cart.example/y', nome: 'Roda da Vila', data: '2026-12-12', inicio: '18:00', ehFesta: true,
        leitura: [{ url: 'https://cart.example/y', lidoEm: '2026-11-16T12:00:00-03:00', campos: ['nome'] }],
        descricao: 'Roda de samba com pagode de raiz até a meia-noite.',
      }],
    }, { origem: 't', mtime: '2026-11-16T15:00:00Z' }),
  };
  await executar({ db, fontes: [fonte], agora: relogio(), log: logMudo });
  const [roda, samba] = listarRegistros(db);
  assert.equal(samba.nome, 'Samba Fictício');
  assert.deepEqual(samba.estilos, []);
  assert.equal(roda.nome, 'Roda da Vila');
  assert.deepEqual(roda.estilos, ['mpb-samba']);
  assert.deepEqual(roda.classificacao.por, 'regras');
  assert.equal(roda.campos.estilos.fonte, 'regras');
});

// ---------------------------------------------------------------- fonte

test('a fonte indicacao se chama "Lido na página do ingresso", e o id fica', () => {
  assert.equal(NOME_FONTE.indicacao, 'Lido na página do ingresso');
  assert.equal(indicacao.nome, 'Lido na página do ingresso');
  assert.equal(indicacao.id, 'indicacao');
  const r = montarRegistro({ id: 'f' }, [], [{ fonte: 'indicacao', url: 'https://a.example/', visto_em: '2026-11-16T12:00:00Z' }]);
  assert.deepEqual(r.fontes.map((x) => x.nome), ['Lido na página do ingresso']);
  assert.ok(!/grupo/i.test(JSON.stringify(NOME_FONTE)));
});

test('páginas: cada leitura diz o que a página é; a fonte aponta a página do ingresso, sem código', async () => {
  const db = novoBanco();
  const fonte = {
    id: 'indicacao',
    coletar: async () => indicacao.itensDaIndicacao({
      festas: [{
        id: 'festival-ficticio', origem: 'https://www.instagram.com/festival_ficticio/', nome: 'Festival Fictício', data: '2026-12-05', inicio: '12:30',
        endereco: 'Rua do Exemplo, 99 (CEP 04100-000)', ehFesta: true,
        lotes: [{ nome: 'Dia, inteira', preco: 500, disponivel: null }],
        leitura: [
          { url: 'https://www.instagram.com/festival_ficticio/', lidoEm: '2026-11-16T21:38:00-03:00', campos: ['instagram'] },
          { url: 'https://revista.example/precos', tipo: 'materia', nome: 'Revista Exemplo', lidoEm: '2026-11-16T21:52:00-03:00', campos: ['nome', 'data', 'lotes'] },
          { url: 'https://www.ingresse.com/festival-ficticio/?passkey=FULANA', lidoEm: '2026-11-19T11:25:00-03:00', campos: ['inicio', 'endereco'] },
        ],
      }],
    }, { origem: 't', mtime: '2026-11-16T15:00:00Z' }),
  };
  await executar({ db, fontes: [fonte], agora: relogio(), log: logMudo });
  const [f] = listarRegistros(db);
  assert.deepEqual(f.fontes.map((x) => x.url), ['https://www.ingresse.com/festival-ficticio/']);
  assert.deepEqual(f.paginas.map((x) => [x.tipo, x.nome, x.url]), [
    ['ingresso', 'Ingresse', 'https://www.ingresse.com/festival-ficticio/'],
    ['materia', 'Revista Exemplo', 'https://revista.example/precos'],
    ['instagram', 'Instagram', 'https://www.instagram.com/festival_ficticio/'],
  ]);
  // O preço foi conferido na matéria, em 16/11; a página lida por último é outra.
  assert.equal(f.campos.lotes.conferidoEm, '2026-11-16T21:52:00-03:00');
  assert.deepEqual(f.paginas[1].campos, ['nome', 'data', 'lotes']);
  assert.ok(!JSON.stringify(f).includes('FULANA'));
});
