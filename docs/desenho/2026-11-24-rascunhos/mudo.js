// Stub mudo de áudio: carregado antes de qualquer outro script. Nenhum
// rascunho toca som, nem por engano (regra da casa).
(function () {
  'use strict';
  function Mudo() {}
  Mudo.prototype.resume = function () { return Promise.resolve(); };
  Mudo.prototype.suspend = function () { return Promise.resolve(); };
  Mudo.prototype.close = function () { return Promise.resolve(); };
  Mudo.prototype.createGain = function () { return { connect: function () {}, gain: { value: 0 } }; };
  Mudo.prototype.createOscillator = function () { return { connect: function () {}, start: function () {}, stop: function () {} }; };
  try { window.AudioContext = Mudo; window.webkitAudioContext = Mudo; } catch (e) { /* nada */ }
  try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) { /* nada */ }
})();
