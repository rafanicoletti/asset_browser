# Pending Task Review

## Goal
- Expand the image viewer layout menu from 1-5 fixed columns to 1-10, plus a square mode.
- Add horizontal/vertical alignment so fixed layouts can fill by rows or by columns.
- Prevent the image viewer toolbar controls from overlapping when there are many controls.

## Implementation Notes
- `grid-square` uses `ceil(sqrt(image_count))`, so 24 images create a 5-by-5-capable grid.
- Horizontal alignment fills rows first: `N per row`.
- Vertical alignment fills columns first: `N per column`.
- Toolbar groups are allowed to wrap, and controls no longer shrink into neighboring groups.

## Verification
- Completed: `node --check server.js`.
- Completed: `node --check public/app.js`.
- Browser follow-up: verify that selecting 1-10, Square, Horizontal, and Vertical updates the workspace layout.
- Browser follow-up: verify at narrower widths that toolbar controls wrap instead of overlapping.
