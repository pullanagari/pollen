# Pollen_SARDI PWA

A Progressive Web App for tracking pollen sample transfers: scan the source **sample** barcode, then connect to the destination **box** over Wi-Fi (by IP address, or a barcode encoding it) to pull its run summary.

![Pollen_SARDI](https://img.shields.io/badge/Platform-PWA-blue) ![SARDI](https://img.shields.io/badge/SARDI-Research-green)

## Features

- 🌸 **Sample Scan + Box Wi-Fi Connect** - Scan the pollen sample barcode, then connect to the destination box over Wi-Fi (by IP, or a barcode encoding it) to pull its run summary
- 📍 **Auto GPS Location** - Captures location with reverse geocoding
- 📅 **Auto Date/Time** - Timestamps every transfer
- 📝 **Notes** - Add optional notes to each transfer
- ☁️ **Cloud Sync** - Syncs to Google Sheets
- 📴 **Offline Mode** - Works offline, syncs when connected
- 📊 **History & Search** - View and filter past transfers
- 📥 **CSV Export** - Export data locally

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/pullanagari/pollen-sardi-pwa.git
cd pollen-sardi-pwa
```

### 2. Generate App Icons

Use an online PWA icon generator 
## Usage

1. **Tap "Start Transfer"** on the home screen
2. **Scan the SAMPLE barcode** (pollen sample you're moving)
3. **Connect to the BOX** - enter its Wi-Fi IP address (or scan a barcode encoding it) and tap **Connect & Fetch Summary**. Each box has its own IP. In practice, the box can rarely be fetched automatically this way (its page is plain HTTP, which a secure HTTPS site like this one can't fetch directly, and the box has no CORS support) - the app expects this and falls back to **Open Box & Choose File**, which opens the box's page (starting its CSV download) and immediately prompts you to pick the downloaded file. Treat "open page, then pick the file" as the normal flow rather than a fallback. If the box is unreachable at all, you can also enter the Box ID manually with no run summary.
4. **Review** the captured data (editable)
5. **Add notes** if needed
6. **Tap "Log Transfer"** to save

The transfer is saved locally and synced to Google Sheets when online.

## Project Structure

```
pollen-sardi-pwa/
├── index.html              # Main app HTML
├── manifest.json           # PWA manifest
├── service-worker.js       # Offline caching
├── css/
│   └── styles.css          # All styles
├── js/
│   └── app.js              # Application logic
├── icons/                  # App icons
│   └── icon.svg            # Base icon (generate PNGs from this)
└── google-apps-script/
    └── Code.gs             # Backend API code
```

## Google Sheet Schema

The app creates a sheet with these columns:

| Column | Description |
|--------|-------------|
| transfer_id | Unique ID (POL-XXXXXXXX) |
| sample_id | Scanned pollen sample barcode |
| sample_type | Barcode format (QR, Code128, etc.) |
| box_id | Scanned storage box barcode |
| box_type | Barcode format |
| latitude | GPS latitude |
| longitude | GPS longitude |
| location_name | Reverse geocoded address |
| transfer_date | YYYY-MM-DD |
| transfer_time | HH:MM:SS |
| timestamp | Full ISO timestamp |
| notes | User-entered notes |
| user_id | Device identifier |
| created_at | Server timestamp |
| run_mode | FAST or SLOW (from the most recent START event in the device log) |
| run_start_date | Date of the device log's first row, YYYY-MM-DD |
| run_start_time | Time of the device log's first row, HH:MM:SS |
| run_end_date | Date of the device log's last row, YYYY-MM-DD |
| run_end_time | Time of the device log's last row, HH:MM:SS |
| stop_reason | Auto or Manual (from the next stop event after the most recent start) |
| rotor_speed_rpm | Mean of all RPM readings in the device log |
| battery_start_v | Battery voltage on the device log's first row |
| battery_end_v | Battery voltage on the device log's last row |
| client_id | The app's local transfer ID - lets the script ignore a retried transfer it already logged |

Text columns (IDs, dates, times, notes, etc.) are written as plain text, so all-digit barcodes keep their leading zeros and dates aren't auto-converted by Sheets.

## Supported Barcode Types

- QR Code
- Code 128
- Code 39
- EAN-13
- EAN-8
- UPC-A
- Data Matrix

## Browser Support

- Chrome (Android & Desktop) ✅
- Safari (iOS 11.3+) ✅
- Firefox ✅
- Edge ✅

## Troubleshooting

### Camera not working?
- Ensure HTTPS is enabled (required for camera access)
- Check browser permissions for camera
- Try the "Enter manually" option
- Known issue: Samsung Galaxy S22 (model SM-S901E) cannot scan barcodes with this app - use "Enter manually" on that device instead

### "Connect & Fetch Summary" doesn't load from the box's IP?
- This is expected, not a bug - the box only serves plain HTTP, and a secure HTTPS site can never fetch an HTTP page directly (a browser security rule, not something the app can work around) or there is no CORS support on the box
- The app falls back to **Open Box & Choose File** automatically: it opens the box's page (triggering its CSV download) and immediately prompts you to pick the file - tap the newest one in your Downloads
- If the file picker doesn't show the right file, check your Downloads folder isn't cluttered with several similarly-named files from earlier attempts

### Location not accurate?
- Enable GPS/Location Services
- Allow location permission when prompted
- Outdoor locations are more accurate

### Sync not working?
- Check your Apps Script URL in Settings
- Verify the Apps Script is deployed as "Anyone can access"
- Check browser console for errors

## License

Private 

## Author 
Pullanagari


