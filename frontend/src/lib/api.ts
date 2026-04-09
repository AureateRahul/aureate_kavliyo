import { supabase } from './supabase'
import type { Campaign, Stats } from '../types'

const BACKEND = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:5000'

export interface RefreshResult {
  updated: number
  inserted: number
  new_campaign_ids: string[]
  per_email_cost?: number
}

export async function refreshMetrics(timeframe: string, userId?: string): Promise<RefreshResult> {
  const res = await fetch(`${BACKEND}/api/refresh-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeframe, user_id: userId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Refresh failed')
  return json
}

export async function fetchUserEmailCost(): Promise<number> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('per_email_cost')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  return Number(data?.per_email_cost ?? 0)
}

export async function saveUserEmailCost(payload: {
  monthlyCost: number
  totalEmailCredits: number
}): Promise<number> {
  const perEmailCost = payload.monthlyCost / payload.totalEmailCredits

  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: 1, per_email_cost: String(perEmailCost) }, { onConflict: 'id' })

  if (error) throw error

  return perEmailCost
}

export async function runApi2(campaignIds: string[]): Promise<{ processed: number }> {
  const res = await fetch(`${BACKEND}/api/run-api2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign_ids: campaignIds }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'API 2 failed')
  return json
}

export async function runApi3(campaignIds: string[]): Promise<{ processed: number }> {
  const res = await fetch(`${BACKEND}/api/run-api3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign_ids: campaignIds }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'API 3 failed')
  return json
}

const CAMPAIGN_COLUMNS = [
  'id', 'campaign_id', 'send_channel',
  'open_rate', 'click_rate', 'conversion_value', 'click_to_open_rate',
  'total_sent', 'cost', 'roas',
  'timeframe_start', 'timeframe_end',
  'campaign_message_id', 'label', 'send_time', 'template_created', 'subject', 'template_link',
  'template_file_path',
  'api_call_1', 'api_call_2', 'api_call_3',
].join(', ')

/** Extract just the filename from a full file path (cross-platform). */
function basename(p: string | null): string | null {
  if (!p) return null
  return p.replace(/.*[\\/]/, '') || null
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .order('id')

  if (error) throw error

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(row => ({
    id:                  row.id as number,
    campaign_id:         row.campaign_id as string,
    send_channel:        (row.send_channel as string) ?? null,
    open_rate:           (row.open_rate as number) ?? null,
    click_rate:          (row.click_rate as number) ?? null,
    conversion_value:    (row.conversion_value as number) ?? null,
    click_to_open_rate:  (row.click_to_open_rate as number) ?? null,
    total_sent:          (row.total_sent as number) ?? null,
    cost:                (row.cost as number) ?? null,
    roas:                (row.roas as number) ?? null,
    timeframe_start:     (row.timeframe_start as string) ?? null,
    timeframe_end:       (row.timeframe_end as string) ?? null,
    campaign_message_id: (row.campaign_message_id as string) ?? null,
    label:               (row.label as string) ?? null,
    send_time:           (row.send_time as string) ?? null,
    template_created:    (row.template_created as string) ?? null,
    subject:             (row.subject as string) ?? null,
    template_link:       (row.template_link as string) ?? null,
    template_file_path:  (row.template_file_path as string) ?? null,
    template_filename:   basename(row.template_file_path as string | null),
    has_screenshot:      !!(row.template_file_path),
    api_call_1:          (row.api_call_1 as number) ?? 0,
    api_call_2:          (row.api_call_2 as number) ?? 0,
    api_call_3:          (row.api_call_3 as number) ?? 0,
  }))
}

export async function fetchStats(): Promise<Stats> {
  const [r0, r1, r2, r3] = await Promise.all([
    supabase.from('campaigns').select('*', { count: 'exact', head: true }),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('api_call_1', 1),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('api_call_2', 1),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('api_call_3', 1),
  ])

  return {
    total:  r0.count ?? 0,
    done_1: r1.count ?? 0,
    done_2: r2.count ?? 0,
    done_3: r3.count ?? 0,
  }
}
