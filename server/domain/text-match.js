'use strict';

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  return new RegExp(`(^|\\s)${escapeRe(phrase)}(?=\\s|$)`, 'i').test(text);
}

function norm(s) {
  // Заменяем «@» на пробел, а не вырезаем: длина строки не меняется, и вызовы вроде
  // parseCreateIntent, что переносят позиции из normalized-строки в исходную (чтобы
  // сохранить регистр и «ё» в заголовке), не рассинхронизируются из-за одного «@».
  return (s || '').toString().toLowerCase().replace(/ё/g, 'е').replace(/@(?=[a-zа-я0-9])/gi, ' ').trim();
}

function stemRu(word) {
  return norm(word).replace(/(ами|ями|ого|ему|ому|ыми|ими|ов|ев|ей|ах|ях|ью|ям|ам|а|я|ы|и|у|ю|е|ь)$/i, '');
}

module.exports = { escapeRe, containsPhrase, norm, stemRu };
