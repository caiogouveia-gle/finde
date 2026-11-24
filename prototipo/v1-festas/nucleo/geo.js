'use strict';
// Distância em linha reta e o ponto de cada bairro (R29, KTD15 do plano de
// 24/11/2026). Puro. A real com coordenada mede do ponto do bairro escolhido;
// a tabela de minutos (catalogo.js) fica só para as fictícias.

const C = require('./catalogo');

const RAIO_KM = 6371.0088;
const rad = (g) => (g * Math.PI) / 180;
const ponto = (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// haversineKm({ lat, lng }, { lat, lng }) -> km, ou null sem os dois pontos.
function haversineKm(a, b) {
  if (!ponto(a) || !ponto(b)) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// O ponto de referência de um dos 14 bairros ({ lat, lng, nome }), ou null.
function pontoDoBairro(id) {
  const b = typeof id === 'string' && Object.hasOwn(C.TODOS_OS_BAIRROS, id) ? C.TODOS_OS_BAIRROS[id] : null;
  return b && b.ponto ? b.ponto : null;
}

// A caixa da cidade de São Paulo, a mesma do motor (normalizar.js, U9).
function dentroDeSP(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && lat >= -24.1 && lat <= -23.3 && lng >= -47.0 && lng <= -46.3;
}

// vizinho(a, b, raioKm = 3) -> true quando os dois pontos estão a até raioKm
// em linha reta; false quando estão mais longe; null quando falta um dos dois
// (sem medida não se diz que é longe). O "ou mesma região" do pedido fica com
// quem chama (nucleo/motor.js).
function vizinho(a, b, raioKm = 3) {
  const km = haversineKm(a, b);
  if (km === null) return null;
  return km <= (Number.isFinite(raioKm) && raioKm >= 0 ? raioKm : 3);
}

// O ponto de uma festa real para medir distância: o `local` com precisão de
// casa ou de rua, dentro de São Paulo. Precisão `bairro` não vira ponto
// (KTD16, M30): seria medir de um centro de bairro como se fosse a porta.
function pontoDaFesta(f) {
  const l = f && f.local;
  if (!l || !ponto(l) || !dentroDeSP(l.lat, l.lng)) return null;
  if (l.precisao !== 'casa' && l.precisao !== 'rua') return null;
  return { lat: l.lat, lng: l.lng };
}

// kmDoBairro(festa, bairroId) -> km com uma casa decimal, ou null.
function kmDoBairro(f, bairroId) {
  const km = haversineKm(pontoDoBairro(bairroId), pontoDaFesta(f));
  return km === null ? null : Math.round(km * 10) / 10;
}

module.exports = { haversineKm, pontoDoBairro, dentroDeSP, vizinho, pontoDaFesta, kmDoBairro };
