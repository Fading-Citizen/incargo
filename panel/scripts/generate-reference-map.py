"""Manual build-time public dataset import. Never takes shipment data or runs in production."""
import json
from pathlib import Path
from urllib.request import urlopen
COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19'
BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' + COMMIT + '/geojson/'
def read(name):
    with urlopen(BASE + name + '.geojson',timeout=30) as response:
        return json.load(response)['features']
def point(coordinate):
    return [round(40+(coordinate[0]+83)*30,2),round(30+(14-coordinate[1])*34,2)]
country=next(f for f in read('ne_110m_admin_0_countries') if f['properties']['ADMIN']=='Colombia')
places=[f for f in read('ne_10m_populated_places') if f['properties']['ADM0NAME']=='Colombia']
outline=' '.join('M'+' L'.join(','.join(map(str,point(c))) for c in ring)+' Z' for ring in country['geometry']['coordinates'])
cities=[{'name':f['properties']['NAME'],'x':point(f['geometry']['coordinates'])[0],'y':point(f['geometry']['coordinates'])[1]} for f in places]
target=Path(__file__).resolve().parents[1]/'src/lib/colombia-reference.ts'
target.write_text('// Natural Earth public-domain reference geography. See panel/audit/maps-and-tracking.md.\nexport const colombiaOutline = '+json.dumps(outline)+';\nexport const referenceCities = '+json.dumps(cities,ensure_ascii=False)+';\n')
print(f'Generated local reference: {len(cities)} cities; public source commit {COMMIT}')
