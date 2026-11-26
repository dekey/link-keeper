#!/usr/bin/env bash
# Builds, tests and publishes a GitHub release for TAG, with plugin/main.js,
# plugin/manifest.json and dist/link-keeper.zip as downloads.
# Before it builds, it stops unless:
#   - TAG is the same as "version" in manifest.json (Obsidian needs that);
#   - the checked-out commit is TAG and there are no uncommitted or untracked files;
#   - TAG on GitHub (remote "origin") points to the same commit.
# Then it runs `make test zip` itself, so the files always come from the tagged
# code, and nothing is published when a test fails.
# If TAG already has a release, its files are replaced in place (the release is
# not deleted first), so a failed upload leaves the release there and running
# the script again finishes it. The git tag itself is kept.
# Release notes come from docs/releases/TAG.md when that file exists (also for
# an existing release); otherwise GitHub writes them from the commits when the
# release is created, and they stay as they are on a re-run.
#
# Usage: scripts/release.sh TAG
# Needs: make, zip, the Deno version that CI uses (deno-version in
# .github/workflows/ci.yml), origin on GitHub with the tag pushed, and the gh CLI
# logged in with rights to write releases (contents: write).
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/release.sh TAG" >&2
  exit 1
fi
tag="$1"
cd "$(dirname "$0")/.."
files=(plugin/main.js plugin/manifest.json dist/link-keeper.zip)

version="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -n 1)"
if [ "$version" != "$tag" ]; then
  echo "release.sh: tag $tag is not the version in manifest.json ($version): Obsidian needs them equal" >&2
  exit 1
fi

# Build with the same Deno as CI, so the uploaded main.js is bundled the way CI tests it.
# The value may be quoted, start with "v" or have a comment after it: keep only the version.
ci_deno="$(sed -E -n 's/^[[:space:]]*deno-version:[[:space:]]*["'"'"']?v?([0-9][^"'"'"'[:space:]#]*).*/\1/p' .github/workflows/ci.yml | head -n 1)"
local_deno="$(deno --version | awk 'NR == 1 { print $2 }')"
if [ "$local_deno" != "$ci_deno" ]; then
  echo "release.sh: Deno $local_deno is not the Deno $ci_deno that CI tests with: install it, run again" >&2
  exit 1
fi

# owner/repo of a GitHub URL, or nothing for any other URL. An SSH host alias from
# ~/.ssh/config (git@github-work:owner/repo.git) counts when it points at github.com.
github_repo() {
  local url="$1" host
  if [[ "$url" =~ ^git@([^:]+):(.+)$ ]]; then
    # "--": a host that starts with "-" is a host name, not an ssh option.
    host="$(ssh -G -- "${BASH_REMATCH[1]}" 2>/dev/null | awk '$1 == "hostname" { print $2 }')"
    if [ "$host" = "github.com" ]; then url="git@github.com:${BASH_REMATCH[2]}"; fi
  fi
  sed -E -n 's#^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)([^/]+/[^/]+)$#\2#p' <<<"$url" |
    sed 's/\.git$//'
}

# The GitHub repository of origin. Every gh call gets it, so the tag check (on origin) and the
# release always go to the same repository, also in a clone with more remotes. The URL as
# written first, then as git rewrites it (insteadOf short names like gh:owner/repo).
origin_url="$(git config --get remote.origin.url || true)"
repo="$(github_repo "$origin_url")"
if [ -z "$repo" ]; then
  repo="$(github_repo "$(git remote get-url origin 2>/dev/null || true)")"
fi
if [ -z "$repo" ]; then
  echo "release.sh: origin ($origin_url) is not a GitHub repository" >&2
  exit 1
fi

tag_commit="$(git rev-parse --verify --quiet "refs/tags/$tag^{commit}" || true)"
if [ -z "$tag_commit" ]; then
  echo "release.sh: there is no tag $tag here" >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$tag_commit" ]; then
  echo "release.sh: the checked-out commit is not tag $tag: check out the tag, run again" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "release.sh: uncommitted or untracked files: commit or remove them, run again" >&2
  git status --short >&2
  exit 1
fi

remote_refs="$(git ls-remote origin "refs/tags/$tag" "refs/tags/$tag^{}")"
# An annotated tag has a second line, "<commit> refs/tags/TAG^{}": the commit it points to.
remote_commit="$(awk -v ref="refs/tags/$tag^{}" '$2 == ref { print $1 }' <<<"$remote_refs")"
if [ -z "$remote_commit" ]; then
  remote_commit="$(awk -v ref="refs/tags/$tag" '$2 == ref { print $1 }' <<<"$remote_refs")"
fi
if [ -z "$remote_commit" ]; then
  echo "release.sh: tag $tag is not on GitHub yet: git push origin $tag" >&2
  exit 1
fi
if [ "$remote_commit" != "$tag_commit" ]; then
  echo "release.sh: tag $tag on GitHub is another commit than here: git push -f origin $tag" >&2
  exit 1
fi

# Before the long build: can gh see the repository (a private repo it has no access to looks
# like "release not found" below), and does the release exist?
if ! repo_error="$(gh repo view "$repo" --json name 2>&1 >/dev/null)"; then
  echo "release.sh: gh cannot reach $repo: $repo_error" >&2
  exit 1
fi
# Any gh error other than "release not found" (not logged in, no network) stops it here too.
if view_error="$(gh release view "$tag" --repo "$repo" 2>&1 >/dev/null)"; then
  release_exists=yes
elif grep -q "release not found" <<<"$view_error"; then
  release_exists=no
else
  echo "release.sh: gh release view failed: $view_error" >&2
  exit 1
fi

# set -e stops the script here when the build or a test fails.
make test zip

notes_file="docs/releases/$tag.md"
if [ -f "$notes_file" ]; then
  notes=(--notes-file "$notes_file")
else
  notes=(--generate-notes)
fi

if [ "$release_exists" = yes ]; then
  echo "Release $tag already exists: replacing its files."
  gh release upload "$tag" "${files[@]}" --clobber --repo "$repo"
  if [ -f "$notes_file" ]; then
    gh release edit "$tag" --notes-file "$notes_file" --repo "$repo"
  fi
else
  gh release create "$tag" "${files[@]}" \
    --repo "$repo" \
    --title "$tag" \
    "${notes[@]}" \
    --verify-tag
fi

echo "Release $tag published with: ${files[*]}"
