export interface Campaign {
  id: number
  campaign_id: string
  send_channel: string | null
  open_rate: number | null
  click_rate: number | null
  conversion_value: number | null
  click_to_open_rate: number | null
  timeframe_start: string | null
  timeframe_end: string | null
  campaign_message_id: string | null
  label: string | null
  send_time: string | null
  subject: string | null
  template_link: string | null
  template_file_path: string | null
  template_filename: string | null
  has_screenshot: boolean
  api_call_1: number
  api_call_2: number
  api_call_3: number
}

export interface Stats {
  total: number
  done_1: number
  done_2: number
  done_3: number
}
