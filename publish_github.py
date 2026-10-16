"""Publish this static website using GitHub's API and the existing Git login."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', default='asdasas1212/kx-public-notes')
args = parser.parse_args()
if args.repo != 'asdasas1212/kx-public-notes':
    raise SystemExit('This publisher is restricted to the KX website repository.')
credential = subprocess.run(
    ['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
    capture_output=True, text=True, timeout=10, check=True,
    env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
token = fields.get('password')
if not token:
    raise SystemExit('No existing GitHub login is available.')
headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
           'User-Agent': 'KX-site-publisher', 'Content-Type': 'application/json',
           'X-GitHub-Api-Version': '2022-11-28'}
prefix = '/repos/' + args.repo


def api(path, method='GET', body=None):
    req = urllib.request.Request('https://api.github.com' + path, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('message', '')
        except (ValueError, OSError):
            message = ''
        raise RuntimeError(f'GitHub API {error.code}: {message}') from None


try:
    ref = api(prefix + '/git/ref/heads/main')
except RuntimeError as error:
    if not str(error).startswith(('GitHub API 404:', 'GitHub API 409:')):
        raise
    seed = api(prefix + '/contents/README.md', 'PUT', {
        'message': 'Initialize KX website repository', 'branch': 'main',
        'content': base64.b64encode((ROOT / 'README.md').read_bytes()).decode()})
    ref = {'object': {'sha': seed['commit']['sha']}}
parent_sha = ref['object']['sha']
parent = api(prefix + '/git/commits/' + parent_sha)
old_tree = api(prefix + '/git/trees/' + parent['tree']['sha'] + '?recursive=1')
if old_tree.get('truncated'):
    raise SystemExit('Remote tree is truncated; no changes published.')
old = {entry['path']: entry['sha'] for entry in old_tree['tree'] if entry['type'] == 'blob'}
paths = list((ROOT / 'docs').rglob('*'))
paths += [ROOT / name for name in ('README.md', 'build_site.py', '.gitignore', 'publish_github.py')]
tree, local_paths = [], set()
for path in sorted(paths):
    if path.is_symlink():
        raise SystemExit('Symlinks cannot be published: ' + str(path))
    if not path.is_file():
        continue
    relative = path.relative_to(ROOT).as_posix()
    local_paths.add(relative)
    data = path.read_bytes()
    sha = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if old.get(relative) == sha:
        continue
    entry = {'path': relative, 'mode': '100644', 'type': 'blob'}
    try:
        entry['content'] = data.decode('utf-8')
    except UnicodeDecodeError:
        blob = api(prefix + '/git/blobs', 'POST', {
            'encoding': 'base64', 'content': base64.b64encode(data).decode()})
        entry['sha'] = blob['sha']
    tree.append(entry)
for relative in old:
    if relative.startswith('docs/') and relative not in local_paths:
        tree.append({'path': relative, 'mode': '100644', 'type': 'blob', 'sha': None})
if not tree:
    print(json.dumps({'changed': False, 'commit': parent_sha}))
    raise SystemExit(0)
new_tree = api(prefix + '/git/trees', 'POST', {'base_tree': parent['tree']['sha'], 'tree': tree})
commit = api(prefix + '/git/commits', 'POST', {
    'message': 'Update KX notes and browser CSV audit tool', 'tree': new_tree['sha'],
    'parents': [parent_sha],
    'author': {'name': 'KX', 'email': 'kx-site@users.noreply.github.com'},
    'committer': {'name': 'KX', 'email': 'kx-site@users.noreply.github.com'}})
latest = api(prefix + '/git/ref/heads/main')['object']['sha']
if latest != parent_sha:
    raise SystemExit('The remote branch changed during upload; no branch update was made.')
api(prefix + '/git/refs/heads/main', 'PATCH', {'sha': commit['sha'], 'force': False})
print(json.dumps({'changed': True, 'commit': commit['sha'], 'files_changed': len(tree),
                  'repository': 'https://github.com/' + args.repo}))
