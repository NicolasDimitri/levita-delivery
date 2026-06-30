// src/lib/extractDigitsFromSpeech.js
// O reconhecimento de voz às vezes devolve dígitos ("3684"), às vezes
// números por extenso ("três seis oito quatro"), e às vezes uma mistura
// com palavras irrelevantes no meio ("o código é três seis oito quatro").
// Essa função ignora tudo que não for número e pega só os 4 primeiros.

const NUMBER_WORDS = {
  zero: '0',
  um: '1',
  uma: '1',
  dois: '2',
  duas: '2',
  tres: '3',
  quatro: '4',
  cinco: '5',
  seis: '6',
  meia: '6', // "meia" é comum no lugar de "seis" ao ditar números no Brasil
  sete: '7',
  oito: '8',
  nove: '9'
};

export function extractDigitsFromSpeech(transcript) {
  if (!transcript) return '';

  const tokens = transcript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos (três -> tres) pra bater com o dicionário
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  let digits = '';

  for (const token of tokens) {
    const literalDigits = token.match(/\d/g);
    if (literalDigits) {
      digits += literalDigits.join('');
    } else if (NUMBER_WORDS[token]) {
      digits += NUMBER_WORDS[token];
    }
    if (digits.length >= 4) break;
  }

  return digits.slice(0, 4);
}
