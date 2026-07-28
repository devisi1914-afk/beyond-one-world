/* A turning globe, drawn from real coastlines.

   The Earth is stored once as unit vectors; every frame those are rotated and
   projected orthographically, so this is a genuine rotation — continents cross
   the meridian rather than the picture spinning. The colour split stays fixed
   at the centre line, which means land changes hemisphere as it passes. */
(function (global) {
  "use strict";

  var SIZE = 800, CX = 400, CY = 400, R = 352;
  var TILT = 12 * Math.PI / 180;      // viewing latitude
  var SPIN_PERIOD = 150000;           // ms for one full turn

  function build(hostEl, opts) {
    opts = opts || {};
    if (typeof GLOBE_LAND === "undefined") return null;

    // ---- geometry, converted once -------------------------------------
    var rings = GLOBE_LAND.map(function (flat) {
      var n = flat.length / 2;
      var v = new Float64Array(n * 3);
      for (var i = 0; i < n; i++) {
        var lon = flat[i * 2] * Math.PI / 180;
        var lat = flat[i * 2 + 1] * Math.PI / 180;
        var cl = Math.cos(lat);
        v[i * 3]     = cl * Math.sin(lon);
        v[i * 3 + 1] = Math.sin(lat);
        v[i * 3 + 2] = cl * Math.cos(lon);
      }
      return v;
    });

    var grat = [];
    (function () {
      var lon, lat, arc, i;
      for (lon = -180; lon < 180; lon += 15) {
        arc = [];
        for (lat = -88; lat <= 88; lat += 3) arc.push([lon, lat]);
        grat.push(arc);
      }
      for (lat = -75; lat <= 75; lat += 15) {
        arc = [];
        for (lon = -180; lon <= 180; lon += 3) arc.push([lon, lat]);
        grat.push(arc);
      }
      for (i = 0; i < grat.length; i++) {
        var pts = grat[i], v = new Float64Array(pts.length * 3);
        for (var k = 0; k < pts.length; k++) {
          var a = pts[k][0] * Math.PI / 180, b = pts[k][1] * Math.PI / 180;
          var cb = Math.cos(b);
          v[k * 3] = cb * Math.sin(a);
          v[k * 3 + 1] = Math.sin(b);
          v[k * 3 + 2] = cb * Math.cos(a);
        }
        grat[i] = v;
      }
    })();

    // ---- svg scaffold --------------------------------------------------
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + SIZE + " " + SIZE);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label",
      "A slowly turning globe. The western half is drawn in grey, the eastern in warm orange, " +
      "divided by a meridian down the centre.");
    svg.innerHTML =
      '<defs>' +
        '<clipPath id="gw"><rect x="0" y="0" width="' + CX + '" height="' + SIZE + '"/></clipPath>' +
        '<clipPath id="ge"><rect x="' + CX + '" y="0" width="' + CX + '" height="' + SIZE + '"/></clipPath>' +
        '<clipPath id="gd"><circle cx="' + CX + '" cy="' + CY + '" r="' + R + '"/></clipPath>' +
        '<radialGradient id="gwarm" cx="62%" cy="42%" r="62%">' +
          '<stop offset="0%" stop-color="#DE4B25" stop-opacity="0.40"/>' +
          '<stop offset="55%" stop-color="#F2A25C" stop-opacity="0.24"/>' +
          '<stop offset="100%" stop-color="#F2A25C" stop-opacity="0.05"/>' +
        '</radialGradient>' +
        '<radialGradient id="gcool" cx="38%" cy="40%" r="66%">' +
          '<stop offset="0%" stop-color="#121212" stop-opacity="0.055"/>' +
          '<stop offset="100%" stop-color="#121212" stop-opacity="0.015"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<g clip-path="url(#gd)">' +
        '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="url(#gcool)" clip-path="url(#gw)"/>' +
        '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="url(#gwarm)" clip-path="url(#ge)"/>' +
        '<path id="g-grat" fill="none" stroke="#121212" stroke-opacity="0.12" stroke-width="0.7"/>' +
        '<g clip-path="url(#gw)"><path id="g-west" fill="none" stroke="#121212" ' +
          'stroke-opacity="0.74" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/></g>' +
        '<g clip-path="url(#ge)"><path id="g-east" fill="none" stroke="#B23A1C" ' +
          'stroke-opacity="0.85" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/></g>' +
      '</g>' +
      '<line x1="' + CX + '" y1="' + (CY - R) + '" x2="' + CX + '" y2="' + (CY + R) + '" ' +
        'stroke="#121212" stroke-opacity="0.45" stroke-width="1"/>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" ' +
        'stroke="#121212" stroke-opacity="0.32" stroke-width="1.1"/>';
    hostEl.appendChild(svg);

    var pLand = svg.querySelector("#g-west");
    var pLandE = svg.querySelector("#g-east");
    var pGrat = svg.querySelector("#g-grat");

    var cosT = Math.cos(TILT), sinT = Math.sin(TILT);

    // Project one ring at spin angle th, returning path data for the visible arcs.
    function ringPath(v, out) {
      var n = v.length / 3;
      var cs = Math.cos(th), sn = Math.sin(th);
      var px = 0, py = 0, pz = -1, started = false;

      for (var i = 0; i <= n; i++) {
        var j = (i % n) * 3;
        var x = v[j], y = v[j + 1], z = v[j + 2];
        var xr = x * cs + z * sn;
        var zr = -x * sn + z * cs;
        var y2 = y * cosT - zr * sinT;
        var z2 = y * sinT + zr * cosT;

        if (z2 > 0) {
          var sx = CX + R * xr, sy = CY - R * y2;
          if (!started) {
            if (i > 0 && pz <= 0) {
              // entering view: meet the horizon first
              var t = pz / (pz - z2);
              var hx = px + (xr - px) * t, hy = py + (y2 - py) * t;
              var m = Math.sqrt(hx * hx + hy * hy) || 1;
              out.push("M", (CX + R * hx / m).toFixed(1), " ", (CY - R * hy / m).toFixed(1));
              out.push("L", sx.toFixed(1), " ", sy.toFixed(1));
            } else {
              out.push("M", sx.toFixed(1), " ", sy.toFixed(1));
            }
            started = true;
          } else {
            out.push("L", sx.toFixed(1), " ", sy.toFixed(1));
          }
        } else if (started) {
          // leaving view: stop on the horizon
          var t2 = pz / (pz - z2);
          var gx = px + (xr - px) * t2, gy = py + (y2 - py) * t2;
          var m2 = Math.sqrt(gx * gx + gy * gy) || 1;
          out.push("L", (CX + R * gx / m2).toFixed(1), " ", (CY - R * gy / m2).toFixed(1));
          started = false;
        }
        px = xr; py = y2; pz = z2;
      }
    }

    var th = 0;

    function draw() {
      var land = [];
      for (var i = 0; i < rings.length; i++) ringPath(rings[i], land);
      var d = land.join("");
      pLand.setAttribute("d", d);
      pLandE.setAttribute("d", d);

      var g = [];
      for (var k = 0; k < grat.length; k++) ringPath(grat[k], g);
      pGrat.setAttribute("d", g.join(""));
    }

    var reduce = global.matchMedia &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches;

    draw();

    if (!reduce && opts.spin !== false) {
      var t0 = null, raf = null;
      var step = function (ts) {
        if (svg.offsetParent === null && hostEl.offsetParent === null) { raf = null; return; }
        if (t0 === null) t0 = ts;
        th = ((ts - t0) / SPIN_PERIOD) * Math.PI * 2;
        draw();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && raf === null) { t0 = null; raf = requestAnimationFrame(step); }
      });
    }

    return { svg: svg, draw: draw, setAngle: function (a) { th = a; draw(); } };
  }

  global.Globe = { build: build };
})(window);
