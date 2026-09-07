(function (root, factory) {
  const config = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  if (root) root.GardenAppearance = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const themes = [
    { value: 'chernika', label: 'Черника', mode: 'light', note: 'прохладная' },
    { value: 'myata', label: 'Мята', mode: 'light', note: 'свежая' },
    { value: 'lavanda', label: 'Лаванда', mode: 'light', note: 'мягкая' },
    { value: 'tuman', label: 'Туман', mode: 'light', note: 'нейтральная' },
    { value: 'grafit', label: 'Графит', mode: 'dark', note: 'строгая' },
    { value: 'khvoya', label: 'Хвоя', mode: 'dark', note: 'природная' },
    { value: 'noch', label: 'Ночь', mode: 'dark', note: 'глубокая' },
    { value: 'anuppuccin-latte', label: 'AnuPpuccin Latte', mode: 'light', note: 'настраиваемая' },
    { value: 'anuppuccin-mocha', label: 'AnuPpuccin Mocha', mode: 'dark', note: 'настраиваемая' },
  ];
  const accentThemes = ['anuppuccin-latte', 'anuppuccin-mocha'];
  const accents = [
    { value: 'red', label: 'Красный', latte: '#D20F39', mocha: '#F38BA8' },
    { value: 'maroon', label: 'Бордовый', latte: '#E64553', mocha: '#EBA0AC' },
    { value: 'peach', label: 'Персиковый', latte: '#FE640B', mocha: '#FAB387' },
    { value: 'yellow', label: 'Жёлтый', latte: '#DF8E1D', mocha: '#F9E2AF' },
    { value: 'green', label: 'Зелёный', latte: '#40A02B', mocha: '#A6E3A1' },
    { value: 'teal', label: 'Бирюзовый', latte: '#179299', mocha: '#94E2D5' },
    { value: 'sky', label: 'Небесный', latte: '#04A5E5', mocha: '#89DCEB' },
    { value: 'sapphire', label: 'Сапфировый', latte: '#209FB5', mocha: '#74C7EC' },
    { value: 'blue', label: 'Синий', latte: '#1E66F5', mocha: '#89B4FA' },
    { value: 'lavender', label: 'Лавандовый', latte: '#7287FD', mocha: '#B4BEFE' },
    { value: 'mauve', label: 'Мальва', latte: '#8839EF', mocha: '#CBA6F7' },
    { value: 'pink', label: 'Розовый', latte: '#EA76CB', mocha: '#F5C2E7' },
    { value: 'flamingo', label: 'Фламинго', latte: '#DD7878', mocha: '#F2CDCD' },
    { value: 'rosewater', label: 'Розовая вода', latte: '#DC8A78', mocha: '#F5E0DC' },
    { value: 'slate', label: 'Графитовый', latte: '#586174', mocha: '#A6ADC8' },
  ];
  return {
    themes,
    themeValues: themes.map((item) => item.value),
    themeModes: Object.fromEntries(themes.map((item) => [item.value, item.mode])),
    accentThemes,
    accents,
    accentValues: accents.map((item) => item.value),
    defaultTheme: 'anuppuccin-latte',
    defaultAccent: 'green',
  };
});
