import React, { useEffect, useState } from 'react'
import { useStore } from '../services/store'
import { CATEGORIES, CATEGORY_ALL } from '@shared/types'
import type { Material, MaterialCategory } from '@shared/types'

const TABS: (typeof CATEGORY_ALL | MaterialCategory)[] = [CATEGORY_ALL, ...CATEGORIES]

interface CtxMenu {
  x: number
  y: number
  material: Material
}

const MaterialLibrary: React.FC = () => {
  const materials = useStore((s) => s.materials)
  const activeCategory = useStore((s) => s.activeCategory)
  const selectedId = useStore((s) => s.selectedMaterialId)
  const loading = useStore((s) => s.loading)
  const importing = useStore((s) => s.importing)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const setCategory = useStore((s) => s.setCategory)
  const selectMaterial = useStore((s) => s.selectMaterial)
  const loadMaterials = useStore((s) => s.loadMaterials)
  const importFiles = useStore((s) => s.importFiles)
  const updateMaterial = useStore((s) => s.updateMaterial)
  const deleteMaterial = useStore((s) => s.deleteMaterial)

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  useEffect(() => {
    void loadMaterials()
  }, [loadMaterials])

  // 右键菜单：点击任意处 / Esc 关闭
  useEffect(() => {
    if (!ctxMenu) return
    const close = (): void => setCtxMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? materials.filter(
        (m) =>
          m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)),
      )
    : materials

  const ctxRename = (): void => {
    if (!ctxMenu) return
    const m = ctxMenu.material
    setCtxMenu(null)
    const name = window.prompt('重命名素材', m.name)
    if (name && name.trim()) void updateMaterial(m.id, { name: name.trim() })
  }

  const ctxEditTags = (): void => {
    if (!ctxMenu) return
    const m = ctxMenu.material
    setCtxMenu(null)
    const input = window.prompt('编辑标签（逗号分隔）', m.tags.join(', '))
    if (input === null) return
    const tags = input
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    void updateMaterial(m.id, { tags })
  }

  const ctxMoveTo = (category: MaterialCategory): void => {
    if (!ctxMenu) return
    const m = ctxMenu.material
    setCtxMenu(null)
    void updateMaterial(m.id, { category })
  }

  const ctxShowInFolder = (): void => {
    if (!ctxMenu) return
    const m = ctxMenu.material
    setCtxMenu(null)
    void window.api.showItemInFolder(m.file_path)
  }

  const ctxDelete = (): void => {
    if (!ctxMenu) return
    const m = ctxMenu.material
    setCtxMenu(null)
    if (window.confirm(`确认删除素材「${m.name}」？\n磁盘文件将一并删除，不可恢复。`)) {
      void deleteMaterial(m.id)
    }
  }

  return (
    <aside className="material-library">
      <div className="category-tabs">
        {TABS.map((t) => (
          <button key={t} className={activeCategory === t ? 'active' : ''} onClick={() => setCategory(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="library-toolbar">
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索名称 / 标签…"
        />
        <button className="primary" onClick={() => void importFiles()} disabled={importing}>
          {importing ? '导入中…' : '导入'}
        </button>
      </div>

      <div className="material-grid">
        {loading && <div className="empty-hint">加载中…</div>}
        {!loading && filtered.length === 0 && (
          <div className="empty-hint" onClick={() => void importFiles()}>
            {q ? '没有匹配的素材' : '暂无素材，点击导入'}
          </div>
        )}
        {filtered.map((m) => (
          <div
            key={m.id}
            className={`material-card ${selectedId === m.id ? 'selected' : ''}`}
            onClick={() => selectMaterial(m.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              selectMaterial(m.id)
              setCtxMenu({ x: e.clientX, y: e.clientY, material: m })
            }}
            draggable
            onDragStart={(e) => {
              // 所有素材可拖到预览区；音效还可拖到时间轴音效轨道
              e.dataTransfer.setData('text/guiyi-material', JSON.stringify({ materialId: m.id, category: m.category }))
              e.dataTransfer.effectAllowed = 'copy'
            }}
            title={m.tags.length ? `${m.name}\n标签：${m.tags.join('、')}` : m.name}
          >
            <div className="thumb">
              {m.thumbnail_path ? (
                <img src={window.api.assetUrl(m.thumbnail_path)} alt={m.name} draggable={false} />
              ) : (
                <span className="audio-mark">🎵</span>
              )}
            </div>
            <div className="name">{m.name}</div>
            <div className="cat">{m.category}</div>
          </div>
        ))}
      </div>

      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button onClick={ctxRename}>✏ 重命名…</button>
          <button onClick={ctxEditTags}>🏷 编辑标签…</button>
          <div className="ctx-sep" />
          <div className="ctx-label">迁移分类</div>
          {CATEGORIES.filter((c) => c !== ctxMenu.material.category).map((c) => (
            <button key={c} onClick={() => ctxMoveTo(c)}>
              → {c}
            </button>
          ))}
          <div className="ctx-sep" />
          <button onClick={ctxShowInFolder}>📂 打开所在文件夹</button>
          <button className="danger" onClick={ctxDelete}>
            🗑 删除素材
          </button>
        </div>
      )}
    </aside>
  )
}

export default MaterialLibrary
