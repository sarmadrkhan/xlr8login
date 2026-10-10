#!/usr/bin/bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Create the source tarball expected by packaging/xlr8login.spec
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n "s/^Version:[[:space:]]*//p" "${ROOT}/packaging/xlr8login.spec" | head -1)"
NAME="xlr8login-${VERSION}"
OUT="${ROOT}/${NAME}.tar.gz"

cd "${ROOT}"
make -s schemas

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
mkdir -p "${tmpdir}/${NAME}"

# Export tracked files when in git; otherwise copy the working tree.
if git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 && \
   git -C "${ROOT}" ls-files --error-unmatch README.md >/dev/null 2>&1; then
    git -C "${ROOT}" archive --format=tar --prefix="${NAME}/" HEAD | tar -x -C "${tmpdir}"
else
    rsync -a --exclude '.git' --exclude '*.tar.gz' --exclude '*.shell-extension.zip' \
        --exclude 'extension/schemas/gschemas.compiled' \
        --exclude '_destdir' --exclude 'build' \
        "${ROOT}/" "${tmpdir}/${NAME}/"
fi

tar -C "${tmpdir}" -czf "${OUT}" "${NAME}"
echo "Wrote ${OUT}"
