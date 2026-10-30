"""Disposable database only. Run after enterprise-local.test.sql and proposal activation."""
import concurrent.futures, json, subprocess, uuid
ACTOR='11111111-1111-4111-8111-111111111111'
def query(sql, **values):
    args=['docker','--host=unix:///var/run/docker.sock','exec','-i','incargo-enterprise-test','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']
    for key,value in values.items(): args+=['-v',key+'='+str(value)]
    return subprocess.run(args,input=f"begin;set local role authenticated;set local \"request.jwt.claim.sub\"='{ACTOR}';{sql};commit;",text=True,capture_output=True)
def call(sql, **values):
    result=query(sql,**values)
    if result.returncode: raise RuntimeError(result.stderr)
    return json.loads(result.stdout.strip())
tag='CONCURRENCY-'+str(uuid.uuid4())
invoice={'account_id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','issuer_reference':'LOCAL TEST','external_number':tag,'currency':'COP','issue_date':'2026-10-30','due_date':'2026-11-30','source_reference':'LOCAL ONLY','lines':[{'description':'Test','quantity':1,'unit_price':100,'tax_amount':0}],'document_total':100}
i=call("select to_jsonb(public.incargo_register_admin_invoice(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(invoice))
receipts=[]
for n in range(2):
    data={'account_id':invoice['account_id'],'currency':'COP','amount':60,'external_reference':tag+'-'+str(n),'received_date':'2026-10-30','source_reference':'LOCAL ONLY'}
    receipts.append(call("select to_jsonb(public.incargo_record_receipt(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(data)))
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda receipt:query("select to_jsonb(public.incargo_apply_receipt(:'req'::uuid,:'receipt'::uuid,:'invoice'::uuid,60))",req=uuid.uuid4(),receipt=receipt,invoice=i),receipts))
assert sum(r.returncode==0 for r in results)==1, [r.stderr for r in results]
board=call('select public.incargo_finance_board()')
assert next(x for x in board if x['id']==i)['outstanding']==40
# Simultaneous retry of the same creation must return one identity and one audited write.
shared_request=str(uuid.uuid4());invoice['external_number']=tag+'-REPLAY'
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda _:call("select to_jsonb(public.incargo_register_admin_invoice(:'req'::uuid,:'payload'::jsonb))",req=shared_request,payload=json.dumps(invoice)),range(2)))
assert results[0]==results[1]
print('PASS: concurrent allocations serialize to prevent invoice overpayment; concurrent same-request replay returns the same invoice.')
# Same source quote cannot fork, nor be accepted concurrently with a revision.
quote={'account_id':invoice['account_id'],'currency':'COP','origin':'LOCAL origin','destination':'LOCAL destination','description':tag+' lifecycle','lines':invoice['lines']}
q=call("select to_jsonb(public.incargo_create_quote(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(quote))
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda n:query("select to_jsonb(public.incargo_revise_quote(:'req'::uuid,:'quote'::uuid,:'reason',:'payload'::jsonb))",req=uuid.uuid4(),quote=q,reason='LOCAL concurrent revision '+str(n),payload=json.dumps(quote)),range(2)))
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
q=call("select to_jsonb(public.incargo_create_quote(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(quote))
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    accepted=pool.submit(query,"select to_jsonb(public.incargo_accept_quote(:'req'::uuid,:'quote'::uuid,'LOCAL concurrent acceptance'))",req=uuid.uuid4(),quote=q)
    revised=pool.submit(query,"select to_jsonb(public.incargo_revise_quote(:'req'::uuid,:'quote'::uuid,'LOCAL concurrent revision',:'payload'::jsonb))",req=uuid.uuid4(),quote=q,payload=json.dumps(quote))
    results=[accepted.result(),revised.result()]
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
# Cancellation and invoice linking lock the same order. Neither combination may survive.
q=call("select to_jsonb(public.incargo_create_quote(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(quote))
o=call("select to_jsonb(public.incargo_accept_quote(:'req'::uuid,:'quote'::uuid,'LOCAL acceptance'))",req=uuid.uuid4(),quote=q)
invoice['external_number']=tag+'-CANCEL-RACE';invoice['order_ids']=[o]
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    cancelled=pool.submit(query,"select to_jsonb(public.incargo_cancel_unassigned_order(:'req'::uuid,:'order'::uuid,'LOCAL cancel before execution'))",req=uuid.uuid4(),order=o)
    invoiced=pool.submit(query,"select to_jsonb(public.incargo_register_admin_invoice(:'req'::uuid,:'payload'::jsonb))",req=uuid.uuid4(),payload=json.dumps(invoice))
    results=[cancelled.result(),invoiced.result()]
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
print('PASS: concurrent revisions cannot fork; acceptance and revision are exclusive; cancellation and invoicing cannot both commit.')
