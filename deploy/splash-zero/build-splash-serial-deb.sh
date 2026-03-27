#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
DIST_DIR="${SCRIPT_DIR}/dist"
PKG_ROOT="${BUILD_DIR}/pkgroot"
DEBIAN_DIR="${PKG_ROOT}/DEBIAN"
BIN_DIR="${PKG_ROOT}/usr/bin"
ETC_DIR="${PKG_ROOT}/etc/splash"
UNIT_DIR="${PKG_ROOT}/lib/systemd/system"

VERSION="${1:-0.0.0-dev}"
STAGE_ONLY="${2:-}"
PACKAGE_NAME="splash-serial"
ARCH="armhf"
PACKAGE_PATH="${DIST_DIR}/${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

rm -rf "${PKG_ROOT}"
mkdir -p "${DEBIAN_DIR}" "${BIN_DIR}" "${ETC_DIR}" "${UNIT_DIR}" "${DIST_DIR}"
rm -f "${PACKAGE_PATH}"

cat > "${DEBIAN_DIR}/control" <<EOF
Package: ${PACKAGE_NAME}
Version: ${VERSION}
Section: net
Priority: optional
Architecture: ${ARCH}
Maintainer: Devin Rader <devin@rader.haus>
Depends: systemd
Description: Splash RS-485 serial transport service
 Splash serial transport daemon for splash-zero. It owns the RS-485 adapter,
 publishes raw transport events to NATS, and exposes local health and metrics.
EOF

install -m 0644 "${SCRIPT_DIR}/debian/conffiles" "${DEBIAN_DIR}/conffiles"
install -m 0755 "${SCRIPT_DIR}/debian/postinst" "${DEBIAN_DIR}/postinst"
install -m 0755 "${SCRIPT_DIR}/debian/prerm" "${DEBIAN_DIR}/prerm"

echo "Building splash-serial for linux/arm/v7..."
(
  cd "${REPO_ROOT}/services/splash-serial"
  GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 \
    go build -o "${BIN_DIR}/splash-serial" ./cmd/splash-serial
)

install -m 0644 "${SCRIPT_DIR}/splash-serial.env.example" \
  "${ETC_DIR}/splash-serial.env"
install -m 0644 "${SCRIPT_DIR}/splash-serial.service" \
  "${UNIT_DIR}/splash-serial.service"

cat <<EOF
Staged Debian package filesystem in:
  ${PKG_ROOT}
EOF

if [[ "${STAGE_ONLY}" == "--stage-only" ]]; then
  cat <<EOF
Skipping .deb build because --stage-only was requested.

If you later install dpkg-deb, run:
  ./deploy/splash-zero/build-splash-serial-deb.sh ${VERSION}
EOF
  exit 0
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
  cat <<EOF
dpkg-deb is not available on this machine.

The package filesystem has been staged in:
  ${PKG_ROOT}

To build the final package, run this script on a machine with dpkg-deb or use:
  ./deploy/splash-zero/build-splash-serial-deb.sh ${VERSION} --stage-only
EOF
  exit 0
fi

dpkg-deb --build "${PKG_ROOT}" "${PACKAGE_PATH}"

cat <<EOF
Built Debian package:
  ${PACKAGE_PATH}
EOF
