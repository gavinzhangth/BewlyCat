const BILIBILI_TOP_BAR_SELECTORS = [
  '.bili-header',
  '.bili-header .bili-header__bar',
  '#internationalHeader',
  '.link-navbar',
  '#home_nav',
  '#biliMainHeader',
  '#bili-header-container',
  // Bilibili Evolved
  '.custom-navbar',
]

const BILIBILI_TOP_BAR_SCROLL_TRIGGER_HEIGHT = 32
const BILIBILI_TOP_BAR_SCROLL_PROXY_TOP = BILIBILI_TOP_BAR_SCROLL_TRIGGER_HEIGHT + 1
const BILIBILI_TOP_BAR_SCROLL_PROXY_ID = 'bewly-bilibili-top-bar-scroll-proxy'
const BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS = 'bewly-bilibili-top-bar-scroll-sync'
const BILIBILI_TOP_BAR_SCROLL_SYNC_STYLE_ID = 'bewly-bilibili-top-bar-scroll-sync-style'

let cachedOriginalTopBar: HTMLElement | null = null

function getDocumentTopBar(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.bili-header')
}

export function captureOriginalBilibiliTopBar(doc: Document) {
  if (cachedOriginalTopBar && cachedOriginalTopBar.ownerDocument === doc)
    return cachedOriginalTopBar

  const header = getDocumentTopBar(doc)
  if (!header)
    return null

  cachedOriginalTopBar = header
  return cachedOriginalTopBar
}

function getScrollingElement(doc: Document): Element {
  return doc.scrollingElement || doc.documentElement
}

function dispatchScrollEvent(doc: Document) {
  const win = doc.defaultView
  if (win)
    win.dispatchEvent(new win.Event('scroll'))
}

function ensureScrollSyncStyles(doc: Document) {
  if (doc.getElementById(BILIBILI_TOP_BAR_SCROLL_SYNC_STYLE_ID))
    return

  const style = doc.createElement('style')
  style.id = BILIBILI_TOP_BAR_SCROLL_SYNC_STYLE_ID
  style.textContent = `
html.${BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS},
html.${BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS} body {
  overflow: hidden !important;
}
html.${BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS} #bewly {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100dvh !important;
}
`
  const styleContainer = doc.head || doc.documentElement
  styleContainer.append(style)
}

/**
 * Bilibili's large homepage header only enables the channel popover after its own
 * document scroll position passes 32px. Bewly pages scroll inside Shadow DOM, so
 * mirror just that state into the outer document and let Bilibili update its own
 * reactive header state.
 */
export function syncOriginalBilibiliTopBarScrollState(doc: Document, scrollTop: number) {
  if (!doc.body)
    return

  ensureScrollSyncStyles(doc)

  let scrollProxy = doc.getElementById(BILIBILI_TOP_BAR_SCROLL_PROXY_ID)
  if (!scrollProxy) {
    scrollProxy = doc.createElement('div')
    scrollProxy.id = BILIBILI_TOP_BAR_SCROLL_PROXY_ID
    scrollProxy.setAttribute('aria-hidden', 'true')
    Object.assign(scrollProxy.style, {
      height: `calc(100vh + ${BILIBILI_TOP_BAR_SCROLL_PROXY_TOP}px)`,
      left: '0',
      opacity: '0',
      pointerEvents: 'none',
      position: 'absolute',
      top: '0',
      width: '1px',
    })
    doc.body.append(scrollProxy)
  }

  doc.documentElement.classList.add(BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS)

  const isScrolled = scrollTop > BILIBILI_TOP_BAR_SCROLL_TRIGGER_HEIGHT
  const mirroredScrollTop = isScrolled ? BILIBILI_TOP_BAR_SCROLL_PROXY_TOP : 0
  const scrollingElement = getScrollingElement(doc)
  const topBar = doc.querySelector<HTMLElement>('.bili-header .bili-header__bar')
  const shouldNotifyBilibili = scrollingElement.scrollTop !== mirroredScrollTop
    || Boolean(topBar?.classList.contains('slide-down')) !== isScrolled

  // Keep the visual state in sync immediately while Bilibili's throttled listener
  // updates the reactive state that controls whether the popover is rendered.
  topBar?.classList.toggle('slide-down', isScrolled)
  scrollingElement.scrollTop = mirroredScrollTop

  if (shouldNotifyBilibili)
    dispatchScrollEvent(doc)
}

export function resetOriginalBilibiliTopBarScrollState(doc: Document) {
  const scrollProxy = doc.getElementById(BILIBILI_TOP_BAR_SCROLL_PROXY_ID)
  const scrollSyncStyle = doc.getElementById(BILIBILI_TOP_BAR_SCROLL_SYNC_STYLE_ID)
  const isSyncing = doc.documentElement.classList.contains(BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS)
  if (!scrollProxy && !isSyncing) {
    scrollSyncStyle?.remove()
    return
  }

  const scrollingElement = getScrollingElement(doc)
  const topBar = doc.querySelector<HTMLElement>('.bili-header .bili-header__bar')
  const shouldNotifyBilibili = scrollingElement.scrollTop !== 0
    || Boolean(topBar?.classList.contains('slide-down'))

  topBar?.classList.remove('slide-down')
  scrollingElement.scrollTop = 0

  if (shouldNotifyBilibili)
    dispatchScrollEvent(doc)

  scrollProxy?.remove()
  scrollSyncStyle?.remove()
  doc.documentElement.classList.remove(BILIBILI_TOP_BAR_SCROLL_SYNC_CLASS)
}

export function detachOriginalBilibiliTopBar(doc: Document) {
  const header = getDocumentTopBar(doc)
  if (!header)
    return

  cachedOriginalTopBar = header
  header.remove()
}

export function ensureOriginalBilibiliTopBarAppended(doc: Document): boolean {
  const header = getDocumentTopBar(doc) || cachedOriginalTopBar
  if (!header)
    return false

  // 1. 隐藏多余段落（如 banner 等），只保留顶栏条
  const innerUselessContents = header.querySelectorAll<HTMLElement>(':scope > *:not(.bili-header__bar)')
  innerUselessContents.forEach(item => (item.style.display = 'none'))

  // 2. 确保顶栏是 body 的直接子元素且位于最前
  // 即使 header 已存在，如果它在某个被隐藏的父容器里，这里也会将其移动到 body 下
  if (header.parentElement !== doc.body || header !== doc.body.firstElementChild) {
    doc.body.prepend(header)
  }

  // 更新缓存引用
  cachedOriginalTopBar = header
  return true
}

/**
 * When toggling between Bewly and Bili top bars, Bilibili scripts may leave inline styles behind.
 * Clear a small set of inline properties so the original top bar can be shown immediately.
 */
export function resetBilibiliTopBarInlineStyles(doc: Document) {
  for (const selector of BILIBILI_TOP_BAR_SELECTORS) {
    doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      el.style.removeProperty('visibility')
      el.style.removeProperty('display')
    })
  }
}

/**
 * Add click event listeners to login buttons in the original Bilibili top bar
 * to redirect users to the login page.
 */
export function setupLoginButtonClickHandlers(doc: Document) {
  const LOGIN_URL = 'https://passport.bilibili.com/login'

  // Function to handle login button binding
  function bindLoginButton(button: HTMLElement) {
    if (button.hasAttribute('data-bewly-login-handler'))
      return

    button.setAttribute('data-bewly-login-handler', 'true')
    button.style.cursor = 'pointer'
    button.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      window.location.href = LOGIN_URL
    })
  }

  // Bind existing login buttons
  const existingButtons = doc.querySelectorAll<HTMLElement>('.login-btn')
  existingButtons.forEach(bindLoginButton)

  // Use MutationObserver to handle dynamically added popup elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        // Check if the added node is an element
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement

          // Check if the added node itself is a login button
          if (element.classList.contains('login-btn')) {
            bindLoginButton(element)
          }

          // Check if the added node contains login buttons
          const loginButtons = element.querySelectorAll<HTMLElement>('.login-btn')
          loginButtons.forEach(bindLoginButton)
        }
      })
    })
  })

  // Observe the entire document for popup elements
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  })

  // Return cleanup function
  return () => {
    observer.disconnect()
  }
}
