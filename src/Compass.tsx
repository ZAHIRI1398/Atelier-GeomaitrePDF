import { useRef } from 'react'
import type { ReactNode } from 'react'

// Compas posé sur la page (calque SVG, jamais imprimé). Crayon bleu (mine) = tracer un arc,
// rond vert = tourner sans tracer, rond gris (pointe) = déplacer, croix rouge = ranger.

export type CompassState = { x: number; y: number; rot: number } // rot en radians
type Pt = { x: number; y: number }
type Mode = 'trace' | 'turn' | 'move'

type Props = {
  compass: CompassState
  r: number
  stage: { width: number; height: number }
  zoom: number
  color: string
  onMove: (p: Pt) => void
  onTurn: (rot: number) => void
  onTrace: (start: number, sweep: number, done: boolean) => void
  onClose: () => void
}

export default function Compass({ compass, r, stage, zoom, color, onMove, onTurn, onTrace, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mode: Mode; id: number; last: number; start: number; sweep: number; dx: number; dy: number } | null>(null)
  const k = 1 / zoom
  const pos = (e: React.PointerEvent): Pt => {
    const b = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - b.left) / b.width) * stage.width, y: ((e.clientY - b.top) / b.height) * stage.height }
  }
  const angle = (p: Pt) => Math.atan2(p.y - compass.y, p.x - compass.x)

  const start = (mode: Mode) => (e: React.PointerEvent) => {
    if (e.button > 0 || drag.current) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pos(e)
    drag.current = { mode, id: e.pointerId, last: angle(p), start: compass.rot, sweep: 0, dx: compass.x - p.x, dy: compass.y - p.y }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const p = pos(e)
    if (d.mode === 'move') {
      onMove({ x: p.x + d.dx, y: p.y + d.dy })
      return
    }
    const a = angle(p)
    const delta = Math.atan2(Math.sin(a - d.last), Math.cos(a - d.last))
    d.last = a
    d.sweep += delta
    if (d.mode === 'trace') {
      d.sweep = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, d.sweep))
      onTrace(d.start, d.sweep, false)
    }
    onTurn(d.start + d.sweep)
  }
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.mode === 'trace') onTrace(d.start, d.sweep, true)
  }
  const dragProps = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end }
  const grab = { pointerEvents: 'auto' as const, touchAction: 'none' as const, cursor: 'grab' }

  const h = Math.max(90, Math.min(190, r * 0.6))
  const deg = (compass.rot * 180) / Math.PI
  const dot = (x: number, y: number, fill: string, icon: ReactNode) => (
    <g transform={`translate(${x} ${y}) rotate(${-deg}) scale(${k})`}>
      <circle r={15} fill={fill} stroke="#fff" strokeWidth={2.5} />
      <g fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{icon}</g>
    </g>
  )
  return (
    <svg ref={svgRef} className="pointer-events-none absolute inset-0 h-full w-full select-none" style={{ overflow: 'visible' }} viewBox={`0 0 ${stage.width} ${stage.height}`}>
      <circle cx={compass.x} cy={compass.y} r={r} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 7" />
      <g transform={`translate(${compass.x} ${compass.y}) rotate(${deg})`}>
        <g strokeLinecap="round" style={{ filter: 'drop-shadow(0 5px 8px rgba(15,23,42,.28))' }}>
          <path d={`M0 0L${r / 2} ${-h}L${r} 0`} fill="none" stroke="#64748b" strokeWidth={10} strokeLinejoin="round" />
          <path d={`M0 0L${r / 2} ${-h}L${r} 0`} fill="none" stroke="#e2e8f0" strokeWidth={6} strokeLinejoin="round" />
          <line x1={r / 2} y1={-h} x2={r / 2} y2={-h - 26} stroke="#0f172a" strokeWidth={9} />
        </g>
        <circle r={3} fill="#0f172a" />
        <circle cx={r} r={3.5} fill={color} />
        {/* Les ronds sont décalés pour laisser voir la pointe et la mine */}
        <g data-compass="move" style={grab} onPointerDown={start('move')} {...dragProps}>
          <title>Déplacer le compas</title>
          {dot(-24 * k, 14 * k, '#475569', <path d="M-8 0H8M0-8V8M-5-3L-8 0L-5 3M5-3L8 0L5 3M-3-5L0-8L3-5M-3 5L0 8L3 5" strokeWidth={1.8} />)}
        </g>
        <g data-compass="turn" style={grab} onPointerDown={start('turn')} {...dragProps}>
          <title>Tourner sans tracer</title>
          {dot(r / 2, -h - 30, '#16a34a', <path d="M6-4A7 7 0 1 0 7 2M7-8V-3.5H2.5" />)}
        </g>
        <g data-compass="trace" style={grab} onPointerDown={start('trace')} {...dragProps}>
          <title>Tracer un arc</title>
          <circle cx={r} r={12 * k} fill="transparent" />
          {dot(r + 24 * k, 14 * k, '#2563eb', <path d="M-7 7L-5 1L4-8L8-4L-1 5Z" />)}
        </g>
        <g
          style={{ pointerEvents: 'auto', cursor: 'pointer' }} role="button" tabIndex={0} aria-label="Fermer : Compas" data-compass="close"
          onClick={onClose}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClose() } }}
        >
          <title>Fermer le compas</title>
          {dot(r / 2 + 40 * k, -h - 30, '#ef4444', <path d="M-5-5L5 5M5-5L-5 5" />)}
        </g>
      </g>
    </svg>
  )
}
