import React from 'react'
import { useStore } from '../services/store'

const Toasts: React.FC = () => {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export default Toasts
