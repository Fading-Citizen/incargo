// Scoped read endpoint. The 256-bit token is the sole client credential.
const allowedOrigins = new Set(['https://incargo.co','https://www.incargo.co']);
const baseHeaders = {'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const cors = allowedOrigins.has(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey'} : {};
  const reply = (status:number, body:object) => new Response(JSON.stringify(body),{status,headers:{...baseHeaders,...cors}});
  if (request.method === 'OPTIONS') return allowedOrigins.has(origin) ? reply(204,{}) : reply(403,{error:'forbidden'});
  if (request.method !== 'POST' || !allowedOrigins.has(origin)) return reply(403,{error:'forbidden'});
  let token:unknown;
  try { ({token} = await request.json()); } catch { return reply(400,{error:'invalid request'}); }
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return reply(404,{error:'not found'});
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(503,{error:'temporarily unavailable'});
  try {
    const headers = {'apikey':key,'Authorization':`Bearer ${key}`,'Content-Type':'application/json'};
    const lookup = await fetch(`${url}/rest/v1/rpc/incargo_read_tracking`,{method:'POST',headers,body:JSON.stringify({p_token:token})});
    if (!lookup.ok) return reply(503,{error:'temporarily unavailable'});
    const record = await lookup.json();
    if (!record) return reply(404,{error:'not found'});
    let support_url:null|string = null;
    if (record.proof_path) {
      const safePath = String(record.proof_path).split('/').map(encodeURIComponent).join('/');
      const signed = await fetch(`${url}/storage/v1/object/sign/incargo-proofs/${safePath}`,{method:'POST',headers,body:JSON.stringify({expiresIn:60})});
      if (signed.ok) {
        const result = await signed.json();
        if (typeof result.signedURL === 'string') support_url = `${url}/storage/v1${result.signedURL}`;
      }
    }
    return reply(200,{customer_name:record.customer_name,invoice_reference:record.invoice_reference,status:record.status,events:record.events,support_url});
  } catch { return reply(503,{error:'temporarily unavailable'}); }
});
