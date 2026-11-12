#!/usr/bin/env bash
# Gets a freshly booted Android emulator ready for the Maestro flows. The
# e2e-android workflow runs it inside android-emulator-runner, before it
# installs the APK. Each wait is bounded and names what did not happen, and
# each adb call has its own timeout, so one hung call cannot run to the
# step's limit.
#
# 1. Waits for sys.boot_completed and for the package manager to answer.
# 2. Turns off the system's crash and "isn't responding" dialogs.
# 3. Waits for the network. The image's SDK setup app
#    (com.google.android.googlesdksetup) turns Wi-Fi on and adds the open
#    AndroidWifi network on first boot, so it is never disabled: disabling it
#    removes that network and leaves the device offline. Ready means Wi-Fi is
#    connected to AndroidWifi or the default network is validated. Halfway
#    through, it asks Wi-Fi to join AndroidWifi once. If neither shows within
#    the bound but a default network exists, it warns and goes on.
# 4. Waits up to 60 seconds for the SDK setup process to be gone or cached,
#    since an app still at work can stop responding over the app under test.
#    Android keeps a finished app's process cached, so cached counts as done.
#    The process counts as gone only when the process list has `Proc #` lines
#    and none names it, so a list in another format never reads as done. It
#    prints what it saw: gone, cached, active or an unknown format.
# 5. Lets the device settle for 30 seconds, then requires a default network
#    within 30 seconds, since Wi-Fi can be connected to AndroidWifi before
#    that network is the default. It prints how long it all took.
set -euo pipefail

# Runs adb with a 30-second limit.
adb_() { timeout 30 adb "$@"; }

# On a failure, prints the network state and captures the logcat, which the
# flows line would otherwise capture, since a failure here ends the step.
on_exit() {
  local status=$?
  if [ "$status" != 0 ]; then
    echo "wifi_on: $(adb_ shell settings get global wifi_on 2>/dev/null | tr -d '\r')" >&2
    adb_ shell dumpsys connectivity 2>/dev/null | head -40 >&2 || true
    timeout 60 adb logcat -d > "${RUNNER_TEMP:-.}/logcat.txt" 2>/dev/null || true
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

# Each check reads its adb output whole, so grep -q closing a pipe early
# cannot fail it under pipefail, and a failed adb call counts as "not yet".
booted() {
  local value
  value=$(adb_ shell getprop sys.boot_completed 2>/dev/null) || return 1
  [ "$(tr -d '\r' <<< "$value")" = 1 ]
}
package_manager() { adb_ shell pm path android > /dev/null 2>&1; }
connectivity() { adb_ shell dumpsys connectivity 2>/dev/null; }
default_network() {
  local state
  state=$(connectivity) || return 1
  grep -qE 'Active default network: [0-9]+' <<< "$state"
}
network_ready() {
  local wifi state
  if wifi=$(adb_ shell cmd wifi status 2>/dev/null) && grep -q 'connected to "AndroidWifi"' <<< "$wifi"; then
    return 0
  fi
  state=$(connectivity) || return 1
  grep -qE 'Active default network: [0-9]+' <<< "$state" && grep -q 'VALIDATED' <<< "$state"
}
# Sets sdk_setup to what the last look saw.
sdk_setup='not read'
sdk_setup_settled() {
  local processes line
  processes=$(adb_ shell dumpsys activity processes 2>/dev/null) || return 1
  if ! grep -q 'Proc #' <<< "$processes"; then
    sdk_setup='unknown: the process list has no "Proc #" line'
    return 1
  fi
  line=$(grep -E 'Proc #.*com\.google\.android\.googlesdksetup' <<< "$processes" || true)
  if [ -z "$line" ]; then
    sdk_setup=gone
  elif grep -qE ' cch|CACHED' <<< "$line"; then
    sdk_setup=cached
  else
    sdk_setup=active
    return 1
  fi
}

wait_for 150 error 'the device did not finish booting within 5 minutes' booted
wait_for 150 error 'the package manager did not answer within 5 minutes' package_manager

# With these off, an app that stops responding or crashes is killed with no
# dialog, so a crash of the app under test shows only in the logcat.
adb_ shell settings put global hide_error_dialogs 1

if ! wait_for 45 warning 'the network is not ready after 90 seconds; asking Wi-Fi to join AndroidWifi' network_ready; then
  adb_ shell cmd wifi connect-network AndroidWifi open || true
  if ! wait_for 45 warning 'the network is still not ready after 3 minutes' network_ready; then
    wait_for 15 error 'the device has no default network after 3.5 minutes' default_network
  fi
fi
connectivity | grep -E 'Active default network' || true
echo "network ready after ${SECONDS} s"

wait_for 30 warning 'the SDK setup app is not gone or cached after 60 seconds' sdk_setup_settled || true
echo "SDK setup app: ${sdk_setup}"

sleep 30
wait_for 15 error 'the device has no default network 30 seconds after the settle' default_network
connectivity | grep -E 'Active default network' || true
echo "device ready after ${SECONDS} s"
