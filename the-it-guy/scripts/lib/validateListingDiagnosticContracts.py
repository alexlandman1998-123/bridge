import json,re,subprocess,sys,tempfile
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'fixtures'/'listing-diagnostic'
spec=json.loads((p/'property24-v55.json').read_text());schemas=spec['components']['schemas']
def validate(value,s,path='$'):
 if value is None and s.get('nullable'): return []
 if '$ref' in s: return validate(value,schemas[s['$ref'].split('/')[-1]],path)
 errors=[];t=s.get('type')
 good={'object':isinstance(value,dict),'array':isinstance(value,list),'string':isinstance(value,str),'number':isinstance(value,(int,float)) and not isinstance(value,bool),'integer':isinstance(value,(int,float)) and not isinstance(value,bool) and float(value).is_integer(),'boolean':isinstance(value,bool)}
 if t and not good[t]: return [f'{path}: expected {t}, got {value!r}']
 if 'enum' in s and value not in s['enum']: errors.append(f'{path}: invalid enum {value!r}')
 if t=='object':
  props=s.get('properties',{})
  errors += [f'{path}.{k}: required' for k in s.get('required',[]) if k not in value]
  for k,v in value.items():
   if k in props: errors+=validate(v,props[k],path+'.'+k)
   elif s.get('additionalProperties') is False: errors.append(f'{path}.{k}: extra field')
 if t=='array':
  for i,v in enumerate(value):errors+=validate(v,s.get('items',{}),f'{path}[{i}]')
 if t=='string':
  if len(value)<s.get('minLength',0):errors.append(f'{path}: too short')
  if s.get('format')=='date-time' and not re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d',value):errors.append(f'{path}: invalid date-time shape')
 return errors

# The JSON check deliberately checks structure, not undocumented business rules.
# XML validation uses the vendor's full XSD, including order, required fields and enums.
wsdl=(p/'private-property.wsdl').read_text()
namespaces=' '.join(re.findall(r'xmlns(?::\w+)?="[^"]+"',wsdl.split('<wsdl:types>')[0]))
results=[]
with tempfile.TemporaryDirectory(prefix='listing-contract-') as tmp:
 work=Path(tmp)
 for i,s in enumerate(re.findall(r'<s:schema\b.*?</s:schema>',wsdl,re.S)):
  s=s.replace('<s:schema ',f'<s:schema {namespaces} ',1)
  s=s.replace('<s:import namespace="http://microsoft.com/wsdl/types/" />','<s:import namespace="http://microsoft.com/wsdl/types/" schemaLocation="guid.xsd" />')
  (work/('listing.xsd' if i==0 else 'guid.xsd')).write_text(s)
 for i,row in enumerate(json.load(sys.stdin)):
  xml='<UpdateListing xmlns="http://tempuri.org/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'+row['xml']+'</UpdateListing>'
  target=work/f'case-{i}.xml';target.write_text(xml)
  cp=subprocess.run(['xmllint','--nonet','--noout','--schema',str(work/'listing.xsd'),str(target)],capture_output=True,text=True)
  results.append({'id':row['id'],'property24':validate(row['payload'],schemas['Listing']),'private_property':[] if cp.returncode==0 else [cp.stderr.replace(str(work)+'/','')]})
print(json.dumps(results))
