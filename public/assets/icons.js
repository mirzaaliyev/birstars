// Star icons, chosen per star in the admin. Without an icon a star is the usual dot.
// To add one: put a white SVG (square viewBox, transparent background) into /assets/icons/
// and add a line below. The id is what the database stores, so don't rename it later.
// Optional colours (without them the icon is white with the usual cold glow, like other stars):
//   color — the icon itself, glow — the halo around it, readColor — the icon once it has been read.
window.BirIcons = [
  // Family greetings: a warm star among the cold ones.
  { id: 'heart', label: 'Сердечко', src: '/assets/icons/heart.svg', color: '#FFE2BF', glow: '#FFB56B', readColor: '#A8988A' },
];
