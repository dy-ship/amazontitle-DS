export async function generate(payload){
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok){ throw new Error(await res.text()); }
  return res.json();
}

export async function history(limit=20){
  const res = await fetch('/api/history?limit='+limit);
  if(!res.ok){ throw new Error(await res.text()); }
  return res.json();
}


export async function translate(target_locale, title, bullets){
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_locale, title, bullets })
  });
  if(!res.ok){ throw new Error(await res.text()); }
  return res.json();
}
