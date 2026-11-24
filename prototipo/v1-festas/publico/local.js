'use strict';
// Chegar lá e a que distância fica (R29, R32, KTD16 do plano de 24/11/2026):
// "Como chegar", um link só, que abre Google Maps, Apple Maps e Uber, com ou
// sem coordenada, e a frase da distância em linha reta a partir do bairro
// escolhido. Sem geolocalização (D16): o Uber parte de "my_location", que é o
// próprio app dele que resolve, nunca o nosso. Puro, sem DOM: roda no
// navegador (window.FindeLocal) e no node --test (module.exports).

(function (raiz, fabrica) {
  const L = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = L;
  else raiz.FindeLocal = L;
})(typeof self !== 'undefined' ? self : this, () => {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const q = encodeURIComponent;

  // A coordenada serve para chegar só com precisão de casa ou de rua, e só
  // dentro da caixa de São Paulo (a mesma de nucleo/geo.js). Precisão de
  // bairro mandaria a pessoa para o meio do bairro: aí vale o texto.
  function coordenada(e) {
    if (!e || !num(e.lat) || !num(e.lng)) return null;
    if (e.precisao != null && e.precisao !== 'casa' && e.precisao !== 'rua') return null;
    if (e.lat < -24.1 || e.lat > -23.3 || e.lng < -47.0 || e.lng > -46.3) return null;
    return { lat: e.lat.toFixed(5), lng: e.lng.toFixed(5) };
  }

  // O texto da busca quando não há coordenada: o endereço; sem ele, a casa
  // com a cidade (busca pelo nome só, sem cidade, acha a casa errada).
  function busca(e, casa) {
    const t = texto(e && e.texto);
    if (t) return /s[ãa]o paulo/i.test(t) ? t : `${t}, São Paulo`;
    return casa ? `${casa}, São Paulo` : '';
  }

  // comoChegar(endereco, casa) -> [{ id: 'google'|'apple'|'uber', rotulo, url }]
  // endereco: { texto, lat, lng, precisao } (o `local` da festa, com o texto
  // do endereço, ou só o endereço). Sem coordenada nem texto nem casa, [].
  function comoChegar(endereco, casa) {
    const nome = texto(casa);
    const c = coordenada(endereco);
    if (c) {
      const apple = `https://maps.apple.com/?ll=${c.lat},${c.lng}` + (nome ? `&q=${q(nome)}` : '');
      let uber = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${c.lat}&dropoff[longitude]=${c.lng}`;
      if (nome) uber += `&dropoff[nickname]=${q(nome)}`;
      return [
        { id: 'google', rotulo: 'Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` },
        { id: 'apple', rotulo: 'Apple Maps', url: apple },
        { id: 'uber', rotulo: 'Uber', url: uber },
      ];
    }
    const b = busca(endereco, nome);
    if (!b) return [];
    let uber = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${q(b)}`;
    if (nome) uber += `&dropoff[nickname]=${q(nome)}`;
    return [
      { id: 'google', rotulo: 'Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${q(b)}` },
      { id: 'apple', rotulo: 'Apple Maps', url: `https://maps.apple.com/?q=${q(b)}` },
      { id: 'uber', rotulo: 'Uber', url: uber },
    ];
  }

  // A preposição de cada um dos 14 bairros do motor (a mesma de
  // nucleo/catalogo.js, `de`). Bairro fora da lista leva "de".
  const DE = {
    'Pinheiros': 'de', 'Vila Madalena': 'da', 'Barra Funda': 'da', 'Centro': 'do', 'Bela Vista': 'da',
    'Jardins': 'dos', 'Vila Mariana': 'da', 'Perdizes': 'de', 'Lapa': 'da', 'Butantã': 'do',
    'Santana': 'de', 'Mooca': 'da', 'Santo Amaro': 'de', 'Interlagos': 'de',
  };
  // "da Vila Madalena" a partir de 'Vila Madalena', de 'da Vila Madalena' ou
  // de { nome, de } (o bairro do catálogo).
  function doBairro(bairro) {
    if (bairro && typeof bairro === 'object') return texto(bairro.de) || doBairro(bairro.nome);
    const t = texto(bairro);
    if (!t) return '';
    if (/^(da|de|do|das|dos) /.test(t)) return t;
    return `${DE[t] || 'de'} ${t}`;
  }

  // "2,1 km" (uma casa; de 10 km para cima, inteiro; abaixo de 0,1, "0,1").
  function km(v) {
    if (v >= 10) return `${Math.round(v)} km`;
    return `${String(Math.max(0.1, Math.round(v * 10) / 10)).replace('.', ',')} km`;
  }

  // distanciaTexto(2.1, 'Vila Madalena') -> "a 2,1 km da Vila Madalena, em linha reta"
  // Sem distância medida ou sem bairro, ''.
  function distanciaTexto(v, bairro) {
    if (!num(v) || v < 0) return '';
    const de = doBairro(bairro);
    return de ? `a ${km(v)} ${de}, em linha reta` : '';
  }

  return { comoChegar, distanciaTexto };
});
