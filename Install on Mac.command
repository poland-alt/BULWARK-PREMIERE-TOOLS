#!/bin/bash
# Installs the Bulwark Premiere Tools panel for the current user. Quit Premiere Pro first.
cd "$(dirname "$0")" || exit 1
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$DEST"
rm -rf "$DEST/com.bulwark.captiontools"      # the old separate caption panel: it is a tab in the one panel now
for p in com.bulwark.reformat; do
  rm -rf "$DEST/$p"
  cp -R "panels/$p" "$DEST/$p" || { echo "Could not copy $p"; exit 1; }
  xattr -dr com.apple.quarantine "$DEST/$p" 2>/dev/null
done
# The panels are unsigned, so Premiere needs its developer flag to load them.
for v in 10 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo
echo "Installed. Open Premiere Pro, then Window > Extensions > Bulwark Premiere Tools."
echo "You can close this window."
