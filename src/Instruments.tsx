import { useRef } from 'react'
import type { ReactNode } from 'react'

// Instruments posés sur la page (latte, équerre, rapporteur) : calque SVG au-dessus du
// canvas, donc jamais imprimés ni exportés. Glisser = déplacer, rond bleu = tourner,
// croix rouge = ranger l'instrument.

export type InstrumentKind = 'ruler' | 'setSquare' | 'protractor'
export type InstrumentState = { x: number; y: number; rot: number } // rot en degrés
export type InstrumentsState = Partial<Record<InstrumentKind, InstrumentState>>

const instrumentNames: Record<InstrumentKind, string> = { ruler: 'Latte', setSquare: 'Équerre', protractor: 'Rapporteur' }

const INK = '#0f172a'
const FILL = 'rgba(226, 232, 240, .72)'
const FONT = 'Inter, system-ui, sans-serif'
const RULER_CM = 16
const SQUARE_W = 12
const SQUARE_H = 7
const PROTRACTOR_CM = 6

type Handles = { rotate: [number, number]; move: [number, number]; close: [number, number] }

function ruler(cm: number): { body: ReactNode; handles: Handles } {
  // Origine : milieu du bord gradué (bas)
  const pad = cm * 0.6
  const len = RULER_CM * cm
  const h = cm * 2
  const x0 = -len / 2
  const ticks: ReactNode[] = []
  for (let mm = 0; mm <= RULER_CM * 10; mm += 1) {
    const x = x0 + (mm * cm) / 10
    const size = mm % 10 === 0 ? 0.62 : mm % 5 === 0 ? 0.45 : 0.28
    ticks.push(<line key={mm} x1={x} y1={0} x2={x} y2={-size * cm} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.8 : 0.9} />)
    if (mm % 10 === 0) {
      ticks.push(<text key={`t${mm}`} x={x} y={-0.8 * cm} textAnchor="middle" fontSize={cm * 0.4} fontWeight={700} fontFamily={FONT} fill={INK}>{mm / 10}</text>)
    }
  }
  return {
    body: (
      <>
        <rect x={x0 - pad} y={-h} width={len + 2 * pad} height={h} rx={6} fill={FILL} stroke={INK} strokeWidth={2} />
        <line x1={x0 - pad} y1={-1.3 * cm} x2={x0 + len + pad} y2={-1.3 * cm} stroke="#38bdf8" strokeWidth={1} />
        {ticks}
        <text x={0} y={-1.48 * cm} textAnchor="middle" fontSize={cm * 0.34} fontWeight={700} fontFamily={FONT} fill={INK}>cm</text>
      </>
    ),
    handles: { rotate: [x0, -1.65 * cm], move: [x0 + cm * 1.4, -1.65 * cm], close: [x0 + len, -1.65 * cm] },
  }
}

function setSquare(cm: number): { body: ReactNode; handles: Handles } {
  // Origine : sommet de l'angle droit. Bord bas et bord gauche gradués.
  const w = SQUARE_W * cm
  const h = SQUARE_H * cm
  const ticks: ReactNode[] = []
  const addEdge = (cms: number, vertical: boolean) => {
    for (let mm = 0; mm <= cms * 10 - 12; mm += 1) {
      const d = (mm * cm) / 10
      const size = (mm % 10 === 0 ? 0.5 : mm % 5 === 0 ? 0.36 : 0.22) * cm
      const k = `${vertical ? 'v' : 'h'}${mm}`
      const sw = mm % 10 === 0 ? 1.6 : 0.8
      ticks.push(vertical
        ? <line key={k} x1={0} y1={-d} x2={size} y2={-d} stroke={INK} strokeWidth={sw} />
        : <line key={k} x1={d} y1={0} x2={d} y2={-size} stroke={INK} strokeWidth={sw} />)
      if (mm % 10 === 0 && mm > 0) {
        ticks.push(vertical
          ? <text key={`${k}t`} x={0.62 * cm} y={-d + cm * 0.12} fontSize={cm * 0.36} fontWeight={700} fontFamily={FONT} fill={INK}>{mm / 10}</text>
          : <text key={`${k}t`} x={d} y={-0.64 * cm} textAnchor="middle" fontSize={cm * 0.36} fontWeight={700} fontFamily={FONT} fill={INK}>{mm / 10}</text>)
      }
    }
  }
  addEdge(SQUARE_W, false)
  addEdge(SQUARE_H, true)
  const a = 1.5 * cm // évidement : triangle semblable
  const f = 0.45
  const m = 0.42 * cm
  return {
    body: (
      <>
        <path
          fillRule="evenodd"
          d={`M0 0 L${w} 0 L0 ${-h} Z M${a} ${-a} L${a} ${-a - h * f} L${a + w * f} ${-a} Z`}
          fill={FILL} stroke={INK} strokeWidth={2.4} strokeLinejoin="round"
        />
        {ticks}
        <path d={`M${m} 0 L${m} ${-m} L0 ${-m}`} fill="none" stroke="#dc2626" strokeWidth={2.4} />
        <text x={1.05 * cm} y={-1.12 * cm} fontSize={cm * 0.36} fontWeight={800} fontFamily={FONT} fill="#dc2626">90°</text>
      </>
    ),
    handles: { rotate: [0.75 * cm, -5.15 * cm], move: [a + w * f * 0.28, -a - h * f * 0.28], close: [w * 0.76, -0.95 * cm] },
  }
}

function protractor(cm: number): { body: ReactNode; handles: Handles } {
  // Origine : centre du rapporteur
  const r = PROTRACTOR_CM * cm
  const at = (deg: number, rad: number): [number, number] => {
    const t = (deg * Math.PI) / 180
    return [Math.cos(t) * rad, -Math.sin(t) * rad]
  }
  const marks: ReactNode[] = []
  for (let deg = 0; deg <= 180; deg += 1) {
    const len = deg % 10 === 0 ? 0.6 : deg % 5 === 0 ? 0.42 : 0.24
    const [x1, y1] = at(deg, r)
    const [x2, y2] = at(deg, r - len * cm)
    marks.push(<line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={deg % 10 === 0 ? 1.8 : 0.8} />)
    if (deg % 10 === 0) {
      const label = (rad: number, value: number, size: number, fill: string, key: string) => {
        const [x, y] = at(deg, rad)
        // Aux extrémités, le nombre est remonté au-dessus du bord droit
        const dy = deg === 0 || deg === 180 ? -size * 0.62 : 0
        return (
          <text key={key} transform={`translate(${x} ${y + dy}) rotate(${deg === 0 || deg === 180 ? 0 : 90 - deg})`} textAnchor="middle" dominantBaseline="central"
            fontSize={size} fontWeight={700} fontFamily={FONT} fill={fill}>{value}</text>
        )
      }
      marks.push(label(r - 0.9 * cm, 180 - deg, cm * 0.36, INK, `o${deg}`))
      marks.push(label(r - 1.5 * cm, deg, cm * 0.31, '#b91c1c', `i${deg}`))
      const [a1, b1] = at(deg, r - 1.85 * cm)
      const [a2, b2] = at(deg, deg === 90 ? 0 : cm * 0.9)
      marks.push(<line key={`s${deg}`} x1={a1} y1={b1} x2={a2} y2={b2} stroke={INK} strokeWidth={deg === 90 ? 1.6 : 0.5} strokeDasharray={deg === 90 ? '6 5' : undefined} opacity={deg === 90 ? 1 : 0.35} />)
    }
  }
  return {
    body: (
      <>
        <path d={`M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 Z`} fill={FILL} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
        {marks}
        <circle r={4.5} fill={INK} />
      </>
    ),
    handles: { rotate: [0, -r - cm * 0.15], move: [0, -r * 0.42], close: [r * 0.98, -cm * 1.5] },
  }
}

const builders = { ruler, setSquare, protractor }

type DragMode = 'move' | 'rotate' | 'ray'

type Props = {
  instruments: InstrumentsState
  stage: { width: number; height: number }
  pxPerCm: number
  zoom: number
  bodyDraggable: boolean // faux quand un outil de tracé est choisi : on dessine à travers l'instrument
  onChange: (kind: InstrumentKind, state: InstrumentState) => void
  onClose: (kind: InstrumentKind) => void
  rayDeg: number // rayon du rapporteur, en degrés depuis la droite (sens antihoraire)
  onRay: (deg: number) => void
}

export default function Instruments({ instruments, stage, pxPerCm, zoom, bodyDraggable, onChange, onClose, rayDeg, onRay }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ kind: InstrumentKind; mode: DragMode; pointerId: number; dx: number; dy: number; offset: number; x0: number; y0: number; tap: boolean } | null>(null)
  const k = 1 / zoom // boutons de taille constante à l'écran

  const pos = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * stage.width, y: ((e.clientY - rect.top) / rect.height) * stage.height }
  }
  const angleTo = (s: InstrumentState, p: { x: number; y: number }) => (Math.atan2(p.y - s.y, p.x - s.x) * 180) / Math.PI

  // Direction du pointeur vue depuis le centre du rapporteur, ramenée entre 0° et 180°
  const rayAt = (s: InstrumentState, p: { x: number; y: number }) => {
    const t = (((s.rot - angleTo(s, p)) % 360) + 360) % 360
    return t <= 180 ? Math.round(t) : t < 270 ? 180 : 0
  }

  const start = (kind: InstrumentKind, s: InstrumentState, mode: DragMode, tap = false) => (e: React.PointerEvent) => {
    if (e.button > 0 || drag.current) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pos(e)
    drag.current = { kind, mode, pointerId: e.pointerId, dx: s.x - p.x, dy: s.y - p.y, offset: s.rot - angleTo(s, p), x0: e.clientX, y0: e.clientY, tap }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const s = instruments[d.kind]
    if (!s) return
    const p = pos(e)
    if (d.tap && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5) d.tap = false
    if (d.tap) return
    if (d.mode === 'ray') {
      onRay(rayAt(s, p))
    } else if (d.mode === 'move') {
      onChange(d.kind, {
        ...s,
        x: Math.min(stage.width, Math.max(0, p.x + d.dx)),
        y: Math.min(stage.height, Math.max(0, p.y + d.dy)),
      })
    } else {
      onChange(d.kind, { ...s, rot: Math.round((angleTo(s, p) + d.offset) * 2) / 2 })
    }
  }
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (d?.pointerId !== e.pointerId) return
    drag.current = null
    const s = instruments[d.kind]
    // Simple appui sur le rapporteur : le rayon se place à cet endroit
    if (d.tap && d.kind === 'protractor' && s && e.type === 'pointerup') onRay(rayAt(s, pos(e)))
  }
  const dragProps = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end }

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      style={{ overflow: 'visible' }}
      viewBox={`0 0 ${stage.width} ${stage.height}`}
    >
      {(Object.keys(builders) as InstrumentKind[]).map((kind) => {
        const s = instruments[kind]
        if (!s) return null
        const { body, handles } = builders[kind](pxPerCm)
        const name = instrumentNames[kind]
        const button = (at: [number, number], fill: string, children: ReactNode) => (
          <g transform={`translate(${at[0]} ${at[1]}) rotate(${-s.rot}) scale(${k})`}>
            <circle r={15} fill={fill} stroke="#fff" strokeWidth={2} />
            <g fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">{children}</g>
          </g>
        )
        const active = { pointerEvents: 'auto' as const, touchAction: 'none' as const }
        return (
          <g key={kind} data-instrument={kind} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
            <g
              style={{ filter: 'drop-shadow(0 6px 10px rgba(15,23,42,.28))', cursor: 'move', touchAction: 'none', pointerEvents: bodyDraggable ? 'auto' : 'none' }}
              onPointerDown={start(kind, s, 'move', true)}
              {...dragProps}
            >
              {body}
            </g>
            {kind === 'protractor' && (() => {
              const t = (rayDeg * Math.PI) / 180
              const len = PROTRACTOR_CM * pxPerCm + 45 * k
              const at: [number, number] = [Math.cos(t) * len, -Math.sin(t) * len]
              return (
                <>
                  <line x1={0} y1={0} x2={at[0]} y2={at[1]} stroke="#dc2626" strokeWidth={2} strokeDasharray="7 5" />
                  <g data-handle="ray" style={{ ...active, cursor: 'grab' }} onPointerDown={start(kind, s, 'ray')} {...dragProps}>
                    <title>Régler l'angle</title>
                    {button(at, '#f59e0b', <path d="M-6 6H7M-6 6L4-7M1 6A7 7 0 0 0-2 1" />)}
                  </g>
                </>
              )
            })()}
            <g data-handle="move" style={{ ...active, cursor: 'move' }} onPointerDown={start(kind, s, 'move')} {...dragProps}>
              <title>{`Déplacer : ${name}`}</title>
              {button(handles.move, '#475569', <path d="M-8 0H8M0-8V8M-5-3L-8 0L-5 3M5-3L8 0L5 3M-3-5L0-8L3-5M-3 5L0 8L3 5" strokeWidth={1.8} />)}
            </g>
            <g data-handle="rotate" style={{ ...active, cursor: 'grab' }} onPointerDown={start(kind, s, 'rotate')} {...dragProps}>
              <title>{`Tourner : ${name}`}</title>
              {button(handles.rotate, '#0ea5e9', <path d="M6-4A7 7 0 1 0 7 2M7-8V-3.5H2.5" />)}
            </g>
            <g
              data-handle="close" role="button" tabIndex={0} aria-label={`Fermer : ${name}`}
              style={{ ...active, cursor: 'pointer' }}
              onClick={() => onClose(kind)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose(kind) } }}
            >
              <title>{`Fermer : ${name}`}</title>
              {button(handles.close, '#ef4444', <path d="M-5-5L5 5M5-5L-5 5" />)}
            </g>
          </g>
        )
      })}
    </svg>
  )
}
