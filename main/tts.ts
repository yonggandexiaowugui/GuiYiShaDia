// ============================================================================
// 本地 TTS：调用操作系统自带的语音引擎，免配置、免联网、免 API Key
// Windows 走 PowerShell + System.Speech（SAPI）；macOS 走 `say`（输出 AIFF）
// 文本通过临时 UTF-8 文件传递，避免命令注入与引号转义问题
// ============================================================================
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDataDir } from './database'

/** 执行 PowerShell 脚本（-NoProfile 加快启动，-NonInteractive 避免卡住等待输入） */
function runPowerShell(script: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || 'PowerShell 执行失败').trim().slice(0, 300)))
          return
        }
        resolve(stdout)
      },
    )
  })
}

/** PowerShell 单引号字符串转义：' → '' */
function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/** 枚举系统可用的语音声库 */
export async function listLocalVoices(): Promise<string[]> {
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }',
      '$s.Dispose()',
    ].join('; ')
    try {
      const out = await runPowerShell(script, 30000)
      return out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }
  if (process.platform === 'darwin') {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        execFile('say', ['-v', '?'], { timeout: 15000 }, (e, so) => (e ? reject(e) : resolve(so)))
      })
      return out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }
  return []
}

/** 语速 0.5~2 → SAPI Rate -10~10 */
function speedToRate(speed: number): number {
  const r = Math.round((Math.min(2, Math.max(0.5, speed)) - 1) * 6)
  return Math.min(10, Math.max(-10, r))
}

export interface LocalSynthOptions {
  voiceName?: string
  speed: number
  volume?: number
}

/**
 * 合成语音到 outPath（Windows → .wav，macOS → .aiff）。
 * 返回实际写出的文件路径与扩展名。
 */
export async function synthesizeLocal(
  text: string,
  options: LocalSynthOptions,
  outBasePath: string,
): Promise<{ filePath: string; ext: string }> {
  const tmpDir = path.join(getDataDir(), 'tmp')
  await fsp.mkdir(tmpDir, { recursive: true })
  const textFile = path.join(tmpDir, `tts-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.txt`)
  await fsp.writeFile(textFile, text, 'utf8')

  try {
    if (process.platform === 'win32') {
      const outPath = `${outBasePath}.wav`
      const script = [
        'Add-Type -AssemblyName System.Speech',
        `$t = [System.IO.File]::ReadAllText(${psQuote(textFile)}, [System.Text.Encoding]::UTF8)`,
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        options.voiceName ? `try { $s.SelectVoice(${psQuote(options.voiceName)}) } catch {}` : '',
        `$s.Rate = ${speedToRate(options.speed)}`,
        `$s.Volume = ${Math.min(100, Math.max(0, Math.round((options.volume ?? 1) * 100)))}`,
        `$s.SetOutputToWaveFile(${psQuote(outPath)})`,
        '$s.Speak($t)',
        '$s.Dispose()',
      ]
        .filter(Boolean)
        .join('; ')
      await runPowerShell(script)
      const stat = await fsp.stat(outPath).catch(() => null)
      if (!stat || stat.size < 1000) throw new Error('本地语音引擎未产生音频，请检查系统语音包是否完整')
      return { filePath: outPath, ext: 'wav' }
    }

    if (process.platform === 'darwin') {
      // say 只能输出 AIFF，再用 afconvert 转成浏览器友好的 m4a(aac)
      const aiffPath = `${outBasePath}.aiff`
      const args = ['-o', aiffPath]
      if (options.voiceName) args.push('-v', options.voiceName)
      args.push('-r', String(Math.round(180 * options.speed)))
      args.push('-f', textFile)
      await new Promise<void>((resolve, reject) => {
        execFile('say', args, { timeout: 60000 }, (e) => (e ? reject(e) : resolve()))
      })
      const outPath = `${outBasePath}.m4a`
      await new Promise<void>((resolve, reject) => {
        execFile(
          'afconvert',
          ['-f', 'm4af', '-d', 'aac', aiffPath, outPath],
          { timeout: 60000 },
          (e) => (e ? reject(e) : resolve()),
        )
      })
      await fsp.unlink(aiffPath).catch(() => undefined)
      const stat = await fsp.stat(outPath).catch(() => null)
      if (!stat || stat.size < 1000) throw new Error('本地语音引擎未产生音频')
      return { filePath: outPath, ext: 'm4a' }
    }

    throw new Error(`当前系统（${process.platform}）不支持本地语音合成，请在设置中改用在线 TTS 接口`)
  } finally {
    await fsp.unlink(textFile).catch(() => undefined)
  }
}
