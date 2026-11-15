// Quetta NISAR dashboard, step 1: map + overlay + date slider + play/pause.
// MapLibre = map library. We add one "image source" per date and switch which one is visible.

var meta = null;      // contents of data/meta.json
var map = null;       // the MapLibre map
var current = 0;      // index of the date being shown
var timer = null;     // setInterval handle while playing
var PLAY_MS = 1000;   // time per frame while playing
var cube = null;      // contents of data/cube.json (values in cm for every date)
var chart = null;     // the Chart.js chart
var marker = null;    // the pin on the map

var dateEl = document.getElementById('date');
var dayInfoEl = document.getElementById('dayinfo');
var sliderEl = document.getElementById('slider');
var playBtn = document.getElementById('playBtn');
var errorEl = document.getElementById('error');
var chartInfoEl = document.getElementById('chartInfo');
var chartBoxEl = document.getElementById('chartBox');

function showError(text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
}

// 1. Load meta.json first, everything else depends on it
fetch('data/meta.json')
  .then(function (r) {
    if (!r.ok) { throw new Error('data/meta.json not found (HTTP ' + r.status + ')'); }
    return r.json();
  })
  .then(function (m) {
    meta = m;
    startApp();
  })
  .catch(function (err) {
    showError('Could not load the data (' + err.message + '). Open this page through a local server: run "python -m http.server" in this folder, then visit http://localhost:8000');
  });

function startApp() {
  var b = meta.bounds;

  map = new maplibregl.Map({
    container: 'map',
    attributionControl: false,
    // Dark basemap: Esri Dark Gray Canvas (no API key). Esri's terms apply, attribution is required.
    // To try satellite instead, swap the URL for .../World_Imagery/MapServer/tile/{z}/{y}/{x}
    style: {
      version: 8,
      sources: {
        base: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 16,
          attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }]
    },
    center: [(b.west + b.east) / 2, (b.south + b.north) / 2],
    zoom: 9,
    maxZoom: 14
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  setupLegend();
  setupControls();
  map.on('load', onMapLoad);
  map.on('click', onMapClick);

  fetch('data/cube.json')
    .then(function (r) { return r.json(); })
    .then(function (c) { cube = c; })
    .catch(function () { showError('Could not load data/cube.json, so the chart will not work.'); });
}

// Zoom the map so the whole study box is visible next to the panel
function fitStudyArea() {
  var b = meta.bounds;
  var isPhone = window.innerWidth <= 640;
  map.resize();
  map.fitBounds([[b.west, b.south], [b.east, b.north]], {
    padding: isPhone
      ? { top: 60, bottom: 260, left: 20, right: 20 }
      : { top: 40, bottom: 40, left: 380, right: 440 },
    duration: 0
  });
}

function onMapLoad() {
  var b = meta.bounds;
  // Image corners in order: top-left, top-right, bottom-right, bottom-left
  var corners = [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]];

  // One source + layer per date, all stacked. Only the current one has opacity 1.
  for (var k = 0; k < meta.frames.length; k++) {
    map.addSource('frame-' + k, { type: 'image', url: meta.frames[k], coordinates: corners });
    map.addLayer({
      id: 'frame-' + k,
      type: 'raster',
      source: 'frame-' + k,
      paint: {
        'raster-opacity': 0,
        'raster-opacity-transition': { duration: 250, delay: 0 },
        'raster-fade-duration': 0
      }
    });
  }

  // Place names (cities, roads, borders) drawn on top of the overlay. Separate Esri layer, same terms.
  map.addSource('labels', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 16
  });
  map.addLayer({ id: 'labels', type: 'raster', source: 'labels' });

  // Dashed outline of the study box
  map.addSource('study-box', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]]
      }
    }
  });
  map.addLayer({
    id: 'study-box-line',
    type: 'line',
    source: 'study-box',
    paint: { 'line-color': '#e0cfa6', 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [3, 2] }
  });

  fitStudyArea();
  showFrame(0);
}

function setupLegend() {
  var cm = meta.colormap;
  document.getElementById('legendBar').style.background =
    'linear-gradient(to right, ' + cm.legend_stops.join(', ') + ')';
  document.getElementById('legendMin').textContent = '\u2212' + Math.abs(cm.vmin) + ' cm';
  document.getElementById('legendMax').textContent = '+' + cm.vmax + ' cm';
}

function setupControls() {
  sliderEl.max = meta.dates.length - 1;
  sliderEl.value = 0;

  sliderEl.addEventListener('input', function () {
    stopPlay();
    showFrame(Number(sliderEl.value));
  });
  playBtn.addEventListener('click', function () {
    if (timer) { stopPlay(); } else { startPlay(); }
  });
}

// Show date number i: make its layer visible, hide the others, update the text
function showFrame(i) {
  current = i;
  for (var k = 0; k < meta.frames.length; k++) {
    if (map.getLayer('frame-' + k)) {
      map.setPaintProperty('frame-' + k, 'raster-opacity', k === i ? 1 : 0);
    }
  }
  sliderEl.value = i;
  if (chart) { chart.update('none'); }

  var d = meta.dates[i];
  dateEl.textContent = formatDate(d);
  var days = daysBetween(meta.dates[0], d);
  dayInfoEl.textContent = (i === 0)
    ? 'Starting point: zero by definition'
    : 'Day ' + days + ' since the first acquisition';
}

function startPlay() {
  if (current >= meta.dates.length - 1) { showFrame(0); }
  timer = setInterval(function () {
    if (current >= meta.dates.length - 1) { stopPlay(); return; }
    showFrame(current + 1);
  }, PLAY_MS);
  playBtn.textContent = 'Pause';
  playBtn.setAttribute('aria-pressed', 'true');
}

function stopPlay() {
  clearInterval(timer);
  timer = null;
  playBtn.textContent = 'Play';
  playBtn.setAttribute('aria-pressed', 'false');
}

// "2026-07-14" -> "14 Jul 2026" (dates are real, not evenly spaced)
function formatDate(iso) {
  var d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function daysBetween(a, b) {
  var ms = new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

// ---------- Step 2: click a point, see its time series ----------

function onMapClick(e) {
  if (!cube) { return; }
  var b = meta.bounds;
  var lon = e.lngLat.lng;
  var lat = e.lngLat.lat;

  if (lon < b.west || lon > b.east || lat < b.south || lat > b.north) {
    chartInfoEl.textContent = 'That spot is outside the data. Click inside the dashed box.';
    return;
  }

  // lon/lat -> row/col of the 160x160 grid (row 0 = north edge, col 0 = west edge)
  var col = Math.min(cube.cols - 1, Math.floor((lon - b.west) / (b.east - b.west) * cube.cols));
  var row = Math.min(cube.rows - 1, Math.floor((b.north - lat) / (b.north - b.south) * cube.rows));

  placeMarker(lon, lat);

  var result = pointSeries(row, col);
  if (!result) {
    chartBoxEl.hidden = true;
    chartInfoEl.textContent = 'No reliable data here (these pixels were masked as too noisy). Try a nearby spot.';
    return;
  }
  chartInfoEl.textContent = 'Relative change in cm, average of ' + result.count + ' nearby pixels (about 240 m each). Differences under 2\u20133 cm are within the noise.';
  chartBoxEl.hidden = false;
  drawChart(result.values);
}

function placeMarker(lon, lat) {
  if (marker) { marker.remove(); }
  marker = new maplibregl.Marker({ color: '#e0cfa6' }).setLngLat([lon, lat]).addTo(map);
}

// Average of the 3x3 pixels around (row, col). We only use pixels that are valid on the LAST date,
// so the same pixels are averaged for every date (otherwise the line would jump when pixels drop out).
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
  return { values: values, count: ids.length };
}

function drawChart(values) {
  // x = days since the first date, so the 24-day gap shows as a real gap
  var points = [];
  for (var k = 0; k < values.length; k++) {
    points.push({ x: daysBetween(meta.dates[0], meta.dates[k]), y: values[k] });
  }

  if (chart) {
    chart.data.datasets[0].data = points;
    chart.update('none');
    return;
  }

  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      datasets: [{
        data: points,
        borderColor: '#e0cfa6',
        backgroundColor: '#e0cfa6',
        borderWidth: 2,
        tension: 0,
        pointRadius: function (ctx) { return ctx.dataIndex === current ? 6 : 3; }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) { return formatDate(meta.dates[items[0].dataIndex]); },
            label: function (item) { return item.parsed.y.toFixed(1) + ' cm'; }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          bounds: 'data',
          grid: { color: '#1b2733' },
          ticks: {
            color: '#9aa9b8',
            maxTicksLimit: 6,
            callback: function (v) {
              var ms = Date.parse(meta.dates[0] + 'T00:00:00Z') + v * 86400000;
              return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
            }
          }
        },
        y: {
          suggestedMin: -4,
          suggestedMax: 4,
          grid: { color: '#243241' },
          ticks: { color: '#9aa9b8' },
          title: { display: true, text: 'cm (relative)', color: '#9aa9b8' }
        }
      }
    }
  });
}

// ---------- Step 3: "About this map" dialog ----------
var aboutEl = document.getElementById('about');
document.getElementById('aboutBtn').addEventListener('click', function () { aboutEl.showModal(); });
document.getElementById('aboutClose').addEventListener('click', function () { aboutEl.close(); });
// Clicking the dark area outside the box closes it too
aboutEl.addEventListener('click', function (e) { if (e.target === aboutEl) { aboutEl.close(); } });
