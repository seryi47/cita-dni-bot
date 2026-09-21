'use strict';

// Códigos reales de oficina ("equipo") descubiertos navegando el sitio.
// Santa Pola, Gran Alacant y El Altet NO tienen oficina propia (no aparecen
// en el listado de la provincia de Alicante) — sus vecinos más cercanos son
// Elche y Alicante capital, que ya están cubiertos aquí.
const OFICINAS = [
  { lugar: 'Albacete', provincia: '02', equipo: '02023A6D1', nombre: 'U.D. DE ALBACETE' },
  { lugar: 'Torrevieja', provincia: '03', equipo: '03092A6DS', nombre: 'U.D. DE TORREVIEJA' },
  { lugar: 'Elche', provincia: '03', equipo: '03449L6D1', nombre: 'U.D. DE ELCHE/ELX' },
  { lugar: 'Elda', provincia: '03', equipo: '03456L6D1', nombre: 'U.D. DE ELDA' },
  { lugar: 'Alicante', provincia: '03', equipo: '03092A6D1', nombre: 'U.D. DE ALACANT/ALICANTE' },
];

module.exports = { OFICINAS };
