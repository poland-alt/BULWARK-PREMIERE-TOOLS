#!/bin/bash
# Installs the Bulwark Premiere panels for the current user. Quit Premiere Pro first.
cd "$(dirname "$0")" || exit 1
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$DEST"
for p in com.bulwark.reformat com.bulwark.captiontools; do
  rm -rf "$DEST/$p"
  cp -R "panels/$p" "$DEST/$p" || { echo "Could not copy $p"; exit 1; }
done
# The panels are unsigned, so Premiere needs its developer flag to load them.
for v in 10 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo
echo "Installed. Open Premiere Pro, then Window > Extensions > Bulwark Vertical Reformat"
echo "(and Bulwark Caption Tools). You can close this window."
