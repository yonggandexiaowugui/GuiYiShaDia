import { useState, useRef, useCallback, useEffect } from 'react'

type Direction = 'left' | 'right' | 'top' | 'bottom'

/**
 * 面板尺寸调节 hook
 * - left: 左侧面板，向右拖增大
 * - right: 右侧面板，向左拖增大
 * - bottom: 底部面板，向上拖增大
 */
export function useResizable(
  initialSize: number,
  direction: Direction,
  min = 100,
  max = 800,
): { size: number; onMouseDown: (e: React.MouseEvent) => void; dragging: boolean } {
  const [size, setSize] = useState(initialSize)
  const [dragging, setDragging] = useState(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true)
      startPos.current = direction === 'left' || direction === 'right' ? e.clientX : e.clientY
      startSize.current = size
      document.body.style.cursor = direction === 'left' || direction === 'right' ? 'col-resize' : 'row-resize'
      e.preventDefault()
    },
    [size, direction],
  )

  useEffect(() => {
    if (!dragging) return
    const onMouseMove = (e: MouseEvent): void => {
      const pos = direction === 'left' || direction === 'right' ? e.clientX : e.clientY
      const delta = pos - startPos.current
      let newSize: number
      if (direction === 'left' || direction === 'top') {
        newSize = startSize.current + delta
      } else {
        newSize = startSize.current - delta
      }
      newSize = Math.max(min, Math.min(max, newSize))
      setSize(newSize)
    }
    const onMouseUp = (): void => {
      setDragging(false)
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, direction, min, max])

  return { size, onMouseDown, dragging }
}
