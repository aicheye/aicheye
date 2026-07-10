#!/usr/bin/env node
// Refreshes the profile README's "current role" line and degree-progress bar.
//
//   role     <- seanyang.me public/data/jobs.json via jsDelivr (@main),
//               the entry with "current": true
//   progress <- the hardcoded DEGREE window below -> % elapsed
//
// The README console block is a fixed-width Unicode box: every content row is
// `│` + 57 display columns + `│`. We rewrite only the dynamic rows and re-pad
// them so the box stays aligned. Run with LOCAL_DATA_DIR=<path> to read the
// jobs JSON from disk instead of the network (used for local testing).

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const README_PATH = path.join(REPO_ROOT, 'README.md')
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/aicheye/seanyang.me@main/public/data'
const INNER_WIDTH = 57 // display columns between the box borders
const BAR_CELLS = 20

// UWaterloo BSE '30 degree window (mirrors src/app/components/TermProgress.tsx
// on seanyang.me). Update here if the program dates change.
const DEGREE = { start: '2025-09-01', end: '2030-05-01' }

async function loadData(name) {
  const localDir = process.env.LOCAL_DATA_DIR
  if (localDir) {
    return JSON.parse(await readFile(path.join(localDir, name), 'utf8'))
  }
  const res = await fetch(`${CDN_BASE}/${name}`, { headers: { 'user-agent': 'aicheye-readme-sync' } })
  if (!res.ok) throw new Error(`fetch ${name} failed: ${res.status} ${res.statusText}`)
  return res.json()
}

// Display width of a string. Every code point in this README (ASCII, box
// glyphs, ·, →) occupies exactly one column, so counting code points suffices.
const cols = (s) => [...s].length

// Wrap a content string (already including its 3-space indent) into a padded
// box row of the form `│` + content + spaces + `│`.
function boxRow(content) {
  const pad = INNER_WIDTH - cols(content)
  if (pad < 0) throw new Error(`box row too wide (${cols(content)} cols): ${content}`)
  return `│${content}${' '.repeat(pad)}│`
}

function currentRole(jobs) {
  const job = jobs.find((j) => j.current) ?? jobs[0]
  if (!job) throw new Error('no jobs found in jobs.json')
  return `${job.title} @ ${job.company}`
}

function progressPct(degree, now) {
  const start = Date.parse(degree.start)
  const end = Date.parse(degree.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('invalid degree start/end in degree.json')
  }
  const pct = ((now - start) / (end - start)) * 100
  return Math.max(0, Math.min(100, pct))
}

function progressBar(pct) {
  const filled = Math.round((pct / 100) * BAR_CELLS)
  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

// Weekday Mon DD HH:MM:SS YYYY (UTC), matching the existing "Last login" line.
function loginStamp(now) {
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getUTCDay()]
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getUTCMonth()]
  const p = (n) => String(n).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, ' ')
  return `${wd} ${mo} ${day} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}:${p(now.getUTCSeconds())} ${now.getUTCFullYear()}`
}

function updateReadme(readme, { role, pct, now }) {
  let out = readme

  // Last login line (outside the box, no padding constraint).
  out = out.replace(
    /^> Last login: .* from github\.com$/m,
    `> Last login: ${loginStamp(now)} from github.com`,
  )

  // Role row: the first non-empty box row after the `cat now.txt` prompt.
  out = out.replace(
    /(cat now\.txt.*│\n(?:│\s*│\n)*)│.*│/,
    (_m, head) => head + boxRow(`   ${role}`),
  )

  // Progress bar row: the box row containing a `%` after the DEGREE_PROGRESS prompt.
  const pctText = `${pct.toFixed(0)}%`
  out = out.replace(
    /(echo \$DEGREE_PROGRESS[\s\S]*?)│[^\n]*%[^\n]*│/,
    (_m, head) => head + boxRow(`   [${progressBar(pct)}] ${pctText}`),
  )

  return out
}

async function main() {
  const now = new Date()
  const jobs = await loadData('jobs.json')

  const role = currentRole(jobs)
  const pct = progressPct(DEGREE, now.getTime())

  const readme = await readFile(README_PATH, 'utf8')
  const updated = updateReadme(readme, { role, pct, now })

  if (updated === readme) {
    console.log('README already up to date; nothing to write.')
    return
  }
  await writeFile(README_PATH, updated)
  console.log(`Updated README -> role="${role}", progress=${pct.toFixed(0)}%`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
