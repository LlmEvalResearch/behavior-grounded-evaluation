/* ==========================================================================
   From Surface Realism to Behavioral Validity — linear coded-corpus page
   Reads window.SURVEY_DATA (bundled by web/data/data.js). No fetch, no deps,
   so the page renders when opened directly from file://.

   One long document: the seven coding-group tables stacked in paper order
   behind a sticky jump bar. G1-G6 are 52-row paper tables (all rows always
   present) with a tally row computed over all 52 papers; G7 is the 72-row
   claim-evidence table. No tabs, no pagination, no row collapsing.
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.SURVEY_DATA;
  if (!DATA) {
    var msg = document.createElement('p');
    msg.className = 'fatal';
    msg.textContent = 'Data bundle not found. Expected web/data/data.js to define window.SURVEY_DATA.';
    var main = document.getElementById('main') || document.body;
    main.insertBefore(msg, main.firstChild);
    return;
  }

  var CODEBOOK = DATA.codebook || [];
  var GROUPS = CODEBOOK.filter(function (g) { return g.id !== 'G7'; });
  var META = {};
  GROUPS.forEach(function (g) {
    g.fields.forEach(function (f) { META[f.name] = { group: g, field: f }; });
  });

  var PAPERS = (DATA.papers && DATA.papers.papers) || [];
  var SLOTS = (DATA.claims && DATA.claims.slots) || [];
  var STATS = DATA.stats || {};
  var N = STATS.n || PAPERS.length;

  var SHORT = {
    G1: 'System & Simulation',
    G2: 'Evaluation Methods',
    G3: 'Evaluation Dimensions',
    G4: 'Interaction & Behavior',
    G5: 'Theory & Reliability',
    G6: 'Additional Characteristics'
  };
  var SECTION_IDS = GROUPS.map(function (g) { return g.id; }).concat(['G7']);
  var ALIGN_ORDER = ['ALIGNED', 'PARTIAL', 'EXCEEDS', 'UNCLEAR'];
  var ALIGN_CLASS = { ALIGNED: 'aligned', PARTIAL: 'partial', EXCEEDS: 'exceeds', UNCLEAR: 'unclear' };
  var VALUE_PRIORITY = { yes: 0, no: 1, 'n/a': 2 };

  var state = {
    textOpen: {},
    pop: { field: null, pinned: false }
  };

  /* --------------------------------------------------------------- utils -- */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function isYes(value) { return /^yes$/i.test(clean(value)); }
  function isNA(value) { return clean(value).toUpperCase() === 'N/A'; }
  function $id(id) { return document.getElementById(id); }
  function isBool(f) { return f.type === 'boolean'; }
  function defTitle(f) {
    return f.name + ' \u2014 ' + clean(f.definition) + '  |  Values: ' + clean(f.values || 'Free text');
  }
  function byPaperId(a, b) { return (parseInt(a.Paper_ID, 10) || 0) - (parseInt(b.Paper_ID, 10) || 0); }

  /* --------------------------------------------------------- chip colours -- */

  // Ten label colours drawn from the reference site's blue / indigo / cyan / slate /
  // amber / orange / red families, deliberately excluding every green family. Each
  // one keeps >=4.5:1 contrast both on white and on its own 12%-tint background.
  var PALETTE = ['#1e3a8a', '#1d4ed8', '#0369a1', '#0e7490', '#4338ca', '#6d28d9', '#334155', '#92400e', '#9a3412', '#b91c1c'];
  function chipColor(field, value) {
    var s = field + '|' + value, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }
  function chipHTML(field, value) {
    var c = chipColor(field, value);
    return '<span class="chip" title="' + esc(value) + '"' +
      ' style="color:' + c + ';background:' + c + '1f;border-color:' + c + '55">' + esc(value) + '</span>';
  }
  function chipsHTML(field, raw) {
    return String(raw).split(';').map(clean).filter(Boolean)
      .map(function (v) { return chipHTML(field, v); }).join(' ');
  }
  // Focus_Type is free text: split on '/', ',', U+FF0C and U+3001 and show every
  // value as its own chip. All 52 rows carry at most three values, so nothing
  // is hidden behind a "+N" chip any more.
  function focusChipsHTML(raw) {
    var parts = String(raw).split(/[\/,\uFF0C\u3001]/).map(clean).filter(Boolean);
    if (!parts.length) return '<span class="dash">&mdash;</span>';
    return parts.map(function (v) { return chipHTML('Focus_Type', v); }).join(' ');
  }

  /* ------------------------------------------------------- gate handling -- */

  function gateOf(name) {
    var m = META[name];
    return m && m.field.gate && m.field.gate.gate_field ? m.field.gate : null;
  }
  function gateMet(paper, gate) {
    return clean(paper.values[gate.gate_field]).toLowerCase() === clean(gate.gate_value).toLowerCase();
  }
  function gateCounts(name) {
    var published = (STATS.gated || []).filter(function (g) { return g.field === name; })[0];
    if (published && published.n != null && published.denominator != null) {
      return { n: published.n, denominator: published.denominator };
    }
    var gate = gateOf(name);
    if (!gate) return null;
    var denom = 0, n = 0;
    PAPERS.forEach(function (p) {
      if (!gateMet(p, gate)) return;
      denom++;
      if (isYes(p.values[name])) n++;
    });
    return { n: n, denominator: denom };
  }
  function gateNote(name) {
    var gate = gateOf(name), counts = gateCounts(name);
    if (!gate || !counts) return '';
    return 'Conditional on ' + gate.gate_field + ' = ' + gate.gate_value + ': ' +
      counts.n + ' of ' + counts.denominator + '.';
  }
  /* -------------------------------------------------------- cell renders -- */

  function cellTd(name, cls, title, body, extraAttr) {
    return '<td class="cell ' + cls + '" data-field="' + esc(name) + '"' +
      (extraAttr || '') + ' title="' + esc(title) + '">' + body + '</td>';
  }

  function cellHTML(paper, f) {
    var name = f.name;
    var raw = clean(paper.values[name]);
    if (!raw) {
      return cellTd(name, 'empty', 'Not reported. ' + defTitle(f), '<span class="dash">&mdash;</span>');
    }
    if (name === 'Focus_Type') {
      return cellTd(name, 'focus', raw, focusChipsHTML(raw));
    }
    if (isBool(f)) {
      if (isNA(raw)) return cellTd(name, 'na', defTitle(f), 'N/A');
      return isYes(raw)
        ? cellTd(name, 'bool', 'Yes. ' + defTitle(f), '<span class="bmark yes" title="Yes">&#x2705;</span>')
        : cellTd(name, 'bool', 'No. ' + defTitle(f), '<span class="bmark no" title="No">&#x274C;</span>');
    }
    if (isNA(raw)) return cellTd(name, 'na', defTitle(f), 'N/A');
    if (f.type === 'multi-label') return cellTd(name, 'multi', defTitle(f), chipsHTML(name, raw));
    if (f.type === 'single-choice') return cellTd(name, 'choice', defTitle(f), chipHTML(name, raw));
    var key = String(paper.Paper_ID) + '|' + name;
    var open = !!state.textOpen[key];
    return cellTd(name, 'text' + (open ? ' open' : ''), defTitle(f),
      '<button type="button" class="txt-btn' + (open ? ' open' : '') + '" data-text-key="' + esc(key) + '"' +
      ' aria-expanded="' + (open ? 'true' : 'false') + '" title="' + esc(raw) + '">' + esc(raw) + '</button>');
  }

  /* ------------------------------------------------------------ tallies --- */

  function tallyCellHTML(name) {
    var f = META[name].field;
    var counts = {};
    PAPERS.forEach(function (p) {
      var v = clean(p.values[name]);
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    var parts = [];
    if (isBool(f)) {
      var y = 0, n = 0, na = 0, other = [];
      Object.keys(counts).forEach(function (k) {
        if (isYes(k)) y += counts[k];
        else if (/^no$/i.test(k)) n += counts[k];
        else if (isNA(k)) na += counts[k];
        else other.push(k + ' ' + counts[k]);
      });
      parts.push('Yes ' + y, 'No ' + n);
      if (na) parts.push('N/A ' + na);
      parts = parts.concat(other);
    } else if (f.type === 'single-choice') {
      Object.keys(counts).sort(function (a, b) {
        var pa = VALUE_PRIORITY[clean(a).toLowerCase()];
        var pb = VALUE_PRIORITY[clean(b).toLowerCase()];
        pa = pa == null ? 9 : pa; pb = pb == null ? 9 : pb;
        return pa - pb || counts[b] - counts[a] || a.localeCompare(b);
      }).forEach(function (k) { parts.push(esc(k) + ' ' + counts[k]); });
    } else {
      var filled = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
      parts.push(filled + (filled === 1 ? ' with a value' : ' with a value'));
    }
    var g = (STATS.gated || []).filter(function (x) { return x.field === name; })[0];
    var note = (g && g.n != null && g.denominator != null)
      ? 'conditional ' + g.n + ' of ' + g.denominator : '';
    return '<td data-tally="' + esc(name) + '" title="Tally computed over all ' + N + ' coded papers">' +
      '<span class="tally">' + parts.join(' \u00b7 ') + '</span>' +
      (note ? '<span class="tally-note">' + esc(note) + '</span>' : '') + '</td>';
  }

  /* -------------------------------------------------------- paper tables -- */

  function paperSectionHTML(group) {
    var sid = group.id.toLowerCase();
    var fields = group.fields;
    var head = '<div class="sec-head"><span class="sec-num">' + esc(group.id) + '</span>' +
      '<h2 id="' + sid + '-h">' + esc(group.name) + ' <span class="gcount">' + fields.length + ' fields</span></h2></div>';
    var lead = '<p class="lead">' + esc(clean(group.description)) + '</p>';
    var thead = '<thead><tr><th scope="col" class="col-idx">#</th>' +
      '<th scope="col" class="col-paper">Paper</th>' +
      fields.map(function (f) {
        return '<th scope="col" class="col-cell">' +
          '<button type="button" class="col-btn" data-field="' + esc(f.name) + '"' +
          ' aria-expanded="false" title="' + esc(defTitle(f)) + '">' + esc(f.name).replace(/_/g, '_<wbr>') + '</button></th>';
      }).join('') + '</tr></thead>';
    var tbody = '<tbody>' + PAPERS.slice().sort(byPaperId).map(function (p, i) {
      return '<tr class="row">' +
        '<td class="col-idx idx">' + (i + 1) + '</td>' +
        '<td class="col-paper paper"><span class="paper-title" title="' + esc(clean(p.Title)) + '">' + esc(clean(p.Title)) + '</span>' +
          '<span class="citation-key">' + esc(clean(p.Author_Year || p.Citation_Key)) + '</span></td>' +
        fields.map(function (f) { return cellHTML(p, f); }).join('') + '</tr>';
    }).join('') + '</tbody>';
    var tfoot = '<tfoot><tr><td class="col-idx"></td>' +
      '<td class="col-paper"><span class="tfoot-label">Tally \u00b7 all ' + N + ' papers</span></td>' +
      fields.map(function (f) { return tallyCellHTML(f.name); }).join('') + '</tr></tfoot>';

    return '<section class="group-section" id="' + sid + '" aria-labelledby="' + sid + '-h">' +
      head + lead +
      '<div class="tablewrap"><table class="sheet-table" id="table-' + sid + '">' +
      thead + tbody + tfoot + '</table></div>' +
      '</section>';
  }

  /* --------------------------------------------------------- claim table -- */

  var SLOT_BY = {};
  SLOTS.forEach(function (s) { SLOT_BY[clean(s.Paper_ID) + '|' + clean(s.Claim_Slot).toUpperCase()] = s; });

  function slotOf(paperId, slot) { return SLOT_BY[clean(paperId) + '|' + slot]; }
  function alignValue(s) { return s ? clean(s.Final_Alignment) : ''; }

  function alignChipHTML(value) {
    var key = clean(value).toUpperCase();
    if (!key || !ALIGN_CLASS[key]) return '<span class="dash">&mdash;</span>';
    return '<span class="chip align ' + ALIGN_CLASS[key] + '" title="' + esc(key) + '">' + esc(key) + '</span>';
  }

  function alignCountsHTML(slots) {
    var counts = {};
    slots.forEach(function (s) {
      var v = clean(s.Final_Alignment).toUpperCase();
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    var keys = ALIGN_ORDER.filter(function (k) { return counts[k]; });
    return keys.length ? keys.map(function (k) { return k + ' ' + counts[k]; }).join(' \u00b7 ') : '\u2014';
  }

  function claimSectionHTML() {
    var ordered = PAPERS.slice().sort(byPaperId);

    var rows = ordered.map(function (p, i) {
      var c1 = slotOf(p.Paper_ID, 'C1');
      var c2 = slotOf(p.Paper_ID, 'C2');
      return '<tr class="claim-row">' +
        '<td class="col-idx idx">' + (i + 1) + '</td>' +
        '<td class="col-paper paper"><span class="paper-title" title="' + esc(clean(p.Title)) + '">' + esc(clean(p.Title)) + '</span>' +
          '<span class="citation-key">' + esc(clean(p.Author_Year || p.Citation_Key)) + '</span></td>' +
        '<td class="value-cell">' + alignChipHTML(alignValue(c1)) + '</td>' +
        '<td class="value-cell">' + alignChipHTML(alignValue(c2)) + '</td>' +
        '</tr>';
    }).join('');

    var c1Slots = SLOTS.filter(function (s) { return clean(s.Claim_Slot).toUpperCase() === 'C1'; });
    var c2Slots = SLOTS.filter(function (s) { return clean(s.Claim_Slot).toUpperCase() === 'C2'; });
    var tfoot = '<tfoot><tr><td class="col-idx"></td>' +
      '<td class="col-paper"><span class="tfoot-label">Tally \u00b7 all ' + SLOTS.length + ' claim rows</span></td>' +
      '<td class="value-cell"><span class="tally">' + c1Slots.length + ' slots \u00b7 ' + alignCountsHTML(c1Slots) + '</span></td>' +
      '<td class="value-cell"><span class="tally">' + c2Slots.length + ' slots \u00b7 ' + alignCountsHTML(c2Slots) + '</span></td>' +
      '</tr></tfoot>';

    return '<section class="group-section" id="g7" aria-labelledby="g7-h">' +
      '<div class="sec-head"><span class="sec-num">G7</span>' +
      '<h2 id="g7-h">Claim&ndash;Evidence Alignment <span class="gcount">' + SLOTS.length + ' claim slots</span></h2></div>' +
      '<p class="lead">One row per paper. C1 is the paper\u2019s primary claim; C2 is an explicit extension ' +
      'beyond it, shown where the paper makes one. Each column gives that claim\u2019s claim\u2013evidence ' +
      'alignment coding; the claim sentences themselves are not reproduced here.</p>' +
      '<div class="tablewrap"><table class="sheet-table claim-table" id="table-g7"><thead><tr>' +
      '<th scope="col" class="col-idx">#</th>' +
      '<th scope="col" class="col-paper">Paper</th>' +
      '<th scope="col" class="col-value">C1 \u2014 Primary claim</th>' +
      '<th scope="col" class="col-value">C2 \u2014 Broader claim</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' + tfoot + '</table></div>' +
      '</section>';
  }

  /* ------------------------------------------------------------ jump bar -- */

  function jumpLinksHTML() {
    return GROUPS.map(function (g) {
      return '<a class="jump-link" href="#' + g.id.toLowerCase() + '" data-target="' + esc(g.id) + '">' +
        esc(g.id + ' ' + (SHORT[g.id] || g.name)) + '</a>';
    }).join('') +
      '<a class="jump-link" href="#g7" data-target="G7">G7 Claim\u2013Evidence</a>';
  }

  /* ---------------------------------------------------- column sizing ---- */
  //
  // Width priority, highest first:
  //   P0  the index column, a 1-2 line title, and - this is the one that
  //       actually decides everything - the 52-paper tally row: a field column
  //       may never be narrower than the text in its own footer cell, or the
  //       footer folds.
  //   P1  if the table's P0 needs fit, nothing is ever folded; the leftover
  //       goes to the title column first, then to the columns that would
  //       otherwise truncate, in proportion to how much they overflow.
  //   P2  only when P0 does not fit (G1: two category tallies alone need
  //       1264px) are the widest footer cells squeezed, in order, down to a
  //       floor that keeps them at two lines.
  //   P3/P4  long text keeps at most two lines, then ellipsis; every clipped
  //       chip, title and text cell is click-to-expand.
  // Measured from the live DOM, never hard-coded: the sizing re-runs on
  // resize. The page must never scroll horizontally.

  var COL_PAD = 14;          // cell left+right padding
  var COL_IDX = 38;          // # column
  var PAPER_MIN = 210;       // title column: 2 lines + citation
  var PAPER_MAX = 330;       // title column: room to breathe when slack allows
  var COL_FLOOR = 58;

  var measureEl = null;
  function textWidth(txt, ref) {
    if (!txt) return 0;
    if (!measureEl) {
      measureEl = document.createElement('span');
      measureEl.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;';
      document.body.appendChild(measureEl);
    }
    var cs = window.getComputedStyle(ref);
    measureEl.style.fontFamily = cs.fontFamily;
    measureEl.style.fontSize = cs.fontSize;
    measureEl.style.fontWeight = cs.fontWeight;
    measureEl.style.fontStyle = cs.fontStyle;
    measureEl.style.letterSpacing = cs.letterSpacing;
    measureEl.textContent = txt;
    return measureEl.getBoundingClientRect().width;
  }

  // The header may wrap after every underscore and at every space, so what
  // limits it is its longest chunk, not the whole field name.
  function headerNeed(th) {
    var ref = th.querySelector('.col-btn') || th;
    var max = 0;
    clean(th.textContent).split(/[\s_]+/).forEach(function (part) {
      var w = textWidth(part + '_', ref);
      if (w > max) max = w;
    });
    return max;
  }

  function sizeTable(table) {
    var wrap = table.closest('.tablewrap');
    if (!wrap) return;
    var avail = wrap.clientWidth;
    if (!avail) return;

    var ths = [].slice.call(table.querySelectorAll('thead th'));
    var n = ths.length;
    if (!n) return;
    var foot = table.querySelector('tfoot tr');
    var footCells = foot ? [].slice.call(foot.children) : [];
    var rows = [].slice.call(table.querySelectorAll('tbody tr'));

    var width = new Array(n), floor = new Array(n), want = new Array(n), tally = new Array(n);
    var content = new Array(n);   // the widest value actually in the column
    var hdr = new Array(n);       // longest single chunk of the header
    var paperIdx = -1, growIdx = [], fieldIdx = [];

    for (var i = 0; i < n; i++) {
      var th = ths[i];
      if (th.classList.contains('col-idx')) {
        width[i] = floor[i] = want[i] = COL_IDX;
        continue;
      }
      if (th.classList.contains('col-paper')) {
        paperIdx = i;
        width[i] = PAPER_MIN; floor[i] = 150; want[i] = PAPER_MAX;
        continue;
      }
      fieldIdx.push(i);
      // P0: the footer cell must stay on one line
      var tRef = footCells[i] ? (footCells[i].querySelector('.tally, .tfoot-label') || footCells[i]) : th;
      tally[i] = footCells[i] ? textWidth(clean(footCells[i].textContent), tRef) + COL_PAD : 0;
      hdr[i] = headerNeed(th) + COL_PAD;
      var min = Math.max(tally[i], hdr[i], 40);
      // comfortable floor: the footer is allowed one extra line
      floor[i] = Math.max(hdr[i], Math.min(min, tally[i] * 0.55), 40);
      // content: the widest single value in this column
      var contentW = 0, isText = false;
      for (var r = 0; r < rows.length; r++) {
        var td = rows[r].children[i];
        if (!td) continue;
        if (td.querySelector('.txt-btn')) isText = true;
        var el = td.querySelector('.txt-btn') || td.querySelector('.chip') ||
                 td.querySelector('.bmark') || td.querySelector('.dash') ||
                 td.querySelector('.na') || td;
        var w = textWidth(clean(el.textContent), el);
        if (w > contentW) contentW = w;
      }
      content[i] = contentW + COL_PAD;
      width[i] = min;
      // A long text cell wants far more room than any column could ever get,
      // so its appetite is capped: past ~2.5 average cell widths another pixel
      // only makes the column emptier, not the content more readable.
      want[i] = Math.max(content[i], min);
      if (isText) want[i] = Math.min(want[i], min + 900);
      if (want[i] > min + 24) growIdx.push(i);
    }

    function sum() { var s = 0; for (var k = 0; k < n; k++) s += width[k]; return s; }

    // P2: squeeze the widest field columns, widest first, until the table fits.
    // First down to the comfortable floor (footer on two lines); only if that is
    // still too wide, down to the hard floor (the header's longest chunk), which
    // is what keeps a narrow laptop free of a horizontal scrollbar.
    function squeeze(limitOf) {
      var guard = 0;
      while (sum() > avail && guard++ < 8000) {
        var pick = -1, pickW = 0;
        for (var a = 0; a < fieldIdx.length; a++) {
          var fi = fieldIdx[a];
          if (width[fi] - limitOf(fi) > 1 && width[fi] > pickW) { pick = fi; pickW = width[fi]; }
        }
        if (pick < 0) return false;
        width[pick] -= 2;
      }
      return true;
    }
    // Below this the header is allowed to break inside a word - at that width
    // a slightly ugly header beats a horizontal scrollbar.
    squeeze(function (i) { return floor[i]; }) ||
      squeeze(function (i) { return Math.max(34, Math.min(hdr[i], 52)); });
    if (paperIdx >= 0) {
      var pguard = 0;
      while (sum() > avail && width[paperIdx] > 130 && pguard++ < 2000) width[paperIdx] -= 2;
    }

    // P1: hand the leftover to the title, then to the columns that truncate
    var slack = avail - sum();
    if (slack > 0 && paperIdx >= 0) {
      var givePaper = Math.min(slack, want[paperIdx] - width[paperIdx]);
      width[paperIdx] += givePaper;
      slack -= givePaper;
    }
    if (slack > 0 && growIdx.length) {
      var overflow = 0;
      growIdx.forEach(function (ti) { overflow += Math.max(want[ti] - width[ti], 1); });
      growIdx.forEach(function (ti) {
        width[ti] += slack * Math.max(want[ti] - width[ti], 1) / overflow;
      });
      slack = 0;
    }
    if (slack > 0 && fieldIdx.length) {
      // nothing truncates any more: spread what is left so columns stay even
      var per = slack / fieldIdx.length;
      fieldIdx.forEach(function (fi) { width[fi] += per; });
    }

    // P3: a column whose width is dictated by its footer cell alone (its own
    // content is much narrower) may not starve the columns that hold long text.
    // Those footer cells are allowed a second line and the difference goes to
    // the long-text columns, which is the whole point of the priority order.
    var textCols = growIdx.filter(function (i) { return want[i] - width[i] > 200; });
    if (textCols.length) {
      var fair = Math.max(170, avail * 0.18);
      textCols.forEach(function (ti) {
        var shortfall = fair - width[ti];
        if (shortfall <= 0) return;
        // Take it from the columns that are wide only because of their footer
        // text, and only from columns that are already comfortable: a 90px
        // boolean column must not be squeezed, or its own footer folds - which
        // is exactly the failure this sizing exists to avoid.
        var donors = fieldIdx.filter(function (fi) {
          return fi !== ti && width[fi] > 120 && width[fi] > floor[fi] + 2 &&
                 tally[fi] > content[fi] + 40;
        }).sort(function (a, b) { return width[b] - width[a]; });
        for (var d = 0; d < donors.length && shortfall > 0; d++) {
          var give = Math.min(shortfall, width[donors[d]] - floor[donors[d]]);
          width[donors[d]] -= give;
          width[ti] += give;
          shortfall -= give;
        }
      });
    }

    var colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      colgroup = document.createElement('colgroup');
      table.insertBefore(colgroup, table.firstChild);
    }
    colgroup.innerHTML = width.map(function (w) {
      return '<col style="width:' + Math.max(w, 24).toFixed(1) + 'px">';
    }).join('');
  }

  var sizeTimer = null;
  function sizeAllTables() {
    var tables = document.querySelectorAll('table.sheet-table');
    for (var i = 0; i < tables.length; i++) sizeTable(tables[i]);
  }
  function sizeAllTablesSoon() {
    if (sizeTimer) clearTimeout(sizeTimer);
    sizeTimer = setTimeout(sizeAllTables, 80);
  }

  /* ---------------------------------------------------------- definition -- */

  function renderPopover(fieldName) {
    var pop = $id('field-pop');
    var f = META[fieldName].field;
    var gate = gateOf(fieldName);
    var note = gateNote(fieldName);
    var fieldNote = clean(f.note);
    pop.dataset.field = fieldName;
    pop.classList.toggle('pinned', !!state.pop.pinned);
    pop.innerHTML =
      '<div class="fp-head"><code>' + esc(f.name) + '</code>' +
      '<span class="fp-actions">' +
      '<button type="button" class="fp-pin" aria-pressed="' + (state.pop.pinned ? 'true' : 'false') + '">' +
      (state.pop.pinned ? 'Unpin' : 'Pin') + '</button>' +
      '<button type="button" class="fp-close" aria-label="Close definition">Close</button></span></div>' +
      '<p class="fp-values"><strong>Values:</strong> ' + esc(clean(f.values || 'Free text')) + '</p>' +
      '<p class="fp-def">' + esc(clean(f.definition)) + '</p>' +
      (note ? '<p class="fp-gate">' + esc(note) + '</p>' : '') +
      (gate && gate.gate_note && !note ? '<p class="fp-gate">' + esc(clean(gate.gate_note)) + '</p>' : '') +
      (fieldNote ? '<p class="fp-def">' + esc(fieldNote) + '</p>' : '');
    pop.hidden = false;
  }

  function openPopover(fieldName, btn) {
    if (state.pop.pinned) {
      state.pop.field = fieldName;
      renderPopover(fieldName);
      highlightHeader(fieldName);
      return;
    }
    state.pop.field = fieldName;
    renderPopover(fieldName);
    positionPopover(btn);
    highlightHeader(fieldName);
  }

  function highlightHeader(fieldName) {
    var btns = document.querySelectorAll('.col-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = state.pop.field === fieldName && btns[i].getAttribute('data-field') === fieldName;
      btns[i].setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }

  function positionPopover(btn) {
    var pop = $id('field-pop');
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var top = rect.bottom + 6;
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 16));
    if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - pop.offsetHeight - 6);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function closePopover(force) {
    if (state.pop.pinned && !force) return;
    state.pop.pinned = false;
    state.pop.field = null;
    var pop = $id('field-pop');
    pop.hidden = true;
    pop.classList.remove('pinned');
    highlightHeader(null);
  }

  function togglePin() {
    state.pop.pinned = !state.pop.pinned;
    renderPopover(state.pop.field);
    if (state.pop.pinned) {
      document.getElementById('field-pop').style.top = '';
      document.getElementById('field-pop').style.left = '';
    }
  }

  /* ------------------------------------------------------------- widgets -- */

  function toggleText(key, btn) {
    var open = !state.textOpen[key];
    if (open) state.textOpen[key] = true; else delete state.textOpen[key];
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var td = btn.closest('td');
    if (td) td.classList.toggle('open', open);
  }

  /* --------------------------------------------------------- scroll-spy --- */

  function jumpbarHeight() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--jumpbar-h');
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }
  function syncJumpbarHeight() {
    var bar = $id('jumpbar');
    if (bar) document.documentElement.style.setProperty('--jumpbar-h', bar.offsetHeight + 'px');
  }
  function spy() {
    var threshold = jumpbarHeight() + 18;
    var active = SECTION_IDS[0];
    SECTION_IDS.forEach(function (gid) {
      var el = $id(gid.toLowerCase());
      if (!el) return;
      if (el.getBoundingClientRect().top - threshold <= 4) active = gid;
    });
    // The last section can never reach the threshold once the page is scrolled
    // to its end, so pin it as active at the bottom of the document.
    var doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
      active = SECTION_IDS[SECTION_IDS.length - 1];
    }
    var links = document.querySelectorAll('.jump-link');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-target') === active) links[i].setAttribute('aria-current', 'true');
      else links[i].removeAttribute('aria-current');
    }
  }

  /* ---------------------------------------------------------------- build -- */

  function build() {
    var html = GROUPS.map(function (g) { return paperSectionHTML(g); }).join('');
    html += claimSectionHTML();
    $id('groups').innerHTML = html;
  }

  /* --------------------------------------------------------------- events -- */

  function bind() {
    $id('jump-links').innerHTML = jumpLinksHTML();

    $id('groups').addEventListener('click', function (e) {
      var colBtn = e.target.closest('.col-btn');
      if (colBtn) { openPopover(colBtn.getAttribute('data-field'), colBtn); return; }
      var txt = e.target.closest('.txt-btn');
      if (txt) { toggleText(txt.getAttribute('data-text-key'), txt); return; }
      var chip = e.target.closest('.chip');
      if (chip) { chip.classList.toggle('expanded'); return; }
      var title = e.target.closest('.paper-title');
      if (title) { title.classList.toggle('expanded'); }
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('#field-pop')) return;
      if (e.target.closest('.col-btn')) return;
      closePopover(false);
    });

    $id('field-pop').addEventListener('click', function (e) {
      if (e.target.closest('.fp-close')) { closePopover(true); return; }
      if (e.target.closest('.fp-pin')) { togglePin(); return; }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePopover(true);
    });

    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', function () { syncJumpbarHeight(); spy(); sizeAllTablesSoon(); });
    window.addEventListener('hashchange', function () { setTimeout(spy, 30); });
    window.addEventListener('load', function () { syncJumpbarHeight(); spy(); sizeAllTables(); });
  }

  /* ---------------------------------------------------------------- start -- */

  syncJumpbarHeight();
  build();
  bind();
  sizeAllTables();
  syncJumpbarHeight();
  spy();
  setTimeout(function () { syncJumpbarHeight(); spy(); sizeAllTables(); }, 0);
})();
