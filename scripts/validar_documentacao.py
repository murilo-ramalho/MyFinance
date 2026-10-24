#!/usr/bin/env python3
"""Verifica consistência básica dos artefatos de especificação, sem libs externas."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
errors = []
files = sorted((root / 'docs').glob('*.md'))
for md in [root / 'README.md', *files]:
    txt = md.read_text(encoding='utf-8')
    for target in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', txt):
        if target.startswith(('https://', 'http://', '#', 'mailto:')):
            continue
        link = target.split('#')[0]
        if link and not (md.parent / link).exists():
            errors.append(f'Broken link: {md.relative_to(root)} -> {target}')

uml = sorted((root / 'diagramas').glob('*.puml'))
if len(uml) != 15: errors.append(f'Expected 15 .puml files, got {len(uml)}')
for p in uml:
    t = p.read_text(encoding='utf8')
    if t.count('@startuml') != 1 or t.count('@enduml') != 1:
        errors.append(f'Invalid UML markers: {p.name}')

j = json.loads((root / 'docs/18-cenarios-de-aceite.json').read_text('utf8'))
examples={r['id']:r for r in j['examples']}
for key in ('OCT-01', 'NOV-01'):
    x=examples[key]
    if x['opening'] + x['inflow'] - x['outflow'] != x['expectedClosing']:
        errors.append(f'Wrong closing balance in {key}')
for key in ('PRINT-01','PRINT-02'):
    x=examples[key]
    if x['sale'] - x['productionCost'] != x['expectedGrossProfit']:
        errors.append(f'Wrong gross profit in {key}')
if examples['FOOD-01']['actual'] - examples['FOOD-01']['planned'] != examples['FOOD-01']['expectedDifference']:
    errors.append('Wrong budget difference')
if examples['REFUND-01']['purchaseMinor'] + examples['REFUND-01']['refundMinor'] != examples['REFUND-01']['expectedNetMinor']:
    errors.append('Wrong refund net')

print(f'Checks: {len(files)} docs, {len(uml)} UML, {len(j["examples"])} arithmetic fixtures')
if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print('PASS: local links, UML markers and arithmetic fixtures')
