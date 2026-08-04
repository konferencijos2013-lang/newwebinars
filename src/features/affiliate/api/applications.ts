import { supabase } from '@/lib/supabase'

export type PartnerPayoutMethod = 'bank' | 'paypal'

export type PartnerApplicationInput = {
  name: string
  email: string
  phone: string
  payoutMethod: PartnerPayoutMethod
  bankAccountHolder?: string
  bankIban?: string
  paypalEmail?: string
}

export async function submitPartnerApplication(input: PartnerApplicationInput) {
  const { error } = await supabase.rpc('submit_partner_application', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_payout_method: input.payoutMethod,
    p_bank_account_holder: input.bankAccountHolder || null,
    p_bank_iban: input.bankIban || null,
    p_paypal_email: input.paypalEmail || null,
    p_terms_version: '2026-08-04',
  })
  if (error) throw error
}
