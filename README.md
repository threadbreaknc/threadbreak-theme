# Threadbreak Shopify Theme

Custom theme for [threadbreak.com](https://threadbreak.com).

## Structure

```
threadbreak-theme/
├── assets/          CSS, JS, and images
├── config/          Theme settings schema
├── layout/          Master template (theme.liquid)
├── sections/        Homepage sections (hero, ticker, overview, etc.)
├── snippets/        (empty — add reusable chunks here)
├── templates/       Page templates (index, product, collection, cart, page)
└── locales/         Language strings
```

## Deploying to Shopify via GitHub

1. Push this repo to GitHub
2. In Shopify Admin → **Online Store → Themes**
3. Click **Add theme → Connect from GitHub**
4. Select this repo and the `main` branch
5. Click **Connect** — Shopify will sync the theme

Every push to `main` automatically updates the theme in Shopify.

## Uploading images via Shopify Admin

The images in `/assets/` are included in this repo.
To update them later: Shopify Admin → **Online Store → Themes → Actions → Edit code → Assets**.
