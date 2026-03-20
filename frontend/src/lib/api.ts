import { supabase } from './supabase'
import type { Campaign, Stats } from '../types'

const CAMPAIGN_COLUMNS = [
  'id', 'campaign_id', 'send_channel',
  'open_rate', 'click_rate', 'conversion_value', 'click_to_open_rate',
  'timeframe_start', 'timeframe_end',
  'campaign_message_id', 'label', 'send_time', 'subject', 'template_link',
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
    timeframe_start:     (row.timeframe_start as string) ?? null,
    timeframe_end:       (row.timeframe_end as string) ?? null,
    campaign_message_id: (row.campaign_message_id as string) ?? null,
    label:               (row.label as string) ?? null,
    send_time:           (row.send_time as string) ?? null,
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
