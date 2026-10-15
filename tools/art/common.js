// Shared bits for the ihram illustrations (faceless, flat, high-contrast). Rendered to PNG by render.js.
const SKIN = '#C68B59', SKIN_D = '#A9713F', CLOTH = '#FFFFFF', LINE = '#7C879C', OK = '#2E7D32', BAD = '#C62828', MARK = '#FF7C06';
const ok = (x, y) => `<g transform="translate(${x},${y})"><circle r="34" fill="${OK}"/><path d="M-16,1 L-5,13 L17,-12" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const bad = (x, y) => `<g transform="translate(${x},${y})"><circle r="34" fill="${BAD}"/><path d="M-13,-13 L13,13 M13,-13 L-13,13" stroke="#fff" stroke-width="9" stroke-linecap="round"/></g>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="28" fill="#EEF2F8"/>${body}</svg>`;
module.exports = { SKIN, SKIN_D, CLOTH, LINE, OK, BAD, MARK, ok, bad, svg };
