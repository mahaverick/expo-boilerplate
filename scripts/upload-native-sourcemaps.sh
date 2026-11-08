#!/usr/bin/env bash
# Uploads the Hermes source map of a finished EAS build to PostHog, with the
# two posthog-cli calls that the posthog-react-native/expo plugin's Gradle and
# Xcode steps make: `hermes clone` copies the chunk ID from the packager's map
# into the composed map, then `hermes upload` sends the composed map. The app
# config carries no PostHog plugin, because a plugin that only a build can see
# the key for would give the build a fingerprint that no update shares.
#
# EAS runs it twice:
# - `prepare`, from eas-build-post-install: on iOS, react-native-xcode.sh
#   deletes the packager's map after composing, and the composed map carries
#   no chunk ID. This rewrites that line to move the map to
#   "$SOURCEMAP_FILE.packager" instead.
# - with no argument, from eas-build-on-success: the upload.
#
# With no POSTHOG_CLI_API_KEY, or no SOURCEMAP_FILE (eas.json sets it for the
# preview and production profiles only), it does nothing and exits 0. With
# both set, an empty POSTHOG_CLI_PROJECT_ID fails the build in either mode, so
# `prepare` stops it before the native compile. A missing map or release field
# fails the upload.
set -euo pipefail

mode="${1:-upload}"
key="${POSTHOG_CLI_API_KEY:-}"
if [ -z "${key//[[:space:]]/}" ]; then
  echo "POSTHOG_CLI_API_KEY is not set, so no native source maps upload."
  exit 0
fi
if [ -z "${SOURCEMAP_FILE:-}" ]; then
  echo "SOURCEMAP_FILE is not set, so this build profile uploads no native source maps."
  exit 0
fi
project="${POSTHOG_CLI_PROJECT_ID:-}"
if [ -z "${project//[[:space:]]/}" ]; then
  echo "POSTHOG_CLI_PROJECT_ID is not set, and POSTHOG_CLI_API_KEY is. Set POSTHOG_CLI_PROJECT_ID in this build's EAS environment, or remove the key to upload no source maps." >&2
  exit 1
fi
platform="${EAS_BUILD_PLATFORM:-}"
if [ "$platform" != ios ] && [ "$platform" != android ]; then
  echo "EAS_BUILD_PLATFORM must be ios or android. Got \"$platform\"." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [ "$mode" = prepare ]; then
  if [ "$platform" != ios ]; then
    exit 0
  fi
  xcode="${REACT_NATIVE_XCODE:-$(node --print "require('path').join(require('path').dirname(require.resolve('react-native/package.json')), 'scripts/react-native-xcode.sh')")}"
  # shellcheck disable=SC2016 # the line to match names the variable literally
  pattern='^\([[:space:]]*\)rm "\$PACKAGER_SOURCEMAP_FILE"$'
  if [ "$(grep -c "$pattern" "$xcode" || true)" != 1 ]; then
    echo "$xcode has no single line that deletes \$PACKAGER_SOURCEMAP_FILE to rewrite" >&2
    exit 1
  fi
  sed -i.orig "s|$pattern|\\1mv \"\$PACKAGER_SOURCEMAP_FILE\" \"\$SOURCEMAP_FILE.packager\"|" "$xcode"
  rm "$xcode.orig"
  echo "react-native-xcode.sh keeps the packager's source map at $SOURCEMAP_FILE.packager."
  exit 0
fi
if [ "$mode" != upload ]; then
  echo "unknown mode \"$mode\": expected prepare, or no argument to upload" >&2
  exit 1
fi

bash scripts/install-posthog-cli.sh
bin=node_modules/@posthog/cli/node_modules/.bin_real/posthog-cli
version=$(node --print "require('./package.json').version")

if [ "$platform" = android ]; then
  # react-native's Gradle plugin writes both maps here for the release variant.
  minified=android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map
  composed=android/app/build/generated/sourcemaps/react/release/index.android.bundle.map
  name=$(sed -n "s/^[[:space:]]*applicationId[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" android/app/build.gradle | head -n 1)
  build=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]*\([0-9][0-9]*\).*/\1/p' android/app/build.gradle | head -n 1)
else
  minified="$SOURCEMAP_FILE.packager"
  composed="$SOURCEMAP_FILE"
  name=$(grep -ho 'PRODUCT_BUNDLE_IDENTIFIER = [^;]*' ios/*.xcodeproj/project.pbxproj | sed 's/^PRODUCT_BUNDLE_IDENTIFIER = //; s/"//g' | sort -u)
  plists=$(find ios -maxdepth 2 -name Info.plist -not -path 'ios/Pods/*')
  if [ "$(printf '%s\n' "$plists" | grep -c .)" != 1 ]; then
    echo "expected one app Info.plist under ios/, found: ${plists:-none}" >&2
    exit 1
  fi
  build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plists")
fi

for field in "name=$name" "build=$build"; do
  value="${field#*=}"
  if [ -z "$value" ] || [ "$(printf '%s\n' "$value" | grep -c .)" != 1 ] || [[ "$value" == *'$'* ]]; then
    echo "could not read one release ${field%%=*} for $platform: got \"$value\"" >&2
    exit 1
  fi
done
for map in "$minified" "$composed"; do
  if [ ! -f "$map" ]; then
    echo "no Hermes source map at $map, so nothing can upload for $platform" >&2
    exit 1
  fi
done

# The upload sends every map in its directory, so the composed map goes alone into a new one.
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cp "$composed" "$dir/"
release=(--release-name "$name" --release-version "$version" --build "$build")
"$bin" hermes clone --minified-map-path "$minified" --composed-map-path "$dir/$(basename "$composed")" "${release[@]}"
"$bin" hermes upload --directory "$dir" "${release[@]}"
echo "uploaded the $platform Hermes source map for $name $version ($build)."
