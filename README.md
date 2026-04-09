# Pollen_SARDI PWA

A Progressive Web App for tracking pollen sample transfers by scanning two barcodes: the source **sample** and the destination **box**.

![Pollen_SARDI](https://img.shields.io/badge/Platform-PWA-blue) ![SARDI](https://img.shields.io/badge/SARDI-Research-green)

## Features

- 🌸 **Dual Barcode Scanning** - Scan pollen sample barcode, then storage box barcode
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

Use an online PWA icon generator like [PWA Asset Generator](https://pwa-asset-generator.vercel.app/) or [Favicon.io](https://favicon.io/).

Upload the `icons/icon.svg` file and generate these sizes for `/icons/` folder:
- icon-72.png
- icon-96.png
- icon-128.png
- icon-144.png
- icon-152.png
- icon-192.png
- icon-384.png
- icon-512.png

### 3. Set Up Google Sheets Backend

1. Create a new Google Sheet
2. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID_HERE]/edit
   ```
3. Go to [Google Apps Script](https://script.google.com)
4. Create new project → Paste code from `google-apps-script/Code.gs`
5. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID
6. Deploy:
   - Click **Deploy** → **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the deployment URL

### 4. Deploy the PWA

**Option A: GitHub Pages (Free)**

1. Go to repository Settings → Pages
2. Source: Deploy from branch `main`
3. Your app will be at: `https://pullanagari.github.io/pollen-sardi-pwa/`

**Option B: Netlify (Free)**

1. Connect your GitHub repo to [Netlify](https://netlify.com)
2. Deploy with default settings
3. Get your custom URL

**Option C: Local Testing**

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .
```

Then open `http://localhost:8000`

### 5. Configure the App

1. Open the app on your phone
2. Tap the ⚙️ Settings icon
3. Paste your Google Apps Script URL
4. Save

## Usage

1. **Tap "Start Transfer"** on the home screen
2. **Scan the SAMPLE barcode** (pollen sample you're moving)
3. **Scan the BOX barcode** (storage box destination)
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

### Location not accurate?
- Enable GPS/Location Services
- Allow location permission when prompted
- Outdoor locations are more accurate

### Sync not working?
- Check your Apps Script URL in Settings
- Verify the Apps Script is deployed as "Anyone can access"
- Check browser console for errors

## License

Private - SARDI Research Use Only.

## Author

SARDI - South Australian Research and Development Institute

---

**Need help?** Open an issue in this repository.
