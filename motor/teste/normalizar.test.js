'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarItem, preco, instagram, novoId, url, limparNome, limparCasa, cidade } = require('../nucleo/normalizar');
const { acharBairro, acharBairroPorCep, extrairCep } = require('../nucleo/bairros');

test('horário: fim depois da meia-noite vira o dia seguinte, em −03:00', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', inicio: '22:00', pistaCheia: '00:30', fim: '04:00' }, 'envio');
  assert.equal(campos.inicio, '2026-11-14T22:00:00-03:00');
  assert.equal(campos.pistaCheia, '2026-11-15T00:30:00-03:00');
  assert.equal(campos.fim, '2026-11-15T04:00:00-03:00');
});

test('pista cheia na mesma hora do início fica no mesmo dia', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', inicio: '18:00', pistaCheia: '18:00', fim: '23:00' }, 'envio');
  assert.equal(campos.pistaCheia, '2026-11-14T18:00:00-03:00');
});

test('preço em texto', () => {
  assert.equal(preco('Gratuito'), 0);
  assert.equal(preco('Entrada franca'), 0);
  assert.equal(preco('R$ 25,00'), 25);
  assert.equal(preco('R$20 a R$40'), 20);
  assert.equal(preco('R$ 1.200,50'), 1200.5);
  assert.equal(preco('consulte'), null);
  assert.equal(preco(-3), null);
});

test('instagram vira URL canônica; outro domínio é recusado', () => {
  assert.equal(instagram('@coletivo.x'), 'https://www.instagram.com/coletivo.x/');
  assert.equal(instagram('https://instagram.com/coletivo_x/?hl=pt'), 'https://www.instagram.com/coletivo_x/');
  assert.equal(instagram('https://evil.com/coletivo'), null);
  assert.equal(instagram('nome com espaço'), null);
});

test('URL: só http(s)', () => {
  assert.equal(url('javascript:alert(1)'), null);
  assert.equal(url('data:text/html,oi'), null);
  assert.equal(url('https://a.example/x'), 'https://a.example/x');
});

test('R16: média de idade vinda de fonte que não é o envio é descartada com aviso', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: { valor: 30, origem: 'produtora' } }, 'mapas-culturais');
  assert.equal(campos.mediaIdade, undefined);
  assert.match(avisos.join(), /só a produtora declara/);
});

test('R16: no envio, média sem origem, origem inventada ou avaliações de menos saem', () => {
  const casos = [
    [{ valor: 30 }, /sem origem/],
    [{ valor: 30, origem: 'chute' }, /sem origem/],
    [{ valor: 30, origem: 'avaliacoes', avaliacoes: 3 }, /ao menos 5/],
    [{ valor: 30, origem: 'edicoes' }, /detalhe/],
    [{ valor: 12, origem: 'produtora' }, /fora de 18 a 60/],
  ];
  for (const [m, re] of casos) {
    const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: m }, 'envio');
    assert.equal(campos.mediaIdade, undefined, JSON.stringify(m));
    assert.match(avisos.join(), re);
  }
  const ok = normalizarItem({ nome: 'X', data: '2026-11-14', mediaIdade: { valor: 31, origem: 'edicoes', detalhe: 'três últimas edições' } }, 'envio');
  assert.deepEqual(ok.campos.mediaIdade, { valor: 31, origem: 'edicoes', detalhe: 'três últimas edições' });
});

test('bairro e região saem do endereço', () => {
  const { campos } = normalizarItem({ nome: 'X', data: '2026-11-14', endereco: 'Rua Augusta, 10 - Consolação' }, 'envio');
  assert.equal(campos.endereco.bairro, 'bela-vista');
  assert.equal(campos.endereco.regiao, 'centro');
});

test('estilos fora do catálogo saem; idade "Livre" não vira idade mínima', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-11-14', estilos: ['house-disco', 'axe'], idadeMinima: 'Livre' }, 'envio');
  assert.deepEqual(campos.estilos, ['house-disco']);
  assert.equal(campos.idadeMinima, undefined);
  assert.match(avisos.join(), /fora do catálogo/);
});

test('data inválida não entra e avisa', () => {
  const { campos, avisos } = normalizarItem({ nome: 'X', data: '2026-02-30', inicio: '22:00' }, 'envio');
  assert.equal(campos.data, undefined);
  assert.equal(campos.inicio, undefined);
  assert.match(avisos.join(), /data inválida/);
});

test('id: formato do protótipo, estável para a mesma semente', () => {
  const a = novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:x');
  assert.match(a, /^[a-z0-9-]{1,60}$/);
  assert.ok(a.length <= 60);
  assert.equal(a, novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:x'));
  assert.notEqual(a, novoId('Sexta Sem Pressa — Edição de Verão Extra Longa Demais Para Caber', '2026-11-14', 'envio:y'));
});

// ---- U9: normalização limpa (M28, KTD3) ----

const norm = (b, fonte = 'paginas', opcoes) => normalizarItem({ nome: 'X', data: '2026-11-14', ...b }, fonte, opcoes).campos;
const LUGARES = [
  { id: 'matiz', nome: 'Matiz', endereco: 'Rua Martins Fontes, 91', cep: '01050-000', bairro: 'centro', bairroNome: 'República', regiao: 'centro', cidade: 'São Paulo' },
  { id: 'aerodromo', nome: 'Aeródromo Exemplo', endereco: 'Rua Beija-Flor, 50', cidade: 'Cotia' },
];

test('cidade: travessão longo, | e UF no fim ("Praça Charles Miller, s/n — Pacaembu, São Paulo — SP")', () => {
  assert.equal(norm({ endereco: 'Praça Charles Miller, s/n — Pacaembu, São Paulo — SP' }).endereco.cidade, 'São Paulo');
  assert.equal(norm({ endereco: 'Rua das Flores, 10 | Cotia | SP' }).endereco.cidade, 'Cotia');
  assert.equal(norm({ endereco: 'Av. Paulista, 1000 — Bela Vista, São Paulo' }).endereco.cidade, 'São Paulo');
  assert.equal(norm({ endereco: 'Rua Beija-Flor, 50, Cotia/SP (CEP 06720-480)' }).endereco.cidade, 'Cotia');
  assert.equal(norm({ endereco: 'Pinheiros - SP' }).endereco.cidade, 'São Paulo');
  assert.equal(cidade({ endereco: 'Rua Y, 10, Consolação' }), null);
});

test('cidade: de onde veio (fonte, CEP da capital, casa curada)', () => {
  assert.equal(norm({ endereco: 'Rua X, 10, São Paulo' }).endereco.cidadeOrigem, 'fonte');
  assert.equal(norm({ endereco: 'Rua X, 10', cep: '05413-011' }).endereco.cidadeOrigem, 'cep');
  assert.equal(norm({ endereco: 'Rua X, 10 - 01310-100' }).endereco.cidadeOrigem, 'cep');
  const dacasa = norm({ casa: 'Matiz' }, 'instagram', { lugares: LUGARES }).endereco;
  assert.equal(dacasa.cidade, 'São Paulo');
  assert.equal(dacasa.cidadeOrigem, 'casa');
  assert.equal(dacasa.lugar, 'matiz');
  // a cidade que a fonte diz vence a da casa
  assert.equal(norm({ casa: 'Aeródromo Exemplo', cidade: 'São Paulo' }, 'paginas', { lugares: LUGARES }).endereco.cidadeOrigem, 'fonte');
  // bairro sozinho não confirma a cidade
  assert.equal(norm({ endereco: 'Rua X, 10 - Consolação' }).endereco.cidade, null);
  // casa que é cidade vira evidência da cidade
  assert.equal(norm({ casa: 'Rio de Janeiro', endereco: 'Rio de Janeiro' }).endereco.cidade, 'Rio de Janeiro');
});

test('cidade, UF, "online" e "a definir" não são casa', () => {
  for (const c of ['São Paulo', 'Rio de Janeiro', 'SP', 'Online', 'A definir', 'São Paulo - SP']) {
    assert.equal(norm({ casa: c }).casa, undefined, c);
  }
  assert.equal(norm({ casa: 'Matiz' }, 'paginas', { lugares: [] }).casa, 'Matiz');
  assert.deepEqual(limparCasa('Online'), { casa: null, endereco: null });
});

test('casa que começa por logradouro é endereço, e "Nome, Rua X 12" separa as duas coisas', () => {
  const a = norm({ casa: 'Alameda Exemplo, 376' });
  assert.equal(a.casa, undefined);
  assert.equal(a.endereco.texto, 'Alameda Exemplo, 376');
  const b = norm({ casa: 'Espaço Exemplo, Rua Exemplo 1221, sala 11.' });
  assert.equal(b.casa, 'Espaço Exemplo');
  // o endereço que a fonte deu vale mais que o tirado da casa
  const c = norm({ casa: 'Alameda Exemplo, 376', endereco: 'Rua Y, 10 - São Paulo' });
  assert.equal(c.endereco.texto, 'Rua Y, 10 - São Paulo');
});

test('sufixo "// handle" sai da casa e do nome', () => {
  assert.equal(norm({ casa: 'Cria // cr1a_011' }, 'paginas', { lugares: [] }).casa, 'Cria');
  assert.equal(norm({ nome: 'Noite Cria // cr1a_011' }).nome, 'Noite Cria');
});

test('nome: sem data, sem "| 28.11" e em caixa de título quando vem em maiúsculas', () => {
  assert.equal(limparNome('LUA CHEIA CLUB no Edifício Exemplo | 28.11'), 'Lua Cheia Club no Edifício Exemplo');
  assert.equal(limparNome('29/11 - Baile da Syon'), 'Baile da Syon');
  assert.equal(limparNome('28.11 | Baile da Syon'), 'Baile da Syon');
  assert.equal(limparNome('Baile da Syon - 29/11'), 'Baile da Syon');
  assert.equal(limparNome('Baile da Syon 29/11'), 'Baile da Syon');
  assert.equal(limparNome('Baile da Syon (29.11)'), 'Baile da Syon');
  assert.equal(limparNome('NOITE DO SAMBA'), 'Noite do Samba');
  assert.equal(limparNome('DJ CASTANHA & FRIENDS'), 'DJ Castanha & Friends');
  assert.equal(limparNome('FESTA DA USP'), 'Festa da USP');
  assert.equal(limparNome('Vol. 1.5 do Baile'), 'Vol. 1.5 do Baile');
  assert.equal(limparNome('Festa DJ Fulano'), 'Festa DJ Fulano');
  assert.equal(limparNome('IBT'), 'IBT');
  assert.equal(limparNome('SAMBA'), 'Samba');
  assert.equal(limparNome('29/11'), '29/11'); // sem nada além da data, fica como veio
});

test('endereço só com o nome de um bairro não emite `endereco`; o bairro fica em bairroDaCasa', () => {
  const c = norm({ endereco: 'Interlagos' });
  assert.equal(c.endereco, undefined);
  assert.equal(c.bairroDaCasa.bairro, 'interlagos');
  const d = norm({ casa: 'Autódromo de Interlagos' }, 'paginas', { lugares: [] });
  assert.equal(d.endereco, undefined);
  assert.equal(d.bairroDaCasa.bairro, 'interlagos');
  // bairro de um endereço de verdade vai para o endereço, sem bairroDaCasa
  const e = norm({ endereco: 'Rua Augusta, 10 - Consolação' });
  assert.equal(e.endereco.bairro, 'bela-vista');
  assert.equal(e.bairroDaCasa, undefined);
  // a casa curada dá o bairro dela, à parte
  assert.deepEqual(norm({ casa: 'Matiz' }, 'paginas', { lugares: LUGARES }).bairroDaCasa, { bairro: 'centro', bairroNome: 'República', regiao: 'centro' });
});

test('endereco só com texto, CEP ou cidade; as chaves vêm todas, com null no que falta', () => {
  assert.equal(norm({ casa: 'Casa X' }, 'paginas', { lugares: [] }).endereco, undefined);
  assert.deepEqual(norm({ cep: '01144010' }).endereco, {
    texto: null, bairro: 'barra-funda', bairroNome: 'Barra Funda', regiao: 'oeste', cidade: 'São Paulo', cidadeOrigem: 'cep', cep: '01144-010', lugar: null,
  });
  assert.equal(norm({ endereco: 'Rua Y, 10 (CEP 04801-010)' }).endereco.cep, '04801-010');
});

test('cep, cidade e uf do extrator passam', () => {
  const c = norm({ cidade: 'Cotia', uf: 'SP', cep: '06720-480' });
  assert.equal(c.endereco.cidade, 'Cotia');
  assert.equal(c.endereco.cep, '06720-480');
  assert.equal(norm({ cidade: 'São Paulo - SP' }).endereco.cidade, 'São Paulo');
});

test('geo do bruto só dentro da caixa de São Paulo, com cinco casas', () => {
  assert.deepEqual(norm({ geo: { lat: -23.5486888, lng: -46.6433182 } }).geo, { lat: -23.54869, lng: -46.64332, precisao: 'casa', origemGeo: 'pagina' });
  assert.equal(norm({ geo: { lat: -23.5, lng: -46.6, precisao: 'rua' } }).geo.precisao, 'rua');
  assert.equal(norm({ geo: { lat: -22.9068, lng: -43.1729 } }).geo, undefined); // Rio
  assert.equal(norm({ geo: { lat: -23.5, lng: -47.2 } }).geo, undefined); // a oeste da caixa
  assert.equal(norm({ geo: { lat: 'x', lng: -46.6 } }).geo, undefined);
});

test('idPlataforma, tipo e ehFesta passam de qualquer fonte; confiança e lixo não', () => {
  const c = norm({ idPlataforma: 'abc-123', tipo: 'Sessão de escuta', ehFesta: false, confianca: 0.9 }, 'instagram');
  assert.equal(c.idPlataforma, 'abc-123');
  assert.equal(c.tipo, 'sessao-de-escuta');
  assert.equal(c.ehFesta, false);
  assert.equal(c.confianca, undefined);
  assert.equal(norm({ tipo: 'balada' }).tipo, undefined);
  assert.equal(norm({ idPlataforma: 'com espaço e <script>' }).idPlataforma, undefined);
  assert.equal(norm({ idPlataforma: 4521 }, 'plataformas').idPlataforma, '4521');
  assert.equal(norm({ ehFesta: true }, 'shotgun-apify').ehFesta, true);
});

test('nenhuma fonte emite `cartaz` (a imagem vai por item.imagens)', () => {
  for (const f of ['envio', 'indicacao', 'instagram', 'paginas', 'shotgun-apify', 'claude']) {
    assert.equal(norm({ cartaz: 'https://exemplo.com/a.jpg' }, f).cartaz, undefined, f);
  }
});

test('nome de lote até 80 caracteres; link sai sem código de quem indicou', () => {
  const nome = 'L'.repeat(120);
  const c = norm({ lotes: [{ nome, preco: 40 }], linkCompra: 'https://shotgun.live/e/x?utm_source=ig&ref=abc' }, 'paginas');
  assert.ok(c.lotes[0].nome.length <= 80);
  assert.equal(c.linkCompra, 'https://shotgun.live/e/x');
});

// ---- U10: bairros e CEP (M28, R29) ----

test('bairros: o nome real fica em `nome` e o id é um dos 14 do app', () => {
  const casos = [
    ['Pacaembu', 'perdizes', 'Pacaembu'], ['Anhangabaú', 'centro', 'Anhangabaú'], ['Santa Cecília', 'centro', 'Santa Cecília'],
    ['Canindé', 'centro', 'Canindé'], ['Vila Leopoldina', 'lapa', 'Vila Leopoldina'], ['Campo de Marte', 'santana', 'Campo de Marte'],
    ['Carrão', 'mooca', 'Carrão'], ['Tatuapé', 'mooca', 'Tatuapé'], ['Jardim Peri Peri', 'butanta', 'Jardim Peri Peri'],
    ['Cerqueira César', 'jardins', 'Cerqueira César'], ['Moema', 'vila-mariana', 'Moema'], ['Vila Madalena', 'vila-madalena', 'Vila Madalena'],
  ];
  for (const [texto, id, nome] of casos) {
    const b = acharBairro(texto);
    assert.equal(b.bairro, id, texto);
    assert.equal(b.nome, nome, texto);
  }
  assert.equal(acharBairro('Rua sem bairro nenhum, 10'), null);
  // o nome mais longo ganha
  assert.equal(acharBairro('Rua X, 10 - Vila Madalena').bairro, 'vila-madalena');
  assert.equal(acharBairro('Av. Junta Mizumoto 13, Jd Peri Peri').bairro, 'butanta');
});

test('"Rua Mergenthaler 1177, Vila Leopoldina" dá lapa, com bairroNome Vila Leopoldina', () => {
  const e = norm({ endereco: 'Rua Mergenthaler 1177, Vila Leopoldina' }).endereco;
  assert.equal(e.bairro, 'lapa');
  assert.equal(e.bairroNome, 'Vila Leopoldina');
  assert.equal(e.regiao, 'oeste');
});

test('CEP decide o bairro só quando o texto não diz', () => {
  assert.equal(norm({ endereco: 'Rua Henrique Schaumann, 794', cep: '05413' + '-011' }).endereco.bairro, 'pinheiros');
  assert.equal(norm({ endereco: 'Rua Achilles Orlando Curtolo, 649', cep: '01144-010' }).endereco.bairro, 'barra-funda');
  // o texto diz Consolação, e o CEP é de Higienópolis: vale o texto
  assert.equal(norm({ endereco: 'Rua Mato Grosso, 398 - Consolação', cep: '01239-040' }).endereco.bairro, 'bela-vista');
  assert.equal(acharBairroPorCep('01144-010').bairro, 'barra-funda');
  assert.equal(acharBairroPorCep('Rua X, 10 - CEP 04801-010').bairro, 'interlagos');
  assert.equal(acharBairroPorCep('05413011').bairro, 'pinheiros');
  assert.equal(acharBairroPorCep('06720-480'), null); // Cotia
  assert.equal(acharBairroPorCep('sem cep'), null);
  assert.equal(extrairCep('CEP 01144010'), '01144-010');
  assert.equal(extrairCep('Rua X, 1234567'), null);
});

test('a faixa de CEP aponta sempre para um dos 14 ids', () => {
  const { FAIXAS_DE_CEP, BAIRROS } = require('../nucleo/bairros');
  assert.equal(Object.keys(BAIRROS).length, 14);
  for (const [de, ate, id] of FAIXAS_DE_CEP) {
    assert.ok(BAIRROS[id], id);
    assert.ok(de <= ate);
  }
  const ordenadas = [...FAIXAS_DE_CEP].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ordenadas.length; i += 1) assert.ok(ordenadas[i][0] > ordenadas[i - 1][1], `faixas se cruzam: ${ordenadas[i][0]}`);
});
