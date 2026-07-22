import type { List as WatchLaterVideo, WatchLaterResult } from '~/models/video/watchLater'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { i18n } from '~/utils/i18n'
import { getCSRF } from '~/utils/main'

const BUTTON_SELECTOR = '.bewly-watch-later-btn'
const WRAPPER_SELECTOR = '.bewly-watch-later-wrap'
const STYLE_ID = 'bewly-watch-later-button-style'

export interface VideoIds {
  bvid?: string
  aid?: number
}

interface WatchLaterButtonState {
  aid?: number
  isInWatchLater: boolean
  isLoading: boolean
}

interface WatchLaterStateCheck {
  isInWatchLater: boolean
  item?: WatchLaterVideo
}

interface ToolbarInsertionPoint {
  before?: HTMLElement
  buttonClassName: string
  container: HTMLElement
  reference?: HTMLElement
  useWrapper: boolean
}

/**
 * 从 URL 中提取视频 ID
 * @param url 视频页面 URL，默认为当前页面 URL
 */
export function extractVideoIds(url: string = location.href): VideoIds {
  const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
  if (bvidMatch)
    return { bvid: bvidMatch[1] }

  const aidMatch = url.match(/\/video\/av(\d+)/i)
  if (aidMatch)
    return { aid: Number.parseInt(aidMatch[1]) }

  return {}
}

function ensureButtonStyles() {
  if (document.getElementById(STYLE_ID))
    return

  const iconUrl = browser.runtime.getURL('/assets/saved-list.svg')
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    ${BUTTON_SELECTOR} {
      cursor: pointer;
      user-select: none;
    }

    ${BUTTON_SELECTOR}.is-loading {
      cursor: wait;
      opacity: 0.55;
      pointer-events: none;
    }

    ${BUTTON_SELECTOR}.on,
    ${BUTTON_SELECTOR}.is-active {
      color: var(--bew-theme-color, var(--brand_blue, #00aeec));
    }

    ${BUTTON_SELECTOR} .bewly-watch-later-icon {
      display: block;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
      background-color: currentColor;
      -webkit-mask: url("${iconUrl}") center / contain no-repeat;
      mask: url("${iconUrl}") center / contain no-repeat;
    }
  `
  document.head.appendChild(style)
}

function getDirectToolbarChild(container: HTMLElement, selector: string) {
  return Array.from(container.children).find((child) => {
    return child.matches(selector) || child.querySelector(selector)
  }) as HTMLElement | undefined
}

function findToolbarInsertionPoint(): ToolbarInsertionPoint | undefined {
  const leftToolbar = document.querySelector<HTMLElement>('.video-toolbar-left-main')
    ?? document.querySelector<HTMLElement>('.video-toolbar-left')
  if (!leftToolbar) {
    const moreButton = document.querySelector<HTMLElement>('.video-tool-more')
    if (!moreButton?.parentElement)
      return undefined

    return {
      before: moreButton,
      buttonClassName: 'video-toolbar-right-item',
      container: moreButton.parentElement,
      useWrapper: false,
    }
  }

  const shareSelector = '.video-share, .video-share-wrap, #share-btn-outer'
  const reference = getDirectToolbarChild(leftToolbar, shareSelector)
    ?? (leftToolbar.lastElementChild as HTMLElement | null)
    ?? undefined
  const useWrapper = Array.from(leftToolbar.children).some(child => child.classList.contains('toolbar-left-item-wrap'))

  return {
    buttonClassName: 'video-toolbar-left-item',
    container: leftToolbar,
    reference,
    useWrapper,
  }
}

function isSameVideo(item: WatchLaterVideo, videoIds: VideoIds) {
  if (videoIds.bvid)
    return item.bvid === videoIds.bvid

  return typeof videoIds.aid === 'number' && item.aid === videoIds.aid
}

async function getWatchLaterItem(videoIds: VideoIds) {
  const result = await api.watchlater.getAllWatchLaterList() as WatchLaterResult
  if (result.code !== 0)
    throw new Error(result.message || `获取稍后再看状态失败（${result.code}）`)

  return result.data?.list?.find(item => isSameVideo(item, videoIds))
}

async function waitForWatchLaterState(
  videoIds: VideoIds,
  expectedState: boolean,
): Promise<WatchLaterStateCheck> {
  let item: WatchLaterVideo | undefined

  for (let attempt = 0; attempt < 3; attempt += 1) {
    item = await getWatchLaterItem(videoIds)
    const isInWatchLater = Boolean(item)
    if (isInWatchLater === expectedState)
      return { isInWatchLater, item }

    if (attempt < 2)
      await new Promise(resolve => setTimeout(resolve, 300))
  }

  return {
    isInWatchLater: Boolean(item),
    item,
  }
}

async function resolveAid(videoIds: VideoIds) {
  if (typeof videoIds.aid === 'number')
    return videoIds.aid

  if (!videoIds.bvid)
    return undefined

  const result = await api.video.getVideoInfo({ bvid: videoIds.bvid })
  if (result.code !== 0)
    throw new Error(result.message || `获取视频信息失败（${result.code}）`)

  const aid = Number(result.data?.aid)
  return Number.isFinite(aid) ? aid : undefined
}

function assertApiSuccess(result: { code: number, message?: string }, action: string) {
  if (result.code !== 0)
    throw new Error(result.message || `${action}失败（${result.code}）`)
}

function refreshTopBarWatchLaterList() {
  try {
    void useTopBarStore().getAllWatchLaterList()
  }
  catch (error) {
    console.error('刷新顶栏稍后再看列表失败:', error)
  }
}

function renderButtonState(
  button: HTMLElement,
  text: HTMLElement,
  state: WatchLaterButtonState,
) {
  const { t } = i18n.global
  const actionLabel = String(t(state.isInWatchLater
    ? 'watch_later.remove_current_video'
    : 'watch_later.add_current_video'))

  button.classList.toggle('on', state.isInWatchLater)
  button.classList.toggle('is-active', state.isInWatchLater)
  button.classList.toggle('is-loading', state.isLoading)
  button.setAttribute('aria-pressed', String(state.isInWatchLater))
  button.setAttribute('aria-busy', String(state.isLoading))
  button.setAttribute('aria-disabled', String(state.isLoading))
  button.setAttribute('aria-label', actionLabel)
  button.title = state.isLoading ? String(t('common.loading')) : actionLabel
  text.textContent = String(t('watch_later.title'))
}

/** 移除播放页上的外置稍后再看按钮。 */
export function removeWatchLaterButton() {
  document.querySelector(WRAPPER_SELECTOR)?.remove()
  document.querySelector(BUTTON_SELECTOR)?.remove()
}

/**
 * 在点赞、投币、收藏、分享之后添加可切换的稍后再看按钮。
 * @param language 当前界面语言；传入时保证按钮第一次渲染就使用该语言
 * @returns 是否成功找到工具栏并添加按钮
 */
export function addWatchLaterButton(language?: string) {
  removeWatchLaterButton()

  if (language)
    i18n.global.locale.value = language

  const insertionPoint = findToolbarInsertionPoint()
  const videoIds = extractVideoIds()
  if (!insertionPoint || (!videoIds.bvid && !videoIds.aid))
    return false

  ensureButtonStyles()

  const button = document.createElement('div')
  button.className = `${insertionPoint.buttonClassName} bewly-watch-later-btn`
  button.setAttribute('role', 'button')
  button.tabIndex = 0

  const iconContainer = document.createElement('div')
  iconContainer.className = 'video-toolbar-item-icon'
  const icon = document.createElement('span')
  icon.className = 'bewly-watch-later-icon'
  icon.setAttribute('aria-hidden', 'true')
  iconContainer.appendChild(icon)

  const text = document.createElement('span')
  text.className = 'video-toolbar-item-text bewly-watch-later-info'
  button.append(iconContainer, text)

  const state: WatchLaterButtonState = {
    aid: videoIds.aid,
    isInWatchLater: false,
    isLoading: true,
  }
  renderButtonState(button, text, state)

  const mountedElement = insertionPoint.useWrapper
    ? document.createElement('div')
    : button
  if (mountedElement !== button) {
    mountedElement.className = 'toolbar-left-item-wrap bewly-watch-later-wrap'
    mountedElement.appendChild(button)
  }

  if (insertionPoint.before)
    insertionPoint.container.insertBefore(mountedElement, insertionPoint.before)
  else if (insertionPoint.reference)
    insertionPoint.reference.after(mountedElement)
  else
    insertionPoint.container.appendChild(mountedElement)

  const refreshState = async () => {
    state.isLoading = true
    renderButtonState(button, text, state)

    try {
      const item = await getWatchLaterItem(videoIds)
      if (!button.isConnected)
        return

      state.isInWatchLater = Boolean(item)
      state.aid = item?.aid ?? videoIds.aid
    }
    catch (error) {
      console.error('获取当前视频稍后再看状态失败:', error)
    }
    finally {
      if (button.isConnected) {
        state.isLoading = false
        renderButtonState(button, text, state)
      }
    }
  }

  const toggleWatchLater = async () => {
    if (state.isLoading)
      return

    state.isLoading = true
    renderButtonState(button, text, state)

    try {
      if (state.isInWatchLater) {
        const aid = state.aid ?? await resolveAid(videoIds)
        if (typeof aid !== 'number')
          throw new Error('未能获取当前视频的 AV 号')

        const result = await api.watchlater.removeFromWatchLater({
          aid,
          csrf: getCSRF(),
        })
        assertApiSuccess(result, '移出稍后再看')

        const confirmedState = await waitForWatchLaterState(videoIds, false)
        if (confirmedState.isInWatchLater)
          throw new Error('后端仍返回当前视频在稍后再看列表中')

        state.isInWatchLater = false
      }
      else {
        const result = await api.watchlater.saveToWatchLater({
          ...videoIds,
          csrf: getCSRF(),
        })
        assertApiSuccess(result, '添加到稍后再看')

        const confirmedState = await waitForWatchLaterState(videoIds, true)
        if (!confirmedState.isInWatchLater)
          throw new Error('后端未返回当前视频的稍后再看记录')

        state.isInWatchLater = true
        state.aid = confirmedState.item?.aid ?? state.aid ?? await resolveAid(videoIds)
      }

      refreshTopBarWatchLaterList()
    }
    catch (error) {
      console.error('切换稍后再看状态失败:', error)
    }
    finally {
      if (button.isConnected) {
        state.isLoading = false
        renderButtonState(button, text, state)
      }
    }
  }

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void toggleWatchLater()
  })
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ')
      return

    event.preventDefault()
    event.stopPropagation()
    void toggleWatchLater()
  })

  void refreshState()
  return true
}
