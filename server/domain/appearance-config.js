'use strict';

// Garden appearance vocabulary shared with persisted user preferences.
// The React client maps these values to semantic shadcn color tokens.
const themes = [
  ['system', 'system'],
  ['disk-light', 'light'],
  ['anuppuccin-latte', 'light'],
  ['noch', 'dark'],
  ['anuppuccin-mocha', 'dark'],
];
const accents = ['red','maroon','peach','yellow','green','teal','sky','sapphire','blue','lavender','mauve','pink','flamingo','rosewater','slate'];

module.exports = {
  themeValues: themes.map(([value]) => value),
  themeModes: Object.fromEntries(themes),
  accentValues: accents,
  defaultTheme: 'system',
  defaultAccent: 'green',
};
