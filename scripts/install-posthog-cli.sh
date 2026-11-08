#!/usr/bin/env bash
# Installs the posthog-cli binary that scripts/upload-native-sourcemaps.sh and
# the update workflows call to upload Hermes source maps, and checks it against
# scripts/posthog-cli.sha256 before anything runs it. EAS runs this as
# `eas-build-post-install`, and the upload script runs it again. With no POSTHOG_CLI_API_KEY the build uploads
# nothing, so the script skips and exits 0.
#
# @posthog/cli's postinstall is off (pnpm-workspace.yaml): its npm wrapper
# downloads the binary from releases.posthog.com with no checksum of its own.
# A binary that is not a regular file, a hash mismatch, or a host that the
# hash file does not list fails the build.
set -euo pipefail

key="${POSTHOG_CLI_API_KEY:-}"
if [ -z "${key//[[:space:]]/}" ]; then
  echo "POSTHOG_CLI_API_KEY is not set, so no source maps upload; posthog-cli is not installed."
  exit 0
fi

cd "$(dirname "$0")/.."
host="$(uname -s)-$(uname -m)"
want=$(awk -v host="$host" '$1 !~ /^#/ && $2 == host { print $1 }' scripts/posthog-cli.sha256)
if [ -z "$want" ]; then
  echo "no pinned posthog-cli hash for host '$host' (scripts/posthog-cli.sha256)" >&2
  exit 1
fi

node node_modules/@posthog/cli/install.js
bin=node_modules/@posthog/cli/node_modules/.bin_real/posthog-cli
if [ ! -f "$bin" ] || [ -L "$bin" ]; then
  echo "$bin is not a regular file (the path the CLI runs)" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$bin" | cut -d' ' -f1)
else
  got=$(shasum -a 256 "$bin" | cut -d' ' -f1)
fi
if [ "$got" != "$want" ]; then
  echo "posthog-cli binary hash mismatch for $host: got $got, pinned $want" >&2
  exit 1
fi
echo "posthog-cli binary verified: $got"
