import { describe, expect, it } from 'vitest'
import {
  centsToEuros,
  eurosToCents,
  md5Hex,
  payseraData,
  payseraDecode,
  payseraSign,
} from './offerPayment'

describe('offer amounts', () => {
  it('converts euro amounts to cents', () => {
    expect(eurosToCents('19')).toBe(1900)
    expect(eurosToCents('19,90')).toBe(1990)
    expect(eurosToCents('0')).toBeNull()
    expect(eurosToCents('19.999')).toBeNull()
    expect(centsToEuros(1990)).toBe('19.90')
  })
})

describe('Paysera signing', () => {
  it('uses the MD5 digest Paysera expects', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('round-trips the signed payload', () => {
    const data = payseraData({
      projectid: '123',
      orderid: 'order-1',
      amount: '1990',
      currency: 'EUR',
    })
    expect(payseraDecode(data)).toContain('orderid=order-1')
    expect(payseraSign(data, 'secret-pass')).toHaveLength(32)
  })
})
