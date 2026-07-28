# Beyond One World — A Vocabulary of Transformation

An illustrated A–Z glossary of concepts around the Global North / Global South,
built for the GEE Global North / Global South course.

**Live site:** https://devisi1914-afk.github.io/beyond-one-world/

## What is in it

- **Alphabet** — 106 terms across 21 letters, each traced to one of six academic
  sources, with a reading-progress layer saved on your device.
- **Statistics** — a qualitative concept analysis of all six texts: 213 concept
  groups, counted directly from the source PDFs, shown as per-source profiles,
  a comparison across texts, and a concept constellation.
- **A–Z on your phone** — scan the code on the Alphabet tab: a letter appears,
  you tap it and read the words it holds.

## Method

Every frequency in the Statistics section is measured from the source texts, not
estimated. Running page headers and reference lists are removed before counting,
and each concept group is matched by an explicit set of word forms so no
occurrence is counted under two groups. The full method is stated on the page and
the word forms are listed in `Statistics_Data/Concept-Statistics.pdf`.

## Sources

The six academic texts are **not** included in this repository — they are
third-party works and are not ours to redistribute. The Sources tab links to the
publishers instead.

| # | Author | Text |
|---|--------|------|
| 1 | Fatheuer, Thomas (2011) | Buen Vivir. Heinrich-Böll-Stiftung |
| 2 | Fry, Tony (2017) | Design for/by "The Global South". Design Philosophy Papers |
| 3 | Noguera de Echeverri et al. (2020) | Decolonization of Environmental Education. Oxford Research Encyclopedia |
| 4 | Bundeskanzler-Willy-Brandt-Stiftung | Der Nord-Süd-Bericht (Brandt-Report) |
| 5 | Avilés-Irahola & Youkhana (2024) | Gender studies in development research. ZEF Working Paper 227 |
| 6 | Aschner Rosselli et al. (2025) | Decolonizing Creative Education in the Global South. Manuscript |

## Running it locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765

No build step — it is plain HTML, CSS and JavaScript.

## Files

| | |
|---|---|
| `index.html` | the glossary, statistics and phone hand-off |
| `play.html` · `play.js` · `play.css` | the phone game |
| `data.js` | the lexicon, the sources and the concept statistics |
| `app.js` | glossary, progress tracking, statistics and the network graph |
| `globe.js` · `assets/globe-data.js` | the turning globe, drawn from Natural Earth coastlines |
| `qr.js` | a QR encoder, so no external service is called |

Coastline data: [Natural Earth](https://www.naturalearthdata.com/), public domain.
