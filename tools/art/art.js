const { SKIN, SKIN_D, CLOTH, LINE, MARK, ok, bad, svg } = require('./common');
const sw = `stroke="${LINE}" stroke-width="4" stroke-linejoin="round"`;

// Man standing, front view. idtiba = right shoulder (viewer's left) bare.
function man(idtiba) {
  const head = `<circle cx="300" cy="105" r="46" fill="${SKIN}"/><rect x="284" y="142" width="32" height="26" fill="${SKIN}"/>`;
  const legs = `<rect x="244" y="492" width="34" height="62" rx="10" fill="${SKIN}"/><rect x="322" y="492" width="34" height="62" rx="10" fill="${SKIN}"/>`;
  const sandals = `<rect x="226" y="552" width="64" height="14" rx="7" fill="#6B4A2B"/><rect x="310" y="552" width="64" height="14" rx="7" fill="#6B4A2B"/>
    <path d="M238,552 L262,536 L284,552" stroke="#6B4A2B" stroke-width="7" fill="none"/><path d="M316,552 L340,536 L362,552" stroke="#6B4A2B" stroke-width="7" fill="none"/>`;
  const izar = `<path d="M204,318 L396,318 L408,500 L192,500 Z" fill="${CLOTH}" ${sw}/><path d="M300,320 L330,498" stroke="${LINE}" stroke-width="3" fill="none"/><path d="M204,336 L396,336" stroke="${LINE}" stroke-width="3"/>`;
  const armR = `<path d="M398,190 Q428,260 420,392" stroke="${SKIN}" stroke-width="30" fill="none" stroke-linecap="round"/>`;
  const armL = `<path d="M202,190 Q172,260 180,392" stroke="${SKIN}" stroke-width="30" fill="none" stroke-linecap="round"/>`;
  let top;
  if (!idtiba) {
    top = `${armL}${armR}<path d="M196,182 Q300,150 404,182 L432,300 L414,336 Q300,352 186,336 L168,300 Z" fill="${CLOTH}" ${sw}/>
      <path d="M232,200 Q300,250 368,200" stroke="${LINE}" stroke-width="3" fill="none"/><path d="M215,250 Q300,290 385,250" stroke="${LINE}" stroke-width="3" fill="none"/>`;
  } else {
    top = `<path d="M206,178 L300,166 L300,330 L206,330 Z" fill="${SKIN}"/>${armL}${armR}
      <path d="M220,262 L404,180 L432,300 L414,336 Q300,352 192,336 L196,272 Z" fill="${CLOTH}" ${sw}/>
      <path d="M250,280 L392,214" stroke="${LINE}" stroke-width="3"/><path d="M262,312 L400,252" stroke="${LINE}" stroke-width="3"/>
      <circle cx="214" cy="200" r="48" fill="none" stroke="${MARK}" stroke-width="7" stroke-dasharray="14 10"/>`;
  }
  return svg(600, 600, `${legs}${sandals}${izar}${top}${head}${ok(520, 80)}`);
}

// Foot side view: open sandal (instep bone visible) vs closed shoe.
function feet() {
  const foot = (x) => `<path d="M${x + 34},120 L${x + 98},120 L${x + 100},300 L${x + 30},300 Z" fill="${SKIN}"/><path d="M${x},360 Q${x},300 ${x + 30},282 L${x + 60},250 Q${x + 80},236 ${x + 92},262 L${x + 100},300 Q${x + 160},318 ${x + 200},340 Q${x + 218},352 ${x + 210},368 Z" fill="${SKIN}"/>`;
  const left = `${foot(60)}<rect x="52" y="364" width="232" height="18" rx="9" fill="#6B4A2B"/>
    <path d="M238,350 Q246,330 262,352" stroke="#6B4A2B" stroke-width="9" fill="none"/><path d="M72,336 Q64,354 84,366" stroke="#6B4A2B" stroke-width="9" fill="none"/>
    <circle cx="158" cy="300" r="40" fill="none" stroke="${MARK}" stroke-width="7" stroke-dasharray="12 9"/>`;
  const right = `${foot(340)}<path d="M332,384 L332,330 Q352,276 410,268 Q470,280 556,334 Q572,350 556,384 Z" fill="#2D3446"/>
    <rect x="326" y="380" width="240" height="18" rx="9" fill="#151a26"/>`;
  return svg(620, 460, `<line x1="310" y1="40" x2="310" y2="420" stroke="#C9D1E0" stroke-width="4"/>${left}${right}${ok(240, 90)}${bad(530, 90)}`);
}

// Women: face and hands open (correct) vs niqab and gloves (not allowed in ihram).
function women() {
  const W = (x, niqab) => {
    const c = '#4F6386';
    return `<path d="M${x - 92},560 L${x - 70},250 Q${x},214 ${x + 70},250 L${x + 92},560 Z" fill="${c}"/>
      <path d="M${x - 66},170 Q${x - 66},62 ${x},62 Q${x + 66},62 ${x + 66},170 L${x + 80},262 Q${x},290 ${x - 80},262 Z" fill="#3E4F6E"/>
      <ellipse cx="${x}" cy="150" rx="40" ry="50" fill="${SKIN}"/>
      ${niqab ? `<path d="M${x - 44},132 L${x + 44},132 L${x + 46},206 Q${x},224 ${x - 46},206 Z" fill="#1F2533"/>` : ''}
      <path d="M${x - 78},300 Q${x - 108},380 ${x - 96},450" stroke="${c}" stroke-width="34" fill="none" stroke-linecap="round"/>
      <path d="M${x + 78},300 Q${x + 108},380 ${x + 96},450" stroke="${c}" stroke-width="34" fill="none" stroke-linecap="round"/>
      <circle cx="${x - 96}" cy="466" r="20" fill="${niqab ? '#1F2533' : SKIN}"/><circle cx="${x + 96}" cy="466" r="20" fill="${niqab ? '#1F2533' : SKIN}"/>
      ${niqab ? '' : `<circle cx="${x}" cy="150" r="64" fill="none" stroke="${MARK}" stroke-width="6" stroke-dasharray="12 9"/>`}`;
  };
  return svg(640, 600, `<line x1="320" y1="40" x2="320" y2="570" stroke="#C9D1E0" stroke-width="4"/>${W(165, false)}${W(475, true)}${ok(270, 70)}${bad(580, 70)}`);
}

module.exports = { 'ihram-man': man(false), 'ihram-idtiba': man(true), 'ihram-sandal': feet(), 'ihram-women': women() };
