// 1. FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyB2-e5VYWXTY3g5mtfIP8ivEDOvi8mZmys",
  authDomain: "home-maintenance-hub-2319d.firebaseapp.com",
  projectId: "home-maintenance-hub-2319d",
  storageBucket: "home-maintenance-hub-2319d.firebasestorage.app",
  messagingSenderId: "782506625761",
  appId: "1:782506625761:web:cc4979661e299f94e3c5a0"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
db.enablePersistence().catch(() => {});

// Application State
let activeTasks = [];
let inventoryItems = [];
let maintenanceLogs = [];
let selectedTask = null;
let html5QrCode = null;
let currentHistoryFilter = 'ALL';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// 2. REAL-TIME DATA LISTENERS
db.collection('maintenance_tasks').onSnapshot((snapshot) => {
  activeTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderTasks();
  updateLinkedInventoryDropdown();
});

db.collection('inventory_items').onSnapshot((snapshot) => {
  inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderInventory();
  renderTasks();
  updateLinkedInventoryDropdown();
});

db.collection('task_logs').onSnapshot((snapshot) => {
  maintenanceLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderHistory();
  renderTasks();
});

// 3. UI RENDERING: MAINTENANCE CYCLES (TASKS)
function renderTasks() {
  const container = document.getElementById('taskList');
  const countBadge = document.getElementById('taskCountBadge');
  if (!container) return;

  if (activeTasks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-slate-800/40 rounded-2xl border border-slate-800 p-6">
        <p class="text-slate-400 text-sm">No maintenance tasks configured.</p>
        <button onclick="openTaskDrawer()" class="mt-3 px-4 py-2 bg-sky-600 rounded-xl text-xs font-bold text-white">
          + Add First Task
        </button>
      </div>`;
    if (countBadge) countBadge.innerText = '0 Active';
    return;
  }

  const now = new Date();
  if (countBadge) countBadge.innerText = `${activeTasks.length} Active`;
  const sorted = [...activeTasks].sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));

  container.innerHTML = sorted.map(task => {
    const nextDue = new Date(task.nextDueDate);
    const diffDays = Math.round((nextDue - now) / (1000 * 60 * 60 * 24));
    
    let badge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">In ${diffDays}d</span>`;
    if (diffDays <= 0) {
      badge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">DUE NOW</span>`;
    } else if (diffDays <= 14) {
      badge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">In ${diffDays}d</span>`;
    }

    const linkedItem = inventoryItems.find(i => i.id === task.linkedInventoryId);
    let inventoryNotice = '';
    if (linkedItem) {
      const stockOk = linkedItem.qtyOnHand >= (task.qtyRequired || 1);
      inventoryNotice = `
        <div class="mt-2 pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
          <span class="text-slate-400 truncate">Part: ${linkedItem.name}</span>
          <span class="font-bold shrink-0 ml-2 ${stockOk ? 'text-emerald-400' : 'text-rose-400'}">
            ${linkedItem.qtyOnHand} in stock (${linkedItem.location})
          </span>
        </div>`;
    }

    // Find most recent log for this task
    const recentLog = maintenanceLogs
      .filter(l => l.taskId === task.id || l.taskTitle === task.title)
      .sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate))[0];

    const lastDoneText = recentLog 
      ? `Last: ${new Date(recentLog.completedDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` 
      : 'No prior logs recorded';

    return `
      <div class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 shadow-sm hover:border-slate-600 transition">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <span class="text-[10px] font-bold text-sky-400 uppercase tracking-wide">${task.assetName}</span>
            <h3 class="font-bold text-white text-sm leading-snug">${task.title}</h3>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${badge}
            <button onclick="openTaskDrawer('${task.id}')" class="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-700/50">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <p class="text-xs text-slate-400 mt-1">${task.memo || ''}</p>
        ${inventoryNotice}

        <div class="mt-3 pt-2.5 border-t border-slate-700/40 flex items-center justify-between text-xs">
          <span class="text-[11px] text-slate-500">${lastDoneText} (Every ${task.intervalDays}d)</span>
          <button onclick="openCompleteModal('${task.id}')" 
            class="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 active:scale-95 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 transition">
            <i data-lucide="check" class="w-3.5 h-3.5"></i> Log Service
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// 4. UI RENDERING: SERVICE PROOF LEDGER (HISTORY)
function renderHistory() {
  const container = document.getElementById('historyList');
  const countBadge = document.getElementById('logCountBadge');
  const filterBox = document.getElementById('historyFilterContainer');
  if (!container) return;

  if (countBadge) countBadge.innerText = `${maintenanceLogs.length} Records`;

  // Render Asset Filter Chips
  if (filterBox) {
    const assets = ['ALL', ...new Set(maintenanceLogs.map(l => l.assetName).filter(Boolean))];
    filterBox.innerHTML = assets.map(asset => `
      <button onclick="filterHistory('${asset}')" 
        class="history-chip px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${currentHistoryFilter === asset ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}">
        ${asset === 'ALL' ? 'All Systems' : asset}
      </button>
    `).join('');
  }

  const filtered = currentHistoryFilter === 'ALL' 
    ? maintenanceLogs 
    : maintenanceLogs.filter(l => l.assetName === currentHistoryFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-slate-800/40 rounded-2xl border border-slate-800 p-6">
        <p class="text-slate-400 text-sm">No service entries match filter.</p>
        <p class="text-xs text-slate-500 mt-1">Tap "Log Service" on any maintenance task to add proof.</p>
      </div>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));

  container.innerHTML = sorted.map(log => {
    const d = new Date(log.completedDate);
    const dateFormatted = d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let photoHtml = '';
    if (log.photoBase64) {
      photoHtml = `
        <div class="mt-2">
          <img src="${log.photoBase64}" onclick="openPhotoLightbox('${log.photoBase64}')" 
            class="w-20 h-20 object-cover rounded-xl border border-slate-700 cursor-pointer active:scale-95 transition" 
            alt="Service Evidence Photo" />
          <span class="text-[10px] text-slate-500 block mt-0.5">Proof Photo (Tap to view)</span>
        </div>`;
    }

    return `
      <div class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 shadow-sm space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-bold text-sky-400 uppercase tracking-wide">${log.assetName || 'Equipment'}</span>
            <h3 class="font-bold text-white text-sm leading-snug">${log.taskTitle}</h3>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-emerald-400">${dateFormatted}</span>
            <span class="text-[10px] text-slate-500 block">${timeFormatted}</span>
          </div>
        </div>

        ${log.consumedPartName ? `
          <div class="text-[11px] text-slate-300 flex items-center gap-1.5">
            <span class="text-slate-500">Replaced:</span> <b>${log.consumedPartName}</b>
          </div>` : ''}

        ${log.notes ? `
          <div class="bg-slate-900/60 p-2.5 rounded-xl text-xs text-slate-300 border border-slate-800">
            <span class="text-slate-500 text-[10px] uppercase font-bold block mb-0.5">Readings / Service Notes</span>
            ${log.notes}
          </div>` : ''}

        ${photoHtml}

        <div class="pt-1 flex justify-end">
          <button onclick="deleteLogEntry('${log.id}')" class="text-slate-500 hover:text-rose-400 text-[11px] p-1 flex items-center gap-1 transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Record
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

window.filterHistory = function(asset) {
  currentHistoryFilter = asset;
  renderHistory();
};

window.deleteLogEntry = async function(id) {
  if (!confirm('Permanently delete this service proof record?')) return;
  await db.collection('task_logs').doc(id).delete();
};

// 5. PRINTABLE SERVICE BINDER EXPORT (FOR INSURANCE / SALE)
window.exportProofBinder = function() {
  if (maintenanceLogs.length === 0) {
    alert('No maintenance history logged yet to export.');
    return;
  }

  const sorted = [...maintenanceLogs].sort((a, b) => new Date(b.completedDate) - new Date(a.completedDate));
  
  const printWindow = window.open('', '_blank');
  const rows = sorted.map(log => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 8px; font-size: 12px;">${new Date(log.completedDate).toLocaleDateString('en-CA')}</td>
      <td style="padding: 8px; font-size: 12px; font-weight: bold;">${log.assetName || ''}</td>
      <td style="padding: 8px; font-size: 12px;">${log.taskTitle}</td>
      <td style="padding: 8px; font-size: 12px;">${log.consumedPartName || '—'}</td>
      <td style="padding: 8px; font-size: 12px;">${log.notes || 'Routine service completed'}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>Home Equipment Maintenance Ledger</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 25px; color: #111; }
          h1 { margin-bottom: 4px; font-size: 20px; }
          p { color: #666; font-size: 12px; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; }
          th { background: #f4f4f4; padding: 8px; font-size: 12px; border-bottom: 2px solid #ccc; }
        </style>
      </head>
      <body>
        <h1>Property Maintenance & Service Ledger</h1>
        <p>Generated: ${new Date().toLocaleDateString('en-CA')} | Official preventative care and proof record</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>System</th>
              <th>Task Action</th>
              <th>Replaced Part</th>
              <th>Notes / Readings</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
};

// 6. UI RENDERING: INVENTORY (SPARES)
function renderInventory() {
  const container = document.getElementById('inventoryList');
  const alertBadge = document.getElementById('reorderAlertBadge');
  const query = (document.getElementById('inventorySearchInput')?.value || '').toLowerCase();
  if (!container) return;

  const filtered = inventoryItems.filter(item => 
    item.name.toLowerCase().includes(query) ||
    item.location.toLowerCase().includes(query) ||
    (item.sku && item.sku.toLowerCase().includes(query))
  );

  const needsReorderCount = inventoryItems.filter(i => i.qtyOnHand <= i.qtyMinPar).length;
  if (needsReorderCount > 0 && alertBadge) {
    alertBadge.innerText = `${needsReorderCount} Needs Reorder`;
    alertBadge.classList.remove('hidden');
  } else if (alertBadge) {
    alertBadge.classList.add('hidden');
  }

  container.innerHTML = filtered.map(item => {
    const isLow = item.qtyOnHand <= item.qtyMinPar;
    return `
      <div class="bg-slate-800/80 border ${isLow ? 'border-amber-500/40' : 'border-slate-700'} rounded-2xl p-4 space-y-2.5">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="font-bold text-white text-sm">${item.name}</h4>
            <p class="text-xs text-slate-400">Fits: ${item.unitFit || 'General'}</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="text-sm font-black ${item.qtyOnHand === 0 ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}">
                ${item.qtyOnHand} on hand
              </span>
              <p class="text-[10px] text-slate-500">Min: ${item.qtyMinPar}</p>
            </div>
            <button onclick="openInventoryDrawer('${item.id}')" class="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-700/50">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="bg-slate-900/60 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-300">
          <span class="truncate">📍 ${item.location}</span>
          ${item.barcode ? `<span class="font-mono text-[10px] text-slate-500">${item.barcode}</span>` : ''}
        </div>

        <div class="flex items-center justify-between pt-1 text-xs">
          <span class="text-slate-400">~$${item.targetPriceCad || '0'} CAD (${item.vendor || 'Local'})</span>
          <div class="flex items-center gap-1.5">
            <button onclick="adjustInventory('${item.id}', -1)" class="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center justify-center font-bold text-base active:scale-90">-</button>
            <button onclick="adjustInventory('${item.id}', 1)" class="w-8 h-8 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center justify-center font-bold text-base active:scale-90">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

window.adjustInventory = async function(id, delta) {
  const item = inventoryItems.find(i => i.id === id);
  if (!item) return;
  const newQty = Math.max(0, (item.qtyOnHand || 0) + delta);
  await db.collection('inventory_items').doc(id).update({ qtyOnHand: newQty });
};

// 7. TASK BOTTOM DRAWER LOGIC (IN-APP ADD / EDIT)
window.openTaskDrawer = function(taskId = null) {
  const drawer = document.getElementById('taskDrawer');
  const title = document.getElementById('taskDrawerTitle');
  const deleteBtn = document.getElementById('btnDeleteTask');

  updateLinkedInventoryDropdown();

  if (taskId) {
    const task = activeTasks.find(t => t.id === taskId);
    if (!task) return;
    title.innerText = 'Edit Maintenance Task';
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('taskAssetInput').value = task.assetName || '';
    document.getElementById('taskTitleInput').value = task.title || '';
    document.getElementById('taskIntervalInput').value = task.intervalDays || 30;
    document.getElementById('taskNextDueInput').value = (task.nextDueDate || '').split('T')[0];
    document.getElementById('taskLinkedInventorySelect').value = task.linkedInventoryId || '';
    document.getElementById('taskMemoInput').value = task.memo || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.innerText = 'New Maintenance Cycle';
    document.getElementById('editTaskId').value = '';
    document.getElementById('taskAssetInput').value = '';
    document.getElementById('taskTitleInput').value = '';
    document.getElementById('taskIntervalInput').value = '30';
    
    const d = new Date();
    d.setDate(d.getDate() + 30);
    document.getElementById('taskNextDueInput').value = d.toISOString().split('T')[0];
    document.getElementById('taskLinkedInventorySelect').value = '';
    document.getElementById('taskMemoInput').value = '';
    deleteBtn.classList.add('hidden');
  }

  drawer.classList.remove('hidden');
};

window.closeTaskDrawer = function() {
  document.getElementById('taskDrawer').classList.add('hidden');
};

window.setTaskAsset = function(val) {
  document.getElementById('taskAssetInput').value = val;
};

window.setTaskInterval = function(days) {
  document.getElementById('taskIntervalInput').value = days;
  const d = new Date();
  d.setDate(d.getDate() + days);
  document.getElementById('taskNextDueInput').value = d.toISOString().split('T')[0];
};

window.saveTaskFromDrawer = async function() {
  const id = document.getElementById('editTaskId').value;
  const assetName = document.getElementById('taskAssetInput').value.trim();
  const title = document.getElementById('taskTitleInput').value.trim();
  const intervalDays = parseInt(document.getElementById('taskIntervalInput').value) || 30;
  const nextDueDateRaw = document.getElementById('taskNextDueInput').value;
  const linkedInventoryId = document.getElementById('taskLinkedInventorySelect').value;
  const memo = document.getElementById('taskMemoInput').value.trim();

  if (!assetName || !title) {
    alert('Please provide equipment name and task title.');
    return;
  }

  const payload = {
    assetName,
    title,
    intervalDays,
    nextDueDate: new Date(nextDueDateRaw || Date.now()).toISOString(),
    linkedInventoryId: linkedInventoryId || null,
    qtyRequired: 1,
    memo
  };

  if (id) {
    await db.collection('maintenance_tasks').doc(id).update(payload);
  } else {
    payload.lastCompletedDate = new Date().toISOString();
    await db.collection('maintenance_tasks').add(payload);
  }

  closeTaskDrawer();
};

window.deleteCurrentTask = async function() {
  const id = document.getElementById('editTaskId').value;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this maintenance cycle?')) return;
  await db.collection('maintenance_tasks').doc(id).delete();
  closeTaskDrawer();
};

function updateLinkedInventoryDropdown() {
  const select = document.getElementById('taskLinkedInventorySelect');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">No part required</option>' + 
    inventoryItems.map(i => `<option value="${i.id}">${i.name} (${i.qtyOnHand} on hand)</option>`).join('');
  select.value = currentVal;
}

// 8. INVENTORY BOTTOM DRAWER LOGIC (IN-APP ADD / EDIT)
window.openInventoryDrawer = function(itemId = null) {
  const drawer = document.getElementById('inventoryDrawer');
  const title = document.getElementById('inventoryDrawerTitle');
  const deleteBtn = document.getElementById('btnDeleteInventory');

  if (itemId) {
    const item = inventoryItems.find(i => i.id === itemId);
    if (!item) return;
    title.innerText = 'Edit Spare Part';
    document.getElementById('editInventoryId').value = item.id;
    document.getElementById('invNameInput').value = item.name || '';
    document.getElementById('invFitInput').value = item.unitFit || '';
    document.getElementById('invQtyInput').value = item.qtyOnHand || 0;
    document.getElementById('invParInput').value = item.qtyMinPar || 1;
    document.getElementById('invLocationInput')
