'use strict';

// Transcripción manual (leída a ojo) de las muestras guardadas en bg_samples/.
// Las marcadas como null se excluyen por ser ambiguas a simple vista.
const ETIQUETAS = {
  s0: 'RD6B',
  s1: 'N42Q',
  s2: 'KIGR',
  s3: '#X1G', // '#' = el 1er carácter (U) está mal segmentado (recorte incompleto), se omite
  s4: 'PJV1', // la 'v' minúscula se trata como V: los captchas normalmente son case-insensitive
  s5: 'EQHL',
  s6: null, // ambiguo (J repetida / posible artefacto)
  s7: '4JPW',
  s8: '3AQG',
  s9: null, // ambiguo (segundo caracter dudoso)
  s10: 'MHCP',
  s11: null, // ambiguo (X repetida, dudoso)
  s12: 'UVQY',
  s13: 'RBQ3',
  s14: 'ZGTM',
  s15: 'QTVX',
  s16: 'HNZA',
  s17: 'NX2Y',
  s18: '6GXC',
  s19: 'AQ5X',
  s20: null, // ambiguo (I / l / 1)
  s21: '5LEU',
  s22: 'LR6F',
  s23: 'FWMB',
  s24: 'JDLK',
  s25: '86ZF',
  s26: '49KB',
  s27: '97LA',
  s28: 'JZ2C',
  s29: 'VLNZ',
};

// Segundo lote (bg_samples2/), descargado y leído más tarde.
const ETIQUETAS2 = {
  t0: '9WNK',
  t1: '786E',
  t2: '1K9X',
  t3: '36CA',
  t4: null, // ambiguo (orden 3/6 dudoso)
  t5: null, // solo se ven 3 caracteres claros
  t6: 'CAW7',
  t7: '9LYG',
  t8: 'AZHM',
  t9: 'ULGE',
  t10: 'AZZ6', // dudoso (Z repetida) pero se incluye
  t11: 'XZY7', // corregido: el 3er carácter es una Y, no una M (error de lectura previo)
  t12: 'JG6Y',
  t13: 'YQE9',
  t14: 'NL67', // corregido: 3er y 4º carácter estaban invertidos (el de abajo/izq es 6, el de arriba/dcha es 7)
  t15: '4LIX',
  t16: 'Q63S',
  t17: '9L38',
  t18: '2GH6',
  t19: '1WUD',
};

// Tercer lote (t20-t44 dentro de bg_samples2/), descargado y leído más tarde.
const ETIQUETAS3 = {
  t20: null, // V y E se fusionaron en un solo trozo (solo 3 bloques detectados)
  t21: '5BGW',
  t22: 'H416',
  t23: null, // ambiguo, no se distingue bien el 2º/3er carácter
  t24: 'N1SS',
  t25: 'C81K',
  t26: 'CGHU', // corregido tras verificar: el 1er carácter es C, no '0'
  t27: null, // ambiguo
  t28: '3RL6',
  t29: '14KG',
  t30: 'G9X9',
  t31: null, // P y C se fusionaron en un solo trozo (solo 3 bloques detectados)
  t32: 'YE3M',
  t33: 'F2GD',
  t34: '6B45',
  t35: 'TK1Q',
  t36: 'GJDH',
  t37: 'UW6Y',
  t38: '1R9P',
  t39: 'MAXT',
  t40: '4NX1',
  t41: 'NX2U',
  t42: 'YGPX',
  t43: '1CL5',
  t44: '2EJL',
};

// Cuarto lote (t45-t69 dentro de bg_samples2/), descargado y leído más tarde.
const ETIQUETAS4 = {
  t45: 'R7YD',
  t46: 'NILK',
  t47: 'WB19',
  t48: 'DEYA',
  t49: null, // ambiguo (2º/3er carácter dudoso, posible P repetida sin confirmar)
  t50: '563H',
  t51: 'AF44',
  t52: 'QEAM',
  t53: null, // J y N se fusionaron en un solo trozo (solo 3 bloques detectados)
  t54: 'UQ4N',
  t55: 'HQ2N',
  t56: 'DKLC',
  t57: 'RSJR', // verificado con recorte: R repetida es real
  t58: '84D2', // corregido tras verificar: orden real es 8,4,D,2 (no 8,D,4,2)
  t59: 'F7F3', // verificado con recorte: F repetida es real
  t60: 'MZCS',
  t61: 'NGKG', // verificado con recorte: G repetida es real
  t62: 'WDY4',
  t63: 'KK4U', // re-verificado con recorte aislado: SÍ es K,K,4,U (mi 1ª lectura); una verificación intermedia se equivocó y se descartó
  t64: 'KLYL', // verificado con recorte: L repetida es real
  t65: '1J2Y',
  t66: 'LVA8',
  t67: '2XLN',
  t68: '7UJQ',
  t69: null, // J se fusionó con un vecino (solo 3 bloques detectados)
};

const LOTES = [
  { dir: 'bg_samples', etiquetas: ETIQUETAS },
  { dir: 'bg_samples2', etiquetas: { ...ETIQUETAS2, ...ETIQUETAS3, ...ETIQUETAS4 } },
];

module.exports = { ETIQUETAS, ETIQUETAS2, ETIQUETAS3, ETIQUETAS4, LOTES };
