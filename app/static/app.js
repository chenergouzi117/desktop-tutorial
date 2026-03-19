const map = L.map('map', {
  zoomControl: true,
}).setView([39.9075, 116.3972], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const conduitLayer = L.geoJSON(null, {
  style: feature => ({
    color: getColorByRentalRate(feature.properties.rental_rate),
    weight: getWeightByCores(feature.properties.total_cores),
    opacity: 0.9,
    lineCap: 'round',
  }),
  onEachFeature: (feature, layer) => {
    layer.bindPopup(buildPopupContent(feature.properties));
  },
}).addTo(map);

const statsContainer = document.getElementById('stats');
const statusFilter = document.getElementById('statusFilter');
let allFeatures = [];

function getColorByRentalRate(rentalRate) {
  if (rentalRate < 50) return '#2ca25f';
  if (rentalRate <= 80) return '#f0c419';
  return '#d7301f';
}

function getWeightByCores(totalCores) {
  return Math.max(4, Math.min(14, totalCores / 2));
}

function buildPopupContent(properties) {
  return `
    <div class="popup-content">
      <h3>${properties.road_name}</h3>
      <p><strong>路段编号：</strong>${properties.id}</p>
      <p><strong>管孔总数：</strong>${properties.total_cores}</p>
      <p><strong>已租赁数量：</strong>${properties.occupied_cores}</p>
      <p><strong>租赁率：</strong>${properties.rental_rate}%</p>
      <p><strong>主要承租方：</strong>${properties.primary_tenant}</p>
      <p><strong>到期预警：</strong>${properties.expiry_warning}</p>
    </div>
  `;
}

function renderStats(features) {
  const total = features.length;
  const occupied = features.reduce((sum, item) => sum + item.properties.occupied_cores, 0);
  const cores = features.reduce((sum, item) => sum + item.properties.total_cores, 0);
  const highRisk = features.filter(item => item.properties.rental_status === 'high').length;

  statsContainer.innerHTML = `
    <div><dt>展示管段</dt><dd>${total}</dd></div>
    <div><dt>总孔数</dt><dd>${cores}</dd></div>
    <div><dt>已租赁孔数</dt><dd>${occupied}</dd></div>
    <div><dt>高负载段</dt><dd>${highRisk}</dd></div>
  `;
}

function applyFilter() {
  const selectedStatus = statusFilter.value;
  const filtered = selectedStatus === 'all'
    ? allFeatures
    : allFeatures.filter(feature => feature.properties.rental_status === selectedStatus);

  conduitLayer.clearLayers();
  conduitLayer.addData(filtered);
  renderStats(filtered);

  if (filtered.length > 0) {
    map.fitBounds(conduitLayer.getBounds(), { padding: [20, 20] });
  }
}

async function loadConduits() {
  try {
    const response = await fetch('/api/conduits');
    const data = await response.json();
    allFeatures = data.features;
    applyFilter();
  } catch (error) {
    console.error('加载管网数据失败:', error);
    statsContainer.innerHTML = '<div><dt>错误</dt><dd>无法加载数据</dd></div>';
  }
}

statusFilter.addEventListener('change', applyFilter);
loadConduits();
