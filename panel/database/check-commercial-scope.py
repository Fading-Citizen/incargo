"""Disposable database only; test the separate commercial grant proposal then roll back."""
from pathlib import Path
import subprocess
proposal = Path('panel/database/commercial-activation.proposal.sql').read_text()
assert proposal.count('\nbegin;') == 1 and proposal.endswith('commit;\n')
proposal = proposal.replace('\nbegin;', '\n', 1).removesuffix('commit;\n')
script = '''begin;
revoke all on all functions in schema incargo_enterprise from public,anon,authenticated;
create or replace function incargo_enterprise.finance_release_enabled() returns boolean language sql immutable set search_path='' as $$select false$$;
''' + proposal + Path('panel/database/commercial-permissions.test.sql').read_text() + '\nrollback;\n'
subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i','incargo-enterprise-test','psql','-Xq','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], input=script, text=True, check=True, stdout=subprocess.DEVNULL)
