import { describe, expect, it, vi } from 'vitest'

import watchLaterApi from '~/background/messageListeners/api/watchLater'

vi.mock('webextension-polyfill', () => ({
  default: {},
}))

describe('watch later API definitions', () => {
  it('sends the target aid in the delete request body', () => {
    const removeDefinition = watchLaterApi.removeFromWatchLater

    expect(removeDefinition._fetch.body).toEqual({
      aid: 0,
      viewed: false,
      csrf: '',
    })
    expect('params' in removeDefinition).toBe(false)
  })
})
