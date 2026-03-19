const uploadForm = document.getElementById('uploadForm');
const jsonFile = document.getElementById('jsonFile');
const jsonEditor = document.getElementById('jsonEditor');
const adminMessage = document.getElementById('adminMessage');
const loadDataButton = document.getElementById('loadData');
const saveDataButton = document.getElementById('saveData');
const downloadDataButton = document.getElementById('downloadData');

function setMessage(message, isError = false) {
  adminMessage.textContent = message;
  adminMessage.classList.toggle('error', isError);
}

async function loadCurrentData() {
  const response = await fetch('/api/assets/full');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  jsonEditor.value = JSON.stringify(data, null, 2);
  setMessage('已加载当前资产数据。');
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!jsonFile.files.length) {
    setMessage('请先选择一个 JSON 文件。', true);
    return;
  }

  const formData = new FormData();
  formData.append('file', jsonFile.files[0]);

  try {
    const response = await fetch('/api/assets/upload', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '上传失败');
    setMessage(data.message);
    await loadCurrentData();
  } catch (error) {
    setMessage(error.message, true);
  }
});

loadDataButton.addEventListener('click', async () => {
  try {
    await loadCurrentData();
  } catch (error) {
    setMessage(`加载失败：${error.message}`, true);
  }
});

saveDataButton.addEventListener('click', async () => {
  try {
    const payload = JSON.parse(jsonEditor.value);
    const response = await fetch('/api/assets/full', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '保存失败');
    setMessage(data.message);
  } catch (error) {
    setMessage(`保存失败：${error.message}`, true);
  }
});

downloadDataButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/assets/full');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'network_assets.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('当前数据已下载。');
  } catch (error) {
    setMessage(`下载失败：${error.message}`, true);
  }
});

loadCurrentData();
