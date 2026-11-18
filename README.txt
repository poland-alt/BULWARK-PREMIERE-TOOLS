BULWARK PREMIERE TOOLS - v2.5 test build
========================================

WHAT'S NEW IN v2.5
------------------
 - Thumbnail tab: the picture options can be saved as files. After
   "Show picture options", press "Export these pictures" to save every
   option as a full-size PNG, or point at one picture and click the
   arrow in its corner to save just that one. They go to
   Desktop > Bulwark Thumbnails > "<clip name> pictures".
 - Thumbnail tab: every show now has a "1 picture" layout: one picture
   with no bar across the middle, and the title lower down (halfway
   between where the bar sits and the bottom border).
 - Thumbnail tab: "Title up / down" slider moves the title in any
   layout. Double-click the slider to put the title back.
 - Thumbnail tab: "Title lines" sets the title to 1, 2 or 3 lines.
   Auto (the default) uses one line, or two when one is too long.
 - Thumbnail tab: "Title size" slider makes the title smaller or bigger.
   Double-click the slider to put it back.
 - Clips tab: "Export transcript" saves the open sequence's transcript
   as text with times, plain text, a spreadsheet (.csv) or subtitles
   (.srt). You choose where it is saved.
 - Reframe: each new vertical recut is filed in a bin called
   "SOCIAL CLIPS 9X16" (made at the top of the project if it is not
   there yet).
 - Buttons, chips and dropdowns no longer cut their words short in a
   narrow panel: the words wrap, and a row of buttons that does not fit
   goes onto a second line.
 - Thumbnail tab: "Change folder..." picks where thumbnails and exported
   pictures are saved (any folder or drive). "Back to Desktop" returns
   to Desktop > Bulwark Thumbnails.

WHAT'S NEW IN v2.4
------------------
 - New look, in the style of Premiere's own panels. Nothing moved to a
   different tab and every button does what it did before.
     - The open sequence is always shown at the top, with its length
       and whether it is 16x9 or 9x16.
     - The tabs run in working order (Clips, Reframe, Captions,
       Thumbnail); the gear is Settings.
     - Each tab shows its main button first. The less-used choices are
       under "Options"; click it to open them.
     - Work in progress shows a progress bar.
     - "Check these" after a reframe is a list; click a time to jump
       the playhead there.

WHAT'S NEW IN v2.3
------------------
 - New Thumbnail tab: makes the 1080x1920 thumbnail from the vertical
   clip.
     1. Pick a template (2 pictures or 3 pictures; more can be added per
        show, see below).
     2. "Show picture options from this clip" pulls 8 pictures of each
        person and of the media. Media pictures are taken with captions
        and titles hidden. "Give me more options" pulls a different set.
     3. Click a picture to put it in the window that is marked; the mark
        moves to the next empty window. Double-click a picture to jump
        the playhead there. "Use the frame under the playhead" takes
        exactly the frame you are parked on.
     4. Type the headline, or press "Thumbnail" next to a suggested IG
        headline on the Clips tab. It goes on one line or two to fit.
     5. Move and zoom each picture, then "Save thumbnail"
        (Desktop > Bulwark Thumbnails).
     Click a window in the preview to mark it as the next one to fill,
     drag a picture in the preview to move it, and use Left / right,
     Up / down and Zoom for the marked window. "Use playhead frame" also
     works inside any 16x9 sequence (a person's camera nest, for
     example): park on the frame you want and press it.
     "Add image file" puts in any picture from your Mac (PNG, JPEG,
     HEIC, TIFF, PSD and others), or drop an image file onto a window in
     the preview. It also joins the picture options as "Your images".
     The headline fills in by itself from the open vertical clip: the
     panel reads the title that is on the clip (or, if there is none,
     starts from the sequence name). "From clip" reads it again. "New
     thumbnail" clears the pictures and headline to start the next one.
     Cmd+Z undoes the last change to the thumbnail and Shift+Cmd+Z
     redoes it, while the Thumbnail tab is showing (there are Undo and
     Redo buttons too). On the other tabs Cmd+Z is still Premiere's undo.
 - Panel size: A- and A+ at the top right (and a slider in Settings)
   make everything in the panel bigger or smaller. The layout is tighter
   overall and no longer stretches across a wide panel.
 - Thumbnail frames for 18 shows, each in a 2-picture and a 3-picture
   layout: Breakdown, Bulwark Podcast, Bulwark Takes, Focus Group,
   Hollywood, Huddled Masses, Illegal News, Mona Charen, Morning Shots,
   Oppo, Overtime, Press Pass, Receipts, Sarah Matthews, Secret Show, TNL,
   Triad, Trio + MAGA Monday + Psycho. Pick the show in the "Show (frame)" list
   and the layout with the chips beside the preview. A show that is
   picked on the Reframe tab is listed first. More frames can be added:
   "Open my thumbnail templates folder" opens the place, with a how-to.
 - Pictures under "Your images" have an x in the corner to remove them.
 - Signed updates. Every release is signed with a key kept on the release
   Mac, and the panel checks that signature and a fingerprint of every
   file before it installs an update. An update that was not made with
   that key, or that was altered on the way, is refused and nothing is
   changed. (Panels older than this version cannot check, so this
   protects every update after this one.)
 - Clips tab, "Suggest IG headlines": open a cut clip (16x9 or vertical)
   and the AI assistant suggests eight on-screen headlines of 4 to 8
   words, each with a Copy button. Works with whichever assistant is
   chosen in Settings, including the no-key copy-and-paste mode.

WHAT'S NEW IN v2.2.1
--------------------
 - Reframe: a section laid out with a 16x9 layout frame (for example
   "Three Frame Media - 16:9.png": people in small windows down one side,
   media beside them) is now a media section, the same as one with a
   Background plate. Three people on become the PIP frame (one on top,
   media in the middle, two below), two become the 3-UP, one the 2-up,
   unless you pick a layout for that section. People keep the top-to-
   bottom order they had in the 16x9 frame.

WHAT'S NEW IN v2.2
------------------
 - Captions tab, three new tick boxes:
     Auto reposition captions   captions are placed by shot: 80% down on a
                                solo shot, 50% on a 2-up (the join between
                                the two windows), 67% on a 3-UP. Untick it
                                to use one height for the whole clip.
     Split captions at cuts     a caption that runs across a picture cut
                                becomes two clips meeting at the cut, so
                                each shot's captions can be selected and
                                moved on their own.
     Drop shadow                adds a shadow under every caption, with a
                                strength slider from faint (0) to heavy
                                (100).
   "Captions already placed" also has a button that applies the shadow,
   at the slider's strength, to captions already in a sequence (use it
   again after moving the slider to change them).
 - Transcribing now uses Parakeet: a 30 minute episode takes a few seconds.
   Each Mac downloads the new speech model (about 450 MB) once.
 - Captions tab, "Leave out filler words and stutters" (on by default):
   um / uh are dropped, and a small word said several times in a row
   ("I, I, I think") is kept once. "No, no, no" and "very, very" stay.
 - Captions tab, "Edit caption text": loads every caption in the sequence
   as an ordinary text box, so you can fix a word with a normal cursor
   (Premiere's own field re-renders the caption on every keystroke).
   Click in a box to jump to that caption; Return or clicking away saves.
   Adding or removing words keeps the gold highlight running in step.
 - Settings tab, AI assistant: choose who suggests clips and proofreads
   captions: Claude, ChatGPT or Gemini (each with its own API key), Apple
   Intelligence (on your Mac, free, needs macOS 26 with Apple Intelligence
   on; rougher picks), or no key (copy and paste through any chat).
   With a key saved, "Refresh list" loads the models that key can use and
   you pick one; you can also type a model ID.

WHAT'S NEW IN v2.1.1
--------------------
 - Transcribing is much faster and shows what it is doing: download
   percent (first time only), loading the model, then transcription
   percent with a running clock. A 30 minute episode takes about a minute
   on a recent Mac. The first-time setup no longer sits for minutes.
 - Reframe: a multicam sequence whose name contains 2-up, 3-up, 2-box or
   3-box is treated as the wide shot and stacked, not scaled to fill as a
   single camera. (The panel cannot read which angle a multicam clip is
   showing, so the name is how you tell it.)

WHAT'S NEW IN v2.1
------------------
 - One panel instead of two: Window > Extensions > Bulwark Premiere Tools
   (it keeps the old name "Bulwark Vertical Reformat" in that menu until
   Premiere restarts). Tabs across the top:
     Clips     suggest clips from a full episode and cut them
     Reframe   16x9 to 9x16 (everything the Vertical Reformat panel did)
     Captions  caption a vertical clip; change the stroke on existing ones
     Settings  Claude API key, caption size and stroke, clip length and
               bin name, clear saved transcripts, check for updates
   The panel opens on the tab you used last.
 - The separate Bulwark Caption Tools panel is retired. If you still have
   it, it shows a note pointing here; the installer removes it.

WHAT'S NEW IN v2.0
------------------
 - Find clips in a full episode. Open the finished 16x9 episode sequence
   and press "Analyze transcript and suggest clips". The panel
   transcribes the episode on your Mac, and Claude suggests every 1:30 to
   2:30 moment worth clipping (as many or as few as the episode has), and
   lists them with a title, an on-screen headline and the reason. "Go to"
   moves the playhead to a pick. Untick or rename, then "Cut ticked clips":
   each becomes its own trimmed 16x9 sequence named "SOC - <title>" in the
   bin "SOCIAL CLIPS 16x9". Then run Bulwark Vertical Reformat on each.
 - Caption a vertical clip. Open the 9x16 clip and press "Caption this
   sequence". Captions go on a new top track in the house style: Special
   Gothic Condensed SemiBold, size 54, white, black stroke 7, with the
   word being spoken in gold (FFBA2E). No CaptionX step. The font must be
   installed. Wrong word? Fix it in the Caption field of that clip.
 - No API key needed. For clip suggestions (and caption proofreading)
   the panel shows three steps: "Copy the transcript for Claude", paste it
   into a new chat at claude.ai and send, then copy Claude's answer and
   press "Paste Claude's answer". The clips then list in the panel as
   usual. If you do have an Anthropic API key, paste it once on the
   Settings tab and those steps happen inside the panel in one click.
   Either way only transcript text goes to Claude; audio and video stay
   on your Mac.
 - Transcribing happens on your Mac (Apple silicon, macOS 14 or later)
   with Parakeet. The first time, the panel downloads the speech model
   (about 450 MB); after that it needs no internet.
   On macOS 26 the panel also uses Apple's recogniser to time each word
   more tightly; on older macOS the highlight is a little looser after
   pauses.
 - Limits: names can still be misheard; proofreading catches most.
   Word timing is within about a tenth of a second on clean speech and
   looser under music or crosstalk. Clip picks are suggestions: check the
   in and out points before posting.

WHAT'S NEW IN v1.7
------------------
 - Nests with media inside them (e.g. a "react" frame: two speakers small on
   one side, media big on the other). The vertical version is now built as
     2 people + media  3-UP frame: person on top, media in the middle,
                       person below
     1 person + media  2-up frame: person on top, media below
   The "who goes where" list shows the two people and where the media goes.
   Media is the clip with "media" or "screen share" in its name; if there is
   none, the picture that is clearly bigger than the cameras. Switched-off
   clips inside the nest are ignored.
 - Multicam clips (AutoCut and others) are treated as a single camera and
   scaled to fill, instead of being swapped for a stacked wide. The panel
   cannot read which angle a multicam clip shows, so it lists a reminder
   under "Check these": a clip showing a 2-box or media angle needs laying
   out by hand.
 - Framing inside a built vertical wide is measured on the 16x9 nest, which
   puts each person closer to the middle of their window before centring.

WHAT'S NEW IN v1.6
------------------
 - Wide shot: pick 2 people or 3 people. When the wide nest has three
   cameras, two buttons sit above the "who goes where" list:
     2 people  uses the cameras on V1 and V2 of the wide nest, in the 2-up
               frame (Top V1 / Bottom V2, or the other way round)
     3 people  all three in the 3-UP frame, any order (as before)

WHAT'S NEW IN v1.5
------------------
 - The panels update themselves. When a panel opens it checks for a newer
   version; if there is one, a blue notice at the top says what changed and
   has an "Update now" button. Click it and the panel reloads on the new
   version. Nothing updates without the click. You only need this zip once.
 - The version you are on is shown next to the panel's title.

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

One Premiere Pro panel, Bulwark Premiere Tools, with four tabs:

  Clips      suggests social clips from a full episode and cuts them
  Reframe    turns a finished 16x9 sequence into a 9x16 one
  Captions   captions a vertical clip; sets the stroke on existing captions
  Settings   API key, caption style, clip length, updates

Tested on Premiere Pro 2027 (27.0) on Mac.


INSTALL (Mac) - about one minute
--------------------------------
1. Quit Premiere Pro.
2. Unzip "Bulwark Premiere Tools.zip" (double-click it in Downloads).
3. Open the "Bulwark Premiere Tools" folder.
4. Right-click "Install on Mac.command" and choose Open, then Open again.
   (Double-clicking is blocked by macOS because the file came from the internet.
   If it says it can't be opened, go to System Settings > Privacy & Security,
   scroll down and click "Open Anyway".)
5. A Terminal window says "Installed." You can close it.
6. Open Premiere Pro, then Window > Extensions > Bulwark Premiere Tools.

Updating: from v1.5 on, use the "Update now" button in the panel. To come
from an older version (or to repair a panel), run the installer again and
restart Premiere.

Manual install, if you prefer:
  a. Copy the folder inside "panels" to
       ~/Library/Application Support/Adobe/CEP/extensions/
     (In Finder: Go > Go to Folder..., paste the path; create the
     "extensions" folder if it is missing.)
  b. Run this in Terminal, then restart Premiere:
       defaults write com.adobe.CSXS.12 PlayerDebugMode 1

What the installer changes: it copies the panel folder above (and removes the
old separate Bulwark Caption Tools panel, if present) and turns
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
4. Optional: pick how many people are in the stacked wide shot (2 or 3) and
   who goes where (the list shows the camera nest names from the open
   sequence; click Refresh after switching). 2 people uses V1 and V2 of the
   wide nest. If a "<wide> VERT" nest already exists it is reused as it is;
   tick "Build a new vertical wide" to apply a new choice.
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
 - Multicam clips: the angle cannot be read, so every multicam clip is
   scaled to fill as a single camera, and face centring skips them.
 - A nest with three people and media in it: the media is left out.


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
