import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Download,
  Eraser,
  FileUp,
  Grid3X3,
  Gauge,
  BookOpenText,
  CornerDownRight,
  Minus,
  MousePointer2,
  PenLine,
  Printer,
  RotateCcw,
  Ruler,
  Save,
  Sigma,
  Square,
  Trash2,
  TriangleRight,
  Type,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Rows3,
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

type Tool = 'reader' | 'select' | 'line' | 'segment' | 'midpoint' | 'parallel' | 'perpendicular' | 'ruler' | 'compass' | 'setSquare' | 'protractor' | 'point' | 'text' | 'eraser'

type PdfWord = { id: string; text: string; x: number; y: number; w: number; h: number; line: number }
type ReaderBox = { x1: number; y1: number; x2: number; y2: number }

type Shape =
  | { id: string; type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; label: string }
  | { id: string; type: 'segment'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; label: string }
  | { id: string; type: 'circle'; cx: number; cy: number; r: number; color: string; width: number; label: string }
  | { id: string; type: 'triangle'; x: number; y: number; w: number; h: number; color: string; width: number; label: string }
  | { id: string; type: 'angle'; cx: number; cy: number; angle: number; radius: number; color: string; width: number; label: string }
  | { id: string; type: 'point'; x: number; y: number; color: string; label: string }
  | { id: string; type: 'text'; x: number; y: number; color: string; text: string; size: number }

const tools: Array<{ id: Tool; name: string; hint: string; icon: typeof MousePointer2 }> = [
  { id: 'reader', name: 'Lecture', hint: 'Lire un mot ou une phrase du PDF', icon: BookOpenText },
  { id: 'select', name: 'Sélection', hint: 'Déplacer et inspecter', icon: MousePointer2 },
  { id: 'line', name: 'Droite', hint: 'Construire une droite infinie', icon: Minus },
  { id: 'segment', name: 'Segment', hint: 'Tracer un segment entre deux points', icon: Minus },
  { id: 'midpoint', name: 'Milieu', hint: 'Trouver le milieu d\'un segment', icon: Sigma },
  { id: 'parallel', name: 'Parallèle', hint: 'Droite parallèle à une droite passant par un point', icon: Rows3 },
  { id: 'perpendicular', name: 'Perpendiculaire', hint: 'Droite perpendiculaire à une droite passant par un point', icon: CornerDownRight },
  { id: 'ruler', name: 'Latte', hint: 'Tracer une droite mesurée', icon: Ruler },
  { id: 'compass', name: 'Vrai compas', hint: 'Pointe sèche + mine pour tracer un cercle', icon: PenLine },
  { id: 'setSquare', name: 'Équerre', hint: 'Créer angle droit / triangle', icon: TriangleRight },
  { id: 'protractor', name: 'Rapporteur', hint: 'Mesurer et construire un angle', icon: Gauge },
  { id: 'point', name: 'Point', hint: 'Marquer A, B, C...', icon: Sigma },
  { id: 'text', name: 'Texte', hint: 'Annoter la figure', icon: Type },
  { id: 'eraser', name: 'Gomme', hint: 'Supprimer un objet', icon: Eraser },
]

const colors = ['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c']
const A4 = { width: 840, height: 1188 }

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function lineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const a = px - x1
  const b = py - y1
  const c = x2 - x1
  const d = y2 - y1
  const dot = a * c + b * d
  const lenSq = c * c + d * d
  const param = lenSq !== 0 ? dot / lenSq : -1
  const xx = param < 0 ? x1 : param > 1 ? x2 : x1 + param * c
  const yy = param < 0 ? y1 : param > 1 ? y2 : y1 + param * d
  return distance(px, py, xx, yy)
}

function infiniteLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return Infinity
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len
}

function lineThroughPoint(point: { x: number; y: number }, angle: number, stage: { width: number; height: number }, color: string, width: number, label: string): Shape {
  const len = Math.hypot(stage.width, stage.height) * 1.2
  return {
    id: crypto.randomUUID(),
    type: 'line',
    x1: point.x - Math.cos(angle) * len,
    y1: point.y - Math.sin(angle) * len,
    x2: point.x + Math.cos(angle) * len,
    y2: point.y + Math.sin(angle) * len,
    color,
    width,
    label,
  }
}

function boxesIntersect(a: { x: number; y: number; w: number; h: number }, b: ReaderBox) {
  const minX = Math.min(b.x1, b.x2)
  const maxX = Math.max(b.x1, b.x2)
  const minY = Math.min(b.y1, b.y2)
  const maxY = Math.max(b.y1, b.y2)
  return a.x < maxX && a.x + a.w > minX && a.y < maxY && a.y + a.h > minY
}

function drawReaderHighlights(ctx: CanvasRenderingContext2D, words: PdfWord[], selectedIds: string[], box: ReaderBox | null) {
  ctx.save()
  for (const word of words) {
    if (!selectedIds.includes(word.id)) continue
    ctx.fillStyle = 'rgba(250, 204, 21, .38)'
    ctx.strokeStyle = 'rgba(234, 179, 8, .85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(word.x - 2, word.y - 2, word.w + 4, word.h + 4, 4)
    ctx.fill()
    ctx.stroke()
  }
  if (box) {
    const x = Math.min(box.x1, box.x2)
    const y = Math.min(box.y1, box.y2)
    const w = Math.abs(box.x2 - box.x1)
    const h = Math.abs(box.y2 - box.y1)
    ctx.fillStyle = 'rgba(59, 130, 246, .13)'
    ctx.strokeStyle = 'rgba(37, 99, 235, .9)'
    ctx.setLineDash([8, 6])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 6)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()

}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, pxPerCm: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(59,130,246,.13)'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += pxPerCm) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += pxPerCm) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()
}

function drawCompassInstrument(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, pencil: { x: number; y: number }, pxPerCm: number) {
  const radius = distance(center.x, center.y, pencil.x, pencil.y)
  if (radius < 8) return
  const angle = Math.atan2(pencil.y - center.y, pencil.x - center.x)
  const hingeDistance = Math.max(78, Math.min(190, radius * 0.55))
  const hinge = {
    x: center.x + Math.cos(angle - Math.PI / 2) * hingeDistance,
    y: center.y + Math.sin(angle - Math.PI / 2) * hingeDistance,
  }
  const handleTop = {
    x: hinge.x + Math.cos(angle - Math.PI / 2) * 34,
    y: hinge.y + Math.sin(angle - Math.PI / 2) * 34,
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(15, 23, 42, .20)'
  ctx.shadowBlur = 8
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(hinge.x, hinge.y)
  ctx.lineTo(center.x, center.y)
  ctx.moveTo(hinge.x, hinge.y)
  ctx.lineTo(pencil.x, pencil.y)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(hinge.x, hinge.y)
  ctx.lineTo(center.x, center.y)
  ctx.moveTo(hinge.x, hinge.y)
  ctx.lineTo(pencil.x, pencil.y)
  ctx.stroke()

  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 7])
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(pencil.x, pencil.y)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(hinge.x, hinge.y, 13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(hinge.x, hinge.y, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(hinge.x, hinge.y)
  ctx.lineTo(handleTop.x, handleTop.y)
  ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.roundRect(handleTop.x - 13, handleTop.y - 6, 26, 12, 6)
  ctx.fill()

  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(center.x - Math.cos(angle) * 10 + Math.cos(angle - Math.PI / 2) * 4, center.y - Math.sin(angle) * 10 + Math.sin(angle - Math.PI / 2) * 4)
  ctx.lineTo(center.x - Math.cos(angle) * 10 - Math.cos(angle - Math.PI / 2) * 4, center.y - Math.sin(angle) * 10 - Math.sin(angle - Math.PI / 2) * 4)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#2563eb'
  ctx.beginPath()
  ctx.arc(pencil.x, pencil.y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, angle - 0.35, angle + 0.35)
  ctx.stroke()

  ctx.font = '700 15px Inter, system-ui'
  ctx.fillStyle = '#0f172a'
  ctx.fillText(`ouverture ${(radius / pxPerCm).toFixed(1)} cm`, (center.x + pencil.x) / 2 + 10, (center.y + pencil.y) / 2 - 12)
  ctx.restore()
}

function drawRulerInstrument(ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, pxPerCm: number) {
  const length = Math.max(distance(start.x, start.y, end.x, end.y), pxPerCm)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const height = 46
  ctx.save()
  ctx.translate(start.x, start.y)
  ctx.rotate(angle)
  ctx.shadowColor = 'rgba(15, 23, 42, .18)'
  ctx.shadowBlur = 10
  ctx.fillStyle = 'rgba(251, 191, 36, .30)'
  ctx.strokeStyle = 'rgba(180, 83, 9, .85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(0, -height / 2, length, height, 8)
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#92400e'
  ctx.fillStyle = '#78350f'
  ctx.font = '700 12px Inter, system-ui'
  const totalCm = Math.floor(length / pxPerCm)
  for (let cm = 0; cm <= totalCm; cm += 1) {
    const x = cm * pxPerCm
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, -height / 2)
    ctx.lineTo(x, -4)
    ctx.stroke()
    ctx.fillText(String(cm), x + 3, 16)
    for (let mm = 1; mm < 10; mm += 1) {
      const tickX = x + (mm * pxPerCm) / 10
      if (tickX > length) break
      const tick = mm === 5 ? 16 : 10
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tickX, -height / 2)
      ctx.lineTo(tickX, -height / 2 + tick)
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#78350f'
  ctx.font = '800 14px Inter, system-ui'
  ctx.fillText(`${(length / pxPerCm).toFixed(1)} cm`, Math.max(10, length / 2 - 28), -10)
  ctx.restore()
}

function drawSetSquareInstrument(ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, rotation: number = 0) {
  const w = end.x - start.x
  const h = end.y - start.y
  if (Math.abs(w) < 12 || Math.abs(h) < 12) return
  const sx = Math.sign(w) || 1
  const sy = Math.sign(h) || 1
  const inner = Math.min(Math.abs(w), Math.abs(h)) * 0.34
  ctx.save()
  ctx.translate(start.x, start.y)
  ctx.rotate(rotation)
  ctx.translate(-start.x, -start.y)
  ctx.shadowColor = 'rgba(15, 23, 42, .18)'
  ctx.shadowBlur = 10
  ctx.fillStyle = 'rgba(14, 165, 233, .18)'
  ctx.strokeStyle = 'rgba(2, 132, 199, .85)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(start.x + w, start.y)
  ctx.lineTo(start.x, start.y + h)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  ctx.strokeStyle = 'rgba(2, 132, 199, .55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(start.x + sx * inner * 0.55, start.y + sy * inner * 0.55)
  ctx.lineTo(start.x + sx * (inner + inner * 0.85), start.y + sy * inner * 0.55)
  ctx.lineTo(start.x + sx * inner * 0.55, start.y + sy * (inner + inner * 0.85))
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#0369a1'
  ctx.lineWidth = 3
  const marker = Math.min(24, Math.abs(w) / 4, Math.abs(h) / 4)
  ctx.beginPath()
  ctx.moveTo(start.x + sx * marker, start.y)
  ctx.lineTo(start.x + sx * marker, start.y + sy * marker)
  ctx.lineTo(start.x, start.y + sy * marker)
  ctx.stroke()
  ctx.font = '900 18px Inter, system-ui'
  ctx.fillStyle = '#075985'
  ctx.fillText('90°', start.x + sx * 12, start.y + sy * 42)
  ctx.restore()
}

function drawProtractorInstrument(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, pointer: { x: number; y: number }, fixedAngle: number | null, rotation: number = 0) {
  const radius = Math.max(105, Math.min(210, distance(center.x, center.y, pointer.x, pointer.y)))
  const raw = Math.atan2(pointer.y - center.y, pointer.x - center.x)
  const angle = fixedAngle === null ? raw : (-fixedAngle * Math.PI) / 180
  const degrees = Math.round(Math.abs((angle * 180) / Math.PI))
  ctx.save()
  ctx.translate(center.x, center.y)
  ctx.rotate(rotation)
  ctx.translate(-center.x, -center.y)
  ctx.shadowColor = 'rgba(15, 23, 42, .18)'
  ctx.shadowBlur = 10
  ctx.fillStyle = 'rgba(168, 85, 247, .16)'
  ctx.strokeStyle = 'rgba(126, 34, 206, .75)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, Math.PI, 0)
  ctx.lineTo(center.x - radius, center.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#6b21a8'
  ctx.fillStyle = '#581c87'
  ctx.font = '700 11px Inter, system-ui'
  for (let deg = 0; deg <= 180; deg += 5) {
    const a = Math.PI - (deg * Math.PI) / 180
    const outerX = center.x + Math.cos(a) * radius
    const outerY = center.y - Math.sin(a) * radius
    const tick = deg % 30 === 0 ? 22 : deg % 10 === 0 ? 16 : 9
    const innerX = center.x + Math.cos(a) * (radius - tick)
    const innerY = center.y - Math.sin(a) * (radius - tick)
    ctx.lineWidth = deg % 30 === 0 ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(outerX, outerY)
    ctx.lineTo(innerX, innerY)
    ctx.stroke()
    if (deg % 30 === 0) {
      const tx = center.x + Math.cos(a) * (radius - 38)
      const ty = center.y - Math.sin(a) * (radius - 38)
      ctx.fillText(String(deg), tx - 8, ty + 4)
    }
  }
  ctx.fillStyle = '#581c87'
  ctx.beginPath()
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7e22ce'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius)
  ctx.stroke()
  // Draw arrowhead at the end of the pointer for clearer orientation
  const tipX = center.x + Math.cos(angle) * radius
  const tipY = center.y + Math.sin(angle) * radius
  const arrowSize = Math.min(18, radius * 0.12)
  ctx.fillStyle = '#7e22ce'
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(tipX - Math.cos(angle - Math.PI / 6) * arrowSize, tipY - Math.sin(angle - Math.PI / 6) * arrowSize)
  ctx.lineTo(tipX - Math.cos(angle + Math.PI / 6) * arrowSize, tipY - Math.sin(angle + Math.PI / 6) * arrowSize)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius * 0.33, Math.min(0, angle), Math.max(0, angle))
  ctx.stroke()
  ctx.font = '900 18px Inter, system-ui'
  ctx.fillText(`${Math.min(180, degrees)}°`, center.x + 14, center.y - 14)
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, selected = false) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = shape.color
  ctx.fillStyle = shape.color
  if (selected) {
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 8
  }

  if (shape.type === 'line') {
    ctx.lineWidth = shape.width
    ctx.beginPath()
    ctx.moveTo(shape.x1, shape.y1)
    ctx.lineTo(shape.x2, shape.y2)
    ctx.stroke()
    const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1)
    const midX = (shape.x1 + shape.x2) / 2
    const midY = (shape.y1 + shape.y2) / 2
    ctx.translate(midX, midY)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(shape.x2 - midX - 12, shape.y2 - midY - 5)
    ctx.lineTo(shape.x2 - midX, shape.y2 - midY)
    ctx.lineTo(shape.x2 - midX - 12, shape.y2 - midY + 5)
    ctx.stroke()
  }

  if (shape.type === 'segment') {
    ctx.lineWidth = shape.width
    ctx.beginPath()
    ctx.moveTo(shape.x1, shape.y1)
    ctx.lineTo(shape.x2, shape.y2)
    ctx.stroke()
    // Draw endpoints
    ctx.beginPath()
    ctx.arc(shape.x1, shape.y1, 4, 0, Math.PI * 2)
    ctx.arc(shape.x2, shape.y2, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  if (shape.type === 'circle') {
    ctx.lineWidth = shape.width
    ctx.beginPath()
    ctx.arc(shape.cx, shape.cy, Math.abs(shape.r), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([6, 8])
    ctx.beginPath()
    ctx.moveTo(shape.cx, shape.cy)
    ctx.lineTo(shape.cx + shape.r, shape.cy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(shape.cx, shape.cy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 16px Inter, system-ui'
    ctx.fillText(shape.label, shape.cx + shape.r / 2 + 8, shape.cy - 8)
  }

  if (shape.type === 'triangle') {
    ctx.lineWidth = shape.width
    ctx.beginPath()
    ctx.moveTo(shape.x, shape.y)
    ctx.lineTo(shape.x + shape.w, shape.y)
    ctx.lineTo(shape.x, shape.y + shape.h)
    ctx.closePath()
    ctx.globalAlpha = 0.14
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
    const marker = Math.min(24, Math.abs(shape.w) / 4, Math.abs(shape.h) / 4)
    ctx.beginPath()
    ctx.moveTo(shape.x + Math.sign(shape.w) * marker, shape.y)
    ctx.lineTo(shape.x + Math.sign(shape.w) * marker, shape.y + Math.sign(shape.h) * marker)
    ctx.lineTo(shape.x, shape.y + Math.sign(shape.h) * marker)
    ctx.stroke()
    ctx.font = '600 16px Inter, system-ui'
    ctx.fillText(shape.label, shape.x + 12, shape.y + Math.sign(shape.h) * 38)
  }

  if (shape.type === 'angle') {
    ctx.lineWidth = shape.width
    ctx.beginPath()
    ctx.moveTo(shape.cx, shape.cy)
    ctx.lineTo(shape.cx + shape.radius, shape.cy)
    ctx.moveTo(shape.cx, shape.cy)
    ctx.lineTo(shape.cx + Math.cos(shape.angle) * shape.radius, shape.cy + Math.sin(shape.angle) * shape.radius)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(shape.cx, shape.cy, Math.min(58, shape.radius * 0.42), Math.min(0, shape.angle), Math.max(0, shape.angle))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(shape.cx, shape.cy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '700 18px Inter, system-ui'
    ctx.fillText(shape.label, shape.cx + 18, shape.cy - 18)
  }

  if (shape.type === 'point') {
    ctx.beginPath()
    ctx.arc(shape.x, shape.y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '700 20px Inter, system-ui'
    ctx.fillText(shape.label, shape.x + 10, shape.y - 10)
  }

  if (shape.type === 'text') {
    ctx.font = `700 ${shape.size}px Inter, system-ui`
    ctx.fillText(shape.text, shape.x, shape.y)
  }
  ctx.restore()
}

function hitTest(shape: Shape, x: number, y: number) {
  if (shape.type === 'line') return lineDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2) < 12
  if (shape.type === 'segment') return lineDistance(x, y, shape.x1, shape.y1, shape.x2, shape.y2) < 12
  if (shape.type === 'circle') return Math.abs(distance(x, y, shape.cx, shape.cy) - Math.abs(shape.r)) < 12 || distance(x, y, shape.cx, shape.cy) < 10
  if (shape.type === 'triangle') {
    const minX = Math.min(shape.x, shape.x + shape.w)
    const maxX = Math.max(shape.x, shape.x + shape.w)
    const minY = Math.min(shape.y, shape.y + shape.h)
    const maxY = Math.max(shape.y, shape.y + shape.h)
    return x >= minX - 8 && x <= maxX + 8 && y >= minY - 8 && y <= maxY + 8
  }
  if (shape.type === 'angle') return distance(x, y, shape.cx, shape.cy) < shape.radius + 12 && distance(x, y, shape.cx, shape.cy) > 4
  if (shape.type === 'point') return distance(x, y, shape.x, shape.y) < 16
  if (shape.type === 'text') return x >= shape.x && x <= shape.x + shape.text.length * shape.size * 0.65 && y <= shape.y && y >= shape.y - shape.size
  return false
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [tool, setTool] = useState<Tool>('ruler')
  const [shapes, setShapes] = useState<Shape[]>([])
  const [preview, setPreview] = useState<Shape | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [compassPointer, setCompassPointer] = useState<{ x: number; y: number } | null>(null)
  const [toolPointer, setToolPointer] = useState<{ x: number; y: number } | null>(null)
  const [constructionBaseId, setConstructionBaseId] = useState<string | null>(null)
  const [pdfWords, setPdfWords] = useState<PdfWord[]>([])
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([])
  const [readerText, setReaderText] = useState('')
  const [readerBox, setReaderBox] = useState<ReaderBox | null>(null)
  const [readerStart, setReaderStart] = useState<{ x: number; y: number } | null>(null)
  const [readerMode, setReaderMode] = useState<'mot' | 'phrase'>('mot')
  const [readerRate, setReaderRate] = useState(0.85)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null)
  const [bg, setBg] = useState<string>('')
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [stage, setStage] = useState(A4)
  const [color, setColor] = useState('#2563eb')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [pxPerCm, setPxPerCm] = useState(38)
  const [compassOpeningCm, setCompassOpeningCm] = useState(3)
  const [useFixedCompass, setUseFixedCompass] = useState(false)
  const [protractorAngle, setProtractorAngle] = useState(60)
  const [useFixedProtractor, setUseFixedProtractor] = useState(false)
  const [setSquareRotation, setSetSquareRotation] = useState(0)
  const [protractorRotation, setProtractorRotation] = useState(0)
  const [activeProtractor, setActiveProtractor] = useState<{ x: number; y: number } | null>(null)
  const [activeSetSquare, setActiveSetSquare] = useState<{ x: number; y: number } | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [zoom, setZoom] = useState(0.82)
  const [message, setMessage] = useState('Importez un PDF ou commencez sur une feuille blanche A4.')

  const pointLabel = useMemo(() => String.fromCharCode(65 + shapes.filter((s) => s.type === 'point').length), [shapes])

  const getPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * stage.width,
      y: ((event.clientY - rect.top) / rect.height) * stage.height,
    }
  }

  const makeShape = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }): Shape | null => {
      const id = crypto.randomUUID()
      if (tool === 'ruler' || tool === 'line' || tool === 'segment') {
        const cm = distance(start.x, start.y, end.x, end.y) / pxPerCm
        if (tool === 'ruler') {
          return { id, type: 'segment', x1: start.x, y1: start.y, x2: end.x, y2: end.y, color, width: strokeWidth, label: `${cm.toFixed(1)} cm` }
        }
        if (tool === 'line') {
          const angle = Math.atan2(end.y - start.y, end.x - start.x)
          return lineThroughPoint(start, angle, stage, color, strokeWidth, '')
        }
        if (tool === 'segment') {
          return { id, type: 'segment', x1: start.x, y1: start.y, x2: end.x, y2: end.y, color, width: strokeWidth, label: '' }
        }
        return { id, type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y, color, width: strokeWidth, label: '' }
      }
      if (tool === 'compass') {
        const measuredRadius = distance(start.x, start.y, end.x, end.y)
        const r = useFixedCompass ? compassOpeningCm * pxPerCm : measuredRadius
        return { id, type: 'circle', cx: start.x, cy: start.y, r, color, width: strokeWidth, label: `r = ${(r / pxPerCm).toFixed(1)} cm` }
      }
      if (tool === 'setSquare') {
        return { id, type: 'triangle', x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, color, width: strokeWidth, label: '90°' }
      }
      if (tool === 'protractor') {
        const measuredAngle = Math.atan2(end.y - start.y, end.x - start.x)
        const angle = useFixedProtractor ? (-protractorAngle * Math.PI) / 180 : measuredAngle
        const radius = useFixedProtractor ? 130 : Math.max(70, distance(start.x, start.y, end.x, end.y))
        const degrees = Math.min(180, Math.round(Math.abs((angle * 180) / Math.PI)))
        return { id, type: 'angle', cx: start.x, cy: start.y, angle, radius, color, width: strokeWidth, label: `${degrees}°` }
      }
      return null
    },
    [color, compassOpeningCm, protractorAngle, pxPerCm, stage, strokeWidth, tool, useFixedCompass, useFixedProtractor],
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = stage.width
    canvas.height = stage.height
    ctx.clearRect(0, 0, stage.width, stage.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, stage.width, stage.height)

    const paintAll = () => {
      if (showGrid) drawGrid(ctx, stage.width, stage.height, pxPerCm)
      drawReaderHighlights(ctx, pdfWords, selectedWordIds, readerBox)
      shapes.forEach((shape) => drawShape(ctx, shape, shape.id === selectedId))
      if (preview) drawShape(ctx, preview)
      if ((tool === 'parallel' || tool === 'perpendicular') && constructionBaseId) {
        const base = shapes.find((shape) => shape.id === constructionBaseId && (shape.type === 'line' || shape.type === 'segment'))
        if (base) drawShape(ctx, base, true)
      }
      if (tool === 'ruler' && dragStart && toolPointer) drawRulerInstrument(ctx, dragStart, toolPointer, pxPerCm)
      if (tool === 'setSquare') {
        if (dragStart && toolPointer) drawSetSquareInstrument(ctx, dragStart, toolPointer, setSquareRotation)
        else if (activeSetSquare && toolPointer) drawSetSquareInstrument(ctx, { x: activeSetSquare.x, y: activeSetSquare.y }, toolPointer, setSquareRotation)
      }
      if (tool === 'protractor') {
        if (dragStart && toolPointer) drawProtractorInstrument(ctx, dragStart, toolPointer, useFixedProtractor ? protractorAngle : null, protractorRotation)
        else if (activeProtractor && toolPointer) drawProtractorInstrument(ctx, { x: activeProtractor.x, y: activeProtractor.y }, toolPointer, useFixedProtractor ? protractorAngle : null, protractorRotation)
      }
      if (tool === 'compass' && dragStart && preview?.type === 'circle') {
        const pointer = compassPointer ?? { x: dragStart.x + preview.r, y: dragStart.y }
        const currentAngle = Math.atan2(pointer.y - dragStart.y, pointer.x - dragStart.x)
        const pencil = { x: dragStart.x + Math.cos(currentAngle) * preview.r, y: dragStart.y + Math.sin(currentAngle) * preview.r }
        drawCompassInstrument(ctx, dragStart, pencil, pxPerCm)
      }
    }

    if (bg) {
      const image = new Image()
      image.onload = () => {
        try {
          ctx.drawImage(image, 0, 0, stage.width, stage.height)
          paintAll()
        } catch (err: any) {
          console.error('Render error (onload):', err)
          setMessage(`Erreur d'affichage : ${err?.message ?? String(err)}`)
        }
      }
      image.onerror = () => {
        try {
          paintAll()
        } catch (err: any) {
          console.error('Render error (onerror):', err)
          setMessage(`Erreur d'affichage : ${err?.message ?? String(err)}`)
        }
      }
      image.src = bg
    } else {
      try {
        paintAll()
      } catch (err: any) {
        console.error('Render error:', err)
        setMessage(`Erreur d'affichage : ${err?.message ?? String(err)}`)
      }
    }
  }, [bg, compassPointer, constructionBaseId, dragStart, pdfWords, preview, protractorAngle, pxPerCm, readerBox, selectedId, selectedWordIds, shapes, showGrid, stage, tool, toolPointer, useFixedProtractor, activeProtractor, activeSetSquare, setSquareRotation, protractorRotation])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const rotationStep = e.shiftKey ? 0.25 : 0.05
      if (tool === 'setSquare') {
        if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') {
          e.preventDefault()
          setSetSquareRotation((r) => r - rotationStep)
        } else if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          setSetSquareRotation((r) => r + rotationStep)
        }
      }
      if (tool === 'protractor') {
        if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') {
          e.preventDefault()
          setProtractorRotation((r) => r - rotationStep)
        } else if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          setProtractorRotation((r) => r + rotationStep)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tool])

  const renderPage = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy, pageNumber: number) => {
    const pdfPage = await pdf.getPage(pageNumber)
    const viewport = pdfPage.getViewport({ scale: 1.45 })
    const offscreen = document.createElement('canvas')
    offscreen.width = viewport.width
    offscreen.height = viewport.height
    const context = offscreen.getContext('2d')!
    await pdfPage.render({ canvas: offscreen, canvasContext: context, viewport }).promise
    const textContent = await pdfPage.getTextContent()
    const words: PdfWord[] = []
    let previousY = Number.NaN
    let line = 0
    textContent.items.forEach((item, index) => {
      if (!('str' in item) || !item.str.trim()) return
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const fullText = item.str.trim()
      const itemWidth = Math.max(10, item.width * viewport.scale)
      const itemHeight = Math.max(12, Math.abs(tx[3]) || 16)
      const y = tx[5] - itemHeight
      if (Number.isNaN(previousY) || Math.abs(y - previousY) > itemHeight * 0.75) {
        line += 1
        previousY = y
      }
      const parts = fullText.split(/\s+/).filter(Boolean)
      const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1
      let x = tx[4]
      parts.forEach((part, partIndex) => {
        const w = Math.max(8, itemWidth * (part.length / totalChars))
        words.push({ id: `${pageNumber}-${index}-${partIndex}`, text: part, x, y, w, h: itemHeight + 4, line })
        x += w + itemWidth * 0.04
      })
    })
    setPdfWords(words)
    setSelectedWordIds([])
    setReaderText('')
    setReaderBox(null)
    setStage({ width: Math.round(viewport.width), height: Math.round(viewport.height) })
    setBg(offscreen.toDataURL('image/png'))
    setMessage(`PDF chargé — page ${pageNumber}/${pdf.numPages}. Utilisez les instruments pour construire la figure.`)
  }, [])

  const openPdf = async (file: File) => {
    try {
      const data = await file.arrayBuffer()
      const loaded = await pdfjsLib.getDocument({ data }).promise
      setDoc(loaded)
      setPages(loaded.numPages)
      setPage(1)
      setShapes([])
      await renderPage(loaded, 1)
    } catch {
      setMessage('Impossible de lire ce PDF. Essayez un autre fichier.')
    }
  }

  const changePage = async (next: number) => {
    if (!doc) return
    const valid = Math.min(Math.max(next, 1), pages)
    setPage(valid)
    setShapes([])
    setSelectedId(null)
    await renderPage(doc, valid)
  }

  const makeRelatedLine = (base: Extract<Shape, { type: 'line' } | { type: 'segment' }>, point: { x: number; y: number }, relation: 'parallel' | 'perpendicular') => {
    const baseAngle = Math.atan2(base.y2 - base.y1, base.x2 - base.x1)
    const angle = relation === 'parallel' ? baseAngle : baseAngle + Math.PI / 2
    return lineThroughPoint(point, angle, stage, color, strokeWidth, '')
  }

  const speak = (text = readerText) => {
    const clean = text.trim()
    if (!clean) {
      setMessage('Sélectionnez d’abord un mot ou une phrase à lire.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = 'fr-FR'
    utterance.rate = readerRate
    utterance.pitch = 1
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    setIsSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  const stopSpeaking = () => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  const chooseReaderWords = (pos: { x: number; y: number }) => {
    const word = pdfWords.find((item) => pos.x >= item.x - 4 && pos.x <= item.x + item.w + 4 && pos.y >= item.y - 4 && pos.y <= item.y + item.h + 4)
    if (!word) {
      const textShape = [...shapes].reverse().find((shape): shape is Extract<Shape, { type: 'text' }> => shape.type === 'text' && pos.x >= shape.x && pos.x <= shape.x + shape.text.length * shape.size * 0.65 && pos.y <= shape.y && pos.y >= shape.y - shape.size)
      if (textShape) {
        setSelectedWordIds([])
        setReaderText(textShape.text)
        setMessage(`Texte sélectionné : “${textShape.text}”.`)
        speak(textShape.text)
        return
      }
      setSelectedWordIds([])
      setReaderText('')
      setMessage('Aucun mot détecté ici. Essayez de cliquer au centre du mot ou sélectionnez une zone.')
      return
    }
    const chosen = readerMode === 'mot' ? [word] : pdfWords.filter((item) => item.line === word.line).sort((a, b) => a.x - b.x)
    const text = chosen.map((item) => item.text).join(' ')
    setSelectedWordIds(chosen.map((item) => item.id))
    setReaderText(text)
    setMessage(readerMode === 'mot' ? `Mot sélectionné : “${text}”.` : `Phrase/ligne sélectionnée : “${text}”.`)
    speak(text)
  }

  const chooseReaderBox = (box: ReaderBox) => {
    const chosen = pdfWords.filter((word) => boxesIntersect(word, box)).sort((a, b) => a.line === b.line ? a.x - b.x : a.line - b.line)
    let text = chosen.map((word) => word.text).join(' ')
    if (!text) {
      const texts = [...shapes].reverse().filter((shape): shape is Extract<Shape, { type: 'text' }> => shape.type === 'text' && boxesIntersect({ x: shape.x, y: shape.y - shape.size, w: shape.text.length * shape.size * 0.65, h: shape.size }, box))
      text = texts.map((shape) => shape.text).join(' ')
    }
    setSelectedWordIds(chosen.map((word) => word.id))
    setReaderText(text)
    if (text) {
      setMessage(`Sélection lue : “${text}”.`)
      speak(text)
    } else {
      setMessage('Aucun texte trouvé dans cette zone. Le PDF est peut-être scanné comme une image.')
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(event)
    if (tool === 'reader') {
      setReaderStart(pos)
      setReaderBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
      return
    }
    if (tool === 'protractor') {
      // Place or toggle persistent protractor
      if (!activeProtractor) {
        setActiveProtractor({ x: pos.x, y: pos.y })
        setToolPointer(pos)
        setMessage('Rapporteur placé — déplacez la souris pour orienter, cliquez dessus pour le retirer.')
      } else {
        const d = distance(pos.x, pos.y, activeProtractor.x, activeProtractor.y)
        if (d < 18) {
          setActiveProtractor(null)
          setMessage('Rapporteur retiré.')
        } else {
          setActiveProtractor({ x: pos.x, y: pos.y })
          setMessage('Rapporteur déplacé.')
        }
        // Double-click to create a permanent angle/traces
        if ((event as React.PointerEvent).detail === 2) {
          const measuredAngle = Math.atan2(pos.y - activeProtractor.y, pos.x - activeProtractor.x)
          const angle = useFixedProtractor ? (-protractorAngle * Math.PI) / 180 : measuredAngle
          const radius = useFixedProtractor ? 130 : Math.max(70, distance(activeProtractor.x, activeProtractor.y, pos.x, pos.y))
          const degrees = Math.min(180, Math.round(Math.abs((angle * 180) / Math.PI)))
          const shape = { id: crypto.randomUUID(), type: 'angle', cx: activeProtractor.x, cy: activeProtractor.y, angle, radius, color, width: strokeWidth, label: `${degrees}°` } as Shape
          setShapes((items) => [...items, shape])
          setMessage(`Angle tracé : ${degrees}°`)
        }
      }
      return
    }
    if (tool === 'setSquare') {
      // Place or toggle persistent set square
      if (!activeSetSquare) {
        setActiveSetSquare({ x: pos.x, y: pos.y })
        setToolPointer(pos)
        setMessage('Équerre placée — déplacez la souris pour orienter, cliquez dessus pour la retirer.')
      } else {
        const d = distance(pos.x, pos.y, activeSetSquare.x, activeSetSquare.y)
        if (d < 18) {
          setActiveSetSquare(null)
          setMessage('Équerre retirée.')
        } else {
          setActiveSetSquare({ x: pos.x, y: pos.y })
          setMessage('Équerre déplacée.')
        }
        // Double-click to create a permanent triangle/angle trace
        if ((event as React.PointerEvent).detail === 2) {
          const w = pos.x - activeSetSquare.x
          const h = pos.y - activeSetSquare.y
          const shape = { id: crypto.randomUUID(), type: 'triangle', x: activeSetSquare.x, y: activeSetSquare.y, w, h, color, width: strokeWidth, label: '90°' } as Shape
          setShapes((items) => [...items, shape])
          setMessage('Équerre tracée.')
        }
      }
      return
    }
    if (tool === 'parallel' || tool === 'perpendicular') {
      if (!constructionBaseId) {
        const base = [...shapes]
          .reverse()
          .find((shape): shape is Extract<Shape, { type: 'line' } | { type: 'segment' }> =>
            (shape.type === 'line' && infiniteLineDistance(pos.x, pos.y, shape.x1, shape.y1, shape.x2, shape.y2) < 16) ||
            (shape.type === 'segment' && lineDistance(pos.x, pos.y, shape.x1, shape.y1, shape.x2, shape.y2) < 12),
          )
        if (base) {
          setConstructionBaseId(base.id)
          setSelectedId(base.id)
          setMessage(`Droite de base sélectionnée. Cliquez maintenant sur le point de passage pour tracer la ${tool === 'parallel' ? 'parallèle' : 'perpendiculaire'}.`)
        } else {
          setMessage('Cliquez d’abord sur une droite ou un segment existant. Astuce : utilisez l’outil “Droite” ou “Latte” pour créer une base.')
        }
        return
      }
      const base = shapes.find((shape): shape is Extract<Shape, { type: 'line' } | { type: 'segment' }> => shape.id === constructionBaseId && (shape.type === 'line' || shape.type === 'segment'))
      if (base) {
        const related = makeRelatedLine(base, pos, tool)
        setShapes((items) => [...items, { id: crypto.randomUUID(), type: 'point', x: pos.x, y: pos.y, color, label: '' }, related])
        setPreview(null)
        setConstructionBaseId(null)
        setSelectedId(null)
        setMessage(`${tool === 'parallel' ? 'Parallèle' : 'Perpendiculaire'} construite.`)
      }
      return
    }
    if (tool === 'midpoint') {
      const segment = [...shapes].reverse().find((shape): shape is Extract<Shape, { type: 'segment' }> => shape.type === 'segment' && lineDistance(pos.x, pos.y, shape.x1, shape.y1, shape.x2, shape.y2) < 12)
        if (segment) {
          const midX = (segment.x1 + segment.x2) / 2
          const midY = (segment.y1 + segment.y2) / 2
          setShapes((items) => [...items, { id: crypto.randomUUID(), type: 'point', x: midX, y: midY, color, label: '' }])
          setMessage('Milieu du segment marqué.')
        } else {
        setMessage('Cliquez sur un segment existant pour trouver son milieu.')
      }
      return
    }
    if (tool === 'point') {
      setShapes((items) => [...items, { id: crypto.randomUUID(), type: 'point', x: pos.x, y: pos.y, color, label: pointLabel }])
      return
    }
    if (tool === 'text') {
      const text = window.prompt('Texte à placer sur le PDF :', 'Donnée / construction')
      if (text) setShapes((items) => [...items, { id: crypto.randomUUID(), type: 'text', x: pos.x, y: pos.y, color, text, size: 24 }])
      return
    }
    if (tool === 'eraser') {
      setShapes((items) => items.filter((shape) => !hitTest(shape, pos.x, pos.y)))
      setSelectedId(null)
      return
    }
    if (tool === 'select') {
      const found = [...shapes].reverse().find((shape) => hitTest(shape, pos.x, pos.y))
      setSelectedId(found?.id ?? null)
      if (found) setMoving({ id: found.id, x: pos.x, y: pos.y })
      return
    }
    setDragStart(pos)
    let end = pos
    if (tool === 'compass') {
      if (useFixedCompass) {
        end = { x: pos.x + compassOpeningCm * pxPerCm, y: pos.y }
      }
      setCompassPointer(end)
    } else if (tool === 'protractor' && useFixedProtractor) {
      end = { x: pos.x + Math.cos((-protractorAngle * Math.PI) / 180) * 130, y: pos.y + Math.sin((-protractorAngle * Math.PI) / 180) * 130 }
    }
    setToolPointer(end)
    const created = makeShape(pos, end)
    setPreview(created)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(event)
    if (tool === 'reader' && readerStart) {
      setReaderBox({ x1: readerStart.x, y1: readerStart.y, x2: pos.x, y2: pos.y })
      return
    }
    if (tool === 'protractor' && activeProtractor) {
      // Orient persistent protractor with mouse movements
      setToolPointer(pos)
      if (!useFixedProtractor) {
        const deg = Math.min(180, Math.round(Math.abs((Math.atan2(pos.y - activeProtractor.y, pos.x - activeProtractor.x) * 180) / Math.PI)))
        setProtractorAngle(deg)
      }
      return
    }
    if (tool === 'setSquare' && activeSetSquare) {
      // Orient persistent set square with mouse movements
      setToolPointer(pos)
      const angle = Math.atan2(pos.y - activeSetSquare.y, pos.x - activeSetSquare.x)
      setSetSquareRotation(angle)
      return
    }
    if ((tool === 'parallel' || tool === 'perpendicular') && constructionBaseId) {
      const base = shapes.find((shape): shape is Extract<Shape, { type: 'line' } | { type: 'segment' }> => shape.id === constructionBaseId && (shape.type === 'line' || shape.type === 'segment'))
      if (base) setPreview(makeRelatedLine(base, pos, tool))
      return
    }
    if (moving) {
      const dx = pos.x - moving.x
      const dy = pos.y - moving.y
      setMoving({ ...moving, x: pos.x, y: pos.y })
      setShapes((items) =>
        items.map((shape) => {
          if (shape.id !== moving.id) return shape
          if (shape.type === 'line') return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
          if (shape.type === 'segment') return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
          if (shape.type === 'circle') return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
          if (shape.type === 'triangle') return { ...shape, x: shape.x + dx, y: shape.y + dy }
          if (shape.type === 'angle') return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
          if (shape.type === 'point') return { ...shape, x: shape.x + dx, y: shape.y + dy }
          if (shape.type === 'text') return { ...shape, x: shape.x + dx, y: shape.y + dy }
          return shape
        }),
      )
      return
    }
    if (!dragStart) return
    if (tool === 'compass') setCompassPointer(pos)
    setToolPointer(pos)
    setPreview(makeShape(dragStart, pos))
    if (tool === 'compass' && !useFixedCompass) {
      setCompassOpeningCm(Math.max(0.2, distance(dragStart.x, dragStart.y, pos.x, pos.y) / pxPerCm))
    }
    if (tool === 'protractor' && !useFixedProtractor) {
      setProtractorAngle(Math.min(180, Math.round(Math.abs((Math.atan2(pos.y - dragStart.y, pos.x - dragStart.x) * 180) / Math.PI))))
    }
  }

  const handlePointerUp = () => {
    if (tool === 'reader') {
      if (readerStart && readerBox) {
        const moved = distance(readerBox.x1, readerBox.y1, readerBox.x2, readerBox.y2)
        if (moved < 8) chooseReaderWords(readerStart)
        else chooseReaderBox(readerBox)
      }
      setReaderStart(null)
      setReaderBox(null)
      return
    }
    if (tool === 'parallel' || tool === 'perpendicular') {
      setPreview(null)
      return
    }
    if (moving) {
      setMoving(null)
      return
    }
    if (preview) {
      const valid = preview.type === 'line' ? distance(preview.x1, preview.y1, preview.x2, preview.y2) > 8 : preview.type === 'segment' ? distance(preview.x1, preview.y1, preview.x2, preview.y2) > 8 : preview.type === 'circle' ? preview.r > 8 : preview.type === 'triangle' ? Math.abs(preview.w) > 12 && Math.abs(preview.h) > 12 : true
      if (valid) setShapes((items) => [...items, preview])
    }
    setPreview(null)
    setDragStart(null)
    setCompassPointer(null)
    setToolPointer(null)
  }

  const exportImage = () => {
    redraw()
    setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const link = document.createElement('a')
      link.download = `construction-geometrique-page-${page}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }, 80)
  }

  const printPdf = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = canvas.toDataURL('image/png')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><html><head><title>Construction géométrique</title><style>body{margin:0;background:#e5e7eb;display:grid;place-items:center;min-height:100vh}img{max-width:100%;height:auto;background:white;box-shadow:0 10px 40px #0003}@media print{body{background:white}img{box-shadow:none;width:100%;page-break-inside:avoid}}</style></head><body><img src="${img}" onload="window.print()" /></body></html>`)
    win.document.close()
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,#2563eb55,transparent_34%),linear-gradient(135deg,#020617,#0f172a_55%,#111827)]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-sm text-blue-100">
                <Square className="h-4 w-4" /> Atelier PDF de géométrie
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Construire des figures directement sur un PDF</h1>
              <p className="mt-3 max-w-3xl text-base text-slate-300 sm:text-lg">
                Lecture à voix haute pour élèves dyslexiques, droites, parallèles, perpendiculaires, vrai compas, latte graduée, équerre et rapporteur.
              </p>
            </motion.div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 font-bold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-400">
                <FileUp className="h-5 w-5" /> Importer PDF
              </button>
              <button onClick={printPdf} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400">
                <Printer className="h-5 w-5" /> Imprimer PDF
              </button>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && openPdf(e.target.files[0])} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[300px_1fr] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 backdrop-blur">
            <h2 className="mb-3 font-black text-white">Instruments</h2>
            <select 
              value={tool} 
              onChange={(e) => setTool(e.target.value as Tool)}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-slate-300 hover:bg-slate-800 focus:border-blue-300 focus:outline-none"
            >
              {tools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400">{tools.find((t) => t.id === tool)?.hint}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 backdrop-blur">
            <h2 className="mb-3 font-black text-white">Réglages</h2>
            <label className="text-sm font-semibold text-slate-300">Couleur</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => <button key={c} onClick={() => setColor(c)} className={`h-9 w-9 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} aria-label={c} />)}
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-300">Épaisseur : {strokeWidth}px</label>
            <input type="range" min="1" max="9" value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="mt-2 w-full accent-blue-500" />
            <label className="mt-4 block text-sm font-semibold text-slate-300">Échelle : {pxPerCm}px = 1 cm</label>
            <input type="range" min="20" max="70" value={pxPerCm} onChange={(e) => setPxPerCm(Number(e.target.value))} className="mt-2 w-full accent-blue-500" />
            <div className="mt-4 rounded-2xl border border-blue-300/20 bg-blue-500/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-sm font-bold text-blue-100">Ouverture du vrai compas</label>
                <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-blue-200">{compassOpeningCm.toFixed(1)} cm</span>
              </div>
              <input type="range" min="0.5" max="12" step="0.1" value={compassOpeningCm} onChange={(e) => setCompassOpeningCm(Number(e.target.value))} className="w-full accent-blue-400" />
              <button onClick={() => setUseFixedCompass((v) => !v)} className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-black transition ${useFixedCompass ? 'bg-blue-500 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
                {useFixedCompass ? 'Ouverture verrouillée' : 'Ouverture libre au glisser'}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Mode compas : posez la pointe sèche au centre, ouvrez les branches vers la mine, puis relâchez pour tracer le cercle.
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-sm font-bold text-amber-100">Latte, équerre, rapporteur</label>
                <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-amber-200">{protractorAngle}°</span>
              </div>
              <input type="range" min="0" max="180" step="1" value={protractorAngle} onChange={(e) => setProtractorAngle(Number(e.target.value))} className="w-full accent-amber-400" />
              <button onClick={() => setUseFixedProtractor((v) => !v)} className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-black transition ${useFixedProtractor ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
                {useFixedProtractor ? 'Angle verrouillé' : 'Angle libre au glisser'}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                La latte montre ses graduations en cm, l'équerre affiche un vrai triangle transparent, et le rapporteur mesure/construit un angle de 0° à 180°.
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-3">
              <label className="text-sm font-bold text-emerald-100">Constructions guidées</label>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Pour une parallèle ou une perpendiculaire : créez/choisissez une droite, puis cliquez le point de passage. La nouvelle droite est automatiquement prolongée.
              </p>
              {constructionBaseId && <button onClick={() => { setConstructionBaseId(null); setSelectedId(null); setPreview(null) }} className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-emerald-200 hover:bg-slate-800">Annuler la droite de base</button>}
            </div>
            <div className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-500/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="text-sm font-bold text-yellow-100">Lecture adaptée dyslexie</label>
                <span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-yellow-200">{readerMode}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setReaderMode('mot')} className={`rounded-xl px-3 py-2 text-sm font-black ${readerMode === 'mot' ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-slate-300'}`}>Mot</button>
                <button onClick={() => setReaderMode('phrase')} className={`rounded-xl px-3 py-2 text-sm font-black ${readerMode === 'phrase' ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-slate-300'}`}>Phrase</button>
              </div>
              <label className="mt-3 block text-xs font-bold text-yellow-100">Vitesse de lecture : {readerRate.toFixed(2)}x</label>
              <input type="range" min="0.55" max="1.2" step="0.05" value={readerRate} onChange={(e) => setReaderRate(Number(e.target.value))} className="w-full accent-yellow-400" />
              <div className="mt-3 flex gap-2">
                <button onClick={() => speak()} className="flex-1 rounded-xl bg-yellow-400 px-3 py-2 text-sm font-black text-slate-950 hover:bg-yellow-300"><Volume2 className="inline h-4 w-4" /> Lire</button>
                <button onClick={stopSpeaking} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-slate-200 hover:bg-slate-800"><VolumeX className="inline h-4 w-4" /></button>
              </div>
              <p className="mt-2 rounded-xl bg-slate-950/70 p-2 text-xs leading-relaxed text-slate-200">{readerText || 'Choisissez l’outil Lecture puis cliquez un mot, une ligne, ou entourez une zone du PDF.'}</p>
              {isSpeaking && <p className="mt-2 text-xs font-bold text-yellow-200">Lecture en cours…</p>}
            </div>
            <button onClick={() => setShowGrid((v) => !v)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 font-bold hover:bg-slate-800">
              <Grid3X3 className="h-5 w-5" /> {showGrid ? 'Masquer' : 'Afficher'} la grille
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 backdrop-blur">
            <h2 className="mb-3 font-black text-white">Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShapes((s) => s.slice(0, -1))} className="rounded-2xl bg-slate-800 px-3 py-3 font-bold hover:bg-slate-700"><RotateCcw className="mx-auto mb-1 h-5 w-5" />Annuler</button>
              <button onClick={() => { setShapes([]); setSelectedId(null) }} className="rounded-2xl bg-red-500/90 px-3 py-3 font-bold hover:bg-red-500"><Trash2 className="mx-auto mb-1 h-5 w-5" />Effacer</button>
              <button onClick={exportImage} className="rounded-2xl bg-indigo-500 px-3 py-3 font-bold hover:bg-indigo-400"><Download className="mx-auto mb-1 h-5 w-5" />PNG</button>
              <button onClick={printPdf} className="rounded-2xl bg-emerald-500 px-3 py-3 font-bold hover:bg-emerald-400"><Save className="mx-auto mb-1 h-5 w-5" />PDF</button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-black/30">
          <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-white">{message}</p>
              <p className="text-sm text-slate-400">Outil actif : <span className="text-blue-300">{tools.find((t) => t.id === tool)?.name}</span> · Objets : {shapes.length}</p>
              {tool === 'reader' && <p className="mt-1 text-sm font-semibold text-yellow-200">Lecture dyslexie : cliquez un mot, ou glissez autour d'une phrase/zone, puis l'application lit à voix haute.</p>}
              {tool === 'line' && <p className="mt-1 text-sm font-semibold text-slate-200">Droite : glissez pour définir sa direction, elle sera prolongée sur toute la page.</p>}
              {tool === 'segment' && <p className="mt-1 text-sm font-semibold text-slate-200">Segment : cliquez sur le premier point, glissez jusqu'au deuxième point pour tracer un segment mesuré.</p>}
              {tool === 'midpoint' && <p className="mt-1 text-sm font-semibold text-slate-200">Milieu : cliquez sur un segment existant pour marquer automatiquement son milieu.</p>}
              {tool === 'parallel' && <p className="mt-1 text-sm font-semibold text-emerald-200">Parallèle : 1) cliquez une droite de base, 2) cliquez le point par lequel la parallèle doit passer.</p>}
              {tool === 'perpendicular' && <p className="mt-1 text-sm font-semibold text-red-200">Perpendiculaire : 1) cliquez une droite de base, 2) cliquez le point par lequel la perpendiculaire doit passer.</p>}
              {tool === 'compass' && <p className="mt-1 text-sm font-semibold text-blue-200">Pointe sèche = premier clic. Mine = déplacement. Ouverture actuelle : {compassOpeningCm.toFixed(1)} cm.</p>}
              {tool === 'ruler' && <p className="mt-1 text-sm font-semibold text-amber-200">Latte graduée : glissez pour aligner la règle et tracer un segment mesuré.</p>}
              {tool === 'setSquare' && <p className="mt-1 text-sm font-semibold text-sky-200">Équerre : glissez pour poser le triangle transparent. Utilisez ←/→ ou Q/E pour tourner (Shift pour rotation rapide).</p>}
              {tool === 'protractor' && <p className="mt-1 text-sm font-semibold text-purple-200">Rapporteur : centre au premier clic, glissez pour mesurer/construire l'angle. Utilisez ←/→ ou Q/E pour tourner (Shift pour rotation rapide). Angle actuel : {protractorAngle}°.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => speak()} className="rounded-xl bg-yellow-500 px-3 py-2 font-bold text-slate-950 hover:bg-yellow-400"><Volume2 className="inline h-5 w-5" /> Lire</button>
              <button onClick={stopSpeaking} className="rounded-xl bg-slate-800 p-2 hover:bg-slate-700" title="Arrêter la lecture"><VolumeX className="h-5 w-5" /></button>
              <button disabled={!doc || page <= 1} onClick={() => changePage(page - 1)} className="rounded-xl bg-slate-800 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40">Page -</button>
              <span className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold">{page}/{pages}</span>
              <button disabled={!doc || page >= pages} onClick={() => changePage(page + 1)} className="rounded-xl bg-slate-800 px-3 py-2 font-bold disabled:cursor-not-allowed disabled:opacity-40">Page +</button>
              <button onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))} className="rounded-xl bg-slate-800 p-2"><ZoomOut className="h-5 w-5" /></button>
              <button onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} className="rounded-xl bg-slate-800 p-2"><ZoomIn className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl bg-slate-800 p-4">
            <div className="mx-auto origin-top rounded bg-white shadow-2xl" style={{ width: stage.width * zoom, height: stage.height * zoom }}>
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="block h-full w-full touch-none cursor-crosshair rounded"
                style={{ width: stage.width * zoom, height: stage.height * zoom }}
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-4 pb-6 text-center text-sm text-slate-500">
        Astuce : choisissez “PDF” puis “Enregistrer au format PDF” dans la fenêtre d'impression pour récupérer votre feuille construite.
      </footer>
    </main>
  )
}

export default App
