#!/usr/bin/env bash
# Gets a freshly booted Android emulator ready for the Maestro flows. The
# e2e-android workflow runs it inside android-emulator-runner, before it
# installs the APK. Each wait is bounded and names what did not happen.
#
# 1. Waits for sys.boot_completed and for the package manager to answer.
# 2. Turns off the system's crash and "isn't responding" dialogs.
# 3. Waits for a default network. The image's SDK setup app
#    (com.google.android.googlesdksetup) turns Wi-Fi on and adds the open
#    AndroidWifi network on first boot, so it is never disabled: disabling it
#    removes that network and leaves the device offline. Halfway through the
#    wait, it asks Wi-Fi to join AndroidWifi once.
# 4. Waits for the SDK setup app to finish, since its "isn't responding"
#    dialog can cover the app under test, then lets the device settle for 30
#    seconds.
set -euo pipefail

# On a failure, prints the network state and captures the logcat, which the
# flows line would otherwise capture, since a failure here ends the step.
on_exit() {
  local status=$?
  if [ "$status" != 0 ]; then
    echo "wifi_on: $(adb shell settings get global wifi_on 2>/dev/null | tr -d '\r')" >&2
    adb shell dumpsys connectivity 2>/dev/null | head -40 >&2 || true
    adb logcat -d > "${RUNNER_TEMP:-.}/logcat.txt" 2>/dev/null || true
  fi
}
trap on_exit EXIT

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
sdk_setup_done() { [ -z "$(adb shell pidof com.google.android.googlesdksetup 2>/dev/null | tr -d '\r')" ]; }

wait_for 150 error 'the device did not finish booting within 5 minutes' booted
wait_for 150 error 'the package manager did not answer within 5 minutes' package_manager

adb shell settings put global hide_error_dialogs 1

if ! wait_for 60 warning 'no default network after 2 minutes; asking Wi-Fi to join AndroidWifi' default_network; then
  adb shell cmd wifi connect-network AndroidWifi open || true
  wait_for 60 error 'the device has no default network after 4 minutes' default_network
fi
adb shell dumpsys connectivity | grep -E 'Active default network' || true

wait_for 90 warning 'the SDK setup app is still running after 3 minutes' sdk_setup_done || true

sleep 30
