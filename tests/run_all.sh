#!/bin/sh
# Rigenera le pagine e lancia tutti i test (parser e browser headless).
set -e
cd "$(dirname "$0")/.."
python3 build.py
python3 build.py --artifact >/dev/null
python3 -m unittest discover -s tests
if [ -z "$NODE_PATH" ] && [ -d /opt/node22/lib/node_modules ]; then export NODE_PATH=/opt/node22/lib/node_modules; fi
node tests/browser_test.cjs "${1:-}"
