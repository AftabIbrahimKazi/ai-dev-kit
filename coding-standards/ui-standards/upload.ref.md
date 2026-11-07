# UI Standards — File Upload (reference)

Read when: the task covers transfer, server processing, items and states. The everyday rules are in `ui-standards/upload.md`.

## Transfer

- **UI-UPL-14** Accepted files upload at once, independent of Save. Save attaches the uploaded file IDs. If uploads are still running when Save is pressed, the action bar shows "Waiting for 2 uploads to finish…" and saves when they finish. Leaving the page with running uploads triggers the unsaved-changes guard naming the uploads. A web or PWA tab warns before closing while uploads run; native apps continue in the background.
- **UI-UPL-03** Show progress per file with cancel and retry. Transfer in 5 MB parts (a smaller file is one part through the same contract), up to 3 parts of a file in parallel and 3 files at once (others show "Waiting…"), retry a failed part up to 4 times with backoff (0.5, 1, 2, 4 s), send a SHA-256 checksum per part, and resume from the last completed part after a connection drop or reload.
- **UI-UPL-15** Every backend implements the same contract (paths may be prefixed): `POST /uploads` `{field, name, size, type}` returns `201 {uploadId, partCount, partSize, completed}`; `GET /uploads/{id}` returns status and completed parts (resume); `PUT /uploads/{id}/parts/{n}` raw bytes with header `X-Part-SHA256` returns `201`; `POST /uploads/{id}/complete` returns `202 {id, status: "processing"}`; `DELETE /uploads/{id}` returns `204`; `GET /files/{id}` returns `{status: ready|rejected, name, size, type, width, height, urls: {w160, w640, w1600, original}}`. Errors are `422 {code, message}` with codes `too_large`, `wrong_type`, `too_small`, `too_many`, `macros`, `infected`, `checksum_mismatch`, `missing_parts`; `413` for an oversized part; `429` with `Retry-After`. IDs are opaque UUIDs. Every request is authenticated and authorised against the owning record and field, with CSRF protection where cookies are used.


## Server processing

- **UI-UPL-01** Validate on the server: extension allowlist and the real type from magic bytes, the total size, and for images the pixel count (at most 50 MP). Never trust the client MIME type or filename. Keep the assembled file in a private quarantine until checks pass.
- **UI-UPL-04** Store files outside the web root, in private storage on the application's own server or volume, under random names. Never build a path from user input. Serve through a controlled endpoint with the correct `Content-Type` and `X-Content-Type-Options: nosniff`. Serve documents as downloads (`Content-Disposition: attachment`).
- **UI-UPL-05** Re-encode uploaded images to strip EXIF and GPS data, and create WebP versions at 160, 640 and 1600 px wide.
- **UI-UPL-16** Reject macro-enabled office files. SHOULD: scan documents with an open-source antivirus. Sanitise SVG icons and reject SVG for every other kind. Delete abandoned parts and quarantined files after 24 h and alert administrators at 80% disk use. Disk full shows "We couldn't store this file right now. Try again later." with a support code. HEIC is accepted and converted by the server.


## Items and states

- **UI-UPL-06** Every selected file is an item in a state, never a bare file name: waiting (placeholder, "Waiting…", Cancel); uploading (dimmed preview, progress bar, "62% · 2.1 of 3.4 MB · about 6 s left", "2 of 4 parts" when chunked, Cancel); paused ("Connection lost. The upload will resume automatically from part 3.", Resume, Cancel); processing (skeleton, "Processing…"); checking documents (spinner, "Checking the file for viruses…"); done (image: 160 px WebP thumbnail; document: type label, name, "size · uploader · date"); failed (warning, reason such as "Upload interrupted. Check your connection and retry.", Retry, Remove); rejected (danger border, reason and fix, Remove). A polite status line summarises ("1 uploading · 1 waiting (max 3 at a time) · 1 rejected"). After a reload, unfinished uploads offer "Resume upload". A server rejection after upload (malware) turns the item Rejected with the server message.
- **UI-UPL-17** A done photo offers Move left, Move right, Set as cover (the first is the cover by default, marked with a "Cover" badge), View (opens the viewer), Remove. Reordering never depends on dragging. Alt text is generated as "<record identifier>, photo n of m" and editable as a caption.
- **UI-UPL-18** A done document is a file tile with the type as text (PDF, XLSX, CSV), the name (truncated, full name in a tooltip), "size · uploaded by · date", and actions Preview (PDF only), Download (signed link, 10 min) and Remove.
- **UI-UPL-19** A single-file field (icon, avatar, logo) shows the current image in its final shape (square tile for icons, circle for avatars) with "Replace" and "Remove". Removing shows the default image at once.
- **UI-UPL-20** Removing an item before the form is saved only detaches it, with no confirmation. Removing a file from a saved record offers Undo ("front.jpg removed · Undo").
