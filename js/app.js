/**
 * Pollen_SARDI PWA - Sample Transfer Tracker
 * Main Application Logic
 */

// ===== STATE MANAGEMENT =====
const state = {
    currentScreen: 'home',
    sampleId: null,
    sampleType: null,
    boxId: null,
    boxType: null,
    location: null,
    locationName: null,
    manualEntryTarget: null,
    transfers: [],
    settings: {
        apiUrl: ''
    }
};

// Scanner instances
let sampleScanner = null;
let boxScanner = null;
let sampleScannerRunning = false;
let boxScannerRunning = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadTransfers();
    updateStats();
    checkOnlineStatus();
    
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    }
});

// Online/Offline status
function checkOnlineStatus() {
    const indicator = document.getElementById('offline-indicator');
    
    const updateStatus = () => {
        if (navigator.onLine) {
            indicator.classList.remove('visible');
            syncPendingTransfers();
        } else {
            indicator.classList.add('visible');
        }
    };
    
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// ===== SCREEN NAVIGATION =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(`screen-${screenId}`).classList.add('active');
    state.currentScreen = screenId;
}

function goHome() {
    stopAllScanners();
    showScreen('home');
    resetTransferState();
}

async function goBackToSampleScan() {
    await stopAllScanners();
    state.boxId = null;
    state.boxType = null;
    showScreen('scan-sample');
    await startSampleScanner();
}
async function goBackToBoxScan() {
    await stopAllScanners();
    showScreen('scan-box');
    await startBoxScanner();
}

// ===== TRANSFER WORKFLOW =====
function startTransfer() {
    resetTransferState();
    showScreen('scan-sample');
    startSampleScanner();
}

function resetTransferState() {
    state.sampleId = null;
    state.sampleType = null;
    state.boxId = null;
    state.boxType = null;
    state.location = null;
    state.locationName = null;
}

// ===== BARCODE SCANNING =====


// SAMPLE SCANNER
function startTubeScanner(targetElementId, onDetectedCallback) {

    const target = document.querySelector('#' + targetElementId);

    if (!target) {
        console.error("Scanner target not found");
        return;
    }

    Quagga.init({

        inputStream: {
            type: "LiveStream",
            target: target,
            constraints: {
                facingMode: "environment",
                width: 450,
                height: 140
            }
        },

        locator: {
            patchSize: "large",
            halfSample: false
        },

        decoder: {
            readers: [
                "code_128_reader"
            ]
        },

        locate: true

    }, function(err) {

        if (err) {
            console.error("Quagga init error:", err);
            return;
        }

        Quagga.start();

        console.log("Quagga started");

    });

    let lastCode = null;
    let stableCount = 0;

    Quagga.offDetected(); // IMPORTANT RESET

    Quagga.onDetected((result) => {

        const code = result.codeResult.code;

        if (!code) return;

        if (code === lastCode) {

            stableCount++;

            if (stableCount >= 2) {

                console.log("FINAL:", code);

                if (onDetectedCallback) {
                    onDetectedCallback(code);
                }

                stableCount = 0;
            }

        } else {
            lastCode = code;
            stableCount = 0;
        }
    });
}
let codeReader = null;

function startSampleScanner() {

    console.log("Starting ZXing scanner...");

    const container = document.getElementById("scanner-sample");

    container.innerHTML = `
        <video id="video" style="width:100%;height:100%;object-fit:cover;"></video>
    `;

    const videoElement = document.getElementById("video");

    codeReader = new ZXing.BrowserMultiFormatReader();

    let lastCode = null;
    let stableCount = 0;

    codeReader.decodeFromVideoDevice(
        null,
        videoElement,
        (result, err) => {

            if (result) {

                const code = result.getText();

                // 🔥 stability logic (IMPORTANT for tubes)
                if (code === lastCode) {
                    stableCount++;

                    if (stableCount >= 3) {
                        console.log("FINAL CODE:", code);

                        onSampleScanned(code);

                        codeReader.reset();
                    }

                } else {
                    lastCode = code;
                    stableCount = 0;
                }
            }
        }
    );
}
// BOX SCANNER
function startBoxScanner() {
    console.log('Starting box scanner...');
    
    // Stop any existing scanner
    if (boxScanner && boxScannerRunning) {
        try {
            boxScanner.stop();
            boxScannerRunning = false;
        } catch (err) {
            console.log('Stop error ignored:', err);
        }
    }
    
    if (boxScanner) {
        try {
            boxScanner.clear();
        } catch (err) {
            console.log('Clear error ignored:', err);
        }
        boxScanner = null;
    }
    
    const container = document.getElementById('scanner-box');
    container.innerHTML = '';
    
    // Wait for cleanup
    setTimeout(() => {
        boxScanner = new Html5Qrcode('scanner-box');
        
        const config = {
            fps: 10,
            qrbox: { width: 350, height: 120 },
            aspectRatio: 1.333
        };
        
        boxScanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText, decodedResult) => {
                console.log('Box scanned:', decodedText);
                onBoxScanned(decodedText, decodedResult);
            },
            (errorMessage) => {
                // Ignore continuous scan errors
            }
        ).then(() => {
            boxScannerRunning = true;
            console.log('Box scanner started successfully');
        }).catch(err => {
            console.error('Error starting box scanner:', err);
            boxScannerRunning = false;
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:white;padding:20px;text-align:center;">
                    <p style="font-size:18px;font-weight:600;">📷 Camera Error</p>
                    <p style="font-size:14px;margin-top:8px;">Please allow camera permissions</p>
                    <p style="font-size:12px;opacity:0.7;margin-top:8px;">${err.message}</p>
                    <button onclick="startBoxScanner()" style="margin-top:20px;padding:10px 20px;background:#0d9488;border:none;border-radius:8px;color:white;cursor:pointer;">
                        Try Again
                    </button>
                </div>
            `;
        });
    }, 200);
}
function waitForOpenCV(callback) {
    const check = setInterval(() => {
        if (cv && cv.Mat) {
            clearInterval(check);
            callback();
        }
    }, 100);
}
function enhanceFrame(video, canvas) {

    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let enhanced = new cv.Mat();

    // grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // CLAHE (contrast enhancement)
    let clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, enhanced);

    // slight sharpening (kernel)
    let kernel = cv.matFromArray(3, 3, cv.CV_32F, [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ]);

    cv.filter2D(enhanced, enhanced, cv.CV_8U, kernel);

    cv.imshow(canvas, enhanced);

    src.delete();
    gray.delete();
    enhanced.delete();
}
// STOP ALL SCANNERS
async function stopAllScanners() {

    try {
        if (sampleScanner) {
            await sampleScanner.stop();
            await sampleScanner.clear();
        }
    } catch (e) {}

    try {
        if (boxScanner) {
            await boxScanner.stop();
            await boxScanner.clear();
        }
    } catch (e) {}

    try {
        Quagga.stop();
        Quagga.offDetected();
    } catch (e) {}

    sampleScanner = null;
    boxScanner = null;
    sampleScannerRunning = false;
    boxScannerRunning = false;
}
// Add after the scanner initialization functions
async function enableTorchIfAvailable(scanner, scannerType) {
    try {
        // Check if torch is available
        const capabilities = await scanner.getCapabilities();
        
        if (capabilities && capabilities.torch) {
            // Torch is available - enable the flash button
            const flashBtn = document.getElementById(`btn-flash-${scannerType}`);
            if (flashBtn) {
                flashBtn.style.display = 'flex';
                flashBtn.disabled = false;
            }
        }
    } catch (err) {
        console.log('Torch not available:', err);
    }
}
async function stopAllScanners() {
    try {
        Quagga.stop();
        Quagga.offDetected();
    } catch (err) {
        console.log('Stop error ignored');
    }
    
    sampleScanner = null;
    boxScanner = null;
    sampleScannerRunning = false;
    boxScannerRunning = false;
}

async function onSampleScanned(decodedText, decodedResult) {
    // Vibrate for feedback
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    state.sampleId = decodedText;
    state.sampleType = getBarcodeType(decodedResult);
    
    // Stop sample scanner
    if (sampleScanner && sampleScannerRunning) {
        try {
            await sampleScanner.stop();
            sampleScannerRunning = false;
        } catch (err) {
            console.log('Scanner stop error (ignored)');
        }
    }
    
    if (sampleScanner) {
        try {
            sampleScanner.clear();
        } catch (err) {
            // Ignore
        }
        sampleScanner = null;
    }
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Update UI and move to box scan
    document.getElementById('captured-sample-id').textContent = truncateText(state.sampleId, 15);
    showScreen('scan-box');
    
    // Start box scanner
    await startBoxScanner();
}
async function onBoxScanned(decodedText, decodedResult) {
    // Vibrate for feedback
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    state.boxId = decodedText;
    state.boxType = getBarcodeType(decodedResult);
    
    // Stop box scanner
    await stopAllScanners();
    
    // Move to review screen
    showReviewScreen();
}
function getBarcodeType(decodedResult) {
    if (decodedResult && decodedResult.result && decodedResult.result.format) {
        const format = decodedResult.result.format.formatName;
        return format || 'Unknown';
    }
    return 'Unknown';
}

async function toggleFlash(scannerType) {

    const btn = document.getElementById(`btn-flash-${scannerType}`);

    try {

        const track =
            sampleScanner
            ? sampleScanner._context?.stream?.getVideoTracks?.()[0]
            : null;

        if (!track) {
            alert("Flash not available");
            return;
        }

        const capabilities = track.getCapabilities();

        if (!capabilities.torch) {
            alert("Torch not supported");
            return;
        }

        const enabled = btn.classList.toggle("active");

        await track.applyConstraints({
            advanced: [{ torch: enabled }]
        });

        if (navigator.vibrate) navigator.vibrate(50);

    } catch (err) {
        console.error(err);
    }
}

// ===== MANUAL ENTRY =====
function showManualEntry(target) {
    state.manualEntryTarget = target;
    const modal = document.getElementById('modal-manual');
    const title = document.getElementById('modal-manual-title');
    const input = document.getElementById('manual-input');
    
    title.textContent = target === 'sample' ? 'Enter Sample ID' : 'Enter Box ID';
    input.value = '';
    input.placeholder = target === 'sample' ? 'e.g., SPL-00123' : 'e.g., BOX-A-042';
    
    modal.classList.add('active');
    input.focus();
}

function closeManualEntry() {
    document.getElementById('modal-manual').classList.remove('active');
    state.manualEntryTarget = null;
}

function submitManualEntry() {
    const input = document.getElementById('manual-input');
    const value = input.value.trim();
    
    if (!value) {
        input.focus();
        return;
    }
    
    if (state.manualEntryTarget === 'sample') {
        state.sampleId = value;
        state.sampleType = 'Manual';
        
        stopAllScanners();
        closeManualEntry();
        
        document.getElementById('captured-sample-id').textContent = truncateText(state.sampleId, 15);
        showScreen('scan-box');
        startBoxScanner();
    } else if (state.manualEntryTarget === 'box') {
        state.boxId = value;
        state.boxType = 'Manual';
        
        stopAllScanners();
        closeManualEntry();
        
        showReviewScreen();
    }
}

// ===== REVIEW SCREEN =====
function showReviewScreen() {
    showScreen('review');
    
    // Populate form fields
    document.getElementById('input-sample-id').value = state.sampleId;
    document.getElementById('input-box-id').value = state.boxId;
    document.getElementById('input-notes').value = '';
    
    // Set date/time
    const now = new Date();
    document.getElementById('display-datetime').textContent = formatDateTime(now);
    
    // Get location
    getLocation();
}

function getLocation() {
    const display = document.getElementById('display-location');
    display.innerHTML = '<span class="loading-text">Getting location...</span>';
    
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                state.location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Try to get location name via reverse geocoding
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.location.lat}&lon=${state.location.lng}`
                    );
                    const data = await response.json();
                    
                    if (data.address) {
                        const parts = [];
                        if (data.address.building) parts.push(data.address.building);
                        if (data.address.road) parts.push(data.address.road);
                        if (data.address.suburb || data.address.city) {
                            parts.push(data.address.suburb || data.address.city);
                        }
                        state.locationName = parts.join(', ') || 'Unknown location';
                    } else {
                        state.locationName = `${state.location.lat.toFixed(4)}, ${state.location.lng.toFixed(4)}`;
                    }
                } catch (err) {
                    state.locationName = `${state.location.lat.toFixed(4)}, ${state.location.lng.toFixed(4)}`;
                }
                
                display.textContent = state.locationName;
            },
            (error) => {
                console.error('Geolocation error:', error);
                state.location = null;
                state.locationName = 'Location unavailable';
                display.textContent = state.locationName;
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    } else {
        state.location = null;
        state.locationName = 'Geolocation not supported';
        display.textContent = state.locationName;
    }
}

// ===== SUBMIT TRANSFER =====
async function submitTransfer() {
    // Get form values (may have been edited)
    const sampleId = document.getElementById('input-sample-id').value.trim();
    const boxId = document.getElementById('input-box-id').value.trim();
    const notes = document.getElementById('input-notes').value.trim();
    
    if (!sampleId || !boxId) {
        alert('Sample ID and Box ID are required');
        return;
    }
    
    showLoading('Logging transfer...');
    
    const now = new Date();
    const transfer = {
        id: generateId(),
        sampleId: sampleId,
        sampleType: state.sampleType || 'Unknown',
        boxId: boxId,
        boxType: state.boxType || 'Unknown',
        latitude: state.location?.lat || null,
        longitude: state.location?.lng || null,
        locationName: state.locationName || '',
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        timestamp: now.toISOString(),
        notes: notes,
        synced: false
    };
    
    // Save locally
    state.transfers.unshift(transfer);
    saveTransfers();
    
    // Try to sync to cloud
    if (navigator.onLine && state.settings.apiUrl) {
        try {
            const synced = await syncTransfer(transfer);
            if (synced) {
                transfer.synced = true;
                saveTransfers();
            }
        } catch (err) {
            console.error('Sync failed:', err);
        }
    }
    
    hideLoading();
    
    // Show success
    document.getElementById('success-sample').textContent = truncateText(sampleId, 12);
    document.getElementById('success-box').textContent = truncateText(boxId, 12);
    showScreen('success');
    
    updateStats();
}

async function syncTransfer(transfer) {
    if (!state.settings.apiUrl) return false;
    
    try {
        const response = await fetch(state.settings.apiUrl + '?action=addTransfer', {
            method: 'POST',
            mode: 'no-cors', // Google Apps Script requires this
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sample_id: transfer.sampleId,
                sample_type: transfer.sampleType,
                box_id: transfer.boxId,
                box_type: transfer.boxType,
                latitude: transfer.latitude,
                longitude: transfer.longitude,
                location_name: transfer.locationName,
                transfer_date: transfer.date,
                transfer_time: transfer.time,
                notes: transfer.notes
            })
        });
        
        return true;
    } catch (err) {
        console.error('Sync error:', err);
        return false;
    }
}

async function syncPendingTransfers() {
    if (!state.settings.apiUrl) return;
    
    const pending = state.transfers.filter(t => !t.synced);
    
    for (const transfer of pending) {
        try {
            const synced = await syncTransfer(transfer);
            if (synced) {
                transfer.synced = true;
            }
        } catch (err) {
            console.error('Sync failed for transfer:', transfer.id, err);
        }
    }
    
    saveTransfers();
}

function cancelTransfer() {
    goHome();
}

// ===== HISTORY =====
function showHistory() {
    showScreen('history');
    renderHistory();
}

function renderHistory(filter = 'all', search = '') {
    const list = document.getElementById('history-list');
    let filtered = [...state.transfers];
    
    // Apply date filter
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    if (filter === 'today') {
        filtered = filtered.filter(t => t.date === today);
    } else if (filter === 'week') {
        filtered = filtered.filter(t => t.date >= weekAgo);
    }
    
    // Apply search
    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(t => 
            t.sampleId.toLowerCase().includes(searchLower) ||
            t.boxId.toLowerCase().includes(searchLower) ||
            (t.notes && t.notes.toLowerCase().includes(searchLower))
        );
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="7" y1="8" x2="17" y2="8"/>
                    <line x1="7" y1="12" x2="17" y2="12"/>
                    <line x1="7" y1="16" x2="12" y2="16"/>
                </svg>
                <p>${search ? 'No matching transfers' : 'No transfers yet'}</p>
                ${!search ? '<button class="btn-primary" onclick="startTransfer()">Start First Transfer</button>' : ''}
            </div>
        `;
        return;
    }
    
    list.innerHTML = filtered.map(t => `
        <div class="history-item">
            <div class="history-transfer">
                <span class="sample">🧪 ${escapeHtml(t.sampleId)}</span>
                <span class="arrow">→</span>
                <span class="box">📦 ${escapeHtml(t.boxId)}</span>
            </div>
            <div class="history-meta">
                <span>📅 ${formatDate(t.date)} ${formatTime(t.time)}</span>
                ${t.locationName ? `<span>📍 ${escapeHtml(truncateText(t.locationName, 20))}</span>` : ''}
            </div>
            ${t.notes ? `<div class="history-notes">${escapeHtml(t.notes)}</div>` : ''}
        </div>
    `).join('');
}

function filterHistory() {
    const search = document.getElementById('search-input').value;
    const activeTab = document.querySelector('.filter-tab.active');
    const filter = activeTab ? activeTab.dataset.filter : 'all';
    renderHistory(filter, search);
}

function setFilter(filter) {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    filterHistory();
}

// ===== DASHBOARD =====
function showDashboard() {
    // For now, redirect to history
    // Future: implement actual dashboard with charts
    showHistory();
}

// ===== SETTINGS =====
function showSettings() {
    document.getElementById('settings-api-url').value = state.settings.apiUrl || '';
    document.getElementById('modal-settings').classList.add('active');
}

function closeSettings() {
    document.getElementById('modal-settings').classList.remove('active');
}

function saveSettings() {
    state.settings.apiUrl = document.getElementById('settings-api-url').value.trim();
    localStorage.setItem('pollen_sardi_settings', JSON.stringify(state.settings));
    closeSettings();
    
    // Try to sync pending transfers with new URL
    if (state.settings.apiUrl && navigator.onLine) {
        syncPendingTransfers();
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('pollen_sardi_settings');
        if (saved) {
            state.settings = JSON.parse(saved);
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

function clearLocalData() {
    if (confirm('Are you sure you want to clear all local data? This cannot be undone.')) {
        state.transfers = [];
        saveTransfers();
        updateStats();
        closeSettings();
        renderHistory();
    }
}

function exportData() {
    if (state.transfers.length === 0) {
        alert('No data to export');
        return;
    }
    
    const headers = ['Transfer ID', 'Sample ID', 'Sample Type', 'Box ID', 'Box Type', 
                     'Latitude', 'Longitude', 'Location', 'Date', 'Time', 'Notes', 'Synced'];
    
    const rows = state.transfers.map(t => [
        t.id,
        t.sampleId,
        t.sampleType,
        t.boxId,
        t.boxType,
        t.latitude || '',
        t.longitude || '',
        t.locationName || '',
        t.date,
        t.time,
        t.notes || '',
        t.synced ? 'Yes' : 'No'
    ]);
    
    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pollen_sardi_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== DATA PERSISTENCE =====
function saveTransfers() {
    try {
        localStorage.setItem('pollen_sardi_transfers', JSON.stringify(state.transfers));
    } catch (err) {
        console.error('Error saving transfers:', err);
    }
}

function loadTransfers() {
    try {
        const saved = localStorage.getItem('pollen_sardi_transfers');
        if (saved) {
            state.transfers = JSON.parse(saved);
        }
    } catch (err) {
        console.error('Error loading transfers:', err);
        state.transfers = [];
    }
}

function updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayCount = state.transfers.filter(t => t.date === today).length;
    const totalCount = state.transfers.length;
    
    document.getElementById('stat-today').textContent = todayCount;
    document.getElementById('stat-total').textContent = totalCount;
}

// ===== UTILITIES =====
function generateId() {
    return 'tr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDateTime(date) {
    const options = { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-AU', options);
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    
    return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(text = 'Processing...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

// ===== KEYBOARD SUPPORT =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeManualEntry();
        closeSettings();
    }
    
    if (e.key === 'Enter' && document.getElementById('modal-manual').classList.contains('active')) {
        submitManualEntry();
    }
});
