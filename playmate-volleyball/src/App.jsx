import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Advanced", "Competitive (4‑2/5‑1)"]

function cls(...xs){ return xs.filter(Boolean).join(' ') }
function toDate(v){ const d=new Date(v); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10) }
function formatRange(s,e){
  const S=new Date(s), E=new Date(e)
  const day=S.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})
  const st=S.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})
  const et=E.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})
  return `${day} • ${st}–${et}`
}
function csvEscape(v){ const s=String(v??''); return (/[",\n]/.test(s)) ? '"'+s.replaceAll('"','""')+'"' : s }
function downloadCSV(filename, rows){
  if(!rows?.length) return;
  const header = Object.keys(rows[0])
  const body = rows.map(r => header.map(h => csvEscape(r[h])).join(','))
  const csv = [header.join(','), ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click()
  setTimeout(()=>URL.revokeObjectURL(url),500)
}

const DEMO_EVENTS = [{
  id: crypto.randomUUID(),
  title: 'Drop‑in Volleyball',
  level: 'All Levels',
  location: '717 Rue Saint‑Ferdinand, Montréal',
  lat: 45.4793, lon: -73.5699,
  capacity: 24, courts: 3, price: 12, contact: '514‑241‑0316',
  pay_in_person: true, waitlist_enabled: true, notes: 'Bring clean indoor shoes.',
  start: new Date('2025-10-05T18:00:00-04:00').toISOString(),
  finish:new Date('2025-10-05T20:00:00-04:00').toISOString()
}]

export default function App(){
  const usingCloud = Boolean(supabase)
  const [events,setEvents]=useState(DEMO_EVENTS)
  const [attendees,setAttendees]=useState([])
  const [waitlist,setWaitlist]=useState([])
  const [query,setQuery]=useState('')
  const [selectedId,setSelectedId]=useState(null)
  const selected = useMemo(()=>events.find(e=>e.id===selectedId) ?? events[0] ?? null,[events,selectedId])

  useEffect(()=>{
    if(!usingCloud) return;
    (async ()=>{
      const { data: evs } = await supabase.from('events').select('*').order('start',{ascending:false})
      if(evs) setEvents(evs)
      const { data: at } = await supabase.from('attendees').select('*')
      if(at) setAttendees(at)
      const { data: wl } = await supabase.from('waitlist').select('*')
      if(wl) setWaitlist(wl)
      setSelectedId(evs?.[0]?.id ?? null)
    })()
  },[usingCloud])

  const filtered = useMemo(()=>{
    const q=query.toLowerCase().trim()
    if(!q) return events
    return events.filter(e => e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.level.toLowerCase().includes(q))
  },[query,events])

  async function addEvent(form){
    const fd=new FormData(form)
    const date=String(fd.get('date'))
    const st=String(fd.get('startTime'))
    const et=String(fd.get('endTime'))
    const start=new Date(`${date}T${st}:00`).toISOString()
    const finish=new Date(`${date}T${et}:00`).toISOString()
    const ev={
      title:String(fd.get('title')||'Drop‑in Volleyball'),
      level:String(fd.get('level')||LEVELS[0]),
      location:String(fd.get('location')||'Montréal'),
      lat:Number(fd.get('lat')||45.5017), lon:Number(fd.get('lon')||-73.5673),
      capacity:Number(fd.get('capacity')||24), courts:Number(fd.get('courts')||3), price:Number(fd.get('price')||12),
      contact:String(fd.get('contact')||'514‑241‑0316'),
      pay_in_person:Boolean(fd.get('payInPerson')),
      waitlist_enabled:Boolean(fd.get('waitlistEnabled')),
      notes:String(fd.get('notes')||''),
      start, finish
    }
    if(usingCloud){
      const { data, error } = await supabase.from('events').insert(ev).select('*').single()
      if(!error && data){ setEvents(p=>[data,...p]); setSelectedId(data.id) }
    }else{
      const local={ id:crypto.randomUUID(), ...ev }
      setEvents(p=>[local,...p]); setSelectedId(local.id)
    }
    form.reset()
  }

  function countAttendees(eid){ return attendees.filter(a=>a.event_id===eid).length }

  async function refresh(eid){
    if(!usingCloud) return;
    const { data: at } = await supabase.from('attendees').select('*').match(eid?{event_id:eid}:{}) 
    if(at) setAttendees(prev=>eid?[...prev.filter(x=>x.event_id!==eid),...at]:at)
    const { data: wl } = await supabase.from('waitlist').select('*').match(eid?{event_id:eid}:{}) 
    if(wl) setWaitlist(prev=>eid?[...prev.filter(x=>x.event_id!==eid),...wl]:wl)
  }

  async function rsvp(eid,name){
    const ev=events.find(e=>e.id===eid); if(!ev) return;
    const atCap = usingCloud ? countAttendees(eid) >= ev.capacity : false
    if(usingCloud){
      if(atCap && ev.waitlist_enabled){ await supabase.from('waitlist').insert({event_id:eid,name}); await refresh(eid); return }
      if(atCap) return;
      await supabase.from('attendees').insert({event_id:eid,name,checked_in:false}); await refresh(eid)
    }else{
      alert('RSVP captured (demo) — connect Supabase to persist.')
    }
  }

  async function toggleCheckIn(eid,pid){
    if(!usingCloud) return;
    const target=attendees.find(a=>a.id===pid); if(!target) return;
    await supabase.from('attendees').update({checked_in:!target.checked_in}).eq('id',pid); await refresh(eid)
  }
  async function removeAttendee(eid,pid){
    if(!usingCloud) return;
    await supabase.from('attendees').delete().eq('id',pid); await refresh(eid)
  }
  async function promote(eid){
    if(!usingCloud) return;
    const list=waitlist.filter(w=>w.event_id===eid)
    if(!list.length) return;
    const first=list[0]; const ev=events.find(e=>e.id===eid); if(!ev) return;
    if(countAttendees(eid)>=ev.capacity) return;
    await supabase.from('waitlist').delete().eq('id',first.id)
    await supabase.from('attendees').insert({event_id:eid,name:first.name,checked_in:false})
    await refresh(eid)
  }
  function exportEvent(eid){
    const ev=events.find(e=>e.id===eid); if(!ev) return;
    const rows=attendees.filter(a=>a.event_id===eid).map(a=>({
      event_id:ev.id, event_title:ev.title, date:new Date(ev.start).toLocaleDateString(),
      time:`${new Date(ev.start).toLocaleTimeString()}-${new Date(ev.finish).toLocaleTimeString()}`,
      name:a.name, checked_in:a.checked_in?'yes':'no'
    }))
    downloadCSV(`${ev.title.replaceAll(' ','_')}_attendees.csv`, rows)
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-black text-white flex items-center justify-center font-bold">PM</div>
          <div className="flex-1">
            <h1 className="text-xl font-bold leading-tight">PlayMate — Volleyball</h1>
            <p className="text-xs text-neutral-500">Create volleyball drop‑ins, RSVP, waitlist, check‑in {usingCloud ? '(cloud sync ON)' : '(demo mode)'}.</p>
          </div>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events, locations, levels…" className="w-72 max-w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <h2 className="font-semibold mb-3">Create a volleyball event</h2>
            <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); addEvent(e.currentTarget)}}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Title</label>
                  <input name="title" className="w-full rounded-xl border px-3 py-2" placeholder="Drop‑in Volleyball" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Date</label>
                  <input name="date" type="date" className="w-full rounded-xl border px-3 py-2" defaultValue={toDate(new Date().toISOString())} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-600">Start</label>
                    <input name="startTime" type="time" className="w-full rounded-xl border px-3 py-2" defaultValue="18:00" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-600">End</label>
                    <input name="endTime" type="time" className="w-full rounded-xl border px-3 py-2" defaultValue="20:00" />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Location</label>
                  <input name="location" className="w-full rounded-xl border px-3 py-2" placeholder="717 Rue Saint‑Ferdinand, Montréal" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Latitude</label>
                  <input name="lat" type="number" step="any" className="w-full rounded-xl border px-3 py-2" placeholder="45.5017" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Longitude</label>
                  <input name="lon" type="number" step="any" className="w-full rounded-xl border px-3 py-2" placeholder="-73.5673" />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Courts</label>
                  <input name="courts" type="number" className="w-full rounded-xl border px-3 py-2" defaultValue={3} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Capacity</label>
                  <input name="capacity" type="number" className="w-full rounded-xl border px-3 py-2" defaultValue={24} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Price ($)</label>
                  <input name="price" type="number" className="w-full rounded-xl border px-3 py-2" defaultValue={12} />
                </div>
                <div>
                  <label className="text-xs text-neutral-600">Level</label>
                  <select name="level" className="w-full rounded-xl border px-3 py-2">
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Organizer Contact</label>
                  <input name="contact" className="w-full rounded-xl border px-3 py-2" defaultValue="514‑241‑0316" />
                </div>
                <div className="col-span-2 flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input name="payInPerson" type="checkbox" className="rounded" defaultChecked /> In‑person payment
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input name="waitlistEnabled" type="checkbox" className="rounded" defaultChecked /> Enable waitlist
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-neutral-600">Notes (shown on poster)</label>
                  <textarea name="notes" rows="2" className="w-full rounded-xl border px-3 py-2" placeholder="Bring clean indoor shoes." />
                </div>
              </div>
              <button className="w-full rounded-xl bg-black text-white py-2 font-medium hover:bg-black/90">Add Event</button>
            </form>
          </div>
        </section>

        <section className="lg:col-span-1 space-y-3">
          {filtered.length===0 && <div className="bg-white rounded-2xl shadow-sm border p-6 text-center text-neutral-500">No events match your search.</div>}
          {filtered.map(ev => (
            <button key={ev.id} onClick={()=>setSelectedId(ev.id)} className={cls('w-full text-left bg-white rounded-2xl shadow-sm border p-4 hover:shadow-md transition', selectedId===ev.id && 'ring-2 ring-black/10')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{ev.title}</div>
                  <div className="text-sm text-neutral-600">{formatRange(ev.start, ev.finish)}</div>
                  <div className="text-sm text-neutral-600">{ev.location}</div>
                  <div className="mt-1 text-xs inline-flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 border">{ev.level}</span>
                    <span className="rounded-full px-2 py-0.5 border">Courts: {ev.courts}</span>
                    <span className="rounded-full px-2 py-0.5 border">Cap: {ev.capacity}</span>
                    <span className="rounded-full px-2 py-0.5 border">${ev.price}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500">RSVP</div>
                  <div className="text-lg font-semibold">{attendees.filter(a=>a.event_id===ev.id).length} / {ev.capacity}</div>
                  {ev.waitlist_enabled && <div className="text-xs text-neutral-500">Waitlist: {waitlist.filter(w=>w.event_id===ev.id).length}</div>}
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="lg:col-span-1">
          {!selected ? (
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center text-neutral-500">Select an event to view details.</div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b grid grid-cols-2 gap-3 items-center">
                <div>
                  <div className="text-xs text-neutral-500">Featured Poster</div>
                  <div className="mt-1 rounded-xl border p-3">
                    <div className="text-lg font-bold">{selected.title}</div>
                    <div className="text-sm">{formatRange(selected.start, selected.finish)}</div>
                    <div className="text-sm">{selected.location}</div>
                    <div className="text-sm mt-1">Level: {selected.level}</div>
                    <div className="text-sm">Courts: {selected.courts} • Capacity: {selected.capacity} • ${selected.price}</div>
                    <div className="text-sm">Contact: {selected.contact}</div>
                    {selected.pay_in_person && <div className="mt-1 text-xs text-emerald-600">Pay in person (cash / e‑transfer on site)</div>}
                    {selected.notes && <div className="mt-1 text-xs text-neutral-700">Note: {selected.notes}</div>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Map</div>
                  <div className="aspect-video rounded-xl overflow-hidden border">
                    <iframe title="map" className="w-full h-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.openstreetmap.org/export/embed.html?bbox=${selected.lon-0.01}%2C${selected.lat-0.01}%2C${selected.lon+0.01}%2C${selected.lat+0.01}&layer=mapnik&marker=${selected.lat}%2C${selected.lon}`} />
                  </div>
                </div>
              </div>

              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Attendees</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>exportEvent(selected.id)} className="rounded-lg border px-2 py-1 text-sm hover:bg-neutral-50">Export CSV</button>
                    {selected.waitlist_enabled && <button onClick={()=>promote(selected.id)} className="rounded-lg border px-2 py-1 text-sm hover:bg-neutral-50">Promote from waitlist</button>}
                  </div>
                </div>
                <div className="space-y-2">
                  {attendees.filter(a=>a.event_id===selected.id).length===0 && <div className="text-sm text-neutral-500">No RSVPs yet.</div>}
                  {attendees.filter(a=>a.event_id===selected.id).map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-xl border p-2">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={a.checked_in} onChange={()=>toggleCheckIn(selected.id, a.id)} />
                        <div className="text-sm">{a.name}</div>
                        {a.checked_in && <span className="text-xs text-emerald-600">checked‑in</span>}
                      </div>
                      <button onClick={()=>removeAttendee(selected.id, a.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                    </div>
                  ))}
                </div>
                <form className="mt-3 flex items-center gap-2" onSubmit={(e)=>{e.preventDefault(); const name=e.currentTarget.elements.namedItem('rsvpName').value.trim(); if(!name) return; rsvp(selected.id, name); e.currentTarget.reset()}}>
                  <input name="rsvpName" placeholder="Player name" className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                  <button className="rounded-xl bg-black text-white px-3 py-2 text-sm">RSVP</button>
                </form>
                {selected.waitlist_enabled && (
                  <div className="mt-4">
                    <h4 className="font-medium text-sm mb-1">Waitlist</h4>
                    {waitlist.filter(w=>w.event_id===selected.id).length===0 ? <div className="text-sm text-neutral-500">Empty</div> : (
                      <ul className="list-disc list-inside text-sm">
                        {waitlist.filter(w=>w.event_id===selected.id).map(w => <li key={w.id}>{w.name}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-semibold mb-2">Quick admin</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border p-3">
                    <div className="text-neutral-500">Spots left</div>
                    <div className="text-xl font-bold">{Math.max((selected.capacity - attendees.filter(a=>a.event_id===selected.id).length), 0)}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-neutral-500">Check‑ins</div>
                    <div className="text-xl font-bold">{attendees.filter(a=>a.event_id===selected.id && a.checked_in).length}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-neutral-500">Waitlist</div>
                    <div className="text-xl font-bold">{waitlist.filter(w=>w.event_id===selected.id).length}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-neutral-500">Revenue (projected)</div>
                    <div className="text-xl font-bold">${attendees.filter(a=>a.event_id===selected.id).length * selected.price}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      <footer className="max-w-6xl mx-auto px-4 pb-10 text-xs text-neutral-500">
        <div className="mt-6">© {new Date().getFullYear()} PlayMate Volleyball</div>
      </footer>
    </div>
  )
}