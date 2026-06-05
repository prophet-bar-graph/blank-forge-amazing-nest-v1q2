export type DiffSegment = { type: 'unchanged' | 'removed' | 'added'; text: string }

function tokenize(input: string): string[] {
  const tokens = input.match(/\s+|\S+/g)
  return tokens ?? []
}

type Op = { type: 'unchanged' | 'removed' | 'added'; text: string }

function diffTokens(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'unchanged', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', text: a[i] })
      i++
    } else {
      ops.push({ type: 'added', text: b[j] })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'removed', text: a[i] })
    i++
  }
  while (j < m) {
    ops.push({ type: 'added', text: b[j] })
    j++
  }
  return ops
}

function mergeOps(ops: Op[]): Op[] {
  const merged: Op[] = []
  for (const op of ops) {
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) last.text += op.text
    else merged.push({ ...op })
  }
  return merged
}

export function diffWords(original: string, improved: string): DiffSegment[] {
  if (!original.trim() || !improved.trim()) {
    return [{ type: 'unchanged', text: improved || original }]
  }
  const ops = diffTokens(tokenize(original), tokenize(improved))
  return mergeOps(ops)
}

export function diffChangeRatio(segments: DiffSegment[]): number {
  const total = segments.reduce((n, s) => n + s.text.length, 0)
  if (!total) return 0
  const changed = segments.filter(s => s.type !== 'unchanged').reduce((n, s) => n + s.text.length, 0)
  return changed / total
}
