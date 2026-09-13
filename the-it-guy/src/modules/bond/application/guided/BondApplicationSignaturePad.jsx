import { Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { isBondApplicationSignature } from './bondApplicationSignature.js'

export function BondApplicationSignaturePad({ value = '', onChange, signerName = '' }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let cancelled = false
    const render = () => {
      if (cancelled) return
      const bounds = canvas.getBoundingClientRect()
      const width = Math.max(280, Math.round(bounds.width || 640))
      const height = 170
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = 2.5
      context.strokeStyle = '#142334'
      if (isBondApplicationSignature(value)) {
        const image = new Image()
        image.onload = () => { if (!cancelled) context.drawImage(image, 0, 0, width, height) }
        image.src = value
      }
    }
    render()
    window.addEventListener('resize', render)
    return () => { cancelled = true; window.removeEventListener('resize', render) }
  }, [value])

  const point = (event) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    return { x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) }
  }
  const begin = (event) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = point(event)
    context.beginPath()
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
  }
  const move = (event) => {
    if (!drawingRef.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context || !lastPointRef.current) return
    const next = point(event)
    context.quadraticCurveTo(lastPointRef.current.x, lastPointRef.current.y, (lastPointRef.current.x + next.x) / 2, (lastPointRef.current.y + next.y) / 2)
    context.stroke()
    lastPointRef.current = next
  }
  const end = (event) => {
    const canvas = canvasRef.current
    if (!canvas || !drawingRef.current) return
    canvas.releasePointerCapture?.(event.pointerId)
    drawingRef.current = false
    lastPointRef.current = null
    onChange?.(canvas.toDataURL('image/png'))
  }
  const clear = () => onChange?.('')

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#203549]">Draw your signature{signerName ? `, ${signerName}` : ''}</p>
          <p className="mt-1 text-xs leading-5 text-[#60748b]">Use a mouse, trackpad, or finger.</p>
        </div>
        <button type="button" onClick={clear} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[#d1deeb] bg-white px-3 text-xs font-semibold text-[#35546c]">
          <Trash2 size={14} aria-hidden="true" /> Clear
        </button>
      </div>
      <div className="mt-3 overflow-hidden rounded-[14px] border border-[#cfdceb] bg-white">
        <canvas ref={canvasRef} aria-label="Bond application signature pad" className="block h-[170px] w-full touch-none cursor-crosshair" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
    </div>
  )
}
