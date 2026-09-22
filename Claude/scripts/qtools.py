"""Hilfen zum Schreiben von Fragen fuer Opal (packs/*.json).

Q(frage, antwort, [5 falsche], d, fact=..., alt=[...], typed=False) baut eine Frage im
Paketformat. write_pack schreibt ein neues Paket, add_sections haengt Bereiche an ein
bestehendes an, add_questions ergaenzt Fragen in einem bestehenden Bereich. Danach
formatiert Claude/scripts/format-packs.mjs alle Pakete im ueblichen Stil (eine Frage pro Zeile).
"""
import json
import os

PACKS = os.path.join(os.path.dirname(__file__), '..', '..', 'packs')


def Q(q, a, w, d, fact=None, alt=None, typed=None):
    assert len(w) == 5, (q, len(w))
    assert len(set(x.lower() for x in w)) == 5, (q, 'doppelt')
    assert a.lower() not in [x.lower() for x in w], (q, 'richtige bei falschen')
    # Reihenfolge wie in den bestehenden Paketen: q, a, w, alt, typed, fact, d
    out = {'q': q, 'a': a, 'w': w}
    if alt:
        out['alt'] = alt
    if typed is False:
        out['typed'] = False
    if fact:
        out['fact'] = fact
    out['d'] = d
    return out


def S(id, name, questions):
    return {'id': id, 'name': name, 'questions': questions}


def _path(pack_id):
    return os.path.join(PACKS, f'{pack_id}.json')


def write_pack(pack_id, name, desc, icon, hue, sections):
    pack = {'id': pack_id, 'name': name, 'desc': desc, 'icon': icon, 'hue': hue, 'sections': sections}
    with open(_path(pack_id), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)
    print(pack_id, sum(len(s['questions']) for s in sections), 'Fragen')


def _load(pack_id):
    with open(_path(pack_id), encoding='utf-8') as f:
        return json.load(f)


def _save(pack):
    with open(_path(pack['id']), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)


def add_sections(pack_id, sections):
    pack = _load(pack_id)
    have = {s['id'] for s in pack['sections']}
    for s in sections:
        assert s['id'] not in have, (pack_id, s['id'], 'gibt es schon')
        pack['sections'].append(s)
    _save(pack)
    print(pack_id, '+', len(sections), 'Bereiche,', sum(len(s['questions']) for s in sections), 'Fragen')


def add_questions(pack_id, section_id, questions):
    pack = _load(pack_id)
    section = next(s for s in pack['sections'] if s['id'] == section_id)
    have = {q['q'] for q in section['questions']}
    for q in questions:
        assert q['q'] not in have, (section_id, q['q'], 'gibt es schon')
        section['questions'].append(q)
    _save(pack)
    print(pack_id, section_id, '+', len(questions))
