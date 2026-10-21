// 1. LIVE FIREBASE CONFIG
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
let selectedTask = null;
let html5QrCode = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// 2. REAL-TIME DATA LISTENERS
db.collection('maintenance_tasks').onSnapshot((snapshot) => {
  activeTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderTasks();
});

db.collection('inventory_items').onSnapshot((snapshot) => {
  inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderInventory();
  renderTasks();
});

// 3. UI RENDERING (TASKS)
function renderTasks() {
  const container = document.getElementById('taskList');
  const countBadge = document.getElementById('taskCountBadge');
  if (!container) return;

  if (activeTasks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 bg-slate-800/40 rounded-2xl border border-slate-800 p-6">
        <p class="text-slate-400 text-sm">No maintenance tasks found.</p>
        <p class="text-xs text-slate-500 mt-1">Go to Settings tab to load standard equipment.</p>
      </div>`;
    countBadge.innerText = '0 Active';
    return;
  }

  const now = new Date();
  countBadge.innerText = `${activeTasks.length} Active`;
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
        <div class="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
          <span class="text-slate-400">Part: ${linkedItem.name}</span>
          <span class="font-bold ${stockOk ? 'text-emerald-400' : 'text-rose-400'}">
            ${linkedItem.qtyOnHand} in stock (${linkedItem.location})
          </span>
        </div>`;
    }

    return `
      <div class="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 shadow-sm hover:border-slate-600 transition">
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] font-bold text-sky-400 uppercase tracking-wide">${task.assetName}</span>
            <h3 class="font-bold text-white text-sm leading-snug">${task.title}</h3>
          </div>
          ${badge}
        </div>
        <p class="text-xs text-slate-400 mt-1">${task.memo || ''}</p>
        ${inventoryNotice}
        <div class="mt-3.5 flex items-center justify-between gap-3">
          <span class="text-[11px] text-slate-500">Every ${task.intervalDays} days</span>
          <button onclick="openCompleteModal('${task.id}')" 
            class="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 active:scale-95 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 transition">
            <span>Log Service</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// 4. UI RENDERING (INVENTORY)
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
          <div class="text-right">
            <span class="text-sm font-black ${item.qtyOnHand === 0 ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}">
              ${item.qtyOnHand} on hand
            </span>
            <p class="text-[10px] text-slate-500">Target: ${item.qtyMinPar}</p>
          </div>
        </div>
        <div class="bg-slate-900/60 p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-300">
          <span class="truncate">📍 ${item.location}</span>
          ${item.barcode ? `<span class="font-mono text-[10px] text-slate-500">${item.barcode}</span>` : ''}
        </div>
        <div class="flex items-center justify-between pt-1 text-xs">
          <span class="text-slate-400">~$${item.targetPriceCad || '0'} CAD (${item.vendor})</span>
          <div class="flex items-center gap-1.5">
            <button onclick="adjustInventory('${item.id}', -1)" class="w-7 h-7 bg-slate-700 text-white rounded-lg flex items-center justify-center font-bold text-base active:scale-90">-</button>
            <button onclick="adjustInventory('${item.id}', 1)" class="w-7 h-7 bg-slate-700 text-white rounded-lg flex items-center justify-center font-bold text-base active:scale-90">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 5. CLIENT-SIDE COMPRESSION (NO PAID STORAGE NEEDED)
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// 6. TASK COMPLETION & AUTO-DECREMENT
window.openCompleteModal = function(taskId) {
  selectedTask = activeTasks.find(t => t.id === taskId);
  if (!selectedTask) return;

  document.getElementById('modalTaskTitle').innerText = selectedTask.title;
  document.getElementById('modalAssetSub').innerText = selectedTask.assetName;

  const notice = document.getElementById('modalConsumableNotice');
  const linked = inventoryItems.find(i => i.id === selectedTask.linkedInventoryId);

  if (linked) {
    const qty = selectedTask.qtyRequired || 1;
    notice.innerHTML = `
      <div class="text-sky-300 font-semibold">📦 Uses 1x ${linked.name}</div>
      <div class="text-slate-400">Inventory will drop from ${linked.qtyOnHand} → ${Math.max(0, linked.qtyOnHand - qty)} (${linked.location})</div>
    `;
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }

  document.getElementById('taskModal').classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('taskModal').classList.add('hidden');
  document.getElementById('modalNotesInput').value = '';
  document.getElementById('modalPhotoInput').value = '';
  selectedTask = null;
};

document.getElementById('btnConfirmComplete').addEventListener('click', async () => {
  if (!selectedTask) return;
  const btn = document.getElementById('btnConfirmComplete');
  btn.innerText = 'Logging...';
  btn.disabled = true;

  try {
    const today = new Date();
    const nextDate = new Date();
    nextDate.setDate(today.getDate() + (selectedTask.intervalDays || 90));

    let photoData = null;
    const file = document.getElementById('modalPhotoInput').files[0];
    if (file) {
      photoData = await compressImage(file);
    }

    await db.collection('task_logs').add({
      taskId: selectedTask.id,
      taskTitle: selectedTask.title,
      assetName: selectedTask.assetName,
      completedDate: today.toISOString(),
      notes: document.getElementById('modalNotesInput').value,
      photoBase64: photoData
    });

    await db.collection('maintenance_tasks').doc(selectedTask.id).update({
      lastCompletedDate: today.toISOString(),
      nextDueDate: nextDate.toISOString()
    });

    if (selectedTask.linkedInventoryId) {
      const itemRef = db.collection('inventory_items').doc(selectedTask.linkedInventoryId);
      await db.runTransaction(async (transaction) => {
        const itemDoc = await transaction.get(itemRef);
        if (itemDoc.exists) {
          const current = itemDoc.data().qtyOnHand || 0;
          const req = selectedTask.qtyRequired || 1;
          transaction.update(itemRef, { qtyOnHand: Math.max(0, current - req) });
        }
      });
    }

    closeModal();
  } catch (err) {
    alert('Error saving log: ' + err.message);
  } finally {
    btn.innerText = 'Log Completion (1-Tap)';
    btn.disabled = false;
  }
});

// 7. INVENTORY QUICK ADJUSTMENT
window.adjustInventory = async function(id, delta) {
  const item = inventoryItems.find(i => i.id === id);
  if (!item) return;
  const newQty = Math.max(0, (item.qtyOnHand || 0) + delta);
  await db.collection('inventory_items').doc(id).update({ qtyOnHand: newQty });
};

// 8. BARCODE SCANNER
function startScanner() {
  if (html5QrCode) return;
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 180 } },
    (decodedText) => {
      handleScannedBarcode(decodedText);
      html5QrCode.stop().then(() => { html5QrCode = null; });
    },
    () => {}
  );
}

function handleScannedBarcode(barcode) {
  const resultDiv = document.getElementById('scanResult');
  resultDiv.classList.remove('hidden');

  const match = inventoryItems.find(i => i.barcode === barcode);
  if (match) {
    resultDiv.innerHTML = `
      <div class="space-y-1">
        <span class="text-xs font-bold text-emerald-400">✓ MATCH FOUND</span>
        <h4 class="font-bold text-white text-sm">${match.name}</h4>
        <p class="text-xs text-slate-300">Stock at Home: <b class="text-white">${match.qtyOnHand}</b> (Min: ${match.qtyMinPar})</p>
        <p class="text-xs text-slate-400">Location: ${match.location}</p>
        <button onclick="adjustInventory('${match.id}', 1)" class="mt-2 w-full py-2 bg-sky-600 rounded-lg text-white font-bold text-xs">
          +1 Scanned & Restocked
        </button>
      </div>`;
  } else {
    resultDiv.innerHTML = `
      <div class="space-y-2">
        <span class="text-xs font-bold text-amber-400">NEW BARCODE</span>
        <p class="text-xs text-slate-300 font-mono">${barcode}</p>
        <p class="text-xs text-slate-400">Barcode not yet mapped to an item.</p>
      </div>`;
  }
}

// 9. TAB NAVIGATION
window.switchTab = function(tabName) {
  ['tasks', 'inventory', 'scanner', 'settings'].forEach(t => {
    document.getElementById(`view${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.add('hidden');
    const btn = document.getElementById(`tabBtn-${t}`);
    if (btn) {
      btn.classList.remove('text-sky-400');
      btn.classList.add('text-slate-400');
    }
  });

  document.getElementById(`view${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`)?.classList.remove('hidden');
  const activeBtn = document.getElementById(`tabBtn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400');
    activeBtn.classList.add('text-sky-400');
  }

  if (tabName === 'scanner') {
    startScanner();
  } else if (html5QrCode) {
    html5QrCode.stop().then(() => { html5QrCode = null; });
  }
};

document.getElementById('inventorySearchInput')?.addEventListener('input', renderInventory);

// 10. STARTER SEED DATA
document.getElementById('btnSeedData')?.addEventListener('click', async () => {
  if (!confirm('Load standard equipment and spares?')) return;
  const batch = db.batch();

  const f1 = db.collection('inventory_items').doc('item-furnace-filter');
  batch.set(f1, {
    name: '16x25x4 Furnace Filter (MERV 11)',
    unitFit: 'Carrier Infinity Plenum',
    qtyOnHand: 1,
    qtyMinPar: 1,
    location: 'Utility Room > Overhead Rack',
    vendor: 'Canadian Tire',
    targetPriceCad: 29.99,
    barcode: '012345678905'
  });

  const f2 = db.collection('inventory_items').doc('item-ispring-sediment');
  batch.set(f2, {
    name: 'Stage 1 Sediment Filter (4.5"x10" 5µm)',
    unitFit: 'iSpring WGB32BM Housing 1',
    qtyOnHand: 2,
    qtyMinPar: 2,
    location: 'Utility Room > Shelf B > Bin 2',
    vendor: 'Amazon',
    targetPriceCad: 18.99,
    barcode: '078912345678'
  });

  const t1 = db.collection('maintenance_tasks').doc('task-sediment-filter');
  batch.set(t1, {
    assetName: 'Whole-House Water System',
    title: 'Replace Stage 1 Sediment Cartridge',
    intervalDays: 90,
    lastCompletedDate: new Date().toISOString(),
    nextDueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    linkedInventoryId: 'item-ispring-sediment',
    qtyRequired: 1,
    memo: 'Shut inlet valve first. Release pressure button on top of cap.'
  });

  const t2 = db.collection('maintenance_tasks').doc('task-furnace-filter');
  batch.set(t2, {
    assetName: 'HVAC Air Handler',
    title: 'Replace 16x25x4 Media Filter',
    intervalDays: 90,
    lastCompletedDate: new Date().toISOString(),
    nextDueDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
    linkedInventoryId: 'item-furnace-filter',
    qtyRequired: 1,
    memo: 'Check airflow arrow points toward blower cabinet.'
  });

  const t3 = db.collection('maintenance_tasks').doc('task-flush-water-tank');
  batch.set(t3, {
    assetName: 'Hot Water Tank',
    title: 'Drain & Flush Sediment',
    intervalDays: 180,
    lastCompletedDate: new Date().toISOString(),
    nextDueDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    memo: 'Connect 3/4" hose, drain 5 gallons into bucket until clear.'
  });

  await batch.commit();
  alert('Starter equipment loaded!');
  switchTab('tasks');
});
                      
