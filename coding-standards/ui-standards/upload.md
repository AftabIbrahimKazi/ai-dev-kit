# UI Standards — File Upload

Read when: adding a file or image field, an attachment list, a gallery, a drop zone, an avatar or logo picker, or an upload endpoint. Showing images: `image.md`.

Detail in `ui-standards/upload.ref.md`: transfer, server processing, items and states. Read it only when the task covers one of these.

## Component and limits

- **UI-UPL-07** Every file or image field uses one shared upload component configured by `kind`. Never a raw or restyled `<input type="file">` built per page. Inside it use a real file input; a drop zone also works by keyboard.
- **UI-UPL-11** Default limits by kind; a product may tighten them, loosening needs a recorded waiver. `image`: multiple, JPG PNG WebP HEIC, 10 MB each, at least 800 × 600 px and at most 50 MP, up to 10. `document`: multiple, PDF XLSX XLS CSV with no macro files, 20 MB each, up to 20. `icon`: single, PNG or SVG (sanitised on the server), 1 MB, square and at least 256 × 256 px.
- **UI-UPL-02** Before any file is chosen the drop zone shows an upload icon, the action text ("Drag photos here or choose them"), allowed types, size and dimension limits, and the counter ("4 of 10 photos"). A labelled "Choose …" button is always present; drag and drop is an extra, never the only way. On phones the zone stacks and an `image` field adds "Take photo".
- **UI-UPL-12** On selection check type, size and count at once and show each rejected file as an item with reason and fix: "18.4 MB is too large. Upload images up to 10 MB.", "GIF isn't supported. Upload JPG, PNG, WebP or HEIC.", "Files with macros aren't allowed. Save it as .xlsx and upload again.", "You can add up to 10 photos. Remove one first." The server re-validates everything and its decision is final. A file selected twice is ignored with "front.jpg is already added".
- **UI-UPL-13** Resize an `image` on the device when its long edge exceeds 2560 px (to 2560 px, quality 0.85, keeping orientation; never upscale).


## Quality

- **UI-UPL-21** The choose button has a visible label and is described by the rules text. Each progress bar has progressbar semantics with a value and a label naming the file. Every item action names the file ("Remove scan.png"). Rejected and failed messages are announced once; the status line is a polite live region.
- **UI-UPL-22** On phones controls are at least 44 px, the camera is offered for `image`, and the permission prompt appears only when the user taps "Take photo", with a one-line reason.
- **UI-UPL-23** The UI never shows server paths, storage locations or internal IDs. File links are signed and expire (10 min). File contents are never logged.
- **UI-UPL-24** Colours come from tokens: drop zone on the page surface with a 2 px dashed field border, progress in primary, paused progress neutral, rejected border danger, cover badge in inverted colours.
- **UI-UPL-25** An Excel file used to import records is not this component; it is a data import flow.
