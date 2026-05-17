#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> ng build"
npx ng build

echo "==> ng deploy"
npx ng deploy --no-silent

echo "==> Build e deploy concluídos."
