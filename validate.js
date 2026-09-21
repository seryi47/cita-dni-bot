'use strict';
const fs = require('fs');
const { clasificar } = require('./src/captcha-ocr');

const { referencia } = JSON.parse(fs.readFileSync('char_reference.json'));

// Instancias únicas (una letra real = sus N variantes rotadas comparten "instancia")
const instancias = [...new Set(referencia.map((r) => r.instancia))];

let aciertos = 0;
const fallos = [];
let evaluadas = 0;

for (const instancia of instancias) {
  const grupo = referencia.filter((r) => r.instancia === instancia);
  const original = grupo[Math.floor(grupo.length / 2)]; // el ángulo 0 está en el medio de ANGULOS
  const resto = referencia.filter((r) => r.instancia !== instancia); // fuera TODAS las variantes de esta letra

  evaluadas++;
  const real = original.label;
  const { label: predicho, confianza } = clasificar(original.bitmap, resto);
  if (predicho === real) {
    aciertos++;
  } else {
    fallos.push(`${real} -> predicho ${predicho} (confianza ${confianza}) [${instancia}]`);
  }
}

console.log(`Precisión por carácter (leave-one-out, sin trampa de rotaciones): ${aciertos}/${evaluadas} = ${(100 * aciertos / evaluadas).toFixed(1)}%`);
if (fallos.length) {
  console.log('Fallos:');
  fallos.forEach((f) => console.log(' -', f));
}
