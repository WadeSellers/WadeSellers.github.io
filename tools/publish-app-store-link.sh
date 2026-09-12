#!/bin/bash
# Adds the App Store link for Name That Face to the project page and the
# homepage card. Run it when Apple approves the app:
#
#   ./tools/publish-app-store-link.sh "https://apps.apple.com/app/idXXXXXXXXX"
#
# Idempotent: running it twice changes nothing the second time.
set -euo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "usage: $0 <app-store-url>" >&2
  exit 1
fi
case "$URL" in
  https://apps.apple.com/*) ;;
  *) echo "that doesn't look like an App Store URL: $URL" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."

python3 - "$URL" <<'PY'
import sys
url = sys.argv[1]

# 1. Project page: lead the links with the App Store.
p = 'projects/names-and-faces.html'
s = open(p).read()
if 'apps.apple.com' in s:
    print(f'{p}: already has the link, skipping')
else:
    anchor = '<p><a href="/support/name-that-face.html">'
    assert anchor in s, f'{p}: link paragraph not found'
    badge = (f'<p><a href="{url}" target="_blank" rel="noopener">'
             '<strong>Download on the App Store &rarr;</strong></a></p>\n        ')
    s = s.replace(anchor, badge + anchor, 1)
    open(p, 'w').write(s)
    print(f'{p}: App Store link added')

# 2. Homepage card: say it's on the App Store instead of just "iOS".
p = 'index.html'
s = open(p).read()
old = '<h3>Name That Face</h3>'
assert old in s, f'{p}: card heading not found'
start = s.index(old)
end = s.index('</div>', start)
card = s[start:end]
if 'App Store' in card:
    print(f'{p}: card already updated, skipping')
else:
    new_card = card.replace('<span class="platform">iOS</span>',
                            '<span class="platform">iOS &middot; App Store</span>', 1)
    s = s[:start] + new_card + s[end:]
    open(p, 'w').write(s)
    print(f'{p}: card updated')
PY

echo
echo "Done. Review with 'git diff', then:"
echo "  git commit -am 'Name That Face is on the App Store' && git push"
