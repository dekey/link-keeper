#!/usr/bin/env bash
# Publishes a GitHub release for TAG with the given files as downloads.
# If TAG already has a release, that release is deleted and created again,
# so it always holds the files built from the tag. The git tag itself is kept.
#
# Usage: scripts/release.sh TAG FILE...
# Needs: gh CLI, GH_TOKEN allowed to write releases (contents: write).
# The tag must already exist on GitHub (--verify-tag).
set -euo pipefail

tag="${1:?usage: scripts/release.sh TAG FILE...}"
shift
if [ "$#" -eq 0 ]; then
  echo "release.sh: no files to upload" >&2
  exit 1
fi
for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "release.sh: file not found: $file" >&2
    exit 1
  fi
done

if gh release view "$tag" >/dev/null 2>&1; then
  echo "Release $tag already exists: rewriting it."
  gh release delete "$tag" --yes
fi

gh release create "$tag" "$@" \
  --title "$tag" \
  --generate-notes \
  --verify-tag

echo "Release $tag published with: $*"
