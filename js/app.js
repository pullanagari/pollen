/**
 * Pollen_SARDI PWA - Sample Transfer Tracker
 * Clean version with html5-qrcode only
 */

// ===== STATE MANAGEMENT =====
const state = {
    currentScreen: 'home',
    sampleId: null,
    sampleType: null,
    boxId: null,
    boxType: null,
    deviceLog: null,
    location: null,
    locationName: null,
    manualEntryTarget: null,
    transfers: [],
    settings: {
        apiUrl: ''
    }
};

// Scanner instances, keyed by scan step
const scanners = { sample: null, box: null };

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadTransfers();
    updateStats();
    checkOnlineStatus();

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/pollen/service-worker.js')
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
    setTimeout(() => startSampleScanner(), 300);
}

async function goBackToBoxScan() {
    await stopAllScanners();
    showBoxConnectScreen();
}

// ===== TRANSFER WORKFLOW =====
function startTransfer() {
    resetTransferState();
    showScreen('scan-sample');
    setTimeout(() => startSampleScanner(), 300);
}

function resetTransferState() {
    state.sampleId = null;
    state.sampleType = null;
    state.boxId = null;
    state.boxType = null;
    state.deviceLog = null;
    state.rawDeviceLogText = null;
    state.location = null;
    state.locationName = null;
    state.locationPromise = null;
    locationRequestId++; // ignore any lookup still running for the previous transfer
}

// ===== BARCODE SCANNING =====

// ===== DETECT BEST SCANNER AVAILABLE =====
let useBarcodeDetectionAPI = false;

// Check if Native Barcode Detection API is available (Chrome/Edge)
if ('BarcodeDetector' in window) {
    BarcodeDetector.getSupportedFormats().then(formats => {
        console.log('Native Barcode API available with formats:', formats);
        useBarcodeDetectionAPI = true;
    }).catch(() => {
        console.log('Native Barcode API not available, using html5-qrcode');
    });
}

// ===== SAMPLE SCANNER - HYBRID VERSION =====
async function startSampleScanner() {
    console.log('Starting sample scanner...');

    const container = document.getElementById('scanner-sample');

    // Check if Native API is available
    if ('BarcodeDetector' in window) {
        try {
            await startNativeScanner('sample', container);
            return;
        } catch (err) {
            console.log('Native scanner failed, falling back to html5-qrcode');
        }
    }

    // Fallback to html5-qrcode
    await startHtml5Scanner('sample', container);
}

// ===== BOX BARCODE SCANNER (optional alternative to typing the IP) =====
async function startBoxScanner() {
    console.log('Starting box barcode scanner...');

    const container = document.getElementById('scanner-box');

    if ('BarcodeDetector' in window) {
        try {
            await startNativeScanner('box', container);
            return;
        } catch (err) {
            console.log('Native scanner failed, falling back to html5-qrcode');
        }
    }

    await startHtml5Scanner('box', container);
}

async function toggleBoxBarcodeScanner() {
    const wrap = document.getElementById('scanner-box-wrap');
    const isOpen = wrap.style.display !== 'none';

    if (isOpen) {
        await stopAllScanners();
        wrap.style.display = 'none';
    } else {
        wrap.style.display = 'block';
        setTimeout(() => startBoxScanner(), 100);
    }
}

// Camera can still be busy for a moment after the previous scan released it (common on Android),
// so retry before giving up and falling back
async function acquireCamera(attempts = 4) {
    const constraints = {
        video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        }
    };

    for (let attempt = 1; ; attempt++) {
        try {
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            // Waiting won't fix a denied permission
            if (err.name === 'NotAllowedError' || err.name === 'SecurityError' || attempt >= attempts) {
                throw err;
            }
            console.log(`Camera busy (${err.name}), retrying (${attempt})...`);
            await new Promise(resolve => setTimeout(resolve, 400 * attempt));
        }
    }
}

// Stop camera tracks and detach them from the video so the camera is actually freed
function releaseStream(stream, video) {
    if (video) {
        video.pause();
        video.srcObject = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

// ===== NATIVE BARCODE API SCANNER (Chrome/Edge - BEST FOR TUBES) =====
async function startNativeScanner(type, container) {
    console.log(`Starting Native Barcode scanner for ${type}...`);

    // Stop any existing scanner
    await stopAllScanners();

    container.innerHTML = `
        <video id="video-${type}" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:320px;height:100px;border:3px solid #5eead4;border-radius:8px;pointer-events:none;"></div>
    `;

    const video = document.getElementById(`video-${type}`);

    let stream = null;
    try {
        // Get camera stream
        stream = await acquireCamera();

        video.srcObject = stream;
        await video.play();

        // Create barcode detector
        const barcodeDetector = new BarcodeDetector({
            formats: [
                'code_128',
                'code_39',
                'code_93',
                'ean_13',
                'ean_8',
                'qr_code',
                'upc_a',
                'upc_e'
            ]
        });

        // Store for cleanup
        scanners[type] = { stream, detector: barcodeDetector, scanning: true };

        // Scan loop - FAST detection
        const scanLoop = async () => {
            const scanner = scanners[type];

            if (!scanner || !scanner.scanning) return;

            try {
                const barcodes = await barcodeDetector.detect(video);

                if (barcodes.length > 0) {
                    const barcode = barcodes[0];
                    console.log(`${type} detected:`, barcode.rawValue);

                    // Stop scanning
                    scanner.scanning = false;
                    releaseStream(stream, video);

                    // Vibrate feedback
                    if (navigator.vibrate) navigator.vibrate(100);

                    // Process result
                    onScanned(type, barcode.rawValue, {
                        result: { format: { formatName: barcode.format } }
                    });
                    return;
                }
            } catch (err) {
                console.log('Detection error:', err);
            }

            // Continue scanning
            requestAnimationFrame(scanLoop);
        };

        scanLoop();
        console.log(`Native scanner started for ${type} - EXCELLENT for tubes!`);

    } catch (err) {
        console.error('Native scanner error:', err);
        releaseStream(stream, video);
        throw err; // Let caller handle fallback
    }
}

// ===== HTML5-QRCODE FALLBACK (Safari, Firefox, iPhone) =====
async function startHtml5Scanner(type, container) {
    console.log(`Starting html5-qrcode for ${type}...`);

    await stopAllScanners();

    container.innerHTML = '';
    await new Promise(resolve => setTimeout(resolve, 200));

    // The library loads from unpkg; if the phone was offline and it isn't in the
    // service worker's cache yet, it's missing - show manual entry instead of a blank box
    if (typeof Html5Qrcode === 'undefined') {
        showScannerError(type, container, 'Scanner unavailable', "The barcode scanner couldn't load (no internet connection?). Enter the ID manually, or try again once online.");
        return;
    }

    let scanner;
    const config = {
        fps: 30,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            const width = Math.min(viewfinderWidth * 0.85, 320);
            const height = Math.floor(width * 0.35);
            return { width: width, height: height };
        },
        disableFlip: false
    };

    try {
        scanner = new Html5Qrcode(`scanner-${type}`);
        await scanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText, decodedResult) => {
                console.log(`${type} scanned:`, decodedText);
                onScanned(type, decodedText, decodedResult);
            }
        );

        scanners[type] = scanner;

        console.log(`html5-qrcode started for ${type}`);

    } catch (err) {
        console.error('html5-qrcode error:', err);
        showScannerError(type, container, '📷 Camera Error', 'Please allow camera permissions');
    }
}

function showScannerError(type, container, title, message) {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:white;padding:20px;text-align:center;">
            <p style="font-size:18px;font-weight:600;">${title}</p>
            <p style="font-size:14px;margin-top:8px;">${message}</p>
            <button onclick="start${label}Scanner()" style="margin-top:20px;padding:10px 20px;background:#0d9488;border:none;border-radius:8px;color:white;cursor:pointer;">Try Again</button>
            <button onclick="showManualEntry('${type}')" style="margin-top:8px;padding:10px 20px;background:#64748b;border:none;border-radius:8px;color:white;cursor:pointer;">Enter Manually</button>
        </div>
    `;
}

// ===== STOP ALL SCANNERS =====
async function stopAllScanners() {
    for (const type of Object.keys(scanners)) {
        const scanner = scanners[type];
        if (!scanner) continue;
        scanners[type] = null;

        if (scanner.stream) {
            // Native API scanner
            try {
                scanner.scanning = false;
                releaseStream(scanner.stream, document.getElementById(`video-${type}`));
            } catch (err) {}
        } else if (scanner.stop) {
            // html5-qrcode scanner
            try {
                await scanner.stop();
                scanner.clear();
            } catch (err) {}
        }
    }
}

// SCAN CALLBACKS
function onScanned(type, decodedText, decodedResult) {
    if (type === 'box') {
        onBoxBarcodeScanned(decodedText);
    } else {
        onSampleScanned(decodedText, decodedResult);
    }
}

// A barcode on the box encodes its IP address directly (e.g. "192.168.1.42")
async function onBoxBarcodeScanned(decodedText) {
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }

    await stopAllScanners();
    document.getElementById('scanner-box-wrap').style.display = 'none';
    document.getElementById('input-box-ip').value = decodedText.trim();

    connectToBox();
}

async function onSampleScanned(decodedText, decodedResult) {
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }

    state.sampleId = decodedText;
    state.sampleType = getBarcodeType(decodedResult);

    await stopAllScanners();
    await new Promise(resolve => setTimeout(resolve, 200));

    document.getElementById('captured-sample-id').textContent = truncateText(state.sampleId, 15);
    showBoxConnectScreen();
}

function getBarcodeType(decodedResult) {
    if (decodedResult && decodedResult.result && decodedResult.result.format) {
        const format = decodedResult.result.format.formatName;
        return format || 'Unknown';
    }
    return 'Unknown';
}

// ===== BOX WIFI CONNECT =====
// Each box has its own IP on the local Wi-Fi network. Visiting it serves a
// CSV with the same run-summary format as the old device-log barcode.
function showBoxConnectScreen() {
    document.getElementById('input-box-ip').value = '';
    document.getElementById('box-connect-status').style.display = 'none';
    document.getElementById('box-fallback').style.display = 'none';
    document.getElementById('scanner-box-wrap').style.display = 'none';
    document.getElementById('box-file-input').value = '';
    state._pendingBoxIp = null;
    state.rawDeviceLogText = null;

    showScreen('scan-box');
}

function setBoxConnectStatus(text) {
    const status = document.getElementById('box-connect-status');
    status.style.display = text ? 'block' : 'none';
    status.textContent = text;
}

// Most Wi-Fi-AP devices (e.g. the default ESP8266/ESP32 SoftAP address 192.168.4.1)
// only ever serve plain HTTP, never HTTPS - so default a bare IP to http://.
function boxUrl(ip) {
    return /^https?:\/\//i.test(ip) ? ip : `http://${ip}/`;
}

const DEFAULT_FALLBACK_MESSAGE = "Couldn't fetch automatically. Open the box's page to download its summary file, then choose it below.";
const MIXED_CONTENT_MESSAGE = "This app runs over a secure connection (HTTPS) and your browser won't let it directly pull data from the box's plain (HTTP) address - that's a browser security rule, not a bug. Tap \"Open Box in Browser\" below to download its summary file yourself, then choose it here.";

function showBoxFallback(ip, message) {
    setBoxConnectStatus('');
    state._pendingBoxIp = ip;
    document.getElementById('box-fallback-message').textContent = message;
    const fallback = document.getElementById('box-fallback');
    fallback.style.display = 'block';
    fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// A box that's unreachable (wrong IP, not on this Wi-Fi, powered off) won't reject
// the connection - it just goes silent, and the browser's own TCP timeout can take
// 30s+. Give up well before that so the fallback shows up quickly instead of looking stuck.
const BOX_FETCH_TIMEOUT_MS = 6000;

async function connectToBox() {
    const ip = document.getElementById('input-box-ip').value.trim();

    if (!ip) {
        alert('Enter the box IP address, or scan its barcode');
        return;
    }

    const url = boxUrl(ip);
    document.getElementById('box-fallback').style.display = 'none';

    // A plain-HTTP box can never be fetched from this HTTPS-hosted app - the
    // browser blocks it as mixed content before any network attempt is made.
    if (location.protocol === 'https:' && /^http:\/\//i.test(url)) {
        showBoxFallback(ip, MIXED_CONTENT_MESSAGE);
        return;
    }

    setBoxConnectStatus('Connecting to box...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BOX_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });
        const text = await response.text();
        await finishBoxConnect(ip, text);
    } catch (err) {
        console.log('Box fetch failed, falling back to manual file import:', err);
        showBoxFallback(ip, DEFAULT_FALLBACK_MESSAGE);
    } finally {
        clearTimeout(timeout);
    }
}

async function finishBoxConnect(ip, text) {
    state.boxId = ip;
    state.boxType = 'WiFi';
    state.rawDeviceLogText = text;
    state.deviceLog = parseDeviceLog(text);

    setBoxConnectStatus('');
    await stopAllScanners();
    showReviewScreen();
}

function openBoxInBrowser() {
    const ip = document.getElementById('input-box-ip').value.trim();
    if (!ip) {
        alert('Enter the box IP address');
        return;
    }
    state._pendingBoxIp = ip;
    window.open(boxUrl(ip), '_blank');
}

// Opens the box's page (which starts the download) and, in the same tap so the
// browser still treats it as user-initiated, immediately opens the file picker -
// a page can never read a download it triggered without the user choosing it,
// so this collapses the two separate taps into one. The picker is triggered
// first since it's the action that strictly needs a fresh user gesture; opening
// the new tab right after shouldn't disturb it.
function openBoxAndImport() {
    document.getElementById('box-file-input').click();
    openBoxInBrowser();
}

function onBoxFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const ip = state._pendingBoxIp || document.getElementById('input-box-ip').value.trim();
    const reader = new FileReader();
    reader.onload = () => finishBoxConnect(ip, reader.result);
    reader.readAsText(file);
}

async function skipBoxConnect() {
    await stopAllScanners();
    showManualEntry('box');
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

async function submitManualEntry() {
    const input = document.getElementById('manual-input');
    const value = input.value.trim();

    if (!value) {
        input.focus();
        return;
    }

    if (state.manualEntryTarget === 'sample') {
        state.sampleId = value;
        state.sampleType = 'Manual';

        await stopAllScanners();
        closeManualEntry();

        document.getElementById('captured-sample-id').textContent = truncateText(state.sampleId, 15);
        showBoxConnectScreen();
    } else if (state.manualEntryTarget === 'box') {
        state.boxId = value;
        state.boxType = 'Manual';
        state.deviceLog = null;

        await stopAllScanners();
        closeManualEntry();

        showReviewScreen();
    }
}

// ===== DEVICE LOG =====
// Columns: Timestamp, Event, Status, Voltage(V), Current(mA), Temp(C) - the box's real
// export is comma-separated with ISO-style "YYYY-MM-DD HH:MM:SS" timestamps, confirmed
// from the actual raw file content (seen via the Review screen's raw-text fallback).
// Also accepts tab/multi-space-separated "D/M/YYYY H:MM" (day-first), seen when this
// data gets copy-pasted through a spreadsheet app, in case a box ever serves that
// directly. Status holds either a plain state word (STARTED, USER_STOP, IDLE,
// WiFi_ON, ...) or, for CHECK_INTERVAL rows, the RPM reading, e.g. "2712 RPM (PWM:81)".
const DEVICE_LOG_TIMESTAMP_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DEVICE_LOG_TIMESTAMP_DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DEVICE_LOG_START_EVENTS = ['START_FAST', 'START_SLOW'];
const DEVICE_LOG_STOP_EVENTS = ['AUTO_STOP', 'MANUAL_STOP'];

// Returns { date: 'YYYY-MM-DD', time: 'HH:MM:SS' } or null if it matches neither format
function parseDeviceLogTimestamp(raw) {
    let m = raw.match(DEVICE_LOG_TIMESTAMP_ISO);
    if (m) {
        const [, year, month, day, hours, minutes, seconds = '00'] = m;
        return {
            date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
            time: `${hours.padStart(2, '0')}:${minutes}:${seconds.padStart(2, '0')}`
        };
    }

    m = raw.match(DEVICE_LOG_TIMESTAMP_DMY);
    if (m) {
        const [, day, month, year, hours, minutes, seconds = '00'] = m;
        return {
            date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
            time: `${hours.padStart(2, '0')}:${minutes}:${seconds.padStart(2, '0')}`
        };
    }

    return null;
}

// Columns stored on every transfer, in the order they appear in exports and the sheet
const DEVICE_LOG_FIELDS = [
    'run_mode',
    'run_start_date',
    'run_start_time',
    'run_end_date',
    'run_end_time',
    'stop_reason',
    'rotor_speed_rpm',
    'battery_start_v',
    'battery_end_v'
];

// Reads the device log text and summarises the whole file: start/end date, time and
// voltage from the first and last rows, mean rotor speed across all RPM readings, and
// run mode/stop reason labeled from the most recent START event (and its next STOP)
function parseDeviceLog(text) {
    const entries = [];

    (text || '').split(/\r?\n/).forEach(line => {
        const row = line.trim();
        if (!row) return;

        const cols = row.split(/,|\t+| {2,}/).map(c => c.trim());
        if (cols.length < 4) return;

        const timestamp = parseDeviceLogTimestamp(cols[0]);
        if (!timestamp) return; // header row or malformed line

        entries.push({
            date: timestamp.date,
            time: timestamp.time,
            event: cols[1],
            detail: cols[2],
            volts: parseFloat(cols[3])
        });
    });

    // Require at least one START event for this to count as a real run log, but once
    // confirmed, report the overall span: start/end date, time and voltage come from
    // the file's first and last rows (not just the most recent run), and rotor speed
    // is the mean of every RPM reading in the file.
    const hasStartEvent = entries.some(e => DEVICE_LOG_START_EVENTS.includes(e.event));
    if (!hasStartEvent) return null;

    const first = entries[0];
    const last = entries[entries.length - 1];

    let startEvent = null;
    let stopEvent = null;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (DEVICE_LOG_START_EVENTS.includes(entries[i].event)) {
            startEvent = entries[i];
            for (let j = i + 1; j < entries.length; j++) {
                if (DEVICE_LOG_STOP_EVENTS.includes(entries[j].event)) {
                    stopEvent = entries[j];
                    break;
                }
            }
            break;
        }
    }

    const rpmReadings = entries
        .filter(e => e.event === 'CHECK_INTERVAL' && /RPM/i.test(e.detail))
        .map(e => parseInt(e.detail, 10))
        .filter(n => !isNaN(n));
    const meanRpm = rpmReadings.length
        ? Math.round(rpmReadings.reduce((sum, n) => sum + n, 0) / rpmReadings.length)
        : null;

    return {
        run_mode: startEvent.event === 'START_FAST' ? 'FAST' : 'SLOW',
        run_start_date: first.date,
        run_start_time: first.time,
        run_end_date: last.date,
        run_end_time: last.time,
        stop_reason: stopEvent ? (stopEvent.event === 'AUTO_STOP' ? 'Auto' : 'Manual') : '',
        rotor_speed_rpm: meanRpm,
        battery_start_v: first.volts,
        battery_end_v: last.volts
    };
}

function formatDeviceLog(log) {
    if (!log) return 'No device log scanned';

    const end = log.run_end_time ? `${log.run_end_date} ${log.run_end_time}` : 'no stop recorded';
    const rpm = log.rotor_speed_rpm != null ? `${log.rotor_speed_rpm} RPM` : 'no RPM reading';

    return `${log.run_mode} run · ${log.run_start_date} ${log.run_start_time} → ${end} · ${rpm} · ${log.battery_start_v}V → ${log.battery_end_v}V`;
}

// Expanded, line-by-line version for the Review screen, where there's room to show
// start/end date+time, rotor speed, and start/end battery voltage as separate lines
// rather than one dense summary string.
function formatDeviceLogDetailed(log) {
    const rpm = log.rotor_speed_rpm != null ? `${log.rotor_speed_rpm} RPM` : 'No RPM reading';

    return [
        `Run mode: ${log.run_mode}`,
        `Start: ${log.run_start_date} ${log.run_start_time}`,
        `End: ${log.run_end_date} ${log.run_end_time}`,
        `Mean rotor speed: ${rpm}`,
        `Battery: ${log.battery_start_v}V (start) → ${log.battery_end_v}V (end)`
    ].join('\n');
}

// Device log values for one transfer, blank when no log was scanned
function deviceLogValues(transfer) {
    const log = transfer.deviceLog || {};
    const values = {};
    DEVICE_LOG_FIELDS.forEach(field => {
        values[field] = log[field] ?? '';
    });
    return values;
}

// When parsing fails, show a preview of the raw text that was actually read so it can be
// screenshotted for diagnosis, instead of just a dead-end "No device log scanned".
function deviceLogDisplayText() {
    if (state.deviceLog) return formatDeviceLogDetailed(state.deviceLog);
    if (state.rawDeviceLogText) {
        const preview = state.rawDeviceLogText.slice(0, 400);
        return `No device log scanned - couldn't find a START row in the file. Raw content received (first 400 chars):\n${preview}`;
    }
    return 'No device log scanned';
}

// ===== REVIEW SCREEN =====
function showReviewScreen() {
    showScreen('review');

    // Populate form fields
    document.getElementById('input-sample-id').value = state.sampleId;
    document.getElementById('input-box-id').value = state.boxId;
    document.getElementById('input-notes').value = '';
    document.getElementById('display-log').textContent = deviceLogDisplayText();
    // Snapshot onto the visible element itself, so submission always matches what the
    // user actually saw here - even if `state` gets reset by some stray navigation
    // in between (inputs keep their typed values the same way; this does the same
    // for the device log, which otherwise has no editable field to anchor it to).
    document.getElementById('display-log').dataset.deviceLog = JSON.stringify(state.deviceLog || null);

    // Set date/time
    const now = new Date();
    document.getElementById('display-datetime').textContent = formatDateTime(now);

    // Get location
    getLocation();
}

// Each lookup gets a number, so a slow lookup from an earlier transfer can't
// overwrite the location of the current one when it finally finishes
let locationRequestId = 0;

// Settles (never rejects) once the location is known or has definitely failed.
// Kept on state.locationPromise so submitTransfer can wait for it instead of
// saving the transfer without a location.
function getLocation() {
    const requestId = ++locationRequestId;
    const display = document.getElementById('display-location');
    display.innerHTML = '<span class="loading-text">Getting location...</span>';

    const finish = (location, name) => {
        if (requestId !== locationRequestId) return;
        state.location = location;
        state.locationName = name;
        display.textContent = name;
    };

    state.locationPromise = new Promise(resolve => {
        if (!('geolocation' in navigator)) {
            finish(null, 'Geolocation not supported');
            resolve();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                const coords = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

                // Show the coordinates straight away, then try to replace them with a place name
                finish(location, coords);

                // Reverse geocoding, given up after a few seconds so it can't hold up a submit
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.lat}&lon=${location.lng}`,
                        { signal: controller.signal }
                    );
                    const data = await response.json();

                    if (data.address) {
                        const parts = [];
                        if (data.address.building) parts.push(data.address.building);
                        if (data.address.road) parts.push(data.address.road);
                        if (data.address.suburb || data.address.city) {
                            parts.push(data.address.suburb || data.address.city);
                        }
                        finish(location, parts.join(', ') || 'Unknown location');
                    }
                } catch (err) {
                    // Keep the coordinates already shown
                } finally {
                    clearTimeout(timeout);
                }
                resolve();
            },
            (error) => {
                console.error('Geolocation error:', error);
                finish(null, 'Location unavailable');
                resolve();
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });

    return state.locationPromise;
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

    // If the location lookup is still running, wait for it rather than saving the
    // transfer without a location. GPS gives up after 10s and the place-name lookup
    // after 5s; the 20s cap is a safety net in case the browser never answers.
    if (state.locationPromise) {
        showLoading('Getting location...');
        await Promise.race([
            state.locationPromise,
            new Promise(resolve => setTimeout(resolve, 20000))
        ]);
    }

    showLoading('Logging transfer...');

    const now = new Date();
    let deviceLog = state.deviceLog;
    try {
        deviceLog = JSON.parse(document.getElementById('display-log').dataset.deviceLog || 'null');
    } catch (err) {
        console.error('Could not read device log snapshot, falling back to state:', err);
    }

    const transfer = {
        id: generateId(),
        sampleId: sampleId,
        sampleType: state.sampleType || 'Unknown',
        boxId: boxId,
        boxType: state.boxType || 'Unknown',
        latitude: state.location?.lat || null,
        longitude: state.location?.lng || null,
        locationName: state.locationName || '',
        date: localDateString(now),
        time: now.toTimeString().split(' ')[0],
        timestamp: now.toISOString(),
        notes: notes,
        deviceLog: deviceLog,
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

// Transfers currently being sent, so overlapping syncs don't send the same one twice
const syncInFlight = new Set();

// Only reports success when the Apps Script actually replies { success: true }.
// Content-Type text/plain keeps this a "simple" request (no CORS preflight, which Apps
// Script can't answer), and Apps Script's reply allows any origin, so the response is
// readable - unlike the old no-cors request, which couldn't tell success from failure.
// Each transfer carries its local id as client_id, so a retry after a lost reply is
// recognised by the script instead of adding a second row.
async function syncTransfer(transfer) {
    if (!state.settings.apiUrl) return false;
    if (syncInFlight.has(transfer.id)) return false;
    syncInFlight.add(transfer.id);

    try {
        const response = await fetch(`${state.settings.apiUrl}?action=addTransfer`, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                client_id: transfer.id,
                sample_id: transfer.sampleId,
                sample_type: transfer.sampleType,
                box_id: transfer.boxId,
                box_type: transfer.boxType,
                latitude: transfer.latitude,
                longitude: transfer.longitude,
                location_name: transfer.locationName,
                transfer_date: transfer.date,
                transfer_time: transfer.time,
                notes: transfer.notes,
                ...deviceLogValues(transfer)
            })
        });

        if (!response.ok) {
            console.error('Sync failed: HTTP', response.status);
            return false;
        }

        const result = await response.json();
        if (result && result.success === true) {
            return true;
        }
        console.error('Sync rejected by Apps Script:', result && result.error);
        return false;
    } catch (err) {
        // Network failure, or a reply that wasn't JSON (e.g. a Google sign-in page
        // because the script isn't deployed for "Anyone") - leave it pending
        console.error('Sync error:', err);
        return false;
    } finally {
        syncInFlight.delete(transfer.id);
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
    const today = localDateString(now);
    const weekAgo = localDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

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
            ${t.deviceLog ? `<div class="history-meta"><span>📋 ${escapeHtml(formatDeviceLog(t.deviceLog))}</span></div>` : ''}
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
                     'Latitude', 'Longitude', 'Location', 'Date', 'Time', 'Notes', 'Synced',
                     ...DEVICE_LOG_FIELDS];

    const rows = state.transfers.map(t => {
        const logValues = deviceLogValues(t);
        return [
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
            t.synced ? 'Yes' : 'No',
            ...DEVICE_LOG_FIELDS.map(field => logValues[field])
        ];
    });

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pollen_sardi_export_${localDateString()}.csv`;
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
    const today = localDateString();
    const todayCount = state.transfers.filter(t => t.date === today).length;
    const totalCount = state.transfers.length;

    document.getElementById('stat-today').textContent = todayCount;
    document.getElementById('stat-total').textContent = totalCount;
}

// ===== UTILITIES =====
// Calendar date (YYYY-MM-DD) in the phone's own time zone.
// toISOString() gives the UTC date, which is a day behind in Australia before about 10am.
function localDateString(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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
    // Parse as local midnight so the day isn't shifted by the time zone
    const date = new Date(dateStr + 'T00:00:00');
    const today = localDateString();
    const yesterday = localDateString(new Date(Date.now() - 86400000));

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
