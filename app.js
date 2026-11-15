// Quetta NISAR explorer, new interface. Same data files as the first version (data/meta.json, data/cube.json).

var meta = null;       // data/meta.json
var cube = null;       // data/cube.json (values in cm for every date)
var map = null;
var chart = null;
var marker = null;
var series = null;     // values of the selected spot, one per date
var current = 0;       // index of the date being shown
var timer = null;
var overlay = 1;       // overlay strength, 0 to 1
var SPEEDS = [1000, 500, 250];
var speedIdx = 0;

function $(id) { return document.getElementById(id); }

function showError(text) {
  $('error').textContent = text;
  $('error').hidden = false;
}

// ---------- Load data ----------
fetch('data/meta.json')
  .then(function (r) {
    if (!r.ok) { throw new Error('data/meta.json not found (HTTP ' + r.status + ')'); }
    return r.json();
  })
  .then(function (m) { meta = m; startApp(); })
  .catch(function (err) {
    showError('Could not load the data (' + err.message + '). If you opened this file directly, run "python -m http.server" in the folder and visit http://localhost:8000/new.html');
  });

function startApp() {
  var b = meta.bounds;
  var imagery = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  var dark = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

  map = new maplibregl.Map({
    container: 'map',
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        'base-dark': { type: 'raster', tiles: [dark], tileSize: 256, maxzoom: 16, attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors' },
        'base-sat': { type: 'raster', tiles: [imagery], tileSize: 256, maxzoom: 17, attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community' }
      },
      layers: [
        { id: 'base-dark', type: 'raster', source: 'base-dark' },
        { id: 'base-sat', type: 'raster', source: 'base-sat', layout: { visibility: 'none' } }
      ]
    },
    center: [(b.west + b.east) / 2, (b.south + b.north) / 2],
    zoom: 9,
    maxZoom: 15
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  setupLegend();
  setupControls();
  buildTicks();
  $('endStart').textContent = shortDate(meta.dates[0]);
  $('endEnd').textContent = shortDate(meta.dates[meta.dates.length - 1]);

  map.on('load', onMapLoad);
  map.on('mousemove', onMove);
  map.on('mouseout', function () { $('hover').hidden = true; });
  map.on('click', function (e) { pickSpot(e.lngLat.lng, e.lngLat.lat); });

  fetch('data/cube.json')
    .then(function (r) { return r.json(); })
    .then(function (c) { cube = c; })
    .catch(function () { showError('Could not load data/cube.json, so values and charts will not work.'); });
}

function onMapLoad() {
  var b = meta.bounds;
  var corners = [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]];

  for (var k = 0; k < meta.frames.length; k++) {
    map.addSource('frame-' + k, { type: 'image', url: meta.frames[k], coordinates: corners });
    map.addLayer({
      id: 'frame-' + k, type: 'raster', source: 'frame-' + k,
      paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 250, delay: 0 }, 'raster-fade-duration': 0 }
    });
  }

  // Place names on top of the overlay
  map.addSource('labels', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256, maxzoom: 16
  });
  map.addLayer({ id: 'labels', type: 'raster', source: 'labels' });

  map.addSource('study-box', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]] } }
  });
  map.addLayer({
    id: 'study-box-line', type: 'line', source: 'study-box',
    paint: { 'line-color': '#e0cfa6', 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [3, 2] }
  });

  fitStudyArea();
  showFrame(0);
}

function fitStudyArea() {
  var b = meta.bounds;
  var phone = window.innerWidth <= 720;
  map.resize();
  map.fitBounds([[b.west, b.south], [b.east, b.north]], {
    padding: phone
      ? { top: 150, bottom: 230, left: 20, right: 20 }
      : { top: 50, bottom: 170, left: 300, right: 450 },
    duration: 0
  });
}

// ---------- Controls ----------
function setupLegend() {
  var cm = meta.colormap;
  $('legendBar').style.background = 'linear-gradient(to right, ' + cm.legend_stops.join(', ') + ')';
  $('legendMin').textContent = '\u2212' + Math.abs(cm.vmin) + ' cm';
  $('legendMax').textContent = '+' + cm.vmax + ' cm';
}

function setupControls() {
  $('play').addEventListener('click', function () { if (timer) { stopPlay(); } else { startPlay(); } });
  $('prev').addEventListener('click', function () { stopPlay(); showFrame(Math.max(0, current - 1)); });
  $('next').addEventListener('click', function () { stopPlay(); showFrame(Math.min(meta.dates.length - 1, current + 1)); });

  $('speed').addEventListener('click', function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    $('speed').textContent = (1000 / SPEEDS[speedIdx]) + '\u00d7';
    if (timer) { stopPlay(); startPlay(); }
  });

  $('bmDark').addEventListener('click', function () { setBasemap('dark'); });
  $('bmSat').addEventListener('click', function () { setBasemap('sat'); });

  $('opacity').addEventListener('input', function () {
    overlay = Number($('opacity').value) / 100;
    showFrame(current);
  });

  var chips = document.querySelectorAll('.chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function (e) {
      pickSpot(Number(e.currentTarget.dataset.lon), Number(e.currentTarget.dataset.lat));
    });
  }

  $('introGo').addEventListener('click', function () { $('intro').className = 'gone'; });
  $('aboutBtn').addEventListener('click', function () { $('about').showModal(); });
  $('aboutClose').addEventListener('click', function () { $('about').close(); });
  $('about').addEventListener('click', function (e) { if (e.target === $('about')) { $('about').close(); } });

  // Keyboard: left/right arrows change the date, space plays
  document.addEventListener('keydown', function (e) {
    if ($('about').open || $('intro').className !== '') { return; }
    var tag = e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT') { return; }
    if (e.key === 'ArrowLeft') { stopPlay(); showFrame(Math.max(0, current - 1)); }
    if (e.key === 'ArrowRight') { stopPlay(); showFrame(Math.min(meta.dates.length - 1, current + 1)); }
    if (e.key === ' ') { e.preventDefault(); if (timer) { stopPlay(); } else { startPlay(); } }
  });
}

function setBasemap(which) {
  map.setLayoutProperty('base-dark', 'visibility', which === 'dark' ? 'visible' : 'none');
  map.setLayoutProperty('base-sat', 'visibility', which === 'sat' ? 'visible' : 'none');
  $('bmDark').className = which === 'dark' ? 'on' : '';
  $('bmSat').className = which === 'sat' ? 'on' : '';
}

// Timeline dots sit at their real position in time, so the 24-day gap is visible
function buildTicks() {
  var track = $('track');
  var last = daysBetween(meta.dates[0], meta.dates[meta.dates.length - 1]);
  for (var i = 0; i < meta.dates.length; i++) {
    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'tick';
    t.id = 'tick-' + i;
    t.style.left = (daysBetween(meta.dates[0], meta.dates[i]) / last * 100) + '%';
    t.setAttribute('aria-label', formatDate(meta.dates[i]));
    t.dataset.index = i;
    t.addEventListener('click', function (e) { stopPlay(); showFrame(Number(e.currentTarget.dataset.index)); });
    track.appendChild(t);
  }
}

function showFrame(i) {
  current = i;
  for (var k = 0; k < meta.frames.length; k++) {
    if (map.getLayer('frame-' + k)) {
      map.setPaintProperty('frame-' + k, 'raster-opacity', k === i ? overlay : 0);
    }
    var tick = $('tick-' + k);
    tick.className = 'tick' + (k < i ? ' past' : '') + (k === i ? ' now' : '');
  }

  var last = daysBetween(meta.dates[0], meta.dates[meta.dates.length - 1]);
  $('fill').style.width = (daysBetween(meta.dates[0], meta.dates[i]) / last * 100) + '%';
  $('date').textContent = formatDate(meta.dates[i]);
  $('dayinfo').textContent = (i === 0) ? 'starting point (zero)' : 'day ' + daysBetween(meta.dates[0], meta.dates[i]);

  updateSpotReadout();
  if (chart) { chart.update('none'); }
}

function startPlay() {
  if (current >= meta.dates.length - 1) { showFrame(0); }
  timer = setInterval(function () {
    if (current >= meta.dates.length - 1) { stopPlay(); return; }
    showFrame(current + 1);
  }, SPEEDS[speedIdx]);
  $('play').textContent = 'Pause';
  $('play').setAttribute('aria-pressed', 'true');
}

function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').textContent = 'Play';
  $('play').setAttribute('aria-pressed', 'false');
}

// ---------- Hover and click ----------
function cellAt(lon, lat) {
  if (!cube) { return null; }
  var b = meta.bounds;
  if (lon < b.west || lon > b.east || lat < b.south || lat > b.north) { return null; }
  var col = Math.min(cube.cols - 1, Math.floor((lon - b.west) / (b.east - b.west) * cube.cols));
  var row = Math.min(cube.rows - 1, Math.floor((b.north - lat) / (b.north - b.south) * cube.rows));
  return { row: row, col: col };
}

function onMove(e) {
  var cell = cellAt(e.lngLat.lng, e.lngLat.lat);
  var el = $('hover');
  if (!cell) { el.hidden = true; return; }
  var v = cube.values[current][cell.row * cube.cols + cell.col];
  el.textContent = (v === null) ? 'no data' : fmt(v) + ' cm';
  el.style.left = (e.point.x + 14) + 'px';
  el.style.top = (e.point.y + 14) + 'px';
  el.hidden = false;
}

function pickSpot(lon, lat) {
  var cell = cellAt(lon, lat);
  $('chartCard').hidden = false;
  if (!cell) {
    $('spotInfo').textContent = 'Click inside the dashed box.';
    return;
  }
  if (marker) { marker.remove(); }
  marker = new maplibregl.Marker({ color: '#e0cfa6' }).setLngLat([lon, lat]).addTo(map);

  var result = pointSeries(cell.row, cell.col);
  $('spotInfo').textContent = lat.toFixed(3) + '\u00b0 N, ' + lon.toFixed(3) + '\u00b0 E';
  if (!result) {
    series = null;
    $('spotValue').textContent = 'no data';
    $('spotDate').textContent = 'masked as too noisy here';
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  series = result;
  drawChart();
  updateSpotReadout();
}

// Mean of the 3x3 pixels around the spot, using only pixels valid on the last date (needs at least 3)
function pointSeries(row, col) {
  var last = cube.values.length - 1;
  var ids = [];
  for (var dr = -1; dr <= 1; dr++) {
    for (var dc = -1; dc <= 1; dc++) {
      var r = row + dr;
      var c = col + dc;
      if (r < 0 || r >= cube.rows || c < 0 || c >= cube.cols) { continue; }
      var id = r * cube.cols + c;
      if (cube.values[last][id] !== null) { ids.push(id); }
    }
  }
  if (ids.length < 3) { return null; }

  var values = [];
  for (var k = 0; k < cube.values.length; k++) {
    var sum = 0;
    var n = 0;
    for (var j = 0; j < ids.length; j++) {
      var v = cube.values[k][ids[j]];
      if (v !== null) { sum += v; n++; }
    }
    values.push(n > 0 ? sum / n : null);
  }
  return values;
}

function updateSpotReadout() {
  if (!series) { return; }
  $('spotValue').textContent = fmt(series[current]) + ' cm';
  $('spotDate').textContent = 'on ' + shortDate(meta.dates[current]);
}

function drawChart() {
  var points = [];
  for (var k = 0; k < series.length; k++) {
    points.push({ x: daysBetween(meta.dates[0], meta.dates[k]), y: series[k] });
  }
  if (chart) {
    chart.data.datasets[0].data = points;
    chart.update('none');
    return;
  }
  chart = new Chart($('chart'), {
    type: 'line',
    data: { datasets: [{
      data: points, borderColor: '#e0cfa6', backgroundColor: '#e0cfa6', borderWidth: 2, tension: 0,
      pointRadius: function (ctx) { return ctx.dataIndex === current ? 6 : 3; }
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        title: function (items) { return formatDate(meta.dates[items[0].dataIndex]); },
        label: function (item) { return fmt(item.parsed.y) + ' cm'; }
      } } },
      scales: {
        x: { type: 'linear', bounds: 'data', grid: { color: '#1b2733' }, ticks: { color: '#9aa9b8', maxTicksLimit: 5, callback: function (v) {
          var ms = Date.parse(meta.dates[0] + 'T00:00:00Z') + v * 86400000;
          return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        } } },
        y: { suggestedMin: -4, suggestedMax: 4, grid: { color: '#243241' }, ticks: { color: '#9aa9b8' } }
      }
    }
  });
}

// ---------- Helpers ----------
function fmt(v) { return (v > 0 ? '+' : (v < 0 ? '\u2212' : '')) + Math.abs(v).toFixed(1); }

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function shortDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
