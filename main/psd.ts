// ============================================================================
// 主进程：PSD 解析与图层导出（ag-psd + sharp）
// 角色分层素材的关键能力：一个 PSD 拆出 头/身/表情 等独立图层入库
// ============================================================================
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { readPsd } from 'ag-psd'
import { addMaterial, resolveAsset } from './database'
import { generateThumbnail, writeRgbaPng, rgbaToPngDataUrl } from './media'
import type { Material, PsdLayerInfo, PsdLayerImportItem } from '../shared/types'

// ag-psd 类型带 DOM（HTMLCanvasElement / ImageData），主进程用最小化接口规避 DOM lib
interface ImgData {
  data: Uint8Array
  width: number
  height: number
}
interface LayerLike {
  name?: string
  children?: LayerLike[]
  imageData?: ImgData
  hidden?: boolean
}
interface PsdLike {
  width: number
  height: number
  children?: LayerLike[]
}

function toBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
}

function readPsdFile(filePath: string): PsdLike {
  const buf = fs.readFileSync(filePath)
  // useImageData: 图层像素放到 imageData 字段（纯字节数组），无需 canvas
  return readPsd(toBuffer(buf), { useImageData: true }) as unknown as PsdLike
}

function flattenImageLayers(layers: LayerLike[] | undefined, out: LayerLike[] = []): LayerLike[] {
  if (!layers) return out
  for (const l of layers) {
    if (l.imageData && l.imageData.width > 0 && l.imageData.height > 0) {
      out.push(l)
    }
    if (l.children && l.children.length) {
      flattenImageLayers(l.children, out)
    }
  }
  return out
}

export async function parsePSD(filePath: string): Promise<PsdLayerInfo[]> {
  const psd = readPsdFile(filePath)
  const flat = flattenImageLayers(psd.children)
  const result: PsdLayerInfo[] = []
  for (let i = 0; i < flat.length; i++) {
    const layer = flat[i]
    const img = layer.imageData!
    let preview = ''
    try {
      preview = await rgbaToPngDataUrl(img.data, img.width, img.height)
    } catch {
      preview = ''
    }
    result.push({
      id: String(i),
      name: layer.name || `图层 ${i + 1}`,
      width: img.width,
      height: img.height,
      preview,
      selected: true,
    })
  }
  return result
}

export async function exportPSDLayers(
  filePath: string,
  items: PsdLayerImportItem[],
): Promise<Material[]> {
  const psd = readPsdFile(filePath)
  const flat = flattenImageLayers(psd.children)
  const result: Material[] = []
  for (const item of items) {
    const idx = Number(item.id)
    const layer = flat[idx]
    if (!layer || !layer.imageData) continue
    const img = layer.imageData
    const id = crypto.randomUUID()
    const fileRel = await writeRgbaPng(img.data, img.width, img.height, item.category, id)
    const thumbRel = await generateThumbnail(resolveAsset(fileRel), id)
    result.push(
      addMaterial({
        id,
        name: item.name,
        category: item.category,
        file_path: fileRel,
        thumbnail_path: thumbRel,
        meta: JSON.stringify({
          source: 'psd',
          psdName: path.basename(filePath),
          layerName: layer.name || '',
          width: img.width,
          height: img.height,
        }),
      }),
    )
  }
  return result
}
