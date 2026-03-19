const map = L.map('map', { zoomControl: true }).setView([39.9075, 116.3972], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const conduitLayer = L.geoJSON(null, {
  style: feature => ({
    color: getColorByRentalRate(feature.properties.rental_rate),
    weight: getWeightByCores(feature.properties.total_cores),
    opacity: 0.92,
    lineCap: 'round',
  }),
  onEachFeature: (feature, layer) => {
    layer.bindPopup(buildPopupContent(feature.properties));
    layer.on('mouseover', () => layer.setStyle({ opacity: 1, weight: getWeightByCores(feature.properties.total_cores) + 2 }));
    layer.on('mouseout', () => conduitLayer.resetStyle(layer));
  },
}).addTo(map);

const statusFilter = document.getElementById('statusFilter');
const tenantKeyword = document.getElementById('tenantKeyword');
const warningOnly = document.getElementById('warningOnly');
const applyFiltersButton = document.getElementById('applyFilters');
const resetFiltersButton = document.getElementById('resetFilters');
const summaryCards = document.getElementById('summaryCards');
const segmentList = document.getElementById('segmentList');
const requestState = document.getElementById('requestState');
const resultCount = document.getElementById('resultCount');

function getColorByRentalRate(rentalRate) {
  if (rentalRate < 50) return '#2ca25f';
  if (rentalRate <= 80) return '#f0c419';
  return '#d7301f';
}

function getWeightByCores(totalCores) {
  return Math.max(4, Math.min(18, Math.round(totalCores / 2.5)));
}

function buildPopupContent(properties) {
  const secondaryTenants = properties.secondary_tenants.length
    ? properties.secondary_tenants.join('、')
    : '无';
  const contractEnd = properties.contract_end || '未填写';
  const remaining = properties.days_remaining === null ? '—' : `${properties.days_remaining} 天`;

  return `
    <div class="popup-content">
      <h3>${properties.road_name}</h3>
      <p><strong>路段编号：</strong>${properties.id}</p>
      <p><strong>管孔总数：</strong>${properties.total_cores}</p>
      <p><strong>已租赁数量：</strong>${properties.occupied_cores}</p>
      <p><strong>剩余孔数：</strong>${properties.available_cores}</p>
      <p><strong>租赁率：</strong>${properties.rental_rate}%</p>
      <p><strong>主要承租方：</strong>${properties.primary_tenant}</p>
      <p><strong>其他承租方：</strong>${secondaryTenants}</p>
      <p><strong>合同到期：</strong>${contractEnd}</p>
      <p><strong>到期预警：</strong>${properties.expiry_warning}</p>
      <p><strong>剩余天数：</strong>${remaining}</p>
    </div>
  `;
}

function renderSummary(summary) {
  const cards = [
    ['展示管段', summary.total_segments],
    ['总孔数', summary.total_cores],
    ['已出租孔数', summary.occupied_cores],
    ['可出租孔数', summary.available_cores],
    ['平均租赁率', `${summary.average_rental_rate}%`],
    ['预警段数', summary.warning_segments],
  ];

  summaryCards.innerHTML = cards
    .map(([label, value]) => `<div class="stat-card"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('');
}

function renderSegmentList(features) {
  resultCount.textContent = features.length;

  if (!features.length) {
    segmentList.innerHTML = '<p class="empty-state">当前筛选条件下没有匹配的管段。</p>';
    return;
  }

  segmentList.innerHTML = features
    .map(feature => {
      const { id, road_name, rental_rate, rental_status, primary_tenant, expiry_warning } = feature.properties;
      return `
        <button class="segment-item" type="button" data-id="${id}">
          <span class="segment-title">${road_name}</span>
          <span class="segment-meta">${primary_tenant}</span>
          <span class="segment-tags">
            <span class="status-pill ${rental_status}">${rental_rate}%</span>
            <span class="warning-pill">${expiry_warning}</span>
          </span>
        </button>
      `;
    })
    .join('');

  segmentList.querySelectorAll('.segment-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.id;
      conduitLayer.eachLayer(layer => {
        if (layer.feature.properties.id === targetId) {
          map.fitBounds(layer.getBounds(), { padding: [40, 40] });
          layer.openPopup();
        }
      });
    });
  });
}

async function fetchConduits() {
  const params = new URLSearchParams();
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value);
  if (tenantKeyword.value.trim()) params.set('tenant', tenantKeyword.value.trim());
  if (warningOnly.checked) params.set('warning_only', 'true');

  requestState.textContent = '正在请求后端数据...';

  const response = await fetch(`/api/conduits?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function refreshMap() {
  try {
    const data = await fetchConduits();
    conduitLayer.clearLayers();
    conduitLayer.addData(data.features);
    renderSummary(data.summary);
    renderSegmentList(data.features);

    if (data.features.length) {
      map.fitBounds(conduitLayer.getBounds(), { padding: [24, 24] });
    }

    requestState.textContent = `已加载 ${data.summary.total_segments} 条管段数据`; 
  } catch (error) {
    console.error('加载管网数据失败:', error);
    requestState.textContent = '数据加载失败，请检查后端服务';
    summaryCards.innerHTML = '<div class="stat-card"><dt>错误</dt><dd>无法加载</dd></div>';
    segmentList.innerHTML = '<p class="empty-state">请求失败，请稍后重试。</p>';
  }
}

applyFiltersButton.addEventListener('click', refreshMap);
resetFiltersButton.addEventListener('click', () => {
  statusFilter.value = 'all';
  tenantKeyword.value = '';
  warningOnly.checked = false;
  refreshMap();
});
tenantKeyword.addEventListener('keydown', event => {
  if (event.key === 'Enter') refreshMap();
});

refreshMap();
