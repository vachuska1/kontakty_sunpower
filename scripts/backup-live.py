#!/usr/bin/env python3
"""Read-only GET backup. Never imports application code or writes to a server."""
import argparse
import re
import datetime
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://kontaktysunpower.vercel.app/api/contacts'



def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default='2026-10-16')
    label = parser.parse_args().label
    if not re.fullmatch(r'[A-Za-z0-9_-]+', label):
        raise SystemExit('Invalid backup label')
    folder = ROOT / 'backups'
    full = folder / f'live-contacts-before-id-repair-{label}.json'
    array = folder / f'live-contacts-array-before-id-repair-{label}.json'
    manifest = folder / f'live-contacts-backup-manifest-{label}.json'
    if any(p.exists() for p in (full, array, manifest)):
        raise SystemExit('Refusing to overwrite an existing backup; verify existing files instead.')
    request = urllib.request.Request(URL, method='GET', headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
        status = response.status
    data = json.loads(raw)
    contacts = data['contacts']
    if not isinstance(contacts, list):
        raise SystemExit('Response does not contain a contacts array')
    full.parent.mkdir(exist_ok=True)
    with full.open('xb') as handle:
        handle.write(raw)
    array_raw = (json.dumps(contacts, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    with array.open('xb') as handle:
        handle.write(array_raw)
    assert full.read_bytes() == raw
    assert json.loads(full.read_bytes()) == data
    assert json.loads(array.read_bytes()) == contacts
    nonempty = [c.get('id') for c in contacts if c.get('id')]
    affected = [c for c in contacts if not c.get('id')]
    summary = {
        'url': URL, 'method': 'GET', 'httpStatus': status,
        'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'files': [{'path': str(p.relative_to(ROOT)), 'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size} for p in (full, array)],
        'contacts': len(contacts), 'emptyIds': len(affected), 'validIds': len(nonempty),
        'duplicateNonemptyIds': len(nonempty) - len(set(nonempty)),
        'contactsWithHistory': sum(bool(c.get('history')) for c in contacts),
        'historyRecords': sum(len(c.get('history', [])) for c in contacts),
        'responseKeys': list(data), 'updatedAt': data.get('updatedAt'),
        'roundTripVerified': True, 'rawResponsePreserved': True,
        'affectedAllNoAnswer': all(c.get('status') == 'no-answer' for c in affected),
        'affectedAllExpectedCalledAt': all(c.get('calledAt') == '2026-10-16T08:12:12.997Z' for c in affected),
        'affectedAllEightHistoryRecords': all(len(c.get('history', [])) == 8 for c in affected),
        'affectedHistoriesIdentical': len({json.dumps(c.get('history'), sort_keys=True, ensure_ascii=False) for c in affected}) == 1,
    }
    with manifest.open('x', encoding='utf-8') as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    assert (summary['contacts'], summary['emptyIds'], summary['historyRecords'], summary['contactsWithHistory']) == (178, 14, 209, 82), 'Live snapshot differs from expected state; STOP and review backup.'
    assert summary['duplicateNonemptyIds'] == 0


if __name__ == '__main__':
    main()
