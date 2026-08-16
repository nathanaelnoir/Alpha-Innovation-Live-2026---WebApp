import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const socialPreview = readFileSync(
  resolve(process.cwd(), 'public/social-preview.png'),
)

describe('participant page metadata', () => {
  it('uses the artwork name for the browser tab and share previews', () => {
    expect(indexHtml).toContain('<title>eigenvalue:space</title>')
    expect(indexHtml).toContain(
      '<meta property="og:title" content="eigenvalue:space" />',
    )
    expect(indexHtml).toContain(
      '<meta name="twitter:title" content="eigenvalue:space" />',
    )
    expect(indexHtml).toContain(
      '<meta property="og:image" content="https://eigenvalue.space/social-preview.png" />',
    )
    expect(indexHtml).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    )
    expect(indexHtml).toContain(
      '<meta property="og:description" content="Where individual signals become a space." />',
    )
    expect(indexHtml).toContain(
      '<meta name="twitter:description" content="Where individual signals become a space." />',
    )
    expect(indexHtml.toLowerCase()).not.toContain('session pulse')
  })

  it('ships a standard 1200 by 630 PNG share card', () => {
    expect(socialPreview.subarray(1, 4).toString()).toBe('PNG')
    expect(socialPreview.readUInt32BE(16)).toBe(1200)
    expect(socialPreview.readUInt32BE(20)).toBe(630)
  })
})
