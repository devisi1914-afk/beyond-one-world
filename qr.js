/* Minimal QR encoder — byte mode, error-correction level M, versions 1–10.
   Written in place because the page must not call an external service to draw
   a code. Exposes QR.encode(text) -> { size, modules } where modules is a
   size×size array of booleans (true = dark). */
(function (global) {
  "use strict";

  // ---- Galois field GF(256), primitive polynomial 0x11d -------------------
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Reed–Solomon generator polynomial of the given degree.
  function rsPoly(degree) {
    var poly = [1];
    for (var d = 0; d < degree; d++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var i = 0; i < poly.length; i++) {
        next[i] ^= poly[i];
        next[i + 1] ^= gmul(poly[i], EXP[d]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    var gen = rsPoly(ecLen);
    var res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (var j = 0; j < ecLen; j++) res[j] ^= gmul(gen[j + 1], factor);
    }
    return res;
  }

  // ---- capacity tables, error-correction level M --------------------------
  // [total codewords, ec codewords per block, blocks in group 1,
  //  data codewords per block in group 1, blocks in group 2, data per block]
  var SPEC = {
    1:  [26,  10, 1, 16, 0, 0],
    2:  [44,  16, 1, 28, 0, 0],
    3:  [70,  26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44]
  };

  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function dataCapacity(v) {
    var s = SPEC[v];
    return s[2] * s[3] + s[4] * s[5];
  }

  // ---- bit buffer ---------------------------------------------------------
  function BitBuffer() { this.bits = []; }
  BitBuffer.prototype.put = function (value, length) {
    for (var i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };

  function utf8Bytes(str) {
    var out = [], enc = encodeURIComponent(str);
    for (var i = 0; i < enc.length; i++) {
      if (enc[i] === "%") { out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
      else out.push(enc.charCodeAt(i));
    }
    return out;
  }

  // ---- module grid --------------------------------------------------------
  function place(version, allBits) {
    var size = version * 4 + 17;
    var mod = [], reserved = [];
    for (var i = 0; i < size; i++) {
      mod.push(new Array(size).fill(false));
      reserved.push(new Array(size).fill(false));
    }

    function setFinder(r, c) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                   (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                   (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
          mod[rr][cc] = on;
          reserved[rr][cc] = true;
        }
      }
    }
    setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);

    // timing patterns
    for (var t = 8; t < size - 8; t++) {
      mod[6][t] = t % 2 === 0; reserved[6][t] = true;
      mod[t][6] = t % 2 === 0; reserved[t][6] = true;
    }

    // alignment patterns
    var centers = ALIGN[version];
    for (var a = 0; a < centers.length; a++) {
      for (var b = 0; b < centers.length; b++) {
        var cr = centers[a], cc2 = centers[b];
        if (reserved[cr][cc2]) continue;   // skips the finder corners
        for (var dr2 = -2; dr2 <= 2; dr2++) {
          for (var dc2 = -2; dc2 <= 2; dc2++) {
            mod[cr + dr2][cc2 + dc2] =
              Math.max(Math.abs(dr2), Math.abs(dc2)) !== 1;
            reserved[cr + dr2][cc2 + dc2] = true;
          }
        }
      }
    }

    // dark module + reserved format areas
    mod[size - 8][8] = true; reserved[size - 8][8] = true;
    for (var f = 0; f < 9; f++) {
      if (!reserved[8][f]) reserved[8][f] = true;
      if (!reserved[f][8]) reserved[f][8] = true;
    }
    for (var g = 0; g < 8; g++) {
      reserved[8][size - 1 - g] = true;
      reserved[size - 1 - g][8] = true;
    }
    if (version >= 7) {
      for (var vi = 0; vi < 6; vi++) {
        for (var vj = 0; vj < 3; vj++) {
          reserved[vi][size - 11 + vj] = true;
          reserved[size - 11 + vj][vi] = true;
        }
      }
    }

    // zigzag data placement, bottom-right upward, skipping the timing column
    var idx = 0, up = true;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var n = 0; n < size; n++) {
        var row = up ? size - 1 - n : n;
        for (var k = 0; k < 2; k++) {
          var cx = col - k;
          if (reserved[row][cx]) continue;
          mod[row][cx] = idx < allBits.length ? allBits[idx] === 1 : false;
          idx++;
        }
      }
      up = !up;
    }
    return { size: size, mod: mod, reserved: reserved };
  }

  function maskFn(id, r, c) {
    switch (id) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
  }

  function formatBits(maskId) {
    var data = (0 << 3) | maskId;            // 0b00 = level M
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function versionBits(version) {
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
    return (version << 12) | rem;
  }

  function applyFormat(grid, maskId) {
    var size = grid.size, bits = formatBits(maskId), m = grid.mod;
    for (var i = 0; i < 15; i++) {
      var bit = ((bits >>> i) & 1) === 1;
      // vertical strip beside the top-left finder
      if (i < 6) m[i][8] = bit;
      else if (i === 6) m[7][8] = bit;
      else if (i === 7) m[8][8] = bit;
      else if (i === 8) m[8][7] = bit;
      else m[8][14 - i] = bit;
      // duplicated copy
      if (i < 8) m[8][size - 1 - i] = bit;
      else m[size - 15 + i][8] = bit;
    }
    m[size - 8][8] = true;
  }

  function applyVersion(grid, version) {
    if (version < 7) return;
    var bits = versionBits(version), size = grid.size, m = grid.mod;
    for (var i = 0; i < 18; i++) {
      var bit = ((bits >>> i) & 1) === 1;
      var r = Math.floor(i / 3), c = i % 3;
      m[r][size - 11 + c] = bit;
      m[size - 11 + c][r] = bit;
    }
  }

  function penalty(m, size) {
    var score = 0, i, j, run, dark = 0;
    // rule 1 — runs of five or more
    for (i = 0; i < size; i++) {
      run = 1;
      for (j = 1; j < size; j++) {
        if (m[i][j] === m[i][j - 1]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
      for (j = 1; j < size; j++) {
        if (m[j][i] === m[j - 1][i]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    // rule 2 — 2×2 blocks
    for (i = 0; i < size - 1; i++)
      for (j = 0; j < size - 1; j++)
        if (m[i][j] === m[i + 1][j] && m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j + 1]) score += 3;
    // rule 3 — finder-like patterns
    var pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    var pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    function match(get, k) {
      var a = true, b = true;
      for (var q = 0; q < 11; q++) {
        if (get(k + q) !== pat1[q]) a = false;
        if (get(k + q) !== pat2[q]) b = false;
      }
      return a || b;
    }
    for (i = 0; i < size; i++) {
      for (j = 0; j <= size - 11; j++) {
        if (match(function (x) { return m[i][x]; }, j)) score += 40;
        if (match(function (x) { return m[x][i]; }, j)) score += 40;
      }
    }
    // rule 4 — overall balance
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (m[i][j]) dark++;
    var pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function encode(text) {
    var bytes = utf8Bytes(text);

    var version = 0;
    for (var v = 1; v <= 10; v++) {
      var countBits = v < 10 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
    }
    if (!version) throw new Error("QR: content too long");

    var spec = SPEC[version], ecLen = spec[1];
    var buf = new BitBuffer();
    buf.put(4, 4);                                   // byte mode
    buf.put(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);

    var capacityBits = dataCapacity(version) * 8;
    for (var t = 0; t < 4 && buf.bits.length < capacityBits; t++) buf.bits.push(0);
    while (buf.bits.length % 8 !== 0) buf.bits.push(0);
    var pad = [0xEC, 0x11], p = 0;
    while (buf.bits.length < capacityBits) { buf.put(pad[p % 2], 8); p++; }

    var codewords = [];
    for (var b = 0; b < buf.bits.length; b += 8) {
      var byteVal = 0;
      for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | buf.bits[b + k];
      codewords.push(byteVal);
    }

    // split into blocks, compute EC, then interleave
    var blocks = [], ecBlocks = [], off = 0, g;
    for (g = 0; g < spec[2]; g++) { blocks.push(codewords.slice(off, off + spec[3])); off += spec[3]; }
    for (g = 0; g < spec[4]; g++) { blocks.push(codewords.slice(off, off + spec[5])); off += spec[5]; }
    for (g = 0; g < blocks.length; g++) ecBlocks.push(rsEncode(blocks[g], ecLen));

    var interleaved = [], maxLen = Math.max(spec[3], spec[5]), q;
    for (q = 0; q < maxLen; q++)
      for (g = 0; g < blocks.length; g++)
        if (q < blocks[g].length) interleaved.push(blocks[g][q]);
    for (q = 0; q < ecLen; q++)
      for (g = 0; g < ecBlocks.length; g++) interleaved.push(ecBlocks[g][q]);

    var allBits = [];
    for (q = 0; q < interleaved.length; q++)
      for (k = 7; k >= 0; k--) allBits.push((interleaved[q] >>> k) & 1);

    // try every mask, keep the least penalised
    var best = null, bestScore = Infinity;
    for (var maskId = 0; maskId < 8; maskId++) {
      var grid = place(version, allBits);
      for (var r = 0; r < grid.size; r++)
        for (var c = 0; c < grid.size; c++)
          if (!grid.reserved[r][c] && maskFn(maskId, r, c)) grid.mod[r][c] = !grid.mod[r][c];
      applyVersion(grid, version);
      applyFormat(grid, maskId);
      var sc = penalty(grid.mod, grid.size);
      if (sc < bestScore) { bestScore = sc; best = grid; }
    }
    return { size: best.size, modules: best.mod, version: version };
  }

  // Render to an <svg> string with a quiet zone of 4 modules.
  function svg(text, px) {
    var q = encode(text), n = q.size, quiet = 4, total = n + quiet * 2;
    var d = "";
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++)
        if (q.modules[r][c]) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total +
      '" width="' + (px || 200) + '" height="' + (px || 200) + '" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="#FFFFFF"/>' +
      '<path d="' + d + '" fill="#121212"/></svg>';
  }

  global.QR = { encode: encode, svg: svg };
})(window);
