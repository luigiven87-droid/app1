#!/bin/sh
# Rigenera la pagina e lancia tutti i test (parser, punteggio, browser headless).
set -e
cd "$(dirname "$0")/.."
python3 build.py
python3 -m unittest discover -s tests
node tests/test_scoring.cjs
if [ -z "$NODE_PATH" ] && [ -d /opt/node22/lib/node_modules ]; then export NODE_PATH=/opt/node22/lib/node_modules; fi
node tests/browser_test.cjs "${1:-}"
