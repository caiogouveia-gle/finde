'use strict';
// A correlação (U5 e U6 do plano de 24/11/2026): o vínculo conservador na hora
// da coleta e a passada de escore no fim da execução, com a forma dos casos
// do banco de 24/11. Festa, perfil, post, link e lineup são fictícios; só as
// casas são as de config/lugares.json, que é público (KTD10).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executar } = require('../nucleo/coleta');
const { listarRegistros } = require('../nucleo/contrato');
const { parEmOrdem } = require('../nucleo/banco');
const correlacao = require('../nucleo/correlacao');
const { linkComparavel, idDeEvento, idDePlataforma, chavesDeEvento, palavrasDoNome, jaccard } = require('../nucleo/agregar');
const { idPlataforma } = require('../nucleo/extrair');
const { novoBanco, relogio, logMudo, fonteFixa, ligarImagem, particao } = require('./ajuda');

const rodar = (db, fontes, extra = {}) => executar({ db, fontes, agora: extra.agora || relogio(), log: logMudo, apify: null, classificar: false, fontesDeFesta: [], ...extra });
const festas = (db) => db.prepare('SELECT COUNT(*) AS n FROM festas').get().n;

// ---------------------------------------------------------------- peças puras

test('nome limpo: sem datas, sem a casa, sem a cidade e sem palavras de festa', () => {
  const casa = new Set(['mundo', 'pensante']);
  assert.deepEqual([...palavrasDoNome('26/11 - Abacateira No Mundo Pensante', casa)], ['abacateira']);
  assert.deepEqual([...palavrasDoNome('26/11 - Embalo Com Dj Castanha No Mundo Pensante', casa)], ['embalo', 'castanha']);
  assert.deepEqual([...palavrasDoNome('Maré Alta São Paulo ’26 - Sábado')], ['mare', 'alta']);
  assert.deepEqual([...palavrasDoNome('LUA CHEIA | 28.11 Festa ao vivo edição especial SP open bar 2026')], ['lua', 'cheia']);
  assert.equal(jaccard('26/11 - Abacateira No Mundo Pensante', '26/11 - Embalo Com Dj Castanha No Mundo Pensante', casa), 0);
});

test('link: o mesmo evento em formas diferentes dá a mesma chave; agenda e festival são fracos', () => {
  assert.equal(linkComparavel('https://shotgun.live/pt-br/events/festa-z'), linkComparavel('https://shotgun.live/events/festa-z?ref=x'));
  assert.equal(linkComparavel('https://www.sympla.com.br/evento/baile/3012345'), linkComparavel('https://sympla.com.br/evento/baile-novo-nome/3012345/'));
  assert.equal(idDeEvento('https://www.ingresse.com/constelar/').chave, 'ingresse:constelar');
  assert.equal(idDeEvento('https://embedstore.ingresse.com/pt/event/77123').chave, 'ingresse-id:77123');
  assert.equal(idDeEvento('https://cart.ingresse.com/0b1c2d3e-aaaa-bbbb-cccc-1234567890ab/tickets').forma, 'ingresse-cart');
  assert.deepEqual(idDeEvento('https://mare-alta-exemplo-26.ingresse.com/'), { chave: 'ingresse-sub:mare-alta-exemplo-26', forma: 'ingresse-sub', forte: false });
  assert.equal(idDeEvento('https://www.instagram.com/p/ABC/'), null);
  assert.equal(idDeEvento('https://casax.example/agenda').forte, false);
});

test('idPlataforma da Ingresse tem a forma do link: slug, id do embedstore, carrinho e subdomínio (fraco) não se confundem', () => {
  const uuid = '0b1c2d3e-aaaa-bbbb-cccc-1234567890ab';
  assert.equal(idPlataforma('https://www.ingresse.com/festa-xis/'), 'ingresse:festa-xis');
  assert.equal(idPlataforma('https://embedstore.ingresse.com/pt/event/12345'), 'ingresse-id:12345');
  assert.equal(idPlataforma(`https://cart.ingresse.com/${uuid}/tickets`), `ingresse-cart:${uuid}`);
  assert.equal(idPlataforma('https://festival-exemplo.ingresse.com/'), 'ingresse-sub:festival-exemplo');
  assert.equal(idPlataforma('https://kraken.ingresse.com/x.jpg'), null);
  // Cada link e o idPlataforma tirado dele dão a mesma chave, com a mesma força.
  for (const u of ['https://www.ingresse.com/festa-xis/', 'https://embedstore.ingresse.com/pt/event/12345', `https://cart.ingresse.com/${uuid}`, 'https://festival-exemplo.ingresse.com/']) {
    assert.deepEqual(idDePlataforma(idPlataforma(u)), idDeEvento(u), u);
  }
  // O "ingresse:<x>" antigo, que já está no banco, cai na forma pelo jeito do id.
  assert.deepEqual(idDePlataforma('ingresse:12345'), { chave: 'ingresse-id:12345', forma: 'ingresse-id', forte: true });
  assert.equal(idDePlataforma(`ingresse:${uuid}`).forma, 'ingresse-cart');
  assert.equal(idDePlataforma('ingresse:festa-xis').forma, 'ingresse');
  assert.equal(idDePlataforma('ingresse:eventos'), null);
  assert.equal(idDePlataforma('ingresse-sub:festival-exemplo').forte, false);
  assert.deepEqual(idDePlataforma({ plataforma: 'ingresse', id: 4521 }), { chave: 'ingresse-id:4521', forma: 'ingresse-id', forte: true });
  // Slug com o idPlataforma dele não tem chave forte na forma do embedstore.
  const fortes = chavesDeEvento({ linkCompra: 'https://www.ingresse.com/festa-xis', idPlataforma: idPlataforma('https://www.ingresse.com/festa-xis') }).filter((k) => k.forte);
  assert.deepEqual(fortes.map((k) => k.chave), ['ingresse:festa-xis']);
});

test('a mesma festa pelo slug, pelo embedstore e pelo carrinho da Ingresse não se veta; dois dias no mesmo subdomínio não se unem pelo link', async () => {
  const uuid = '0b1c2d3e-aaaa-bbbb-cccc-1234567890ab';
  const base = { nome: 'Festa Xis', casa: 'Galpão Exemplo', data: '2026-12-05', inicio: '23:00' };
  const comLink = (u) => ({ ...base, linkCompra: u, idPlataforma: idPlataforma(u) });
  const pares = [
    ['https://www.ingresse.com/festa-xis', 'https://embedstore.ingresse.com/pt/event/12345'],
    [`https://cart.ingresse.com/${uuid}`, 'https://www.ingresse.com/festa-xis'],
  ];
  for (const [u1, u2] of pares) {
    const db = novoBanco();
    // Uma fonte de cada lado, para o veto de "dois links próprios da mesma fonte" não entrar.
    await rodar(db, [fonteFixa('paginas', [{ idExterno: 'p:1', url: u1, bruto: comLink(u1) }]), fonteFixa('indicacao', [{ idExterno: 'i:1', bruto: comLink(u2) }])]);
    const ids = db.prepare('SELECT id FROM festas ORDER BY rowid').all().map((r) => r.id);
    if (ids.length === 2) {
      const [a, b] = ids.map((id) => correlacao.ladoDaFesta(db, id));
      assert.equal(correlacao.escore(a, b).veto, null, `${u1} × ${u2}`);
    } else assert.equal(ids.length, 1);
  }
  // O subdomínio serve aos dois dias: o idPlataforma dele não une a sexta com o sábado na coleta.
  const db = novoBanco();
  const sub = 'https://festival-exemplo.ingresse.com/';
  const dia = (id, nome, inicio) => ({ idExterno: id, url: sub, bruto: { nome, casa: 'Galpão Exemplo', data: '2026-12-05', inicio, linkCompra: sub, idPlataforma: idPlataforma(sub) } });
  await rodar(db, [fonteFixa('paginas', [dia('p:a', 'Palco Norte', '16:00')]), fonteFixa('indicacao', [dia('i:b', 'Palco Sul', '23:30')])]);
  assert.equal(festas(db), 2);
  const regras = db.prepare('SELECT regra FROM vinculos').all().map((r) => r.regra);
  assert.ok(!regras.includes('link'), regras.join());
});

test('escore: imagem igual sem outro sinal não une; com o nome une', () => {
  const img = (phash) => ({ imagens: [{ sha: phash, phash }] });
  const igual = correlacao.escore(img('0123456789abcdef'), img('0123456789abcdef'));
  assert.equal(igual.valor, 3);
  assert.equal(igual.decisao, 'talvez');
  const quase = correlacao.escore(img('0123456789abcdef'), img('0123456789abcd00')); // 4 bits
  assert.equal(quase.sinais.find((s) => s.sinal === 'imagem').peso, 3);
  const comNome = correlacao.escore({ ...img('0123456789abcdef'), nomes: ['Constelar'] }, { ...img('0123456789abcdef'), nomes: ['CONSTELAR'] });
  assert.equal(comNome.decisao, 'une');
  assert.deepEqual(comNome.sinais.map((s) => s.sinal).sort(), ['imagem', 'nome']);
  // A peça de uma agenda pesa a metade.
  const agenda = correlacao.escore({ imagens: [{ phash: 'ff', agenda: true }] }, { imagens: [{ phash: 'ff' }] });
  assert.equal(agenda.valor, 1.5);
});

// ---------------------------------------------------------------- U5: o vínculo conservador

const MUNDO = { casa: 'Mundo Pensante', produtora: { nome: 'Mundo Pensante' }, endereco: 'R. Treze de Maio, 830 - Bela Vista, São Paulo - SP, 01327-000, Brasil', cidade: 'São Paulo', data: '2026-11-26' };
const abacateira = { idExterno: 'pagina:https://shotgun.live/pt-br/events/26-11-abacateira-no-mundo-pensante', url: 'https://shotgun.live/pt-br/events/26-11-abacateira-no-mundo-pensante',
  bruto: { ...MUNDO, nome: '26/11 - Abacateira No Mundo Pensante', inicio: '21:00', fim: '23:59', linkCompra: 'https://shotgun.live/pt-br/events/26-11-abacateira-no-mundo-pensante', linkEvento: 'https://shotgun.live/pt-br/events/26-11-abacateira-no-mundo-pensante', lotes: [{ nome: 'antecipados', preco: 20 }] } };
const embalo = { idExterno: 'pagina:https://shotgun.live/pt-br/events/26-11-embalo-com-dj-castanha-no-mundo-pensante', url: 'https://shotgun.live/pt-br/events/26-11-embalo-com-dj-castanha-no-mundo-pensante',
  bruto: { ...MUNDO, nome: '26/11 - Embalo Com Dj Castanha No Mundo Pensante', inicio: '23:59', fim: '04:00', linkCompra: 'https://shotgun.live/pt-br/events/26-11-embalo-com-dj-castanha-no-mundo-pensante', linkEvento: 'https://shotgun.live/pt-br/events/26-11-embalo-com-dj-castanha-no-mundo-pensante', lotes: [{ nome: 'antecipados', preco: 20 }] } };

test('AE1: Abacateira (21h) e Embalo com DJ Castanha (23h59) no Mundo Pensante continuam duas festas, com o motivo', async () => {
  const db = novoBanco();
  await rodar(db, [fonteFixa('paginas', [abacateira, embalo])]);
  const fs = listarRegistros(db, { todas: true });
  assert.equal(fs.length, 2);
  assert.ok(fs.some((f) => /Abacateira/.test(f.nome)) && fs.some((f) => /Embalo/.test(f.nome)));
  assert.deepEqual(fs.map((f) => f.inicio).sort(), ['2026-11-26T21:00:00-03:00', '2026-11-26T23:59:00-03:00']);
  const [a, b] = db.prepare('SELECT id FROM festas ORDER BY rowid').all().map((r) => correlacao.ladoDaFesta(db, r.id));
  const e = correlacao.escore(a, b);
  assert.equal(e.decisao, 'separa');
  assert.match(e.veto, /dois links próprios diferentes da mesma fonte/);
  assert.equal(e.sinais.find((s) => s.sinal === 'nome').peso, -3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidatos').get().n, 0);
});

test('Casa de Francisca: Porão, Sala B e Salão na mesma noite continuam três festas', async () => {
  const db = novoBanco();
  const item = (id, casa, fonte) => ({ idExterno: id, bruto: { nome: 'Noite de Choro', casa, data: '2026-11-28', inicio: '21:00', endereco: 'Rua Quintino Bocaiúva, 22 - Sé, São Paulo - SP' }, fonte });
  await rodar(db, [
    fonteFixa('indicacao', [item('a', 'Casa de Francisca - Porão')]),
    fonteFixa('paginas', [item('b', 'Casa de Francisca (Sala B)')]),
    fonteFixa('instagram', [item('ig:c:1', 'Casa de Francisca – Salão')]),
  ]);
  assert.equal(festas(db), 3);
  // Mesmo espaço, outra fonte: junta.
  await rodar(db, [fonteFixa('mapas-culturais', [item('d', 'Casa de Francisca | Porão')])]);
  assert.equal(festas(db), 3);
  assert.equal(listarRegistros(db, { todas: true }).filter((f) => f.fontes.length === 2).length, 1);
});

test('matinê às 15h e noite às 23h na mesma casa continuam duas festas', async () => {
  const db = novoBanco();
  const item = (id, inicio) => ({ idExterno: id, bruto: { nome: 'Baile do Galpão', casa: 'Galpão Exemplo', data: '2026-11-28', inicio } });
  await rodar(db, [fonteFixa('paginas', [item('p1', '15:00')]), fonteFixa('indicacao', [item('i1', '23:00')])]);
  assert.equal(festas(db), 2);
  // E a mesma noite às 23h30 por outra fonte junta à das 23h.
  await rodar(db, [fonteFixa('instagram', [item('ig:x:1', '23:30')])]);
  assert.equal(festas(db), 2);
});

const constelarIg = { idExterno: 'ig:POSTCONSTELAR:0659af149b', url: 'https://www.instagram.com/p/POSTCONSTELAR/',
  bruto: { nome: 'CONSTELAR', data: '2026-12-05', inicio: null, casa: 'Hangar Campo de Marte', estilos: ['mpb-samba', 'funk'], produtora: { nome: 'Constelar', instagram: '@coletivo_exemplo' }, instagram: '@coletivo_exemplo' } };
const constelarPagina = (extra = {}) => ({ idExterno: 'pagina:https://www.ingresse.com/constelar', url: 'https://www.ingresse.com/constelar/',
  bruto: { nome: 'Constelar', casa: 'São Paulo', endereco: 'São Paulo', data: '2026-12-05', inicio: '22:00', linkEvento: 'https://www.ingresse.com/constelar/', ...extra } });

test('Constelar e Like Old\'s: a casa "São Paulo" de um lado não veta; com o mesmo perfil, juntam já na coleta', async () => {
  const db = novoBanco();
  await rodar(db, [fonteFixa('instagram', [constelarIg]), fonteFixa('paginas', [constelarPagina({ instagram: '@coletivo_exemplo' })])]);
  assert.equal(festas(db), 1);
  const [f] = listarRegistros(db, { todas: true });
  assert.deepEqual(f.fontes.map((x) => x.id).sort(), ['instagram', 'paginas']);
  const pag = f.fontes.find((x) => x.id === 'paginas');
  assert.equal(pag.vinculo.regra, 'escore');
  assert.ok(pag.vinculo.sinais.some((s) => s.sinal === 'perfil'));

  const db2 = novoBanco();
  const likeIg = { idExterno: 'ig:POSTCOOL:1d4772d543', url: 'https://www.instagram.com/p/POSTCOOL/', bruto: { nome: "Cool Kid's", data: '2026-12-12', casa: 'WTC Golden Hall', produtora: { nome: 'Cool Kid’s', instagram: '@produtora_exemplo2' } } };
  const likePag = { idExterno: 'pagina:https://www.ingresse.com/cool-kid-s-12-12/', bruto: { nome: "Cool Kid's", casa: 'São Paulo', endereco: 'São Paulo', data: '2026-12-12', inicio: '21:00', linkEvento: 'https://www.ingresse.com/cool-kid-s-12-12/' } };
  await rodar(db2, [fonteFixa('instagram', [likeIg]), fonteFixa('paginas', [likePag])]);
  const [x, y] = db2.prepare('SELECT id FROM festas ORDER BY rowid').all().map((r) => correlacao.ladoDaFesta(db2, r.id));
  const e = correlacao.escore(x, y);
  assert.equal(e.veto, null);
  assert.equal(e.decisao, 'talvez');
});

test('festa de 00h30 lida como sexta e a página que diz sábado 00h30 caem na mesma noite', async () => {
  const db = novoBanco();
  const flyer = { idExterno: 'ig:MEIANOITE:1', bruto: { nome: 'Depois da Meia-Noite', casa: 'Galpão Exemplo', data: '2026-11-27' } };
  const pagina = { idExterno: 'pagina:x', bruto: { nome: 'DEPOIS DA MEIA-NOITE', casa: 'Galpão Exemplo', data: '2026-11-28', inicio: '00:30', linkEvento: 'https://ingressos.example/e/depois' } };
  await rodar(db, [fonteFixa('instagram', [flyer]), fonteFixa('paginas', [pagina])]);
  assert.equal(festas(db), 1);
  assert.equal(db.prepare('SELECT data_noite FROM festas').get().data_noite, '2026-11-27');
});

// ---------------------------------------------------------------- U6: escore, passada e apelidos

test('AE3: Constelar do Instagram e Constelar da Ingresse, sem imagem, vão para candidatos com escore 3; com o mesmo flyer, unem', async () => {
  const db = novoBanco();
  const r = await rodar(db, [fonteFixa('instagram', [constelarIg]), fonteFixa('paginas', [constelarPagina()])]);
  assert.equal(festas(db), 2);
  const cand = db.prepare('SELECT * FROM candidatos').all();
  assert.equal(cand.length, 1);
  assert.equal(cand[0].escore, 3);
  assert.deepEqual(JSON.parse(cand[0].motivo).map((s) => s.sinal), ['nome']);
  assert.equal(r.candidatos, 1);
  assert.equal(r.festasMultiFonte, 0);
  // O registro mostra o candidato em `revisar`.
  assert.ok(listarRegistros(db, { todas: true }).some((f) => f.revisar.some((x) => x.motivo === 'candidato-a-fusao')));

  // O flyer do post e o pôster da página, a 6 bits: une, com nome e imagem.
  ligarImagem(db, { fonte: 'instagram', idExterno: constelarIg.idExterno, sha: 'aaaaaaaaaaaaaaaa', phash: 'f0f0f0f0f0f0f0f0' });
  ligarImagem(db, { fonte: 'paginas', idExterno: constelarPagina().idExterno, sha: 'bbbbbbbbbbbbbbbb', phash: 'f0f0f0f0f0f0f03f', papel: 'pagina-ingresso' });
  const ids = db.prepare('SELECT id FROM festas').all().map((x) => x.id);
  const p = correlacao.passada(db, { festasTocadas: ids, agora: relogio(), log: logMudo });
  assert.equal(p.unidas, 1);
  assert.equal(festas(db), 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidatos').get().n, 0);
  const [f] = listarRegistros(db, { todas: true });
  const movido = f.fontes.find((x) => x.vinculo.regra === 'escore');
  assert.deepEqual(movido.vinculo.sinais.map((s) => s.sinal).sort(), ['imagem', 'nome']);
  assert.equal(movido.vinculo.escore, 6);
  // O id antigo resolve para a festa que ficou, e o registro o lista.
  const antigo = ids.find((x) => x !== f.id);
  assert.equal(correlacao.resolverId(db, antigo), f.id);
  assert.deepEqual(f.idsAntigos, [antigo]);
});

test('AE3 na execução: a imagem que a lane de imagens dá pelo item pesa na passada', async () => {
  const imagens = require('../nucleo/imagens');
  const orig = imagens.imagensDoItem;
  imagens.imagensDoItem = (db, fonte) => [{ sha: fonte === 'instagram' ? 'a1' : 'b1', phash: fonte === 'instagram' ? 'f0f0f0f0f0f0f0f0' : 'f0f0f0f0f0f0f0f1', papel: 'post' }];
  try {
    const db = novoBanco();
    const r = await rodar(db, [fonteFixa('instagram', [constelarIg]), fonteFixa('paginas', [constelarPagina()])]);
    assert.equal(festas(db), 1);
    assert.equal(r.correlacao.unidas, 1);
    assert.equal(r.festasMultiFonte, 1);
  } finally {
    imagens.imagensDoItem = orig;
  }
});

test('imagem igual sem outro sinal não une duas festas', async () => {
  const db = novoBanco();
  await rodar(db, [fonteFixa('instagram', [{ idExterno: 'ig:A:1', bruto: { nome: 'Festa', data: '2026-12-05' } }]), fonteFixa('paginas', [{ idExterno: 'p:1', bruto: { nome: 'Festa', data: '2026-12-05' } }])]);
  ligarImagem(db, { fonte: 'instagram', idExterno: 'ig:A:1', sha: 's1', phash: '00ff00ff00ff00ff' });
  ligarImagem(db, { fonte: 'paginas', idExterno: 'p:1', sha: 's1', phash: '00ff00ff00ff00ff' });
  correlacao.passada(db, { festasTocadas: db.prepare('SELECT id FROM festas').all().map((x) => x.id), agora: relogio(), log: logMudo });
  assert.equal(festas(db), 2);
  assert.equal(db.prepare('SELECT escore FROM candidatos').get().escore, 3);
});

test('agenda de seis datas e a página do Shotgun de uma delas, com a mesma peça: une só a do mesmo dia', async () => {
  const db = novoBanco();
  const dias = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'];
  const agenda = dias.map((d) => ({ idExterno: `ig:AGENDA:${d}`, bruto: { nome: 'Baile Exemplo', casa: 'Casa X', data: d, inicio: '23:00' } }));
  const pagina = { idExterno: 'pagina:shotgun', url: 'https://shotgun.live/events/baile-exemplo-03-12', bruto: { nome: 'Baile Exemplo 03.12', casa: 'Casa X', data: '2026-12-03', inicio: '23:00', linkEvento: 'https://shotgun.live/events/baile-exemplo-03-12' } };
  await rodar(db, [fonteFixa('instagram', agenda), fonteFixa('paginas', [pagina])]);
  for (const d of dias) ligarImagem(db, { fonte: 'instagram', idExterno: `ig:AGENDA:${d}`, sha: 'agenda', phash: '1234123412341234' });
  ligarImagem(db, { fonte: 'paginas', idExterno: 'pagina:shotgun', sha: 'agenda', phash: '1234123412341234' });
  correlacao.passada(db, { festasTocadas: db.prepare('SELECT id FROM festas').all().map((x) => x.id), agora: relogio(), log: logMudo });
  assert.equal(festas(db), 6);
  const junta = particao(db).filter((g) => g.includes(' + '));
  assert.deepEqual(junta, ['instagram:ig:AGENDA:2026-12-03 + paginas:pagina:shotgun']);
  // A peça da agenda pesa a metade no escore.
  const [a, b] = ['2026-12-03', '2026-12-04'].map((d) => correlacao.ladoDaFesta(db, db.prepare('SELECT id FROM festas WHERE data_noite = ?').get(d).id));
  assert.ok(a.imagens.every((i) => i.agenda) && b.imagens.every((i) => i.agenda));
});

test('série com o mesmo flyer em datas diferentes nunca une', async () => {
  const db = novoBanco();
  const posts = ['2026-11-28', '2026-12-05', '2026-12-12'].map((d, i) => ({ idExterno: `ig:SERIE${i}:1`, bruto: { nome: 'Série Exemplo', casa: 'Casa Y', data: d, inicio: '22:00' } }));
  await rodar(db, [fonteFixa('instagram', posts)]);
  for (const p of posts) ligarImagem(db, { fonte: 'instagram', idExterno: p.idExterno, sha: 'serie', phash: 'abcdabcdabcdabcd' });
  correlacao.passada(db, { festasTocadas: db.prepare('SELECT id FROM festas').all().map((x) => x.id), agora: relogio(), log: logMudo });
  assert.equal(festas(db), 3);
});

// Um festival de dois dias, na forma do caso de 24/11: a indicação, a página da Ingresse
// (um subdomínio que serve os dois dias) e dois posts do sábado.
const LOTES = [{ nome: 'Dia inteiro, inteira', preco: 700, taxa: 140 }];
const mareAlta = {
  indicacao: ['sabado', 'domingo'].map((dia, i) => ({ idExterno: `grupo:mare-alta-sp-2026-${dia}`, url: 'https://www.ingresse.com/mare-alta-sp-2026/',
    bruto: { nome: `Maré Alta São Paulo · ${dia === 'sabado' ? 'sábado' : 'domingo'}`, produtora: { nome: 'Produtora Exemplo', instagram: '@produtora_exemplo' }, casa: 'Autódromo de Interlagos',
      endereco: 'Av. Senador Teotônio Vilela, 261 - Interlagos (CEP 04801-010)', data: i ? '2026-12-06' : '2026-12-05', lotes: LOTES,
      linkCompra: 'https://www.ingresse.com/mare-alta-sp-2026/', linkEvento: 'https://festival.example/sao-paulo', instagram: '@festival_exemplo' } })),
  paginas: [['Sábado', '2026-12-05', '#45b4241132'], ['Domingo', '2026-12-06', '#81f0eca130']].map(([dia, data, h]) => ({ idExterno: `pagina:https://mare-alta-sp-26.ingresse.com/${h}`, url: 'https://mare-alta-sp-26.ingresse.com/',
    bruto: { nome: `Maré Alta São Paulo ’26 - ${dia}`, data, casa: 'Autódromo de Interlagos', linkCompra: 'https://mare-alta-sp-26.ingresse.com/', lineup: dia === 'Sábado' ? ['Banda Exemplo A', 'Banda Exemplo B', 'Banda Exemplo C'] : ['Banda Exemplo D', 'Banda Exemplo E', 'Banda Exemplo F'] } })),
  instagram: ['POSTEXEMPLO1:500f6e99a2', 'POSTEXEMPLO2:65b1616e0c'].map((c) => ({ idExterno: `ig:${c}`, url: `https://www.instagram.com/p/${c.split(':')[0]}/`,
    bruto: { nome: 'Maré Alta São Paulo', data: '2026-12-05', casa: 'Autódromo de Interlagos', produtora: { nome: 'Maré Alta São Paulo', instagram: '@festival_exemplo' }, instagram: '@festival_exemplo', ehFesta: true } })),
};

test('Maré Alta (indicação, página e dois posts) dá uma festa por dia; sábado e domingo continuam duas, mesmo com o mesmo pôster', async () => {
  const db = novoBanco();
  await rodar(db, [fonteFixa('indicacao', mareAlta.indicacao), fonteFixa('instagram', mareAlta.instagram), fonteFixa('paginas', mareAlta.paginas)]);
  for (const it of [...mareAlta.indicacao, ...mareAlta.paginas]) ligarImagem(db, { fonte: it.idExterno.startsWith('grupo') ? 'indicacao' : 'paginas', idExterno: it.idExterno, sha: 'poster', phash: '0f0f0f0f0f0f0f0f' });
  correlacao.passada(db, { festasTocadas: db.prepare('SELECT id FROM festas').all().map((x) => x.id), agora: relogio(), log: logMudo });
  assert.deepEqual(particao(db), [
    'indicacao:grupo:mare-alta-sp-2026-domingo + paginas:pagina:https://mare-alta-sp-26.ingresse.com/#81f0eca130',
    'indicacao:grupo:mare-alta-sp-2026-sabado + instagram:ig:POSTEXEMPLO1:500f6e99a2 + instagram:ig:POSTEXEMPLO2:65b1616e0c + paginas:pagina:https://mare-alta-sp-26.ingresse.com/#45b4241132',
  ]);
  const sab = listarRegistros(db, { todas: true }).find((f) => f.data === '2026-12-05');
  assert.equal(sab.endereco.cidade, 'São Paulo');
});

test('a ordem de chegada não muda a partição', async () => {
  const embaralhar = (xs, semente) => {
    const a = xs.slice();
    let s = semente;
    for (let i = a.length - 1; i > 0; i -= 1) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const grupos = {
    indicacao: mareAlta.indicacao,
    instagram: [...mareAlta.instagram, constelarIg],
    paginas: [...mareAlta.paginas, abacateira, embalo, constelarPagina({ instagram: '@coletivo_exemplo' })],
  };
  const resultados = new Set();
  for (let semente = 1; semente <= 6; semente += 1) {
    const db = novoBanco();
    const fontes = embaralhar(Object.keys(grupos), semente).map((id) => fonteFixa(id, embaralhar(grupos[id], semente + 7)));
    await rodar(db, fontes);
    resultados.add(JSON.stringify(particao(db)));
  }
  assert.equal(resultados.size, 1, [...resultados].join('\n'));
});

test('decisão manual: `separa` sobrevive à próxima coleta, e `une` junta o que o escore deixaria separado', async () => {
  const db = novoBanco();
  const agora = relogio();
  const a = { idExterno: 'a', bruto: { nome: 'Baile Exemplo', casa: 'Galpão Exemplo', data: '2026-11-28', inicio: '23:00' } };
  const b = { idExterno: 'b', bruto: { nome: 'Baile Exemplo', casa: 'Galpão Exemplo', data: '2026-11-28', inicio: '23:00' } };
  await rodar(db, [fonteFixa('paginas', [a]), fonteFixa('indicacao', [b])], { agora });
  assert.equal(festas(db), 1);
  const [x, y] = parEmOrdem(['paginas', 'a'], ['indicacao', 'b']);
  db.prepare("INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quem, quando) VALUES (?, ?, ?, ?, 'separa', 'teste', 't')").run(...x, ...y);
  agora.andar(3600e3);
  await rodar(db, [fonteFixa('paginas', [a]), fonteFixa('indicacao', [b])], { agora });
  assert.equal(festas(db), 2);
  agora.andar(3600e3);
  await rodar(db, [fonteFixa('paginas', [a]), fonteFixa('indicacao', [b])], { agora });
  assert.equal(festas(db), 2);
  const separada = db.prepare("SELECT regra FROM vinculos WHERE regra = 'manual'").get();
  assert.ok(separada);

  // `une`: dois nomes diferentes, sem nada em comum, juntam pela decisão.
  const db2 = novoBanco();
  const c = { idExterno: 'c', bruto: { nome: 'Nome Um', data: '2026-11-28' } };
  const d = { idExterno: 'd', bruto: { nome: 'Outro Título', data: '2026-11-28' } };
  const [p, q] = parEmOrdem(['paginas', 'c'], ['indicacao', 'd']);
  db2.prepare("INSERT INTO vinculos_decisoes (a_fonte, a_id, b_fonte, b_id, decisao, quem, quando) VALUES (?, ?, ?, ?, 'une', 'teste', 't')").run(...p, ...q);
  await rodar(db2, [fonteFixa('paginas', [c]), fonteFixa('indicacao', [d])]);
  assert.equal(festas(db2), 1);
  assert.equal(db2.prepare("SELECT COUNT(*) AS n FROM vinculos WHERE regra = 'manual'").get().n, 1);
});

test('a festa absorvida resolve para a nova, também em cadeia', async () => {
  const db = novoBanco();
  const agora = relogio();
  for (const [id, nome] of [['f1', 'Um'], ['f2', 'Dois'], ['f3', 'Três']]) {
    db.prepare("INSERT INTO festas (id, data, data_noite, criada_em) VALUES (?, '2026-11-28', '2026-11-28', ?)").run(id, agora().toISOString());
    db.prepare("INSERT INTO valores (festa_id, campo, fonte, valor, conferido_em, mudou_em) VALUES (?, 'nome', 'paginas', ?, 't', 't')").run(id, JSON.stringify(nome));
    agora.andar(1000);
  }
  correlacao.unir(db, 'f2', 'f3', { agora });
  correlacao.unir(db, 'f1', 'f2', { agora });
  assert.equal(correlacao.resolverId(db, 'f3'), 'f1');
  assert.equal(correlacao.resolverId(db, 'f2'), 'f1');
  assert.deepEqual(db.prepare('SELECT id FROM festas').all().map((x) => x.id), ['f1']);
  // O registro da festa que ficou diz os ids antigos.
  assert.deepEqual(listarRegistros(db, { todas: true })[0].idsAntigos.sort(), ['f2', 'f3']);
});
