import { assertEquals, assertThrows } from 'jsr:@std/assert'
import {
  allowedOrigins,
  checkoutIdempotencyKey,
  UUID_PATTERN,
  validateRedirect,
} from './billing.ts'

Deno.test('redirect allowlist permits configured origins only', () => {
  const origins = allowedOrigins(
    'https://app.example.com',
    'http://localhost:5173',
  )
  assertEquals(
    validateRedirect('https://app.example.com/billing', origins, ''),
    'https://app.example.com/billing',
  )
  assertThrows(() =>
    validateRedirect('https://evil.example/billing', origins, ''),
  )
})

Deno.test('checkout key is stable per account and plan', () => {
  assertEquals(
    checkoutIdempotencyKey('account', 'grow-month', 'attempt'),
    'checkout:account:grow-month:attempt',
  )
})

Deno.test('checkout attempt accepts only RFC 4122 version 4 UUIDs', () => {
  assertEquals(UUID_PATTERN.test('7d444840-9dc0-4f3c-8b7e-4f7f29e963af'), true)
  assertEquals(UUID_PATTERN.test('7d444840-9dc0-1f3c-8b7e-4f7f29e963af'), false)
  assertEquals(UUID_PATTERN.test('not-a-uuid'), false)
})
