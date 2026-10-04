"""Export only a validated release RPK and public verification metadata."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile


def prepare(certificate, certificate_sha256, source_commit, output):
    manifest = json.loads(Path('src/manifest.json').read_text())
    package = json.loads(Path('package.json').read_text())
    lock = json.loads(Path('package-lock.json').read_text())
    assert manifest['package'] == 'org.bandmetronome.app', 'Unexpected application ID'
    version = manifest['versionName']
    assert re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', version), 'Unsafe version'
    assert version == package['version'] == lock['version'] == lock['packages']['']['version'], 'Version mismatch'
    assert re.fullmatch(r'[0-9a-f]{40}', source_commit), 'Expected exact source commit'

    pem = Path(certificate).read_text()
    encoded = pem.split('-----BEGIN CERTIFICATE-----', 1)[1].split('-----END CERTIFICATE-----', 1)[0]
    der = base64.b64decode(''.join(encoded.split()), validate=True)
    assert hashlib.sha256(der).hexdigest() == certificate_sha256, 'Certificate identity changed'

    rpk = Path('dist') / f"{manifest['package']}.release.{version}.rpk"
    raw = rpk.read_bytes()
    # The toolkit embeds the DER certificate in the signed RPK block outside ZIP entries.
    assert der in raw, 'Expected signing certificate is missing from RPK'
    with zipfile.ZipFile(rpk) as archive:
        assert archive.testzip() is None, 'Corrupt archive'
        built = json.loads(archive.read('manifest.json'))
        for field in ['package', 'versionName', 'versionCode', 'router']:
            assert built[field] == manifest[field], f'Packaged {field} mismatch'
        for name in archive.namelist():
            assert not name.startswith('/') and '..' not in Path(name).parts, 'Unsafe archive path'
            assert not name.lower().endswith(('.pem', '.key', '.map')), 'Unexpected key or source-map file'
            content = archive.read(name)
            assert not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content), 'Private key in archive'
            assert not re.search(rb'/(?:Users|home)/[^/\s]+/', content), 'Local home path in archive'
        for route in manifest['router']['pages']:
            assert f'{route}/index.js' in archive.namelist(), 'Missing page'

    digest = hashlib.sha256(raw).hexdigest()
    destination = Path(output)
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(rpk, destination / rpk.name)
    (destination / 'SHA256SUMS').write_text(f'{digest}  {rpk.name}\n')
    metadata = {
        'package': manifest['package'], 'version': version,
        'versionCode': manifest['versionCode'], 'sourceCommit': source_commit,
        'file': rpk.name, 'sha256': digest,
        'certificateSha256': certificate_sha256,
        'mode': 'release', 'deviceValidation': 'pending',
    }
    (destination / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Validated release artifact: {rpk.name}')
    print(f'SHA-256: {digest}')
    print('Device validation is still required; this build does not publish to a store.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--certificate', required=True)
    parser.add_argument('--certificate-sha256', required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    prepare(args.certificate, args.certificate_sha256, args.source_commit, args.output)
