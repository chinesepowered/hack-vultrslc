// Capy, the lifeguard capybara. Original character, drawn in SVG so it can animate.
// Moods map onto the tub lifecycle: watch (working), soak (calm idle), nope (blocked),
// ask (needs a human), drained (done, tub destroyed).
import { useId } from 'react';

export type Mood = 'watch' | 'soak' | 'nope' | 'ask' | 'drained';

const C = {
  fur: '#B57A52', furDark: '#8E5A39', earIn: '#6E3F28', muzzle: '#D9A982', line: '#4A2E1F', eye: '#2B1A12', blush: '#F59A8C',
  yuzu: '#FFC53D', yuzuDot: '#FFE08A', leaf: '#5BAA47', water: '#7FCBFF', wood: '#EDB884', woodIn: '#CE9157', woodDark: '#C2834B',
  band: '#6F7C8E', red: '#FF5A4E', green: '#2FA36B',
};
const RIM = { cx: 150, cy: 262, rx: 132, ry: 26 };
const arcY = (x: number) => RIM.cy + RIM.ry * Math.sqrt(Math.max(0, 1 - ((x - RIM.cx) / RIM.rx) ** 2));
const S = { stroke: C.line, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export function Capy({ mood = 'watch', size = 220, bubble, className = '', still = false }: { mood?: Mood; size?: number; bubble?: string; className?: string; still?: boolean }) {
  const uid = useId().replace(/:/g, '');
  const drained = mood === 'drained';
  const eyeL = 96, eyeR = 204, ey = 98;
  return (
    <svg viewBox="0 0 300 380" width={size} height={(size * 380) / 300} className={`capy ${still ? '' : 'capy-anim'} capy-${mood} ${className}`} role="img" aria-label={`Capy is ${mood}`}>
      {!drained && (
        <g className="steam" fill="none" stroke="#EADCCB" strokeLinecap="round">
          <path d="M30,238 q-11,-17 0,-35 q11,-17 0,-35" strokeWidth={7} />
          <path d="M272,232 q-11,-15 0,-30 q11,-15 0,-30" strokeWidth={7} />
          <path d="M252,200 q-8,-8 0,-17 q8,-8 0,-17" strokeWidth={5} />
        </g>
      )}
      {drained && (
        <g className="sparkles" fill="#FFCF40" stroke={C.line} strokeWidth={1.6} strokeLinejoin="round">
          {[[36, 70, 1.3], [270, 128, 1], [28, 178, 0.8]].map(([x, y, s], i) => (
            <path key={i} transform={`translate(${x} ${y}) scale(${s})`} d="M0,-10 L2.6,-2.6 L10,0 L2.6,2.6 L0,10 L-2.6,2.6 L-10,0 L-2.6,-2.6 Z" />
          ))}
        </g>
      )}
      <ellipse cx={RIM.cx} cy={RIM.cy} rx={RIM.rx} ry={RIM.ry} fill={C.woodDark} {...S} strokeWidth={5} />
      <ellipse cx={150} cy={264} rx={117} ry={17} fill={drained ? C.woodIn : C.water} />

      <g className="capy-body">
        <ellipse cx={150} cy={250} rx={92} ry={42} fill={C.fur} {...S} strokeWidth={5} />
        <ellipse cx={84} cy={70} rx={14} ry={10} transform="rotate(-22 84 70)" fill={C.furDark} {...S} strokeWidth={5} />
        <ellipse cx={216} cy={70} rx={14} ry={10} transform="rotate(22 216 70)" fill={C.furDark} {...S} strokeWidth={5} />
        <ellipse cx={85} cy={71} rx={6} ry={4} transform="rotate(-22 85 71)" fill={C.earIn} />
        <ellipse cx={215} cy={71} rx={6} ry={4} transform="rotate(22 215 71)" fill={C.earIn} />
        <path d="M57,116 C57,78 78,63 122,62 L178,62 C222,63 243,78 243,116 L244,166 C244,206 208,220 150,220 C92,220 56,206 56,166 Z" fill={C.fur} {...S} strokeWidth={5} />
        <rect x={90} y={120} width={120} height={92} rx={44} fill={C.muzzle} />
        <ellipse cx={74} cy={132} rx={13} ry={8} fill={C.blush} opacity={0.55} />
        <ellipse cx={226} cy={132} rx={13} ry={8} fill={C.blush} opacity={0.55} />
        <ellipse cx={127} cy={141} rx={7.5} ry={5} transform="rotate(-18 127 141)" fill={C.eye} />
        <ellipse cx={173} cy={141} rx={7.5} ry={5} transform="rotate(18 173 141)" fill={C.eye} />

        {/* eyes */}
        {mood === 'soak' && [eyeL, eyeR].map((x) => <path key={x} d={`M${x - 13},${ey} Q${x},${ey + 10} ${x + 13},${ey}`} fill="none" {...S} stroke={C.eye} strokeWidth={5.5} />)}
        {(mood === 'watch' || mood === 'ask') && (
          <g className="eyes-open">
            {[eyeL, eyeR].map((x) => (
              <g key={x}>
                <circle cx={x} cy={ey + 2} r={9} fill={C.eye} />
                <circle cx={x + 3} cy={ey - 1} r={3} fill="#fff" />
              </g>
            ))}
          </g>
        )}
        {mood === 'nope' && [eyeL, eyeR].map((x) => (
          <g key={x}>
            <path d={`M${x - 14},${ey + 1} L${x + 14},${ey + 1}`} {...S} stroke={C.eye} strokeWidth={6} />
            <path d={`M${x - 9},${ey + 4} Q${x},${ey + 11} ${x + 9},${ey + 4}`} fill={C.eye} />
          </g>
        ))}
        {drained && [eyeL, eyeR].map((x) => <path key={x} d={`M${x - 13},${ey + 6} Q${x},${ey - 8} ${x + 13},${ey + 6}`} fill="none" {...S} stroke={C.eye} strokeWidth={5.5} />)}

        {/* mouth */}
        {(mood === 'soak' || mood === 'watch') && <path d="M150,151 L150,166 M135,171 Q150,181 165,171" fill="none" {...S} stroke={C.eye} strokeWidth={4} />}
        {mood === 'ask' && <path d="M150,151 L150,164 M140,172 Q150,168 160,172" fill="none" {...S} stroke={C.eye} strokeWidth={4} />}
        {mood === 'nope' && <path d="M150,151 L150,166 M138,173 L162,173" fill="none" {...S} stroke={C.eye} strokeWidth={4} />}
        {drained && <path d="M150,151 L150,162 M134,165 Q150,188 166,165 Z" fill="#8A3A2E" {...S} stroke={C.eye} strokeWidth={4} />}

        {mood === 'nope' && (
          <g className="whistle">
            <path d="M104,214 Q126,248 150,247 Q174,248 196,214" fill="none" stroke="#2F6FC4" strokeWidth={4.5} strokeLinecap="round" />
            <g transform="translate(150 246) rotate(-14)">
              <rect x={0} y={-7} width={30} height={14} rx={6} fill={C.red} {...S} strokeWidth={4} />
              <circle cx={0} cy={1} r={13} fill={C.red} {...S} strokeWidth={4} />
              <circle cx={-1} cy={0} r={4} fill={C.line} />
            </g>
          </g>
        )}

        {/* yuzu */}
        <g className="yuzu">
          <path d="M150,25 l1,-7" {...S} strokeWidth={4} />
          <circle cx={150} cy={45} r={23} fill={C.yuzu} {...S} strokeWidth={5} />
          <circle cx={160} cy={53} r={1.8} fill={C.yuzuDot} /><circle cx={142} cy={55} r={1.8} fill={C.yuzuDot} /><circle cx={156} cy={39} r={1.6} fill={C.yuzuDot} />
          <ellipse cx={141} cy={37} rx={6.5} ry={4.5} fill="#fff" opacity={0.75} />
          <path d="M152,22 q15,-15 30,-6 q-13,13 -30,6 z" fill={C.leaf} {...S} strokeWidth={4} />
        </g>
      </g>

      <clipPath id={`front-${uid}`}><rect x={0} y={261} width={300} height={80} /></clipPath>
      <ellipse cx={150} cy={264} rx={117} ry={17} fill={drained ? C.woodIn : C.water} clipPath={`url(#front-${uid})`} />
      {!drained && <path className="ripples" d="M84,262 q11,-7 22,0 M194,262 q11,-7 22,0 M140,266 q10,-6 20,0" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.9} />}

      <path d={`M${RIM.cx - RIM.rx},${RIM.cy} A${RIM.rx},${RIM.ry} 0 0,0 ${RIM.cx + RIM.rx},${RIM.cy} L266,338 Q150,384 34,338 Z`} fill={C.wood} {...S} strokeWidth={5} />
      {[66, 108, 150, 192, 234].map((x) => (
        <path key={x} d={`M${x},${arcY(x) + 5} L${x + (x - 150) * -0.06},${336 + 22 * (1 - ((x - 150) / 116) ** 2) - 6}`} stroke={C.woodDark} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
      ))}
      <path d="M22,280 Q150,334 278,280" fill="none" stroke={C.band} strokeWidth={7} strokeLinecap="round" />
      <path d="M29,316 Q150,368 271,316" fill="none" stroke={C.band} strokeWidth={7} strokeLinecap="round" />
      <path d={`M${RIM.cx - RIM.rx + 8},${RIM.cy + 6} A${RIM.rx - 8},${RIM.ry - 4} 0 0,0 ${RIM.cx + RIM.rx - 8},${RIM.cy + 6}`} fill="none" stroke="#F8D3A8" strokeWidth={4} strokeLinecap="round" opacity={0.9} />
      {[112, 188].map((x) => {
        const y = arcY(x) - 3;
        return (
          <g key={x}>
            <ellipse cx={x} cy={y} rx={21} ry={12} fill={C.fur} {...S} strokeWidth={5} />
            <path d={`M${x - 7},${y + 7} l0,-6 M${x + 7},${y + 7} l0,-6`} {...S} strokeWidth={3} />
          </g>
        );
      })}

      {drained && (
        <g>
          <circle cx={254} cy={42} r={25} fill={C.green} {...S} strokeWidth={4.5} />
          <path d="M242,43 l8,8 l16,-18" fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {mood === 'ask' && (
        <g className="ask-mark">
          <circle cx={254} cy={44} r={25} fill="#FFF4DC" {...S} strokeWidth={4.5} />
          <text x={254} y={56} textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight={900} fontSize={34} fill={C.line}>?</text>
        </g>
      )}
      {bubble && (
        <g className="bubble" transform="translate(198 -10)">
          <path d="M8,0 H96 Q106,0 106,10 V36 Q106,46 96,46 H44 L30,60 L32,46 H8 Q0,46 0,36 V10 Q0,0 8,0 Z" fill="#fff" {...S} strokeWidth={4} />
          <text x={53} y={31} textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight={900} fontSize={23} fill={C.line}>{bubble}</text>
        </g>
      )}
    </svg>
  );
}

export function CapyFace({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <ellipse cx="16" cy="15" rx="5" ry="4" fill="#8E5A39" stroke="#4A2E1F" strokeWidth="2.5" />
      <ellipse cx="48" cy="15" rx="5" ry="4" fill="#8E5A39" stroke="#4A2E1F" strokeWidth="2.5" />
      <path d="M8 26 C8 16 14 12 24 12 L40 12 C50 12 56 16 56 26 L56 40 C56 52 46 57 32 57 C18 57 8 52 8 40 Z" fill="#B57A52" stroke="#4A2E1F" strokeWidth="3" />
      <rect x="18" y="30" width="28" height="23" rx="11" fill="#D9A982" />
      <path d="M15 24 Q19 27 23 24 M41 24 Q45 27 49 24" fill="none" stroke="#2B1A12" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="27" cy="35" rx="2.4" ry="1.7" fill="#2B1A12" />
      <ellipse cx="37" cy="35" rx="2.4" ry="1.7" fill="#2B1A12" />
      <circle cx="32" cy="9" r="7" fill="#FFC53D" stroke="#4A2E1F" strokeWidth="2.5" />
    </svg>
  );
}
