// Google Calendar API helpers
// provider_token comes from supabase.auth.getSession().data.session?.provider_token

const BASE = 'https://www.googleapis.com/calendar/v3'

export interface GCalEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
  description?: string
}

// Fetch events for a date range
export async function fetchEvents(
  token: string,
  timeMin: string,  // ISO string
  timeMax: string
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const res = await fetch(`${BASE}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GCal error: ${res.status}`)
  const data = await res.json()
  return data.items ?? []
}

// Create a time block event
export async function createTimeBlock(
  token: string,
  summary: string,
  startDateTime: string,  // ISO string e.g. "2026-03-29T09:00:00"
  endDateTime: string,
  description?: string
): Promise<GCalEvent> {
  const res = await fetch(`${BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description: description ?? '',
      start: { dateTime: startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      colorId: '6', // tangerine — matches orange theme
    }),
  })
  if (!res.ok) throw new Error(`GCal create error: ${res.status}`)
  return res.json()
}

// Delete an event
export async function deleteEvent(token: string, eventId: string): Promise<void> {
  await fetch(`${BASE}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

// Format ISO dateTime for display
export function fmtTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function fmtEventDuration(start?: string, end?: string): string {
  if (!start || !end) return ''
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h${mins % 60 ? (mins % 60) + 'm' : ''}`
}
