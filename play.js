/* A–Z — a letter appears, you tap it, and you learn what it holds.
   Runs entirely on the phone from the same static files as the glossary. */
(function () {
  "use strict";

  var STORE_KEY = "bow-az-opened";

  var byLetter = {};
  LETTERS.forEach(function (l) { byLetter[l] = []; });
  LEXICON.forEach(function (e) {
    if (e.term && e.definition && byLetter[e.letter]) byLetter[e.letter].push(e);
  });
  var live = LETTERS.filter(function (l) { return byLetter[l].length > 0; });

  var $ = function (id) { return document.getElementById(id); };
  var screens = {
    start: $("screen-start"), letter: $("screen-letter"),
    words: $("screen-words"), done: $("screen-done")
  };

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("is-on", k === name);
    });
    window.scrollTo(0, 0);
  }

  function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  // ---- which letters have been opened, kept on the device ----------------
  function opened() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function markOpened(letter) {
    var o = opened();
    o[letter] = true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function openedCount() {
    var o = opened();
    return live.filter(function (l) { return o[l]; }).length;
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- state -------------------------------------------------------------
  var queue = [], at = 0;

  function refreshStartFacts() {
    $("fact-terms").textContent = LEXICON.length;
    $("fact-letters").textContent = live.length;
    $("fact-seen").textContent = openedCount() + "/" + live.length;
  }

  function begin() {
    // unopened letters first, so a second visit carries on where it left off
    var o = opened();
    var fresh = shuffle(live.filter(function (l) { return !o[l]; }));
    var seen = shuffle(live.filter(function (l) { return o[l]; }));
    queue = fresh.concat(seen);
    at = 0;
    if (!queue.length) return finish();
    showLetter();
  }

  function showLetter() {
    if (at >= queue.length) return finish();
    var letter = queue[at];
    var words = byLetter[letter];

    $("letter-glyph").textContent = letter;
    $("letter-count").textContent = words.length + (words.length === 1 ? " word" : " words");
    $("hud-progress").textContent = (at + 1) + " of " + queue.length;

    var card = $("letter-card");
    card.classList.remove("is-in");
    void card.offsetWidth;          // restart the entrance animation
    card.classList.add("is-in");

    show("letter");
  }

  function openLetter() {
    var letter = queue[at];
    var words = byLetter[letter];
    markOpened(letter);
    buzz(16);

    $("words-letter").textContent = letter;
    $("words-count").textContent = words.length + (words.length === 1 ? " word" : " words");
    $("words-sub").textContent = "under " + letter;

    $("word-list").innerHTML = words.map(function (w) {
      var src = SOURCES[w.source];
      var badge = src
        ? '<span class="w-src">Source ' + escapeHtml(w.source) + " · " +
          escapeHtml((src.authors.split(",")[0] || "").split(";")[0]) + "</span>"
        : "";
      return '<article class="word">' +
        "<h2>" + escapeHtml(w.term) + "</h2>" +
        "<p>" + escapeHtml(w.definition) + "</p>" +
        badge +
        "</article>";
    }).join("");

    $("btn-next").textContent = at + 1 >= queue.length ? "Finish" : "Next letter";
    show("words");
    $("word-list").scrollTop = 0;
  }

  function nextLetter() {
    at++;
    if (at >= queue.length) return finish();
    showLetter();
  }

  function finish() {
    $("done-count").textContent = openedCount() + " of " + live.length + " letters opened.";
    buzz([18, 60, 18]);
    show("done");
  }

  // ---- wire up -----------------------------------------------------------
  refreshStartFacts();

  $("btn-start").addEventListener("click", begin);
  $("letter-card").addEventListener("click", openLetter);
  $("btn-next").addEventListener("click", nextLetter);
  $("btn-close").addEventListener("click", showLetter);
  $("btn-quit").addEventListener("click", function () { refreshStartFacts(); show("start"); });
  $("btn-restart").addEventListener("click", function () { refreshStartFacts(); begin(); });

  $("btn-reset").addEventListener("click", function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    refreshStartFacts();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (screens.letter.classList.contains("is-on")) { e.preventDefault(); openLetter(); }
    else if (screens.words.classList.contains("is-on")) { e.preventDefault(); nextLetter(); }
  });
})();
