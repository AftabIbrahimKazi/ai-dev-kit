# UI Standards — Image Display

Read when: showing any image, thumbnail, avatar, icon or photo gallery to users. Uploading: `upload.md`.

- **UI-IMG-01** Every image of user or record content uses one shared image component. Never a raw `<img>` or image widget for content (static UI icons from the icon set are exempt).
- **UI-IMG-02** Reserve space before load with a fixed aspect ratio and explicit width and height: cards 4:3, list and table thumbnails 1:1 (40 px in tables), avatars 1:1 circle, hero and banners 16:9. Loading, failing or missing images never change the box size.
- **UI-IMG-03** Load lazily and decode asynchronously. Only the main above-the-fold image (at most one per page) sets `priority`: eager with high fetch priority. Every `<img>` has `alt` (empty when decorative) and `width` and `height`. (check: h-04, perf-02)
- **UI-IMG-04** Request the smallest server version that covers the rendered size (WebP 160, 640, 1600 px) through responsive sources. Lists and tables never load originals. Originals only through "Download original".
- **UI-IMG-05** While loading the box shows a neutral skeleton or a tiny blurred preview; the pulse stops under reduced motion.
- **UI-IMG-06** With no image, show the default for the component's `fallback` kind: a neutral tile with the kind's icon in muted colour (asset: box, property: building, document: page, category: grid, image: picture); tiles of 120 px or more add short text ("No photo"). People show an initials avatar.
- **UI-IMG-07** If an image fails to load, replace it with the same default (people: initials), add "Photo unavailable" on large tiles, keep the alt text, and never show the browser's broken-image icon or change the layout. If a signed URL expired, request a fresh URL once before falling back. Report failures to error monitoring without personal data.
- **UI-IMG-08** Alt text: record photos use "<identifier>, photo n of m" or the caption; people use the person's name; images beside text that names them and decorative images use `alt=""`; marketing and landing images get meaningful alt text written by the author.
- **UI-IMG-09** Photos use `cover` (cropped to fill); logos, icons and documents use `contain`. Never stretch an image.
- **UI-IMG-10** An image viewer is a full-screen dialog on a dark backdrop with the caption, "n of m", Previous and Next buttons, Download original and Close. Arrow keys navigate, Esc closes and focus returns to the thumbnail; touch swipe may be added beside the buttons. It loads the 1600 px version. (browser)
- **UI-IMG-11** Never invert or filter photos in dark mode. A transparent logo or icon with no dark variant sits on a light badge with 8 px padding.
- **UI-IMG-12** Images of records come from private storage through signed, expiring URLs (10 min) checked against the viewer's permissions. Public URLs only for marketing images and tenant logos.
- **UI-IMG-13** Lists use thumbnails, never originals.
