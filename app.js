(function () {
  "use strict";

  var byLetter = {};
  LETTERS.forEach(function (l) { byLetter[l] = []; });
  LEXICON.forEach(function (entry) {
    if (byLetter[entry.letter]) byLetter[entry.letter].push(entry);
  });

  // Two terms share a name inside the same letter (Decolonization and
  // Pluriverse each appear once from source 1 and once from source 6), so
  // "letter + term" is not unique. Suffix repeats with an occurrence number to
  // keep every progress key distinct while staying readable and stable.
  (function assignKeys() {
    var seen = {};
    LEXICON.forEach(function (entry) {
      var base = entry.letter + "|" + entry.term;
      var n = seen[base] || 0;
      seen[base] = n + 1;
      entry._key = n === 0 ? base : base + "#" + n;
    });
  })();

  /* =======================================================================
     READING PROGRESS
     Every term can be marked as read. The set of read terms lives in
     localStorage, so a visitor picks up where they left off. Nothing is ever
     hidden behind progress — the glossary stays fully readable; the layer only
     records what you have been through.
     ======================================================================= */

  var STORE_KEY = "bow-progress-v1";
  var read = {};          // termKey -> true
  var celebrated = {};    // milestone id -> true, so a toast fires once only

  function termKey(entry) {
    return entry._key;
  }

  function loadProgress() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      read = parsed.read || {};
      celebrated = parsed.celebrated || {};
    } catch (e) {
      read = {};
      celebrated = {};
    }
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ read: read, celebrated: celebrated }));
    } catch (e) {
      /* private mode or storage full — progress simply stays for this session */
    }
  }

  function readCount() {
    return LEXICON.filter(function (e) { return read[termKey(e)]; }).length;
  }

  function letterProgress(letter) {
    var words = byLetter[letter];
    var done = words.filter(function (e) { return read[termKey(e)]; }).length;
    return { done: done, total: words.length, ratio: words.length ? done / words.length : 0 };
  }

  function sourceProgress(num) {
    var words = LEXICON.filter(function (e) { return String(e.source) === String(num); });
    var done = words.filter(function (e) { return read[termKey(e)]; }).length;
    return { done: done, total: words.length, ratio: words.length ? done / words.length : 0 };
  }

  var alphabetEl = document.getElementById("alphabet");
  var panelEl = document.getElementById("wordpanel");
  var panelLetterEl = document.getElementById("wp-letter");
  var panelCardsEl = document.getElementById("wp-cards");
  var closeBtn = document.getElementById("wp-close");
  var sourcesListEl = document.getElementById("sources-list");

  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabPanels = {
    alphabet: document.getElementById("tab-alphabet"),
    sources: document.getElementById("tab-sources"),
    stats: document.getElementById("tab-stats")
  };

  function showTab(name) {
    Object.keys(tabPanels).forEach(function (key) {
      tabPanels[key].hidden = key !== name;
    });
    tabBtns.forEach(function (b) {
      var active = b.getAttribute("data-tab") === name;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  tabBtns.forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
  });

  var heroBadge = document.querySelector(".hero-badge");
  if (heroBadge) {
    heroBadge.addEventListener("click", function (e) {
      e.preventDefault();
      showTab("alphabet");
      alphabetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function buildTiles() {
    var lettersWithWords = 0;

    LETTERS.forEach(function (letter) {
      var words = byLetter[letter];
      var hasWords = words.length > 0;
      if (hasWords) lettersWithWords++;

      var btn = document.createElement("button");
      btn.className = "letter-tile" + (hasWords ? "" : " is-empty");
      btn.setAttribute("data-letter", letter);
      btn.setAttribute("aria-label", hasWords
        ? "Letter " + letter + ", " + words.length + " terms"
        : "Letter " + letter + ", no terms yet");

      var inner = "";
      if (hasWords) inner += '<span class="blob"></span>';
      inner += '<span class="glyph">' + letter + "</span>";
      if (hasWords) {
        inner += '<span class="count"></span>';
        inner += smileyTile();
        inner += '<span class="tile-track"><span class="tile-fill"></span></span>';
      }
      btn.innerHTML = inner;

      if (hasWords) {
        btn.addEventListener("click", function () { selectLetter(letter, btn); });
      } else {
        btn.title = "Terms coming soon";
        btn.disabled = true;
      }

      alphabetEl.appendChild(btn);
    });

    var statTerms = document.getElementById("stat-terms");
    var statLetters = document.getElementById("stat-letters");
    if (statTerms) statTerms.textContent = LEXICON.length;
    if (statLetters) statLetters.textContent = lettersWithWords + "/26";
  }

  var currentBtn = null;

  function selectLetter(letter, btn) {
    if (currentBtn) currentBtn.classList.remove("is-selected");
    btn.classList.add("is-selected");
    currentBtn = btn;

    var words = byLetter[letter];
    var lp = letterProgress(letter);
    panelLetterEl.innerHTML = letter + '<span class="full">' + lp.done + " / " + lp.total + " read</span>";

    panelCardsEl.innerHTML = "";
    words.forEach(function (entry) {
      var key = termKey(entry);
      var isRead = !!read[key];
      var card = document.createElement("div");
      card.className = "card" + (isRead ? " is-read" : "");
      card.setAttribute("data-key", key);
      var src = entry.source && SOURCES[entry.source];
      card.innerHTML =
        '<h3><span class="dot"></span>' + escapeHtml(entry.term) + "</h3>" +
        "<p>" + escapeHtml(entry.definition) + "</p>" +
        '<div class="card-foot">' +
          (src
            ? '<a class="source-badge" href="#src-' + entry.source + '" data-src="' + entry.source + '">Source ' + entry.source + "</a>"
            : "<span></span>") +
          '<button class="collect-btn" data-key="' + escapeAttr(key) + '" aria-pressed="' + (isRead ? "true" : "false") + '">' +
            '<span class="collect-ring"><span class="collect-tick">' + smileyFace() + "</span></span>" +
            '<span class="collect-label">' + (isRead ? "Read" : "Mark as read") + "</span>" +
          "</button>" +
        "</div>";
      panelCardsEl.appendChild(card);
    });

    panelEl.hidden = false;
    panelEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  closeBtn.addEventListener("click", function () {
    panelEl.hidden = true;
    if (currentBtn) currentBtn.classList.remove("is-selected");
    currentBtn = null;
  });

  panelCardsEl.addEventListener("click", function (e) {
    var target = e.target.closest(".source-badge");
    if (!target) return;
    e.preventDefault();
    var num = target.getAttribute("data-src");
    showTab("sources");
    var li = document.getElementById("src-" + num);
    if (li) {
      li.scrollIntoView({ behavior: "smooth", block: "center" });
      li.classList.remove("is-flash");
      void li.offsetWidth;
      li.classList.add("is-flash");
    }
  });

  function buildSources() {
    var nums = Object.keys(SOURCES).sort(function (a, b) { return Number(a) - Number(b); });

    nums.forEach(function (num) {
      var s = SOURCES[num];
      var li = document.createElement("li");
      li.id = "src-" + num;
      var tags = '<span class="src-type-tag">' + escapeHtml(s.type || "Other") + "</span>";
      if (s.language) tags += '<span class="src-type-tag src-lang-tag">' + escapeHtml(s.language) + "</span>";

      var openTextHtml = s.url
        ? '<a class="open-text-btn" href="' + escapeAttr(s.url) + '" target="_blank" rel="noopener">Open Text ↗</a>'
        : "";

      li.innerHTML =
        '<span class="src-num">' + num + "</span>" +
        "<span>" +
        '<span class="src-tags">' + tags + "</span>" +
        "<div class=\"src-citation\">" + escapeHtml(s.authors) + " (" + escapeHtml(s.year) + "). " +
        '<span class="src-title">' + escapeHtml(s.title) + "</span>.</div>" +
        '<div class="src-meta">' + escapeHtml(s.publisher) + "</div>" +
        openTextHtml +
        "</span>";
      sourcesListEl.appendChild(li);
    });
  }

  function buildStats() {
    var svg = document.getElementById("radial-letters");
    var totalEl = document.getElementById("radial-total");
    var sourcesEl = document.getElementById("stats-sources");
    if (!svg || !sourcesEl) return;

    var active = LETTERS.filter(function (l) { return byLetter[l].length > 0; });
    var maxCount = Math.max.apply(null, active.map(function (l) { return byLetter[l].length; }));
    var minCount = Math.min.apply(null, active.map(function (l) { return byLetter[l].length; }));
    var cx = 200, cy = 200, rInner = 46, rOuter = 168;

    var svgHtml = "";
    active.forEach(function (letter, i) {
      var count = byLetter[letter].length;
      var t = maxCount > minCount ? (count - minCount) / (maxCount - minCount) : 1;
      var rTip = rInner + t * (rOuter - rInner);
      var angle = (i / active.length) * Math.PI * 2 - Math.PI / 2;
      var x1 = cx + Math.cos(angle) * rInner;
      var y1 = cy + Math.sin(angle) * rInner;
      var x2 = cx + Math.cos(angle) * rTip;
      var y2 = cy + Math.sin(angle) * rTip;
      var lx = cx + Math.cos(angle) * (rTip + 18);
      var ly = cy + Math.sin(angle) * (rTip + 18);

      svgHtml +=
        '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="radial-spoke"/>' +
        '<circle cx="' + x2 + '" cy="' + y2 + '" r="4" class="radial-dot"/>' +
        '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle" ' +
        'class="radial-tick-label">' + letter + "</text>";
    });
    svg.innerHTML = svgHtml;
    if (totalEl) totalEl.textContent = LEXICON.length;

    var srcCounts = {};
    LEXICON.forEach(function (entry) {
      if (!entry.source) return;
      srcCounts[entry.source] = (srcCounts[entry.source] || 0) + 1;
    });
    var srcNums = Object.keys(SOURCES).sort(function (a, b) { return Number(a) - Number(b); });

    sourcesEl.innerHTML = "";
    srcNums.forEach(function (num) {
      var count = srcCounts[num] || 0;
      var shortName = (SOURCES[num].authors.split(",")[0] || SOURCES[num].authors).split(";")[0];
      var card = document.createElement("div");
      card.className = "stat-card";
      card.innerHTML =
        '<span class="stat-card-badge">' + num + "</span>" +
        '<span class="stat-card-body">' +
          '<span class="stat-card-count">' + count + "</span>" +
          '<span class="stat-card-label">' + escapeHtml(shortName) + "</span>" +
        "</span>";
      sourcesEl.appendChild(card);
    });
  }

  /* =======================================================================
     CONCEPT STATISTICS
     Three levels, switched by the buttons above:
       1  Source profiles  — one text at a time, chosen from the dropdown
       2  Comparison       — the six texts against each other
       3  Network          — concepts and texts as one constellation
     ======================================================================= */

  var FAMILY_ORDER = ["eco", "pol", "dec", "soc", "des"];

  // Short handles for chart labels, where the full citation will not fit.
  var SOURCE_SHORT = {
    "1": "Fatheuer", "2": "Fry", "3": "Noguera et al.",
    "4": "Brandt Report", "5": "Avilés-Irahola & Youkhana", "6": "Aschner Rosselli et al."
  };
  var SOURCE_TAG = {
    "1": "Fatheuer", "2": "Fry", "3": "Noguera",
    "4": "Brandt", "5": "Avilés-Irahola", "6": "Aschner"
  };

  // Long canonical names collide in the constellation; these are the short
  // forms used there and nowhere else.
  var CANON_SHORT = {
    "global-south": "Global South",
    "decolonization": "Decolonization",
    "earth-life": "Nature / Earth",
    "modernity": "Modernity",
    "indigenous": "Indigenous Knowledge",
    "north-south": "North-South Report",
    "aesthesis": "Methodesthesis",
    "mutual-interest": "Mutual Interests",
    "gender": "Gender",
    "world-domestic": "World Domestic Policy",
    "internal-colonialism": "Internal Colonialism",
    "ontological-design": "Ontological Design",
    "border-thinking": "Border Thinking",
    "colonial-power": "Colonial Power"
  };

  var statIds = typeof CONCEPT_STATS === "undefined"
    ? []
    : Object.keys(CONCEPT_STATS).sort(function (a, b) { return Number(a) - Number(b); });

  // Highest single frequency in the corpus. Every bar in the site is scaled
  // against this one number, so bars stay comparable from text to text.
  var globalMaxFreq = 0;
  statIds.forEach(function (id) {
    CONCEPT_STATS[id].concepts.forEach(function (c) {
      if (c.freq > globalMaxFreq) globalMaxFreq = c.freq;
    });
  });

  function barWidth(freq) {
    return (Math.sqrt(freq) / Math.sqrt(globalMaxFreq)) * 100;
  }

  function freqLabel(c) {
    return String(c.freq);
  }

  // Share of the document's pages on which a concept occurs. Separates
  // vocabulary that runs through the whole text from vocabulary concentrated
  // in one stretch of it.
  function reach(c, stat) {
    return stat.totalPages ? c.pages / stat.totalPages : 0;
  }

  function famVar(key) {
    return "var(--fam-" + key + ")";
  }

  // ---- level navigation -------------------------------------------------

  function initLevelNav() {
    var btns = document.querySelectorAll(".level-btn");
    var panels = document.querySelectorAll("[data-level-panel]");
    if (!btns.length) return;

    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var level = btn.getAttribute("data-level");
        btns.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        panels.forEach(function (p) {
          p.hidden = p.getAttribute("data-level-panel") !== level;
        });
      });
    });
  }

  /* ---------------------------------------------------------------------
     LEVEL 1 — profile of a single source
     --------------------------------------------------------------------- */

  function conceptSpectrumHtml(stat) {
    var rows = stat.concepts.map(function (c, i) {
      var rc = reach(c, stat);
      return (
        '<li class="spec-row">' +
          '<span class="spec-rank">' + (i + 1 < 10 ? "0" : "") + (i + 1) + "</span>" +
          '<span class="spec-term">' + escapeHtml(c.term) +
            (c.orig ? '<em class="spec-orig">' + escapeHtml(c.orig) + "</em>" : "") +
          "</span>" +
          '<span class="spec-bar-cell">' +
            '<span class="spec-bar" style="width:' + barWidth(c.freq).toFixed(2) + "%;background:" + famVar(c.family) + '"></span>' +
          "</span>" +
          '<span class="spec-freq">' + freqLabel(c) + "</span>" +
          '<span class="spec-reach" title="' + escapeAttr("Appears on " + c.pages + " of " + stat.totalPages + " pages (pp. " + c.span + ")") + '">' +
            '<span class="spec-reach-track"><span class="spec-reach-fill" style="width:' + (rc * 100).toFixed(1) + '%"></span></span>' +
            '<span class="spec-reach-n">' + c.pages + "</span>" +
          "</span>" +
          '<span class="spec-cat cat-' + c.cat + '" title="' + escapeAttr(FREQ_CATEGORIES[c.cat].label + " — " + FREQ_CATEGORIES[c.cat].rule) + '">' + c.cat + "</span>" +
        "</li>"
      );
    }).join("");

    return (
      '<div class="spec-head">' +
        "<span>Concept group</span><span>Count</span><span>Pages</span>" +
      "</div>" +
      '<ol class="spectrum">' + rows + "</ol>"
    );
  }

  function familyBalanceHtml(stat) {
    var totals = {};
    var counts = {};
    var sum = 0;
    FAMILY_ORDER.forEach(function (f) { totals[f] = 0; counts[f] = 0; });
    stat.concepts.forEach(function (c) {
      totals[c.family] += c.freq;
      counts[c.family] += 1;
      sum += c.freq;
    });

    var segs = "";
    var legend = "";
    FAMILY_ORDER.forEach(function (f) {
      if (!totals[f]) return;
      var pct = (totals[f] / sum) * 100;
      segs += '<span class="fam-seg" style="width:' + pct.toFixed(2) + "%;background:" + famVar(f) + '" ' +
        'title="' + escapeAttr(CONCEPT_FAMILIES[f].label + ": " + pct.toFixed(0) + "%") + '"></span>';
      legend +=
        '<div class="fam-legend-row">' +
          '<span class="fam-swatch" style="background:' + famVar(f) + '"></span>' +
          '<span class="fam-name">' + escapeHtml(CONCEPT_FAMILIES[f].short) + "</span>" +
          '<span class="fam-pct">' + pct.toFixed(0) + "%</span>" +
          '<span class="fam-count">' + counts[f] + (counts[f] === 1 ? " group" : " groups") + "</span>" +
        "</div>";
    });

    return (
      '<div class="fam-block">' +
        '<div class="fam-bar">' + segs + "</div>" +
        '<div class="fam-legend">' + legend + "</div>" +
      "</div>"
    );
  }

  function categoryBandsHtml(stat) {
    var order = ["A", "B", "C", "D"];
    var counts = { A: 0, B: 0, C: 0, D: 0 };
    stat.concepts.forEach(function (c) { counts[c.cat]++; });

    return '<div class="cat-bands">' + order.map(function (k) {
      var n = counts[k];
      var meta = FREQ_CATEGORIES[k];
      return (
        '<div class="cat-band' + (n ? "" : " is-empty") + '">' +
          '<span class="cat-band-letter">' + k + "</span>" +
          '<span class="cat-band-count">' + n + "</span>" +
          '<span class="cat-band-label">' + escapeHtml(meta.label) + "</span>" +
          '<span class="cat-band-rule">' + escapeHtml(meta.rule) + "</span>" +
        "</div>"
      );
    }).join("") + "</div>";
  }

  // Frequency (log scale) against page reach: separates vocabulary that runs
  // through the whole text from vocabulary concentrated in one stretch.
  function reachPlotHtml(stat) {
    var W = 660, H = 390, padL = 46, padR = 24, padT = 26, padB = 44;
    var maxF = globalMaxFreq;
    var lx = function (f) {
      var t = Math.log(f) / Math.log(maxF);
      return padL + t * (W - padL - padR);
    };
    var ly = function (r) {
      return H - padB - r * (H - padT - padB);
    };

    var grid = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (r) {
      grid += '<line class="plot-grid" x1="' + padL + '" y1="' + ly(r) + '" x2="' + (W - padR) + '" y2="' + ly(r) + '"/>' +
        '<text class="plot-axis" x="' + (padL - 12) + '" y="' + (ly(r) + 4) + '" text-anchor="end">' + Math.round(r * 100) + "%</text>";
    });
    [1, 10, 50, 210].forEach(function (f) {
      grid += '<text class="plot-axis" x="' + lx(f) + '" y="' + (H - padB + 20) + '" text-anchor="middle">' + f + "</text>";
    });

    // Many concepts share the same reach, so points would stack. Fan each band
    // out vertically and flip labels to the left half of the plot once a point
    // sits too far right for its label to fit.
    var byBand = {};
    stat.concepts.forEach(function (c) {
      var band = Math.round(reach(c, stat) * 8);
      (byBand[band] = byBand[band] || []).push(c);
    });

    var placed = [];
    var dots = Object.keys(byBand).map(function (w) {
      var group = byBand[w].slice().sort(function (a, b) { return a.freq - b.freq; });
      return group.map(function (c, k) {
        var x = lx(c.freq);
        var y = ly(reach(c, stat)) + (k - (group.length - 1) / 2) * 13;
        var short = c.term.split(" / ")[0].split(" (")[0];
        var flip = x > W * 0.62;

        // Nudge down until this label clears the ones already drawn.
        var ly2 = y + 4;
        for (var guard = 0; guard < 12; guard++) {
          var clash = placed.some(function (p) {
            return Math.abs(p.x - x) < 96 && Math.abs(p.y - ly2) < 12;
          });
          if (!clash) break;
          ly2 += 13;
        }
        placed.push({ x: x, y: ly2 });

        return (
          '<g class="plot-node">' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5.5" fill="' + famVar(c.family) + '"/>' +
            (Math.abs(ly2 - (y + 4)) > 2
              ? '<line class="plot-leader" x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + (ly2 - 4).toFixed(1) + '"/>'
              : "") +
            '<text class="plot-label" x="' + (flip ? x - 10 : x + 10).toFixed(1) + '" y="' + ly2.toFixed(1) +
              '" text-anchor="' + (flip ? "end" : "start") + '">' + escapeHtml(short) + "</text>" +
            "<title>" + escapeHtml(c.term + " — " + freqLabel(c) + " occurrences on " + c.pages +
              " of " + stat.totalPages + " pages (pp. " + c.span + ")") + "</title>" +
          "</g>"
        );
      }).join("");
    }).join("");

    return (
      '<div class="plot-box">' +
        '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Frequency against page reach">' +
          grid + dots +
        "</svg>" +
        '<div class="plot-axes-labels"><span>Occurrences (log)</span><span>Share of pages</span></div>' +
      "</div>"
    );
  }

  /* The frequency-tier reading, built for every text from the same A-D
     categories the analysis framework defines. Ring radii are cumulative, so
     the innermost disc is the share of core concepts and the outermost is
     always the full set — a text whose vocabulary is all category A reads as
     an almost solid disc. */

  var TIER_ORDER = ["A", "B", "C", "D"];
  var TIER_LABEL = { A: "Very Frequent", B: "Frequent", C: "Moderate", D: "Rare" };
  var TIER_OPACITY = { A: 0.95, B: 0.68, C: 0.42, D: 0.2 };

  function tierSectionHtml(stat) {
    var groups = { A: [], B: [], C: [], D: [] };
    stat.concepts.forEach(function (c) { groups[c.cat].push(c); });
    var total = stat.concepts.length;

    // Outermost first so the darker inner discs paint on top.
    var cum = {}, running = 0;
    TIER_ORDER.forEach(function (k) { running += groups[k].length; cum[k] = running; });

    var rings = "";
    TIER_ORDER.slice().reverse().forEach(function (k) {
      if (!cum[k]) return;
      var r = 26 + 104 * Math.sqrt(cum[k] / total);
      rings += '<circle cx="150" cy="150" r="' + r.toFixed(1) + '" fill="var(--accent)" opacity="' +
        TIER_OPACITY[k] + '"><title>' + escapeHtml(TIER_LABEL[k] + " and above — " + cum[k] + " of " + total + " concept groups") + "</title></circle>";
    });

    var legend = TIER_ORDER.map(function (k) {
      return '<div class="freq-legend-row' + (groups[k].length ? "" : " is-off") + '">' +
        '<span class="freq-swatch" style="opacity:' + TIER_OPACITY[k] + '"></span>' +
        "<span>" + escapeHtml(TIER_LABEL[k]) + "</span>" +
        '<span class="tier-n">' + groups[k].length + "</span>" +
      "</div>";
    }).join("");

    var cards = TIER_ORDER.map(function (k) {
      var list = groups[k];
      var items = list.length
        ? list.map(function (c) {
            return "<li>" +
              '<span class="freq-term">' + escapeHtml(c.term) + "</span>" +
              '<span class="tier-figs">' +
                '<span class="tier-freq">' + freqLabel(c) + "</span>" +
              "</span>" +
              '<span class="tier-dist">' + (c.orig ? escapeHtml(c.orig) + " · " : "") +
                "pp. " + escapeHtml(c.span) + " · " + c.pages +
                (c.pages === 1 ? " page" : " pages") + "</span>" +
            "</li>";
          }).join("")
        : '<li class="tier-empty">No concept group falls in this band in this text.</li>';

      return '<div class="freq-card' + (list.length ? "" : " is-off") + '">' +
        '<div class="freq-card-head">' +
          '<span class="freq-swatch" style="opacity:' + TIER_OPACITY[k] + '"></span>' +
          "<h4>" + escapeHtml(TIER_LABEL[k]) + "</h4>" +
          '<span class="tier-rule">' + escapeHtml(FREQ_CATEGORIES[k].rule) + "</span>" +
        "</div>" +
        '<p class="freq-card-desc">' + escapeHtml(FREQ_CATEGORIES[k].note) + "</p>" +
        '<ul class="freq-term-list tier-list">' + items + "</ul>" +
      "</div>";
    }).join("");

    return (
      '<div class="freq-section">' +
        '<h3 class="stats-subhead">Frequency tiers</h3>' +
        '<p class="sources-note">The same four bands applied to every text: how the vocabulary of this source ' +
          'splits between load-bearing core concepts and passing references.</p>' +
        '<div class="freq-wrap">' +
          '<div class="freq-chart-box">' +
            '<svg viewBox="0 0 300 300">' + rings + "</svg>" +
          "</div>" +
          '<div class="freq-legend">' + legend + "</div>" +
        "</div>" +
        '<div class="freq-cards">' + cards + "</div>" +
      "</div>"
    );
  }

  function wordFreqHtml(num) {
    if (typeof WORD_FREQUENCY === "undefined" || !WORD_FREQUENCY[num]) return "";
    var data = WORD_FREQUENCY[num];
    var tierOpacity = { "Very Frequent": 0.95, "Frequent": 0.68, "Moderate": 0.42, "Rare": 0.2 };

    var cards = data.terms.map(function (t) {
      return (
        '<article class="cr-card">' +
          '<div class="cr-head">' +
            "<h4>" + escapeHtml(t.term) + "</h4>" +
            '<span class="cr-orig">' + escapeHtml(t.original) + "</span>" +
          "</div>" +
          '<p class="cr-role">' + escapeHtml(t.role) + "</p>" +
          '<div class="cr-foot">' +
            '<span class="cr-tier"><span class="freq-swatch" style="opacity:' +
              (tierOpacity[t.tier] || 0.5) + '"></span>' + escapeHtml(t.tier) + "</span>" +
            (t.page ? '<span class="cr-page">p. ' + escapeHtml(t.page) + "</span>" : "") +
          "</div>" +
        "</article>"
      );
    }).join("");

    var sourced = data.terms.filter(function (t) { return t.page; }).length;

    return (
      '<div class="freq-section">' +
        '<h3 class="stats-subhead">Close reading — term by term</h3>' +
        (data.reportTitle ? '<p class="sources-note">' + escapeHtml(data.reportTitle) + "</p>" : "") +
        '<p class="sources-note tier-note">Each concept in the source\u2019s own language, what it does in the ' +
          "argument, and " +
          (sourced === data.terms.length
            ? "the page the reading is drawn from."
            : "where recorded, the page the reading is drawn from.") +
        "</p>" +
        '<div class="cr-grid">' + cards + "</div>" +
      "</div>"
    );
  }

  function renderSourceProfile(id) {
    var host = document.getElementById("source-profile");
    var stat = CONCEPT_STATS[id];
    var src = SOURCES[id];
    if (!host || !stat) return;

    var total = 0, coreCount = 0;
    stat.concepts.forEach(function (c) {
      total += c.freq;
      if (c.cat === "A") coreCount++;
    });
    var top = stat.concepts[0];

    host.innerHTML =
      '<div class="profile-head">' +
        '<div class="profile-head-main">' +
          '<span class="profile-eyebrow">Text ' + stat.textNo + " in the analysis · Source " + id + "</span>" +
          "<h3>" + escapeHtml(SOURCE_SHORT[id] || "") + "</h3>" +
          '<p class="profile-title">' + escapeHtml(src ? src.title : "") + "</p>" +
          '<p class="profile-lead">' + escapeHtml(stat.lead) + "</p>" +
        "</div>" +
        '<div class="profile-focus">' +
          "<span>Theoretical focus</span>" +
          "<strong>" + escapeHtml(stat.focus) + "</strong>" +
        "</div>" +
      "</div>" +

      '<div class="profile-figures">' +
        "<div><dt>" + total + "</dt><dd>counted occurrences</dd></div>" +
        "<div><dt>" + stat.concepts.length + "</dt><dd>concept groups</dd></div>" +
        "<div><dt>" + coreCount + "</dt><dd>core concepts (A)</dd></div>" +
        "<div><dt>" + stat.totalPages + "</dt><dd>pages analysed</dd></div>" +
        '<div><dt class="is-word">' + escapeHtml(top.term.split(" / ")[0]) + "</dt><dd>primary concept</dd></div>" +
      "</div>" +

      '<h3 class="stats-subhead">Concept spectrum</h3>' +
      '<p class="sources-note">Every count is measured directly from the source PDF, with running page headers and the ' +
        'reference list removed first. Bars are scaled against the highest frequency in the corpus (' + globalMaxFreq +
        '), so they can be read across texts; colour marks the concept family, and the second bar is the share of ' +
        "the document's pages on which the concept occurs.</p>" +
      conceptSpectrumHtml(stat) +

      '<h3 class="stats-subhead">Balance of concept families</h3>' +
      '<p class="sources-note">Share of all counted occurrences, by family.</p>' +
      familyBalanceHtml(stat) +

      '<h3 class="stats-subhead">Frequency categories</h3>' +
      '<p class="sources-note">Fixed thresholds, applied identically to every text.</p>' +
      categoryBandsHtml(stat) +

      '<h3 class="stats-subhead">Reach against frequency</h3>' +
      '<p class="sources-note">High on the right: vocabulary that is both frequent and spread across the whole text. ' +
        'Low on the right: concepts used often but concentrated in one stretch of the argument.</p>' +
      reachPlotHtml(stat) +

      '<h3 class="stats-subhead">Reading</h3>' +
      '<p class="profile-reading">' + escapeHtml(stat.reading) + "</p>";

    var wf = document.getElementById("word-freq-sections");
    if (wf) wf.innerHTML = tierSectionHtml(stat) + wordFreqHtml(id);
  }

  function buildSourceProfiles() {
    var select = document.getElementById("stat-source-select");
    if (!select || !statIds.length) return;

    select.innerHTML = statIds.map(function (id) {
      return '<option value="' + id + '">' + escapeHtml(id + " · " + (SOURCE_SHORT[id] || "") + " — " + CONCEPT_STATS[id].focus) + "</option>";
    }).join("");

    select.addEventListener("change", function () { renderSourceProfile(select.value); });
    renderSourceProfile(statIds[0]);
  }

  /* ---------------------------------------------------------------------
     Shared index — which canonical concept appears in which text
     --------------------------------------------------------------------- */

  var canonIndex = {}; // canon -> { label, family, texts: {id: concept}, total, count }

  function buildCanonIndex() {
    statIds.forEach(function (id) {
      CONCEPT_STATS[id].concepts.forEach(function (c) {
        var rec = canonIndex[c.canon];
        if (!rec) {
          rec = canonIndex[c.canon] = {
            canon: c.canon,
            label: CANON_LABELS[c.canon] || c.term,
            family: c.family,
            texts: {},
            total: 0,
            count: 0
          };
        }
        rec.texts[id] = c;
        rec.total += c.freq;
        rec.count++;
      });
    });
  }

  function canonList() {
    return Object.keys(canonIndex).map(function (k) { return canonIndex[k]; });
  }

  /* ---------------------------------------------------------------------
     LEVEL 2 — the six texts compared
     --------------------------------------------------------------------- */

  function sharedMatrixHtml() {
    var shared = canonList()
      .filter(function (r) { return r.count > 1; })
      .sort(function (a, b) { return b.count - a.count || b.total - a.total; });

    var header = '<div class="mx-row mx-head"><span class="mx-label"></span>' +
      statIds.map(function (id) {
        return '<span class="mx-cell mx-col-head"><b>' + id + "</b>" + escapeHtml(SOURCE_TAG[id]) + "</span>";
      }).join("") + '<span class="mx-total">texts</span></div>';

    var rows = shared.map(function (r) {
      var cells = statIds.map(function (id) {
        var c = r.texts[id];
        if (!c) return '<span class="mx-cell"><span class="mx-empty"></span></span>';
        var size = 8 + barWidth(c.freq) * 0.26;
        return '<span class="mx-cell" title="' + escapeAttr(SOURCE_SHORT[id] + " — " + c.term + ": " + freqLabel(c) + " occurrences") + '">' +
          '<span class="mx-dot" style="width:' + size.toFixed(1) + "px;height:" + size.toFixed(1) + "px;background:" + famVar(r.family) + '"></span>' +
        "</span>";
      }).join("");
      return '<div class="mx-row">' +
        '<span class="mx-label"><span class="fam-swatch" style="background:' + famVar(r.family) + '"></span>' + escapeHtml(r.label) + "</span>" +
        cells +
        '<span class="mx-total">' + r.count + "</span>" +
      "</div>";
    }).join("");

    return '<div class="mx-scroll"><div class="matrix">' + header + rows + "</div></div>";
  }

  function uniqueConceptsHtml() {
    var groups = statIds.map(function (id) {
      var uniques = canonList().filter(function (r) {
        return r.count === 1 && r.texts[id];
      }).sort(function (a, b) { return b.total - a.total; });

      return (
        '<div class="uniq-col">' +
          '<h4><span class="uniq-num">' + id + "</span>" + escapeHtml(SOURCE_TAG[id]) + "</h4>" +
          '<p class="uniq-count">' + uniques.length + " of " + CONCEPT_STATS[id].concepts.length + " concepts appear nowhere else</p>" +
          "<ul>" + uniques.map(function (r) {
            return '<li><span class="fam-swatch" style="background:' + famVar(r.family) + '"></span>' + escapeHtml(r.label) + "</li>";
          }).join("") + "</ul>" +
        "</div>"
      );
    }).join("");
    return '<div class="uniq-grid">' + groups + "</div>";
  }

  function similarityHtml() {
    var pairs = [];
    var maxShared = 0;
    var lookup = {};
    statIds.forEach(function (a) {
      statIds.forEach(function (b) {
        if (a >= b) return;
        var setA = CONCEPT_STATS[a].concepts.map(function (c) { return c.canon; });
        var setB = CONCEPT_STATS[b].concepts.map(function (c) { return c.canon; });
        var shared = setA.filter(function (c) { return setB.indexOf(c) > -1; });
        var union = setA.concat(setB.filter(function (c) { return setA.indexOf(c) < 0; })).length;
        var rec = { a: a, b: b, shared: shared, n: shared.length, jaccard: shared.length / union };
        pairs.push(rec);
        lookup[a + "-" + b] = rec;
        if (rec.n > maxShared) maxShared = rec.n;
      });
    });

    var rowIds = statIds.slice(1);
    var colIds = statIds.slice(0, -1);
    var grid = '<div class="sim-row sim-head"><span class="sim-label"></span>' +
      colIds.map(function (id) { return '<span class="sim-cell sim-col-head">' + id + "</span>"; }).join("") + "</div>";

    rowIds.forEach(function (rid) {
      var cells = colIds.map(function (cid) {
        if (Number(cid) >= Number(rid)) return '<span class="sim-cell sim-void"></span>';
        var rec = lookup[cid + "-" + rid];
        var op = maxShared ? rec.n / maxShared : 0;
        var fill = 0.08 + op * 0.85;
        return '<span class="sim-cell" title="' + escapeAttr(
          SOURCE_TAG[cid] + " ↔ " + SOURCE_TAG[rid] + ": " + rec.n + " shared concepts" +
          (rec.n ? " (" + rec.shared.map(function (c) { return CANON_LABELS[c] || c; }).join(", ") + ")" : "")
        ) + '"><span class="sim-fill" style="opacity:' + fill.toFixed(2) + '"></span>' +
          '<span class="sim-n' + (fill < 0.55 ? " is-light" : "") + (rec.n ? "" : " is-zero") + '">' + rec.n + "</span></span>";
      }).join("");
      grid += '<div class="sim-row"><span class="sim-label"><b>' + rid + "</b> " + escapeHtml(SOURCE_TAG[rid]) + "</span>" + cells + "</div>";
    });

    var ranked = pairs.slice().sort(function (x, y) { return y.n - x.n || y.jaccard - x.jaccard; });
    var closest = ranked[0];
    var isolated = {};
    statIds.forEach(function (id) { isolated[id] = 0; });
    pairs.forEach(function (p) { if (p.n === 0) { isolated[p.a]++; isolated[p.b]++; } });
    var mostIsolated = statIds.slice().sort(function (a, b) { return isolated[b] - isolated[a]; })[0];

    return (
      '<div class="sim-wrap">' +
        '<div class="sim-grid">' + grid + "</div>" +
        '<div class="sim-notes">' +
          '<div class="sim-note"><span>Closest pair</span><strong>' + escapeHtml(SOURCE_TAG[closest.a] + " ↔ " + SOURCE_TAG[closest.b]) +
            "</strong><p>" + closest.n + " shared concepts: " + escapeHtml(closest.shared.map(function (c) { return CANON_LABELS[c] || c; }).join(", ")) + ".</p></div>" +
          '<div class="sim-note"><span>Most isolated</span><strong>' + escapeHtml(SOURCE_TAG[mostIsolated]) +
            "</strong><p>Shares no concept at all with " + isolated[mostIsolated] + " of the other five texts.</p></div>" +
        "</div>" +
      "</div>"
    );
  }

  function fingerprintsHtml() {
    var cols = statIds.map(function (id) {
      var stat = CONCEPT_STATS[id];
      var totals = {}, sum = 0;
      FAMILY_ORDER.forEach(function (f) { totals[f] = 0; });
      stat.concepts.forEach(function (c) { totals[c.family] += c.freq; sum += c.freq; });

      var bars = FAMILY_ORDER.map(function (f) {
        var pct = sum ? (totals[f] / sum) * 100 : 0;
        return '<span class="fp-track" title="' + escapeAttr(CONCEPT_FAMILIES[f].label + ": " + pct.toFixed(0) + "%") + '">' +
          '<span class="fp-fill" style="height:' + pct.toFixed(1) + "%;background:" + famVar(f) + '"></span>' +
        "</span>";
      }).join("");

      return (
        '<figure class="fp-col">' +
          '<div class="fp-bars">' + bars + "</div>" +
          "<figcaption><b>" + id + "</b>" + escapeHtml(SOURCE_TAG[id]) + "</figcaption>" +
        "</figure>"
      );
    }).join("");

    var legend = FAMILY_ORDER.map(function (f) {
      return '<div class="fam-legend-row"><span class="fam-swatch" style="background:' + famVar(f) + '"></span>' +
        '<span class="fam-name">' + escapeHtml(CONCEPT_FAMILIES[f].label) + "</span></div>";
    }).join("");

    return '<div class="fp-wrap"><div class="fp-grid">' + cols + "</div>" +
      '<div class="fam-legend fp-legend">' + legend + "</div></div>";
  }

  function corpusRankingHtml() {
    var ranked = canonList().sort(function (a, b) { return b.total - a.total; }).slice(0, 14);
    var max = ranked[0].total;
    return '<ul class="corpus-rank">' + ranked.map(function (r) {
      var scale = 0.62 + (Math.sqrt(r.total) / Math.sqrt(max)) * 1.5;
      return '<li>' +
        '<span class="cr-word" style="font-size:' + scale.toFixed(2) + 'rem;color:' + famVar(r.family) + '">' + escapeHtml(r.label) + "</span>" +
        '<span class="cr-meta">' + r.total + " · " + r.count + (r.count === 1 ? " text" : " texts") + "</span>" +
      "</li>";
    }).join("") + "</ul>";
  }

  function buildCompare() {
    var host = document.getElementById("compare-sections");
    if (!host || !statIds.length) return;

    var sharedCount = canonList().filter(function (r) { return r.count > 1; }).length;

    host.innerHTML =
      '<h3 class="stats-subhead">Shared concepts</h3>' +
      '<p class="sources-note">' + sharedCount + " of " + canonList().length +
        " concept groups appear in more than one text. Dot size is the frequency inside that text; no concept is present in all six.</p>" +
      sharedMatrixHtml() +

      '<h3 class="stats-subhead">Conceptual proximity</h3>' +
      '<p class="sources-note">Number of concept groups two texts have in common. Darker means closer.</p>' +
      similarityHtml() +

      '<h3 class="stats-subhead">Family fingerprints</h3>' +
      '<p class="sources-note">Each text as the share of its vocabulary spent on each concept family.</p>' +
      fingerprintsHtml() +

      '<h3 class="stats-subhead">What the corpus talks about</h3>' +
      '<p class="sources-note">Concept groups by total occurrences across all six texts.</p>' +
      corpusRankingHtml() +

      '<h3 class="stats-subhead">Concepts unique to one text</h3>' +
      '<p class="sources-note">Where each author speaks alone.</p>' +
      uniqueConceptsHtml();
  }

  /* ---------------------------------------------------------------------
     LEVEL 3 — the constellation
     Texts sit on a ring. Every concept is placed at the centre of gravity of
     the texts that use it, so concepts shared by several texts drift inward
     and become visible as bridges, while single-text concepts stay at the rim.
     --------------------------------------------------------------------- */

  function buildNetwork() {
    var host = document.getElementById("network-sections");
    if (!host || !statIds.length) return;

    var W = 980, cx = W / 2, cy = W / 2, ringR = 352;
    var textPos = {};
    statIds.forEach(function (id, i) {
      var a = (i / statIds.length) * Math.PI * 2 - Math.PI / 2;
      textPos[id] = { x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR, angle: a };
    });

    var nodes = canonList().map(function (r, i) {
      var ids = Object.keys(r.texts);
      var px = 0, py = 0;
      ids.forEach(function (id) { px += textPos[id].x; py += textPos[id].y; });
      px /= ids.length; py /= ids.length;

      // The more texts share a concept, the further in it sits. Single-text
      // concepts stay out near their own text, fanned so they do not stack.
      var pull = Math.max(0.1, 0.82 - ids.length * 0.14);
      var x = cx + (px - cx) * pull;
      var y = cy + (py - cy) * pull;
      if (ids.length === 1) {
        var spread = ((i % 5) - 2) * 0.32;
        var base = textPos[ids[0]].angle + spread;
        var rad = ringR * 0.74 + (i % 3) * 28;
        x = cx + Math.cos(base) * rad;
        y = cy + Math.sin(base) * rad;
      }
      return {
        rec: r,
        ids: ids,
        r: 3.4 + Math.sqrt(r.total) * 0.62,
        x: x, y: y, ax: x, ay: y,
        label: r.count > 1
      };
    });

    // Deterministic relaxation so labels and dots stop overlapping.
    for (var it = 0; it < 460; it++) {
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i], b = nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var min = a.r + b.r + (a.label && b.label ? 54 : (a.label || b.label ? 22 : 11));
          if (d < min) {
            var push = ((min - d) / 2) * 0.5;
            a.x -= (dx / d) * push; a.y -= (dy / d) * push;
            b.x += (dx / d) * push; b.y += (dy / d) * push;
          }
        }
      }
      for (var k = 0; k < nodes.length; k++) {
        nodes[k].x += (nodes[k].ax - nodes[k].x) * 0.022;
        nodes[k].y += (nodes[k].ay - nodes[k].y) * 0.022;
      }
    }

    // Edges are kept as data so the animation loop can redraw them as the
    // concept nodes drift.
    var edgeList = [];
    nodes.forEach(function (n, k) {
      n.ids.forEach(function (id) {
        edgeList.push({ i: k, tx: textPos[id].x, ty: textPos[id].y, bridge: n.ids.length > 1 });
      });
    });

    function edgePath(e, nx, ny) {
      var mx = (nx + e.tx) / 2 + (cx - (nx + e.tx) / 2) * 0.18;
      var my = (ny + e.ty) / 2 + (cy - (ny + e.ty) / 2) * 0.18;
      return "M" + nx.toFixed(1) + " " + ny.toFixed(1) + " Q" + mx.toFixed(1) + " " + my.toFixed(1) +
             " " + e.tx.toFixed(1) + " " + e.ty.toFixed(1);
    }

    var edges = edgeList.map(function (e) {
      return '<path class="net-edge' + (e.bridge ? " is-bridge" : "") + '" data-i="' + e.i +
        '" d="' + edgePath(e, nodes[e.i].x, nodes[e.i].y) + '"/>';
    }).join("");

    // Every node carries a label. Shared concepts show theirs permanently;
    // single-text concepts keep theirs hidden until the node is hovered, which
    // is what stops the rim from being a field of anonymous dots.
    var conceptNodes = nodes.map(function (n, k) {
      var anchor = n.x < cx - 30 ? "end" : (n.x > cx + 30 ? "start" : "middle");
      var dx = anchor === "end" ? -(n.r + 7) : (anchor === "start" ? n.r + 7 : 0);
      var dy = anchor === "middle" ? -(n.r + 9) : 4;
      var lbl = '<text class="net-label' + (n.ids.length > 2 ? " is-strong" : "") +
        (n.label ? "" : " is-quiet") + '" x="' + (n.x + dx).toFixed(1) +
        '" y="' + (n.y + dy).toFixed(1) + '" text-anchor="' + anchor + '">' +
        escapeHtml(CANON_SHORT[n.rec.canon] || n.rec.label) + "</text>";

      return '<g class="net-node" data-i="' + k + '" data-count="' + n.ids.length + '">' +
        '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + n.r.toFixed(1) +
          '" fill="' + famVar(n.rec.family) + '" fill-opacity="' + (n.ids.length > 1 ? 0.95 : 0.55) + '"/>' +
        '<circle class="net-hit" cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) +
          '" r="' + Math.max(n.r + 7, 13).toFixed(1) + '"/>' +
        lbl +
        "<title>" + escapeHtml(n.rec.label + " — " + n.rec.total + " occurrences in " + n.ids.length +
          (n.ids.length === 1 ? " text" : " texts")) + "</title>" +
        "</g>";
    }).join("");

    var textNodes = statIds.map(function (id) {
      var p = textPos[id];
      var out = Math.abs(Math.cos(p.angle)) < 0.35;
      var lx = p.x + Math.cos(p.angle) * 34;
      var ly = p.y + Math.sin(p.angle) * 34 + (out ? (Math.sin(p.angle) > 0 ? 8 : -2) : 4);
      var anchor = out ? "middle" : (Math.cos(p.angle) > 0 ? "start" : "end");
      return '<g class="net-text">' +
        '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="19"/>' +
        '<text class="net-text-num" x="' + p.x.toFixed(1) + '" y="' + (p.y + 6).toFixed(1) + '" text-anchor="middle">' + id + "</text>" +
        '<text class="net-text-name" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '">' +
          escapeHtml(SOURCE_TAG[id]) + "</text>" +
        "</g>";
    }).join("");

    var bridges = canonList().filter(function (r) { return r.count >= 2; })
      .sort(function (a, b) { return b.count - a.count || b.total - a.total; });

    var bridgeHtml = bridges.map(function (r) {
      var chips = statIds.filter(function (id) { return r.texts[id]; })
        .map(function (id) { return '<span class="br-chip">' + id + "</span>"; }).join("");
      return (
        '<li class="br-row">' +
          '<span class="br-strength" style="background:' + famVar(r.family) + ";opacity:" + (0.25 + r.count * 0.15).toFixed(2) + '"></span>' +
          '<span class="br-name">' + escapeHtml(r.label) + "</span>" +
          '<span class="br-chips">' + chips + "</span>" +
          '<span class="br-count">' + r.count + "</span>" +
        "</li>"
      );
    }).join("");

    // Which families the concept families actually meet through shared texts.
    var famPairs = {};
    statIds.forEach(function (id) {
      var fams = {};
      CONCEPT_STATS[id].concepts.forEach(function (c) { fams[c.family] = (fams[c.family] || 0) + c.freq; });
      var keys = Object.keys(fams);
      keys.forEach(function (f1) {
        keys.forEach(function (f2) {
          if (f1 >= f2) return;
          var key = f1 + "|" + f2;
          famPairs[key] = (famPairs[key] || 0) + 1;
        });
      });
    });
    var famPairList = Object.keys(famPairs).map(function (k) {
      var p = k.split("|");
      return { a: p[0], b: p[1], n: famPairs[k] };
    }).sort(function (x, y) { return y.n - x.n; }).slice(0, 6);

    var famPairHtml = famPairList.map(function (p) {
      return '<li><span class="fam-swatch" style="background:' + famVar(p.a) + '"></span>' +
        escapeHtml(CONCEPT_FAMILIES[p.a].short) +
        '<span class="fp-link">↔</span>' +
        '<span class="fam-swatch" style="background:' + famVar(p.b) + '"></span>' +
        escapeHtml(CONCEPT_FAMILIES[p.b].short) +
        '<span class="fp-n">' + p.n + " texts</span></li>";
    }).join("");

    var legend = FAMILY_ORDER.map(function (f) {
      return '<div class="fam-legend-row"><span class="fam-swatch" style="background:' + famVar(f) + '"></span>' +
        '<span class="fam-name">' + escapeHtml(CONCEPT_FAMILIES[f].label) + "</span></div>";
    }).join("");

    host.innerHTML =
      '<h3 class="stats-subhead">Concept constellation</h3>' +
      '<p class="sources-note">The six texts sit on the ring. Every concept is placed at the centre of gravity of the texts that use it — ' +
        'so concepts shared by several texts drift inward, and concepts belonging to a single author stay at the edge. ' +
        'Circle size is total occurrences, colour is the concept family.</p>' +
      '<div class="net-box">' +
        '<div class="net-glow" aria-hidden="true"></div>' +
        '<svg viewBox="0 0 ' + W + " " + W + '" role="img" aria-label="Concept constellation">' +
          '<circle class="net-ring" cx="' + cx + '" cy="' + cy + '" r="' + ringR + '"/>' +
          edges + conceptNodes + textNodes +
        "</svg>" +
      "</div>" +
      '<div class="fam-legend net-legend">' + legend + "</div>" +

      '<h3 class="stats-subhead">Bridge concepts</h3>' +
      '<p class="sources-note">The concepts that hold the corpus together — everything else is spoken by one author only.</p>' +
      '<ul class="bridge-list">' + bridgeHtml + "</ul>" +

      '<h3 class="stats-subhead">Where the disciplines meet</h3>' +
      '<p class="sources-note">Concept families that occur inside the same text, counted across the corpus.</p>' +
      '<ul class="fam-pairs">' + famPairHtml + "</ul>";

    animateNetwork(host, nodes, edgeList, edgePath);
  }

  /* ---------------------------------------------------------------------
     The constellation drifts. Each concept oscillates around the position
     the layout gave it — the arrangement is unchanged, it just breathes.
     Hovering a node reveals its name and the texts it belongs to.
     --------------------------------------------------------------------- */

  function animateNetwork(host, nodes, edgeList, edgePath) {
    var svg = host.querySelector(".net-box svg");
    if (!svg) return;

    var groups = svg.querySelectorAll(".net-node");
    var paths = svg.querySelectorAll(".net-edge");

    // ---- hover focus -------------------------------------------------
    var byNode = {};
    edgeList.forEach(function (e, idx) { (byNode[e.i] = byNode[e.i] || []).push(idx); });

    // Delegated on the svg with mouseover/mouseout, which bubble — mouseenter
    // bound to each <g> is unreliable for SVG groups.
    var hot = null;

    function clearHot() {
      if (hot === null) return;
      svg.classList.remove("is-focused");
      groups[hot].classList.remove("is-hot");
      (byNode[hot] || []).forEach(function (p) { paths[p].classList.remove("is-hot"); });
      hot = null;
    }

    function setHot(i) {
      if (hot === i) return;
      clearHot();
      hot = i;
      svg.classList.add("is-focused");
      groups[i].classList.add("is-hot");
      (byNode[i] || []).forEach(function (p) { paths[p].classList.add("is-hot"); });
    }

    svg.addEventListener("mouseover", function (e) {
      var g = e.target.closest ? e.target.closest(".net-node") : null;
      if (g) setHot(Number(g.getAttribute("data-i")));
    });

    svg.addEventListener("mouseout", function (e) {
      var g = e.target.closest ? e.target.closest(".net-node") : null;
      if (!g) return;
      var to = e.relatedTarget;
      if (to && to.closest && to.closest(".net-node") === g) return;  // moving within the same node
      clearHot();
    });

    svg.addEventListener("mouseleave", clearHot);

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // ---- drift -------------------------------------------------------
    // Deterministic per-node phase and period, so the motion never repeats
    // in lockstep and never needs a random seed.
    var wave = nodes.map(function (n, k) {
      return {
        amp: 2.4 + (k % 5) * 0.8,
        wx: 0.00015 + (k % 7) * 0.000021,
        wy: 0.00012 + (k % 11) * 0.000017,
        px: k * 1.7,
        py: k * 2.3
      };
    });

    var raf = null;

    function frame(t) {
      if (svg.offsetParent === null) { raf = null; return; }  // panel hidden — stop

      var dx = new Array(nodes.length), dy = new Array(nodes.length);
      for (var i = 0; i < nodes.length; i++) {
        var w = wave[i];
        dx[i] = Math.sin(t * w.wx + w.px) * w.amp;
        dy[i] = Math.cos(t * w.wy + w.py) * w.amp;
        groups[i].setAttribute("transform",
          "translate(" + dx[i].toFixed(2) + "," + dy[i].toFixed(2) + ")");
      }
      for (var j = 0; j < edgeList.length; j++) {
        var e = edgeList[j];
        paths[j].setAttribute("d", edgePath(e, nodes[e.i].x + dx[e.i], nodes[e.i].y + dy[e.i]));
      }
      raf = window.requestAnimationFrame(frame);
    }

    function start() { if (raf === null) raf = window.requestAnimationFrame(frame); }

    start();
    // the panel is hidden until the Network tab is chosen, so pick the loop
    // back up whenever it becomes visible again
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) start();
    });
    var navBtns = document.querySelectorAll(".level-btn");
    navBtns.forEach(function (b) {
      b.addEventListener("click", function () { window.setTimeout(start, 30); });
    });
  }

  /* ---------------------------------------------------------------------
     Progress UI — tiles, the bar above the grid, source medals, milestones
     --------------------------------------------------------------------- */

  /* A Swiss-style smiley: strict geometry on a 24-unit grid, two circular
     eyes and a true circular arc for the mouth — no rounded caps, no
     decoration. `smileyFace` draws only the features, for use inside an
     element that is already a circle; `smileyBadge` brings its own circle. */

  function smileyFace(extraClass) {
    return '<svg class="smiley' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" ' +
      'aria-hidden="true" focusable="false">' +
      '<circle class="sm-eye" cx="8.6" cy="9.6" r="1.7"/>' +
      '<circle class="sm-eye" cx="15.4" cy="9.6" r="1.7"/>' +
      '<path class="sm-mouth" d="M7.3 13.2A5.4 5.4 0 0 0 16.7 13.2"/>' +
      "</svg>";
  }

  /* The full-tile version: eyes above the letter, mouth below it, drawn as
     line art on a 100-unit grid so it scales with the tile. */
  function smileyTile() {
    return '<svg class="tile-face" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" ' +
      'aria-hidden="true" focusable="false">' +
      '<circle class="tf-eye" cx="31" cy="27" r="4.6"/>' +
      '<circle class="tf-eye" cx="69" cy="27" r="4.6"/>' +
      '<path class="tf-mouth" d="M20 60A32 32 0 0 0 80 60"/>' +
      "</svg>";
  }

  function smileyBadge(extraClass) {
    return '<svg class="smiley has-face' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24" ' +
      'aria-hidden="true" focusable="false">' +
      '<circle class="sm-face" cx="12" cy="12" r="11"/>' +
      '<circle class="sm-eye" cx="8.6" cy="9.6" r="1.7"/>' +
      '<circle class="sm-eye" cx="15.4" cy="9.6" r="1.7"/>' +
      '<path class="sm-mouth" d="M7.3 13.2A5.4 5.4 0 0 0 16.7 13.2"/>' +
      "</svg>";
  }

  var SOURCE_MEDAL = {
    "1": "Fatheuer", "2": "Fry", "3": "Noguera",
    "4": "Brandt", "5": "Avilés-Irahola", "6": "Aschner"
  };

  var toastEl, toastTitleEl, toastBodyEl, toastTimer;

  function showToast(title, body) {
    if (!toastEl) return;
    toastTitleEl.textContent = title;
    toastBodyEl.textContent = body;
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add("is-up");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-up");
      window.setTimeout(function () { toastEl.hidden = true; }, 320);
    }, 3600);
  }

  // Fires at most once per milestone, and only for milestones crossed by the
  // click that just happened — never on page load.
  function checkMilestones(entry) {
    var total = LEXICON.length;
    var count = readCount();
    var pending = [];

    [25, 50, 75, 100].forEach(function (pct) {
      var id = "pct-" + pct;
      if (celebrated[id]) return;
      if ((count / total) * 100 >= pct) {
        celebrated[id] = true;
        pending.push([
          pct === 100 ? "The whole vocabulary" : pct + "% read",
          pct === 100
            ? "All " + total + " terms. You have been through the entire glossary."
            : count + " of " + total + " terms marked as read."
        ]);
      }
    });

    if (entry) {
      var lp = letterProgress(entry.letter);
      var lid = "letter-" + entry.letter;
      if (!celebrated[lid] && lp.total && lp.done === lp.total) {
        celebrated[lid] = true;
        pending.push(["Letter " + entry.letter + " complete", "All " + lp.total + (lp.total === 1 ? " term" : " terms") + " under " + entry.letter + "."]);
      }
      if (entry.source) {
        var sp = sourceProgress(entry.source);
        var sid = "source-" + entry.source;
        if (!celebrated[sid] && sp.total && sp.done === sp.total) {
          celebrated[sid] = true;
          pending.push([
            (SOURCE_MEDAL[entry.source] || "Source " + entry.source) + " complete",
            "Every glossary term traced to source " + entry.source + "."
          ]);
        }
      }
    }

    var lettersDone = LETTERS.filter(function (l) {
      var p = letterProgress(l);
      return p.total && p.done === p.total;
    }).length;
    if (!celebrated["letters-all"] && lettersDone === activeLetterCount() && activeLetterCount() > 0) {
      celebrated["letters-all"] = true;
      pending.push(["Every letter cleared", lettersDone + " letters, start to finish."]);
    }

    if (pending.length) showToast(pending[pending.length - 1][0], pending[pending.length - 1][1]);
  }

  function activeLetterCount() {
    return LETTERS.filter(function (l) { return byLetter[l].length > 0; }).length;
  }

  function updateTiles() {
    LETTERS.forEach(function (letter) {
      var tile = alphabetEl.querySelector('[data-letter="' + letter + '"]');
      if (!tile || tile.classList.contains("is-empty")) return;
      var p = letterProgress(letter);
      var complete = p.done === p.total;

      tile.classList.toggle("is-started", p.done > 0 && !complete);
      tile.classList.toggle("is-complete", complete);

      var blob = tile.querySelector(".blob");
      if (blob) blob.style.opacity = (0.12 + p.ratio * 0.5).toFixed(2);

      var fill = tile.querySelector(".tile-fill");
      if (fill) fill.style.width = (p.ratio * 100).toFixed(1) + "%";

      var count = tile.querySelector(".count");
      if (count) count.textContent = p.done > 0 ? p.done + "/" + p.total : String(p.total);

      tile.setAttribute("aria-label",
        "Letter " + letter + ", " + p.done + " of " + p.total + " terms read");
    });
  }

  function updateMedals() {
    var host = document.getElementById("disc-medals");
    if (!host) return;
    host.innerHTML = Object.keys(SOURCES).sort(function (x, y) { return Number(x) - Number(y); })
      .map(function (num) {
        var p = sourceProgress(num);
        var deg = Math.round(p.ratio * 360);
        var complete = p.total > 0 && p.done === p.total;
        // A source with no glossary terms yet cannot be completed; show it
        // muted rather than as a permanently empty ring.
        var none = p.total === 0;
        return (
          '<div class="medal' + (complete ? " is-complete" : "") + (none ? " is-none" : "") + '" title="' +
            escapeAttr((SOURCE_MEDAL[num] || "Source " + num) + " — " +
              (none ? "no glossary terms yet" : p.done + " of " + p.total + " terms read")) + '">' +
            '<span class="medal-ring" style="background:conic-gradient(var(--accent) ' + deg + 'deg, rgba(18,18,18,0.09) 0deg)">' +
              '<span class="medal-core">' + (complete ? smileyFace("is-medal") : num) + "</span>" +
            "</span>" +
            '<span class="medal-name">' + escapeHtml(SOURCE_MEDAL[num] || ("Source " + num)) + "</span>" +
            '<span class="medal-count">' + (none ? "—" : p.done + "/" + p.total) + "</span>" +
          "</div>"
        );
      }).join("");
  }

  function updateProgressUI() {
    var total = LEXICON.length;
    var count = readCount();
    var pct = total ? (count / total) * 100 : 0;

    var foundEl = document.getElementById("disc-found");
    var totalEl = document.getElementById("disc-total");
    var fillEl = document.getElementById("disc-fill");
    var track = document.querySelector(".disc-track");
    if (foundEl) foundEl.textContent = count;
    if (totalEl) totalEl.textContent = total;
    if (fillEl) fillEl.style.width = pct.toFixed(2) + "%";
    if (track) track.setAttribute("aria-valuenow", Math.round(pct));

    updateTiles();
    updateMedals();

    if (currentBtn) {
      var letter = currentBtn.getAttribute("data-letter");
      var lp = letterProgress(letter);
      panelLetterEl.innerHTML = letter +
        '<span class="full">' + lp.done + " / " + lp.total + " read</span>";
    }
  }

  function toggleRead(key, entry) {
    if (read[key]) {
      delete read[key];
    } else {
      read[key] = true;
    }
    saveProgress();

    var card = panelCardsEl.querySelector('[data-key="' + cssEscape(key) + '"]');
    if (card) {
      var on = !!read[key];
      card.classList.toggle("is-read", on);
      var btn = card.querySelector(".collect-btn");
      if (btn) {
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.querySelector(".collect-label").textContent = on ? "Read" : "Mark as read";
      }
      if (on) {
        card.classList.remove("just-read");
        void card.offsetWidth;
        card.classList.add("just-read");
      }
    }

    updateProgressUI();
    if (read[key]) checkMilestones(entry);
    saveProgress();
  }

  function cssEscape(str) {
    return String(str).replace(/["\\]/g, "\\$&");
  }

  /* ---------------------------------------------------------------------
     Cursor label — on a real pointer, the cursor over the alphabet becomes
     an "Explore" tag. Only enabled for fine pointers with hover, and only
     from script, so touch and no-JS keep the normal cursor.
     --------------------------------------------------------------------- */

  function initCursorTag() {
    var tag = document.getElementById("cursor-tag");
    if (!tag || !alphabetEl) return;
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    alphabetEl.classList.add("has-cursor-tag");

    var x = 0, y = 0, shown = false, queued = false;

    function draw() {
      queued = false;
      tag.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }

    alphabetEl.addEventListener("mousemove", function (e) {
      var tile = e.target.closest(".letter-tile");
      var live = tile && !tile.classList.contains("is-empty");

      if (!live) {
        if (shown) { shown = false; tag.classList.remove("is-on"); }
        return;
      }

      x = e.clientX;
      y = e.clientY;
      if (!queued) { queued = true; window.requestAnimationFrame(draw); }

      if (!shown) {
        shown = true;
        draw();
        tag.classList.add("is-on");
      }
    });

    alphabetEl.addEventListener("mouseleave", function () {
      shown = false;
      tag.classList.remove("is-on");
    });

    window.addEventListener("blur", function () {
      shown = false;
      tag.classList.remove("is-on");
    });
  }

  /* ---------------------------------------------------------------------
     Phone handoff — draws a QR for the play page. The code is generated in
     the page, so nothing about this glossary is sent to a third party.
     A phone cannot resolve "localhost", so when the site is opened that way
     the address has to be swapped for the machine's network address.
     --------------------------------------------------------------------- */

  function initHandoff() {
    var card = document.getElementById("flip");
    var host = document.getElementById("qr");
    var input = document.getElementById("handoff-url");
    var note = document.getElementById("handoff-note");
    var openLink = document.getElementById("handoff-open");
    var urlLabel = document.getElementById("qr-url");
    if (!host || !input || typeof QR === "undefined") return;

    var KEY = "bow-play-origin";
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);

    var stored = null;
    try { stored = window.localStorage.getItem(KEY); } catch (e) {}

    var base = stored || location.origin;
    input.value = base.replace(/\/$/, "") + "/play.html";

    if (isLocal && !stored) {
      note.hidden = false;
      note.textContent = "This page is open on localhost, which a phone cannot reach. Replace " +
        "localhost with this computer's network address, or publish the site so any phone can open it.";
    }

    function draw() {
      var url = input.value.trim();
      if (!url) { host.innerHTML = ""; return; }
      try {
        host.innerHTML = QR.svg(url, 168);
        openLink.href = url;
        if (urlLabel) urlLabel.textContent = url.replace(/^https?:\/\//, "");
        var origin = url.replace(/\/play\.html.*$/, "");
        try { window.localStorage.setItem(KEY, origin); } catch (e) {}
        note.hidden = !/localhost|127\.0\.0\.1/i.test(url);
      } catch (err) {
        host.innerHTML = '<span class="qr-error">That address is too long to encode.</span>';
      }
    }

    input.addEventListener("input", draw);
    draw();

    if (card) {
      card.addEventListener("click", function () {
        var open = card.classList.toggle("is-flipped");
        card.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  function initDiscovery() {
    toastEl = document.getElementById("toast");
    var toastMark = document.getElementById("toast-mark");
    if (toastMark) toastMark.innerHTML = smileyFace("is-toast");
    toastTitleEl = document.getElementById("toast-title");
    toastBodyEl = document.getElementById("toast-body");

    panelCardsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".collect-btn");
      if (!btn) return;
      var key = btn.getAttribute("data-key");
      var entry = LEXICON.filter(function (x) { return x._key === key; })[0];
      toggleRead(key, entry);
    });

    var randomBtn = document.getElementById("disc-random");
    if (randomBtn) {
      randomBtn.addEventListener("click", function () {
        var pool = LEXICON.filter(function (e) { return !read[termKey(e)]; });
        if (!pool.length) pool = LEXICON.slice();
        var pick = pool[Math.floor(Math.random() * pool.length)];
        var tile = alphabetEl.querySelector('[data-letter="' + pick.letter + '"]');
        if (tile) selectLetter(pick.letter, tile);
        window.setTimeout(function () {
          var card = panelCardsEl.querySelector('[data-key="' + cssEscape(termKey(pick)) + '"]');
          if (!card) return;
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.remove("is-spotlit");
          void card.offsetWidth;
          card.classList.add("is-spotlit");
        }, 240);
      });
    }

    var resetBtn = document.getElementById("disc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!window.confirm("Clear your reading progress on this device?")) return;
        read = {};
        celebrated = {};
        saveProgress();
        if (currentBtn) selectLetter(currentBtn.getAttribute("data-letter"), currentBtn);
        updateProgressUI();
      });
    }
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  loadProgress();
  buildTiles();
  initDiscovery();
  initCursorTag();
  initHandoff();

  // the turning globe in the hero
  (function () {
    var host = document.getElementById("globe-live");
    if (host && typeof Globe !== "undefined") window.heroGlobe = Globe.build(host);
  })();
  updateProgressUI();
  buildSources();
  buildStats();
  buildCanonIndex();
  initLevelNav();
  buildSourceProfiles();
  buildCompare();
  buildNetwork();
})();
