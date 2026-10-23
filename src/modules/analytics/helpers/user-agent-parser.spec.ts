import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type DeviceClass, parseUserAgent } from './user-agent-parser'

const UA = {
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  operaWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
} as const

describe('parseUserAgent — browser', () => {
  /**
   * Every case below where the expectation is NOT the obvious one exists because
   * these strings overlap: Edge, Opera and Samsung all claim `Chrome/`, and
   * Chrome claims `Safari/`. Matching in the wrong order silently reports the
   * whole browser market as Chrome or Safari, which looks plausible on a
   * dashboard and is wrong.
   */
  it.each([
    ['Chrome on Windows', UA.chromeWin, 'Chrome'],
    ['Edge (also says Chrome)', UA.edgeWin, 'Edge'],
    ['Opera (also says Chrome)', UA.operaWin, 'Opera'],
    ['Samsung Internet (also says Chrome)', UA.samsung, 'Samsung Internet'],
    ['Safari on macOS', UA.safariMac, 'Safari'],
    ['Firefox on Linux', UA.firefoxLinux, 'Firefox'],
  ])('identifies %s', (_label, ua, expected) => {
    expect(parseUserAgent(ua).browser).toBe(expected)
  })
})

describe('parseUserAgent — operating system', () => {
  it.each([
    ['Windows', UA.chromeWin, 'Windows'],
    ['macOS', UA.safariMac, 'macOS'],
    ['Linux', UA.firefoxLinux, 'Linux'],
    ['iOS on iPhone', UA.safariIphone, 'iOS'],
    // Android must win over Linux: every Android UA also contains "Linux".
    ['Android, not Linux', UA.chromeAndroidPhone, 'Android'],
  ])('identifies %s', (_label, ua, expected) => {
    expect(parseUserAgent(ua).os).toBe(expected)
  })
})

describe('parseUserAgent — device class', () => {
  it.each([
    ['desktop Chrome', UA.chromeWin, 'desktop'],
    ['desktop Safari', UA.safariMac, 'desktop'],
    ['iPhone', UA.safariIphone, 'mobile'],
    ['iPad', UA.safariIpad, 'tablet'],
    ['Android phone (says Mobile)', UA.chromeAndroidPhone, 'mobile'],
    // The documented Android convention: a tablet omits "Mobile".
    ['Android tablet (omits Mobile)', UA.chromeAndroidTablet, 'tablet'],
  ])('classifies %s', (_label, ua, expected) => {
    expect(parseUserAgent(ua).device).toBe(expected)
  })
})

describe('parseUserAgent — absent or unrecognised input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('returns all-null for %s', (_label, input) => {
    expect(parseUserAgent(input)).toEqual({ browser: null, os: null, device: null })
  })

  it('answers null rather than guessing at an unrecognised agent', () => {
    expect(parseUserAgent('SomeCustomBot/1.0')).toEqual({ browser: null, os: null, device: null })
  })
})

describe('parseUserAgent — invariants', () => {
  const DEVICES: readonly DeviceClass[] = ['mobile', 'tablet', 'desktop']

  it('never throws and never invents a device class', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const parsed = parseUserAgent(input)

        expect(parsed.device === null || DEVICES.includes(parsed.device)).toBe(true)
      }),
    )
  })

  it('never returns the raw user-agent string in any field', () => {
    // The whole point of §5.2: the fingerprintable string must not survive.
    fc.assert(
      fc.property(fc.string({ minLength: 40 }), (input) => {
        const parsed = parseUserAgent(input)

        expect(Object.values(parsed)).not.toContain(input)
      }),
    )
  })

  it('is deterministic', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(parseUserAgent(input)).toEqual(parseUserAgent(input))
      }),
    )
  })
})
