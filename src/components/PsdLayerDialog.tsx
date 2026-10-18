import React, { useState } from 'react'
import { useStore } from '../services/store'
import { CATEGORIES } from '@shared/types'
import type { MaterialCategory } from '@shared/types'

interface Draft {
  id: string
  name: string
  category: MaterialCategory
  selected: boolean
}

const PsdLayerDialog: React.FC = () => {
  const dialog = useStore((s) => s.psdDialog)!
  const confirmPsd = useStore((s) => s.confirmPsd)
  const closePsd = useStore((s) => s.closePsd)

  const [draft, setDraft] = useState<Draft[]>(() =>
    dialog.layers.map((l) => ({
      id: l.id,
      name: l.name,
      category: '角色' as MaterialCategory,
      selected: l.selected,
    })),
  )

  const update = (i: number, patch: Partial<Draft>): void =>
    setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const selectedCount = draft.filter((d) => d.selected).length

  const confirm = (): void => {
    const items = draft
      .filter((d) => d.selected)
      .map(({ id, name, category }) => ({ id, name, category }))
    void confirmPsd(items)
  }

  return (
    <div className="modal-overlay" onClick={closePsd}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>选择要导入的 PSD 图层</span>
          <button className="ghost" onClick={closePsd} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="layer-list">
          {draft.map((d, i) => (
            <div key={d.id} className="layer-row">
              <input
                type="checkbox"
                checked={d.selected}
                onChange={(e) => update(i, { selected: e.target.checked })}
              />
              {dialog.layers[i]?.preview ? (
                <img className="layer-preview" src={dialog.layers[i].preview} alt={d.name} />
              ) : (
                <span className="layer-preview layer-preview-empty" />
              )}
              <input
                className="layer-name"
                value={d.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
              <select
                value={d.category}
                onChange={(e) => update(i, { category: e.target.value as MaterialCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="layer-size">
                {dialog.layers[i]?.width}×{dialog.layers[i]?.height}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <span className="hint">
            已选 {selectedCount} / {draft.length} 个图层
          </span>
          <div>
            <button className="ghost" onClick={closePsd}>
              取消
            </button>
            <button className="primary" onClick={confirm} disabled={selectedCount === 0}>
              导入所选图层
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PsdLayerDialog
