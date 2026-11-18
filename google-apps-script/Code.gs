/**
 * Pollen_SARDI - Google Apps Script Backend
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com
 * 2. Create a new project
 * 3. Paste this code
 * 4. Update SHEET_ID below with your Google Sheet ID
 * 5. Deploy > New deployment > Web app
 * 6. Set "Execute as" to "Me" and "Who has access" to "Anyone"
 * 7. Copy the deployment URL and paste it in the Pollen_SARDI app settings
 */

// ===== CONFIGURATION =====
// Replace with your Google Sheet ID (from the URL)
const SHEET_ID = '1ey5lA3qI0TVx_QMs0LCQyct1pTLK7ZwWGccGTUze9xk';
const SHEET_NAME = 'Transfers';

// ===== MAIN HANDLERS =====
function doGet(e) {
    return handleRequest(e);
}

function doPost(e) {
    return handleRequest(e);
}

function handleRequest(e) {
    const action = e.parameter.action;
    
    try {
        let result;
        
        switch (action) {
            case 'addTransfer':
                result = addTransfer(e);
                break;
            case 'getTransfers':
                result = getTransfers(e);
                break;
            case 'updateTransfer':
                result = updateTransfer(e);
                break;
            case 'deleteTransfer':
                result = deleteTransfer(e);
                break;
            case 'getStats':
                result = getStats();
                break;
            default:
                result = { success: false, error: 'Unknown action' };
        }
        
        return createJsonResponse(result);
    } catch (error) {
        return createJsonResponse({
            success: false,
            error: error.toString()
        });
    }
}

function createJsonResponse(data) {
    return ContentService
        .createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

// ===== SHEET OPERATIONS =====
function getSheet() {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
        sheet = ss.insertSheet(SHEET_NAME);
        // Add headers
        const headers = [
            'transfer_id',
            'sample_id',
            'sample_type',
            'box_id',
            'box_type',
            'latitude',
            'longitude',
            'location_name',
            'transfer_date',
            'transfer_time',
            'timestamp',
            'notes',
            'user_id',
            'created_at',
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
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
    }
    
    return sheet;
}

// Calendar date (YYYY-MM-DD) in the script's time zone, so "today" matches the phone's date
function localDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Adds any missing column names to the end of the header row, returns all headers
function ensureHeaders(sheet, requiredHeaders) {
    const lastColumn = sheet.getLastColumn();
    const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

    requiredHeaders.forEach(name => {
        if (headers.indexOf(name) === -1) {
            headers.push(name);
            sheet.getRange(1, headers.length).setValue(name).setFontWeight('bold');
        }
    });

    return headers;
}

// Columns that must stay exactly as sent. Without this, Sheets auto-converts them:
// all-digit barcodes lose leading zeros ("00123" -> 123) and dates/times become date values.
const TEXT_COLUMNS = [
    'transfer_id', 'client_id', 'sample_id', 'sample_type', 'box_id', 'box_type',
    'location_name', 'transfer_date', 'transfer_time', 'timestamp', 'notes', 'user_id',
    'created_at', 'run_mode', 'run_start_date', 'run_start_time', 'run_end_date',
    'run_end_time', 'stop_reason'
];

// Turns a cell value back into the string the app sent. Rows written before the
// text-format fix may hold Date objects that Sheets auto-converted.
function cellText(header, value) {
    if (value instanceof Date) {
        const tz = Session.getScriptTimeZone();
        if (/_time$/.test(header)) return Utilities.formatDate(value, tz, 'HH:mm:ss');
        if (/_date$/.test(header)) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
        return value.toISOString();
    }
    return value;
}

// ===== API METHODS =====
function addTransfer(e) {
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;

    // Serialise writes so the duplicate check and the append can't interleave
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
        return addTransferLocked(data);
    } finally {
        lock.releaseLock();
    }
}

function addTransferLocked(data) {
    const sheet = getSheet();
    const clientId = data.client_id || '';

    // The app retries until it gets a success reply, so the same transfer can arrive
    // more than once - if its client_id is already in the sheet, don't add it again
    if (clientId) {
        const lastColumn = sheet.getLastColumn();
        const lastRow = sheet.getLastRow();
        const existingHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
        const clientCol = existingHeaders.indexOf('client_id');
        const idCol = existingHeaders.indexOf('transfer_id');
        if (clientCol !== -1 && lastRow > 1) {
            const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
            const match = rows.find(row => row[clientCol] === clientId);
            if (match) {
                return {
                    success: true,
                    duplicate: true,
                    transfer_id: idCol !== -1 ? match[idCol] : '',
                    message: 'Transfer already logged'
                };
            }
        }
    }

    const transferId = 'POL-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const timestamp = new Date().toISOString();
    
    const values = {
        transfer_id: transferId,
        sample_id: data.sample_id || '',
        sample_type: data.sample_type || 'Unknown',
        box_id: data.box_id || '',
        box_type: data.box_type || 'Unknown',
        latitude: data.latitude || '',
        longitude: data.longitude || '',
        location_name: data.location_name || '',
        transfer_date: data.transfer_date || localDate(new Date()),
        transfer_time: data.transfer_time || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss'),
        timestamp: timestamp,
        notes: data.notes || '',
        user_id: data.user_id || '',
        created_at: timestamp,
        run_mode: data.run_mode || '',
        run_start_date: data.run_start_date || '',
        run_start_time: data.run_start_time || '',
        run_end_date: data.run_end_date || '',
        run_end_time: data.run_end_time || '',
        stop_reason: data.stop_reason || '',
        rotor_speed_rpm: data.rotor_speed_rpm || '',
        battery_start_v: data.battery_start_v || '',
        battery_end_v: data.battery_end_v || '',
        client_id: clientId
    };

    // Write each value under its column name, so sheets created before
    // the device log columns existed still line up
    const headers = ensureHeaders(sheet, Object.keys(values));
    const row = sheet.getLastRow() + 1;

    // Format the text columns as plain text BEFORE writing, so nothing gets auto-converted
    headers.forEach((header, i) => {
        if (TEXT_COLUMNS.indexOf(header) !== -1) {
            sheet.getRange(row, i + 1).setNumberFormat('@');
        }
    });

    sheet.getRange(row, 1, 1, headers.length).setValues([
        headers.map(header => {
            if (values[header] === undefined) return '';
            return TEXT_COLUMNS.indexOf(header) !== -1 ? String(values[header]) : values[header];
        })
    ]);

    return {
        success: true,
        transfer_id: transferId,
        message: 'Transfer logged successfully'
    };
}

function getTransfers(e) {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
        return { success: true, data: [] };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    let transfers = rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = cellText(header, row[i]);
        });
        return obj;
    });

    // Apply filters (String() because older rows may hold numbers, e.g. all-digit barcodes)
    if (e.parameter.sample_id) {
        transfers = transfers.filter(t =>
            String(t.sample_id).toLowerCase().includes(e.parameter.sample_id.toLowerCase())
        );
    }

    if (e.parameter.box_id) {
        transfers = transfers.filter(t =>
            String(t.box_id).toLowerCase().includes(e.parameter.box_id.toLowerCase())
        );
    }
    
    if (e.parameter.from) {
        transfers = transfers.filter(t => t.transfer_date >= e.parameter.from);
    }
    
    if (e.parameter.to) {
        transfers = transfers.filter(t => t.transfer_date <= e.parameter.to);
    }
    
    // Sort by timestamp descending (newest first)
    transfers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit results
    const limit = parseInt(e.parameter.limit) || 100;
    transfers = transfers.slice(0, limit);
    
    return { success: true, data: transfers };
}

function updateTransfer(e) {
    const sheet = getSheet();
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    
    if (!data.transfer_id) {
        return { success: false, error: 'transfer_id is required' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idCol = headers.indexOf('transfer_id');
    
    for (let i = 1; i < allData.length; i++) {
        if (allData[i][idCol] === data.transfer_id) {
            // Update notes column
            const notesCol = headers.indexOf('notes');
            if (notesCol !== -1 && data.notes !== undefined) {
                sheet.getRange(i + 1, notesCol + 1).setValue(data.notes);
            }
            return { success: true, message: 'Transfer updated' };
        }
    }
    
    return { success: false, error: 'Transfer not found' };
}

function deleteTransfer(e) {
    const sheet = getSheet();
    const data = e.postData ? JSON.parse(e.postData.contents) : e.parameter;
    
    if (!data.transfer_id) {
        return { success: false, error: 'transfer_id is required' };
    }
    
    const allData = sheet.getDataRange().getValues();
    const headers = allData[0];
    const idCol = headers.indexOf('transfer_id');
    
    for (let i = 1; i < allData.length; i++) {
        if (allData[i][idCol] === data.transfer_id) {
            sheet.deleteRow(i + 1);
            return { success: true, message: 'Transfer deleted' };
        }
    }
    
    return { success: false, error: 'Transfer not found' };
}

function getStats() {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
        return {
            success: true,
            stats: {
                total: 0,
                today: 0,
                thisWeek: 0,
                thisMonth: 0,
                topBoxes: [],
                recentSamples: []
            }
        };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    const dateCol = headers.indexOf('transfer_date');
    const boxCol = headers.indexOf('box_id');
    const sampleCol = headers.indexOf('sample_id');
    
    const today = localDate(new Date());
    const weekAgo = localDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const monthAgo = localDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    
    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    const boxCounts = {};
    
    rows.forEach(row => {
        const date = cellText('transfer_date', row[dateCol]);
        const box = row[boxCol];
        
        if (date === today) todayCount++;
        if (date >= weekAgo) weekCount++;
        if (date >= monthAgo) monthCount++;
        
        boxCounts[box] = (boxCounts[box] || 0) + 1;
    });
    
    // Top boxes
    const topBoxes = Object.entries(boxCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([box, count]) => ({ box, count }));
    
    // Recent samples
    const recentSamples = rows
        .slice(-10)
        .reverse()
        .map(row => ({
            sample: row[sampleCol],
            box: row[boxCol],
            date: cellText('transfer_date', row[dateCol])
        }));
    
    return {
        success: true,
        stats: {
            total: rows.length,
            today: todayCount,
            thisWeek: weekCount,
            thisMonth: monthCount,
            topBoxes: topBoxes,
            recentSamples: recentSamples
        }
    };
}

// ===== SETUP FUNCTION =====
// Run this once to initialize the sheet
function setupSheet() {
    const sheet = getSheet();
    Logger.log('Sheet setup complete: ' + sheet.getName());
}
