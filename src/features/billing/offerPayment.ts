export function eurosToCents(value: string) {
  const trimmed = value.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [whole, fraction = ''] = trimmed.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_00) {
    return null
  }
  return cents
}

export function centsToEuros(cents: number) {
  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  return `${whole}.${fraction}`
}

function rotateLeft(value: number, shift: number) {
  return (value << shift) | (value >>> (32 - shift))
}

function toHex(value: number) {
  return (value >>> 0).toString(16).padStart(8, '0')
}

/** MD5 hex digest. Paysera signs the checkout payload with MD5. */
export function md5Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  const paddedLength = ((bytes.length + 8) >> 6) + 1
  const words = new Uint32Array(paddedLength * 16)
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8)
  }
  words[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8)
  words[words.length - 2] = bitLength >>> 0
  const highBits = Math.floor(bitLength / 0x100000000)
  words[words.length - 1] = highBits

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const constants = new Uint32Array(64)
  for (let index = 0; index < 64; index += 1) {
    constants[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000)
  }

  for (let offset = 0; offset < words.length; offset += 16) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let index = 0; index < 64; index += 1) {
      let mixed: number
      let source = index
      if (index < 16) mixed = (b & c) | (~b & d)
      else if (index < 32) {
        mixed = (d & b) | (~d & c)
        source = (5 * index + 1) % 16
      } else if (index < 48) {
        mixed = b ^ c ^ d
        source = (3 * index + 5) % 16
      } else {
        mixed = c ^ (b | ~d)
        source = (7 * index) % 16
      }
      const next =
        b +
        rotateLeft(
          a + mixed + constants[index] + words[offset + source],
          shifts[(index >> 4) * 4 + (index % 4)],
        )
      a = d
      d = c
      c = b
      b = next >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const littleEndian = [a0, b0, c0, d0]
    .map(
      (value) =>
        ((value & 0xff) << 24) |
        ((value & 0xff00) << 8) |
        ((value >>> 8) & 0xff00) |
        ((value >>> 24) & 0xff),
    )
    .map(toHex)
  return littleEndian.join('')
}

export function payseraData(params: Record<string, string>) {
  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`,
    )
    .join('&')
  const bytes = new TextEncoder().encode(query)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_')
}

export function payseraSign(data: string, password: string) {
  return md5Hex(`${data}${password}`)
}

export function payseraDecode(data: string) {
  const normalized = data.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
