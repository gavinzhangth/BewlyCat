import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addWatchLaterButton, extractVideoIds, removeWatchLaterButton } from '~/utils/watchLaterButton'

const mocks = vi.hoisted(() => ({
  getAllWatchLaterList: vi.fn(),
  getVideoInfo: vi.fn(),
  refreshTopBar: vi.fn(),
  removeFromWatchLater: vi.fn(),
  saveToWatchLater: vi.fn(),
}))
const localeState = vi.hoisted(() => ({ value: 'en' }))

vi.mock('webextension-polyfill', () => ({
  runtime: {
    getURL: (path: string) => `chrome-extension://bewly-cat${path}`,
  },
}))

vi.mock('~/utils/api', () => ({
  default: {
    video: {
      getVideoInfo: mocks.getVideoInfo,
    },
    watchlater: {
      getAllWatchLaterList: mocks.getAllWatchLaterList,
      removeFromWatchLater: mocks.removeFromWatchLater,
      saveToWatchLater: mocks.saveToWatchLater,
    },
  },
}))

vi.mock('~/stores/topBarStore', () => ({
  useTopBarStore: () => ({
    getAllWatchLaterList: mocks.refreshTopBar,
  }),
}))

vi.mock('~/utils/i18n', () => ({
  i18n: {
    global: {
      locale: localeState,
      t: (key: string) => {
        if (key === 'watch_later.title' && localeState.value === 'cmn-CN')
          return '稍后再看'

        return ({
          'common.loading': 'Loading...',
          'watch_later.add_current_video': 'Add to Watch Later',
          'watch_later.remove_current_video': 'Remove from Watch Later',
          'watch_later.title': 'Watch Later',
        })[key] ?? key
      },
    },
  },
}))

vi.mock('~/utils/main', () => ({
  getCSRF: () => 'csrf-token',
}))

const BVID = 'BV1TestVideo1'

function mountToolbar() {
  document.body.innerHTML = `
    <div class="video-toolbar-left-main">
      <div class="toolbar-left-item-wrap" data-action="like"></div>
      <div class="toolbar-left-item-wrap" data-action="coin"></div>
      <div class="toolbar-left-item-wrap" data-action="favorite"></div>
      <div class="toolbar-left-item-wrap" data-action="share">
        <div class="video-toolbar-left-item video-share">
          <span id="share-btn-outer"></span>
        </div>
      </div>
    </div>
  `
}

describe('watch later button', () => {
  beforeEach(() => {
    history.replaceState({}, '', `/video/${BVID}`)
    mountToolbar()
    localeState.value = 'en'

    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.getVideoInfo.mockResolvedValue({ code: 0, data: { aid: 123 } })
    mocks.refreshTopBar.mockResolvedValue(undefined)
    mocks.removeFromWatchLater.mockResolvedValue({ code: 0 })
    mocks.saveToWatchLater.mockResolvedValue({ code: 0 })
  })

  afterEach(() => {
    removeWatchLaterButton()
    document.getElementById('bewly-watch-later-button-style')?.remove()
    document.body.innerHTML = ''
  })

  it('extracts BV and AV identifiers from video URLs', () => {
    expect(extractVideoIds(`https://www.bilibili.com/video/${BVID}?p=2`)).toEqual({ bvid: BVID })
    expect(extractVideoIds('https://www.bilibili.com/video/av12345')).toEqual({ aid: 12345 })
    expect(extractVideoIds('https://www.bilibili.com/')).toEqual({})
  })

  it('supports the toolbar layout without a left-main wrapper', () => {
    document.body.innerHTML = `
      <div class="video-toolbar-left">
        <div class="video-like"></div>
        <div class="video-coin"></div>
        <div class="video-fav"></div>
        <div class="video-share"></div>
      </div>
    `
    mocks.getAllWatchLaterList.mockResolvedValue({ code: 0, data: { list: [] } })

    expect(addWatchLaterButton()).toBe(true)

    const toolbar = document.querySelector<HTMLElement>('.video-toolbar-left')!
    expect(toolbar.lastElementChild?.classList.contains('bewly-watch-later-btn')).toBe(true)
  })

  it('uses the selected language on its first render', () => {
    mocks.getAllWatchLaterList.mockResolvedValue({ code: 0, data: { list: [] } })

    expect(addWatchLaterButton('cmn-CN')).toBe(true)

    expect(localeState.value).toBe('cmn-CN')
    expect(document.querySelector('.bewly-watch-later-info')?.textContent).toBe('稍后再看')
  })

  it('mounts after share and removes a video already in Watch Later', async () => {
    mocks.getAllWatchLaterList.mockResolvedValueOnce({
      code: 0,
      data: { list: [{ aid: 123, bvid: BVID }] },
    }).mockResolvedValue({
      code: 0,
      data: { list: [] },
    })

    expect(addWatchLaterButton()).toBe(true)

    const toolbar = document.querySelector<HTMLElement>('.video-toolbar-left-main')!
    const button = document.querySelector<HTMLElement>('.bewly-watch-later-btn')!
    await vi.waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'))

    expect(toolbar.children).toHaveLength(5)
    expect(toolbar.lastElementChild?.classList.contains('bewly-watch-later-wrap')).toBe(true)
    expect(button.classList.contains('is-active')).toBe(true)
    expect(button.title).toBe('Remove from Watch Later')

    button.click()

    await vi.waitFor(() => expect(mocks.removeFromWatchLater).toHaveBeenCalledWith({
      aid: 123,
      csrf: 'csrf-token',
    }))
    await vi.waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('false'))
    expect(mocks.refreshTopBar).toHaveBeenCalledOnce()
  })

  it('adds an unlisted video and keeps the selected state', async () => {
    mocks.getAllWatchLaterList.mockResolvedValueOnce({
      code: 0,
      data: { list: [] },
    }).mockResolvedValue({
      code: 0,
      data: { list: [{ aid: 123, bvid: BVID }] },
    })

    expect(addWatchLaterButton()).toBe(true)

    const button = document.querySelector<HTMLElement>('.bewly-watch-later-btn')!
    await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
    button.click()

    await vi.waitFor(() => expect(mocks.saveToWatchLater).toHaveBeenCalledWith({
      bvid: BVID,
      csrf: 'csrf-token',
    }))
    await vi.waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'))
    expect(button.title).toBe('Remove from Watch Later')
    expect(mocks.refreshTopBar).toHaveBeenCalledOnce()
  })

  it('keeps the selected state when the backend still contains the video', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getAllWatchLaterList.mockResolvedValue({
      code: 0,
      data: { list: [{ aid: 123, bvid: BVID }] },
    })

    expect(addWatchLaterButton()).toBe(true)

    const button = document.querySelector<HTMLElement>('.bewly-watch-later-btn')!
    await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
    button.click()

    await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(mocks.refreshTopBar).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('切换稍后再看状态失败:', expect.any(Error))
    errorSpy.mockRestore()
  })
})
