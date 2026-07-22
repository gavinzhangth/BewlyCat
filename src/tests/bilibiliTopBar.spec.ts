import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetOriginalBilibiliTopBarScrollState, syncOriginalBilibiliTopBarScrollState } from '~/utils/bilibiliTopBar'

const SCROLL_PROXY_ID = 'bewly-bilibili-top-bar-scroll-proxy'
const SCROLL_SYNC_CLASS = 'bewly-bilibili-top-bar-scroll-sync'
const SCROLL_SYNC_STYLE_ID = 'bewly-bilibili-top-bar-scroll-sync-style'

function addBilibiliTopBar() {
  const header = document.createElement('header')
  header.className = 'bili-header'

  const topBar = document.createElement('div')
  topBar.className = 'bili-header__bar'
  header.append(topBar)
  document.body.append(header)

  return topBar
}

describe('original Bilibili top bar scroll state', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    document.getElementById(SCROLL_SYNC_STYLE_ID)?.remove()
    document.documentElement.classList.remove(SCROLL_SYNC_CLASS)
    document.documentElement.scrollTop = 0
  })

  afterEach(() => {
    resetOriginalBilibiliTopBarScrollState(document)
    document.body.replaceChildren()
    document.getElementById(SCROLL_SYNC_STYLE_ID)?.remove()
    document.documentElement.classList.remove(SCROLL_SYNC_CLASS)
    document.documentElement.scrollTop = 0
  })

  it('activates Bilibili native header state after the internal viewport passes its threshold', () => {
    const topBar = addBilibiliTopBar()
    let nativeChannelEntryEnabled = false
    window.addEventListener('scroll', () => {
      const scrollingElement = document.scrollingElement || document.documentElement
      nativeChannelEntryEnabled = scrollingElement.scrollTop > 32
    }, { once: true })

    syncOriginalBilibiliTopBarScrollState(document, 33)

    expect(document.documentElement.classList.contains(SCROLL_SYNC_CLASS)).toBe(true)
    expect(document.getElementById(SCROLL_PROXY_ID)).not.toBeNull()
    expect(document.getElementById(SCROLL_SYNC_STYLE_ID)).not.toBeNull()
    expect(document.documentElement.scrollTop).toBe(33)
    expect(topBar.classList.contains('slide-down')).toBe(true)
    expect(nativeChannelEntryEnabled).toBe(true)
  })

  it('returns the native header to its top-of-page state', () => {
    const topBar = addBilibiliTopBar()

    syncOriginalBilibiliTopBarScrollState(document, 200)
    syncOriginalBilibiliTopBarScrollState(document, 32)

    expect(document.documentElement.scrollTop).toBe(0)
    expect(topBar.classList.contains('slide-down')).toBe(false)
    expect(document.querySelectorAll(`#${SCROLL_PROXY_ID}`)).toHaveLength(1)
  })

  it('does not emit duplicate state changes while remaining on the same side of the threshold', () => {
    addBilibiliTopBar()
    let scrollEventCount = 0
    const handleScroll = () => scrollEventCount++
    window.addEventListener('scroll', handleScroll)

    syncOriginalBilibiliTopBarScrollState(document, 100)
    syncOriginalBilibiliTopBarScrollState(document, 500)

    window.removeEventListener('scroll', handleScroll)
    expect(scrollEventCount).toBe(1)
    expect(document.querySelectorAll(`#${SCROLL_PROXY_ID}`)).toHaveLength(1)
  })

  it('removes the proxy, styles, and mirrored scroll state when disabled', () => {
    const topBar = addBilibiliTopBar()
    syncOriginalBilibiliTopBarScrollState(document, 100)

    resetOriginalBilibiliTopBarScrollState(document)

    expect(document.getElementById(SCROLL_PROXY_ID)).toBeNull()
    expect(document.getElementById(SCROLL_SYNC_STYLE_ID)).toBeNull()
    expect(document.documentElement.classList.contains(SCROLL_SYNC_CLASS)).toBe(false)
    expect(document.documentElement.scrollTop).toBe(0)
    expect(topBar.classList.contains('slide-down')).toBe(false)
  })

  it('only resets an outer scroll position created by the sync helper', () => {
    document.documentElement.scrollTop = 75

    resetOriginalBilibiliTopBarScrollState(document)

    expect(document.documentElement.scrollTop).toBe(75)
  })
})
