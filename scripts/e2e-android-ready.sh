#!/usr/bin/env bash
# Gets a freshly booted Android emulator ready for the Maestro flows. The
# e2e-android workflow runs it inside android-emulator-runner, before it
# installs the APK. Each wait is bounded and names what did not happen.
#
# 1. Waits for sys.boot_completed and for the package manager to answer.
# 2. Turns off the system's crash and "isn't responding" dialogs, and
#    disables the image's SDK setup app, whose "isn't responding" dialog can
#    cover the app under test.
# 3. Waits for a default network. An emulator can boot with none, and the
#    app then shows "You're offline". After 60 seconds without one, it turns
#    Wi-Fi and mobile data off and on again, once.
# 4. Lets the device settle for 30 seconds.
set -euo pipefail

# A failure here ends the emulator step before the flows line, which would
# otherwise capture the logcat, so it is captured on the way out.
capture_logcat_on_failure() {
  local status=$?
  if [ "$status" != 0 ]; then adb logcat -d > "${RUNNER_TEMP:-.}/logcat.txt" 2>/dev/null || true; fi
}
trap capture_logcat_on_failure EXIT

# Runs a check every 2 seconds, up to a limit; on a timeout prints an
# annotation of the given level (error or warning) and fails.
wait_for() {
  local tries=$1 level=$2 what=$3
  shift 3
  for _ in $(seq 1 "$tries"); do
    if "$@"; then return 0; fi
    sleep 2
  done
  echo "::$level::$what" >&2
  return 1
}

booted() { [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; }
package_manager() { adb shell pm path android > /dev/null 2>&1; }
# The output is read whole before grep, so grep -q closing the pipe early
# cannot fail the check under pipefail.
default_network() {
  local state
  state=$(adb shell dumpsys connectivity 2>/dev/null) || return 1
  grep -qE 'Active default network: [0-9]+' <<< "$state"
}

wait_for 150 error 'the device did not finish booting within 5 minutes' booted
wait_for 150 error 'the package manager did not answer within 5 minutes' package_manager

adb shell settings put global hide_error_dialogs 1
adb shell pm disable-user --user 0 com.google.android.googlesdksetup > /dev/null 2>&1 || true

if ! wait_for 30 warning 'no default network after 60 seconds; restarting Wi-Fi and mobile data' default_network; then
  adb shell svc wifi disable || true
  adb shell svc data disable || true
  sleep 2
  adb shell svc wifi enable || true
  adb shell svc data enable || true
  wait_for 60 error 'the device has no default network' default_network
fi
adb shell dumpsys connectivity | grep -E 'Active default network' || true

sleep 30
