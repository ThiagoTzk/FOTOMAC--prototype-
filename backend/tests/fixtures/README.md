# Test photos

Deliberately NOT photos of CESMAC events: the test suite must not carry personal data of event
participants (LGPD Art. 6, III). Both are public-domain works of NASA (U.S. federal government).

| File | What | Source |
|---|---|---|
| `apollo11_crew.jpg` | Apollo 11 prime crew portrait, 3 faces (S69-31740, May 1969) | https://images.nasa.gov/details/S69-31740 (medium size) |
| `astronaut_eileen_collins.png` | Astronaut Eileen Collins, 1 face — the "stranger" of the search tests | NASA, distributed with scikit-image as `skimage.data.astronaut` |

## `formats/` — samples of the other photo formats (requirements v2.0, RF007)

`sample.heic`, `sample.png`, `sample.webp` and `sample.dng`: synthetic images made for the tests
(colour blocks — red on the left, blue on the right, a grey band at the bottom; the PNG has a
transparent corner). **No person appears in them.** Each carries a FAKE GPS position (−9.6658,
−35.7353) and the capture date 2026-10-15 19:30, so the tests can prove that the location is
removed and the date kept. Made on 21/10/2026: PNG/WebP with OpenCV, HEIC with macOS `sips`, DNG
with `pidng` (outside the project), GPS written with ExifTool.
