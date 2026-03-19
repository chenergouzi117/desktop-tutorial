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
    layer.bindPopup(buildConduitPopup(feature.properties));
    layer.on('mouseover', () => layer.setStyle({ opacity: 1, weight: getWeightByCores(feature.properties.total_cores) + 2 }));
    layer.on('mouseout', () => conduitLayer.resetStyle(layer));
  },
}).addTo(map);

const manholeLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => L.circleMarker(latlng, getManholeStyle(feature.properties)),
  onEachFeature: (feature, layer) => {
    layer.bindPopup(buildManholePopup(feature.properties));
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

function getManholeStyle(properties) {
  return {
    radius: Math.max(8, Math.min(14, Math.round(properties.total_cores / 2))),
    fillColor: properties.occupancy_rate > 80 ? '#dc2626' : properties.occupancy_rate >= 50 ? '#f59e0b' : '#2563eb',
    color: '#fff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.92,
  };
}

function buildContractRows(contracts) {
  if (!contracts.length) return '<p class="muted-card">暂无合同信息</p>';
  return `
    <table class="popup-table">
      <thead><tr><th>合同号</th><th>承租方</th><th>孔位</th><th>状态</th><th>到期</th></tr></thead>
      <tbody>
        ${contracts.map(item => `
          <tr>
            <td>${item.contract_id}</td>
            <td>${item.lessee}</td>
            <td>${item.leased_cores.join(', ')}</td>
            <td><span class="mini-tag" style="background:${item.color}22;color:${item.color}">${item.status}</span></td>
            <td>${item.end_date}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function buildConduitPopup(properties) {
  const secondaryTenants = properties.secondary_tenants.length ? properties.secondary_tenants.join('、') : '无';
  const contractEnd = properties.contract_end || '未填写';
  const remaining = properties.days_remaining === null ? '—' : `${properties.days_remaining} 天`;

  return `
    <div class="popup-content popup-wide">
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
      <p><strong>关联人井：</strong>${properties.manhole_ids.join('、') || '无'}</p>
      <p><strong>剩余天数：</strong>${remaining}</p>
      <h4>合同信息</h4>
      ${buildContractRows(properties.contracts)}
    </div>
  `;
}

function buildCoreGrid(cores) {
  return `
    <div class="core-grid">
      ${cores.map(core => `
        <div class="core-slot ${core.status}" style="--slot-color:${core.color}" title="第 ${core.index} 孔 ${core.status === 'occupied' ? core.tenant : '空闲'}">
          <span>${core.index}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function buildManholePopup(properties) {
  return `
    <div class="popup-content popup-wide">
      <h3>${properties.name}</h3>
      <p><strong>人井编号：</strong>${properties.id}</p>
      <p><strong>管控状态：</strong>${properties.control_status}</p>
      <p><strong>总孔数：</strong>${properties.total_cores}</p>
      <p><strong>已占用孔数：</strong>${properties.occupied_cores}</p>
      <p><strong>空闲孔数：</strong>${properties.available_cores}</p>
      <p><strong>关联管道：</strong>${properties.connected_conduit_ids.join('、')}</p>
      <h4>孔位占用示意</h4>
      <p class="muted-card">斜线纹理表示已占用孔，不同颜色表示不同承租方或占用来源。</p>
      ${buildCoreGrid(properties.cores)}
    </div>
  `;
}

function renderSummary(summary) {
  const cards = [
    ['展示管段', summary.total_segments],
    ['展示人井', summary.total_manholes],
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

  segmentList.innerHTML = features.map(feature => {
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
  }).join('');

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

async function fetchMapData() {
  const params = new URLSearchParams();
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value);
  if (tenantKeyword.value.trim()) params.set('tenant', tenantKeyword.value.trim());
  if (warningOnly.checked) params.set('warning_only', 'true');
  requestState.textContent = '正在请求后端数据...';
  const response = await fetch(`/api/map-data?${params.toString()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function refreshMap() {
  try {
    const data = await fetchMapData();
    conduitLayer.clearLayers();
    manholeLayer.clearLayers();
    conduitLayer.addData(data.conduits.features);
    manholeLayer.addData(data.manholes.features);
    renderSummary(data.summary);
    renderSegmentList(data.conduits.features);

    const bounds = [];
    conduitLayer.eachLayer(layer => bounds.push(layer.getBounds()));
    manholeLayer.eachLayer(layer => bounds.push(layer.getLatLng()));
    if (data.conduits.features.length) {
      map.fitBounds(conduitLayer.getBounds(), { padding: [24, 24] });
    }

    requestState.textContent = `已加载 ${data.summary.total_segments} 条管道、${data.summary.total_manholes} 个井位`; 
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
