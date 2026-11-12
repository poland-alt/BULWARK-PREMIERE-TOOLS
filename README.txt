BULWARK PREMIERE TOOLS - v1.4 test build
========================================

WHAT'S NEW IN v1.4
------------------
 - Centre people on their faces (Mac only). The panel looks at a few frames of
   each camera, finds the face, and slides that camera sideways so the person
   sits in the middle of their window: full-screen singles, the speaker over
   media, 3-UP / PIP windows, and the stacked wide the panel builds.
   It runs after "Make vertical version" (tick box, on by default) and from
   the button "Centre people in the open vertical sequence", which you can
   press again any time after a recut.

WHAT'S NEW IN v1.3
------------------
v1.3 puts the two test branches together: everything from v1.1.1 (below) plus
 - A layout for each piece of media. If the sequence has more than one piece
   of media, each is listed with its timecode: 2-up, 3-UP, PIP or Full.
 - "Full": media full screen over a blurred copy of itself.
 - A toggle button that does the same for any selected image, in any sequence.
 - Full-screen images with no background plate get the blurred copy
   automatically (there is a tick box to turn that off).
 - TNL now picks the NEXT-LEVEL 9x16 end card by show, with no warning.
The v1.1.1 camera-nest fix has now been tested in Premiere (camera nests
inside the wide are stacked; an empty wide leaves a centre crop and says so).

FROM v1.1.1 (fix for "WS has 0 camera track")
--------------------------------------------
Problem: in v1.1, Vertical Reformat could report
    "WS" has 0 camera track; a stacked vertical needs 2 or 3,
    so "WS VERT" was left unarranged.
followed by "Could not place the vertical wide shot" at every wide shot.
This happened when the wide nest (e.g. "WS") holds the camera NESTS (or a
multicam) instead of the camera video files. The panel was throwing those
nests away, so the vertical wide came out empty.

Fixed:
 - Horizontal nested sequences inside the wide nest now count as cameras.
   Graphics, stills and vertical nests are still ignored.
 - The camera list in the panel uses the same rule, so camera nests show up.
 - If a wide nest really has no cameras in it, the panel no longer drops an
   empty nest on the timeline. It leaves the wide shots as a centre crop
   and says so under "Check these".

If you already ran v1.1 on a project: delete the "<sequence> VERT"
sequence and any "WS VERT" / "WS VERT 2" nests it made, then run again.
Only the Vertical Reformat panel changed. Caption Tools is the same.

Two Premiere Pro panels:

  Bulwark Vertical Reformat   turns a finished 16x9 sequence into a 9x16 one
  Bulwark Caption Tools       sets the outline width on many captions at once

Tested on Premiere Pro 2027 (27.0) on Mac.


INSTALL (Mac) - about one minute
--------------------------------
1. Quit Premiere Pro.
2. Unzip "Bulwark Premiere Tools v1.4.zip" (double-click it in Downloads).
3. Open the "Bulwark Premiere Tools" folder.
4. Right-click "Install on Mac.command" and choose Open, then Open again.
   (Double-clicking is blocked by macOS because the file came from the internet.
   If it says it can't be opened, go to System Settings > Privacy & Security,
   scroll down and click "Open Anyway".)
5. A Terminal window says "Installed." You can close it.
6. Open Premiere Pro, then Window > Extensions > Bulwark Vertical Reformat
   (and Window > Extensions > Bulwark Caption Tools).

Updating from an earlier version: just run the installer again. It replaces
the old panels. Restart Premiere afterwards.

Manual install, if you prefer:
  a. Copy the two folders inside "panels" to
       ~/Library/Application Support/Adobe/CEP/extensions/
     (In Finder: Go > Go to Folder..., paste the path; create the
     "extensions" folder if it is missing.)
  b. Run this in Terminal, then restart Premiere:
       defaults write com.adobe.CSXS.12 PlayerDebugMode 1

What the installer changes: it copies the two panel folders above and turns
on Adobe's "PlayerDebugMode" setting, which Premiere needs to load panels
that are not signed through Adobe's store. Nothing else.


INSTALL (Windows) - untested
----------------------------
1. Quit Premiere Pro.
2. Copy the two folders inside "panels" to  %APPDATA%\Adobe\CEP\extensions\
3. In Registry Editor, under HKEY_CURRENT_USER\Software\Adobe\CSXS.12
   add a String value named PlayerDebugMode with data 1.


UNINSTALL
---------
Delete com.bulwark.reformat and com.bulwark.captiontools from the extensions
folder above and restart Premiere.


TROUBLESHOOTING
---------------
- Panel is not in Window > Extensions: quit Premiere completely (Cmd+Q) and
  reopen it. Check both folders are in the extensions folder.
- Panel opens as a black/empty box: resize the panel or dock/undock it.
  If it stays black, close it and reopen it from Window > Extensions.
- "This project has no 9x16 Frames bin": import the standard
  BULWARK VIDEO ASSETS bin into the project.


VERTICAL REFORMAT
-----------------
Needs the standard "BULWARK VIDEO ASSETS" bin in the project:
  - 9x16 Frames            (one sub-bin per show; these make the Show list)
  - 16x9 END CARD          (the horizontal end cards)
  - 9x16 SOCIAL END CARD   (the vertical end cards)
It expects the usual edit: one nested sequence per camera on the lower
tracks, a wide nest above them, media on a "Background" plate, "Logo Overlay"
on top.

1. Open the finished 16x9 sequence.
2. Pick the show.
3. Pick what happens when media is on screen:
     2-up  speaker in the top window, media in the bottom window
     3-UP  one person on top, media in the middle, one person below
     PIP   one person on top, media in the middle, two side by side below
     Full  media full screen over a blurred copy of itself (images only)
   If the sequence has more than one piece of media, each one is listed
   under that with its timecode. Leave it on "Same" to use the choice above,
   or pick a different layout for just that one.
4. Optional: pick who goes where in the stacked wide shot (the list shows the
   camera nest names from the open sequence; click Refresh after switching).
5. Click "Make vertical version of this sequence".

It makes a copy named "<sequence> VERT" at 1080x1920. The 16x9 sequence and
the nests are never changed. On the copy it:
 - scales single-camera clips x1.78 to fill the frame
 - swaps wide shots for a vertical version of the wide nest. If the wide nest
   already has a vertical layer inside it, that is used. If not,
   "<wide> VERT" is built: the cameras stacked in the show's 3-UP frame
   (2-up for two people), with any 16x9 side-crops removed. Adjust each
   person's framing once inside that nest.
 - lays out media sections in the layout you picked, with the show's frame
   on top
 - removes Logo Overlay / 16x9 Watermark clips
 - swaps the 16x9 end card for the 9x16 end card of the SHOW YOU PICKED
 - puts full-screen images (ones with no background plate) over a blurred
   copy of themselves that fills the frame. Untick "Full-screen images: add
   a blurred copy behind" to skip this.
 - lists anything it could not decide under "Check these", with timecodes

End cards: the panel uses the 9x16 end card whose name starts with the show
name (e.g. show "BULWARK TAKES" -> BULWARK-TAKES-9-16-INSTA-REEL 02.mp4;
"Reciepts" -> RECEIPTS-9-16-INSTA-REEL 01.mp4). If the show has no 9x16 card
in "9x16 SOCIAL END CARD", it uses the 9x16 card matching the 16x9 card on
the timeline and says so under "Check these". To add a show's card, put it
in that bin with a name starting with the show name (e.g. "TNL-9-16 ...").

Centre people (Mac only)
One measurement is used per camera, so framing does not jump between cuts.
It only moves cameras sideways, never up or down, and never so far that the
picture stops covering its window. It works on camera nests (one nested
sequence per camera) and on "<wide> VERT" nests the panel built. It leaves
alone: a vertical wide you built by hand, camera files cut straight into the
timeline without a nest, clips with Position keyframes, and clips that carry
a side crop from the 16x9 edit. If someone moves a lot, check their clips.

Bring an image full screen (works in any sequence, any time)
Select the image clip in the timeline and click "Toggle full screen + blurred
background". A sharp copy is fitted to the frame over a blurred copy (Gaussian
Blur 20) that fills it, above the cameras and frame, below titles. The
original clip is switched off underneath. Click again with the image selected
to put it back. Images only for now, not video clips.

Still done by hand: title text (the panel names the show's text style) and
captions.

Re-running: delete the old "... VERT" sequence AND any "<wide> VERT" nest it
built first. Otherwise the old nest is reused and you get "... VERT 2".

Known limits
 - Long sequences are slow: a one-hour episode took over ten minutes, and
   Premiere does not respond until it finishes. Clips take seconds.
 - Media cut back to back counts as one piece (one layout for the run).
 - Two-person shows (2-up wide) have only been tested on one project.
 - Camera clips that run past the end of a media section are flagged, not
   trimmed.
 - In 3-UP and PIP media sections the live camera goes on top and the others
   follow track order; swap by hand if needed.


CAPTION TOOLS
-------------
1. Open the sequence.
2. Select the caption clips you want, or select nothing to change every
   caption.
3. Type the outline width (9 for Bulwark) and click the matching button.
Cmd+Z undoes it.


WHAT'S NEW IN v1.1
------------------
 - End cards are now swapped: the panel finds the end card bins whether they
   are named "END CARD" or "END CARDS", and looks inside sub-bins.
 - The 9x16 end card follows the show picked in the panel.
 - Building the vertical wide now removes "Crop (Legacy)" effect crops from
   the 16x9 split screen, not only Motion's crop, so no camera is left
   cut off on one side.


WHAT TO REPORT
--------------
 - the show, the layout you picked, and the name of the sequence
 - what the panel's message and "Check these" list said
 - a screenshot of the timeline and the frame that looks wrong
 - the project file if you can share it
