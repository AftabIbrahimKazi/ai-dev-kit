# AI Dev Kit docs site

The documentation website for the [AI Dev Kit](https://github.com/AftabIbrahimKazi/ai-dev-kit). A landing page, a docs index with an interactive map of the kit, and one story page per part of the kit (skills, commands, mods, standards, MCP, add-ons, libraries).

Built with Next.js 16 (App Router, React 19), Strata CSS for utilities, and a Three.js scene driven through Triforge.

## Where this lives

This code is on the `site` branch of the kit repository, not on `main`. A normal `git clone` of the kit checks out `main` only, so people who just want the kit never get this folder.

| Question | Answer |
| --- | --- |
| Which branch is deployed? | `site` |
| Where do site changes go? | Pull requests against `site`. Kit changes go to `main`. |

## Run it locally

From the root of a kit checkout:

```bash
git worktree add site/ai-dev-kit-doc-site site
cd site/ai-dev-kit-doc-site
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `localhost`, not `127.0.0.1`: the dev server only serves its client scripts to `localhost`, and the page will not hydrate otherwise.

Keep the worktree at `site/ai-dev-kit-doc-site`. The scripts that rebuild the kit map read the kit's files three folders up, so they only work from that path.

## Check your work

```bash
npm run lint            # ESLint (same as: npx eslint src)
npx tsc --noEmit        # type check
npm run build           # production build
```

Do not run `npm run build` while `npm run dev` is running: they share the `.next` folder.

## Keeping the kit map in step with the kit

The map on the docs page is drawn from `src/content/kit-graph.json`, and its "Open ..." buttons link to sections through `src/content/map-link-targets.ts`. Both are generated from the kit's files, so they go stale when the kit changes.

```bash
node --experimental-strip-types scripts/build-map-links.ts
```

`scripts/build-kit-graph.ts` rebuilds the graph itself. Do not run it casually: it re-lays-out every node, including the landing page's.

## Deploy (Vercel Hobby)

1. In Vercel, import the kit's GitHub repository.
2. Set the **Production Branch** to `site`. Leave the framework preset on Next.js and the root directory on the repository root, since this branch holds the site at its root.
3. Deploy. No environment variables are needed.

There is no production domain yet, so the site sets no `metadataBase`, sitemap, `robots` file or Open Graph image. Add them once a domain exists.

## Conventions

- Every class and id starts with `rk-`, every data attribute with `data-rk-`, and shared components with `Rk`. Names that come from a package or framework are left alone.
- Strata utility classes come first; custom CSS is only for what Strata cannot express (pseudo-elements, state selectors, gradients, motion). Tokens live in `src/app/variables.css`.
- No text under 12px, and no `!important`.
- `ScrollObserver` and `CameraController` are shared by the landing page and the module pages. Chapter reveal state is the `data-reveal` attribute (`idle`, `out`, `in`); never add or remove it by hand.
