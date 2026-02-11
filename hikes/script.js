let map;

/**
 * Fetches data from Google Sheets using JSONP to avoid CORS issues
 * when running from the file:// protocol.
 */
function fetchSheetData() {
    return new Promise((resolve, reject) => {
        const sheetId = '1ysWZANdJKh5R6H_uBEEvfsvVy24G0tRQpE7sa48oaI0';
        const query = 'SELECT *'; // Fetch all columns

        // Define a unique callback name
        const callbackName = 'sheetCallback_' + Math.floor(Math.random() * 100000);

        // Construct the JSONP URL
        // tqx=responseHandler:YOUR_CALLBACK_NAME ensures the response is wrapped in the callback
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&tq=${encodeURIComponent(query)}`;

        // Define the global callback
        window[callbackName] = (json) => {
            // Cleanup
            delete window[callbackName];
            document.head.removeChild(script);

            // Check for error in response
            if (json.status === 'error') {
                console.error("Google Sheets API Error:", json.errors);
                resolve([]);
                return;
            }

            // Check if table exists
            if (!json.table || !json.table.rows) {
                console.error("Invalid Google Sheets response structure. 'table' or 'rows' missing:", json);
                resolve([]);
                return;
            }

            // Parse and resolve
            const locations = parseSheetData(json.table);
            resolve(locations);
        };

        // Create and inject the script tag
        const script = document.createElement('script');
        script.src = url;
        script.onerror = (err) => {
            delete window[callbackName];
            document.head.removeChild(script);
            console.error("Error loading sheet data:", err);
            resolve([]); // Resolve empty on error to let map load
        };
        document.head.appendChild(script);
    });
}

function parseSheetData(table) {
    const locations = [];
    const rows = table.rows;
    if (!rows || rows.length === 0) return locations;

    // Expected headers (keywords)
    const headers = {
        date: "date",
        hours: "hours",
        minutes: "minutes",
        distance: "distance",
        latLng: "lat,lng",
        park: "park",
        trail: "trail",
        region: "region",
        elevation: "elevation",
        pace: "pace"
    };

    // Find header row index and column indices
    let headerRowIndex = -1;
    const colIndices = {};

    const identifyColumn = (str, index) => {
        const s = str.toLowerCase();
        if (s.includes(headers.date)) colIndices.date = index;
        else if (s.includes(headers.hours)) colIndices.hours = index;
        else if (s.includes(headers.minutes)) colIndices.minutes = index;
        else if (s.includes(headers.distance)) colIndices.distance = index;
        else if (s.includes(headers.latLng) || (s.includes('lat') && s.includes('lng'))) colIndices.latLng = index;
        else if (s.includes(headers.park)) colIndices.park = index;
        else if (s.includes(headers.trail)) colIndices.trail = index;
        else if (s.includes(headers.region)) colIndices.region = index;
        else if (s.includes(headers.elevation)) colIndices.elevation = index;
        else if (s.includes(headers.pace)) colIndices.pace = index;
    };

    // Check table.cols for labels first
    if (table.cols) {
        table.cols.forEach((col, index) => {
            if (!col || !col.label) return;
            identifyColumn(col.label, index);
        });
    }

    // If we didn't find specific columns in cols labels, scan rows
    if (colIndices.latLng === undefined || colIndices.date === undefined) {
        for (let i = 0; i < Math.min(rows.length, 5); i++) {
            const row = rows[i];
            if (!row.c) continue;

            const rowValues = row.c.map(cell => cell ? (cell.v || "").toString() : "");

            // Try to match headers in this row
            rowValues.forEach((val, index) => {
                identifyColumn(val, index);
            });

            // If we found essential columns, assume this is the header row
            if (colIndices.date !== undefined && colIndices.latLng !== undefined) {
                headerRowIndex = i;
                break;
            } else {
                // Reset if not a good match to avoid mixing data rows as headers
                // But since we are accumulating, we need to be careful. 
                // For now, let's just accept the first strong match.
            }
        }
    } else {
        headerRowIndex = -1;
    }

    console.log("Detected Column Indices:", colIndices);

    // Default indices fallback (only if completely missing)
    if (colIndices.date === undefined) colIndices.date = 0;
    if (colIndices.hours === undefined) colIndices.hours = 1;
    if (colIndices.minutes === undefined) colIndices.minutes = 2;
    if (colIndices.distance === undefined) colIndices.distance = 3;
    if (colIndices.latLng === undefined) colIndices.latLng = 4;
    // No default for Park/Trail/Elevation/Pace to avoid junk data if they don't exist in fixed positions


    // Iterate rows, skipping header row if it was inside the data
    rows.forEach((row, index) => {
        if (index <= headerRowIndex) return;

        const cells = row.c;
        if (!cells) return;

        const getDate = (idx) => idx !== undefined ? (cells[idx]?.f || cells[idx]?.v || "") : ""; // Prefer formatted value for dates
        const getVal = (idx) => idx !== undefined ? (cells[idx]?.v || 0) : 0;
        const getString = (idx) => idx !== undefined ? (cells[idx]?.v || "") : "";

        const date = getDate(colIndices.date);
        const rawDate = (colIndices.date !== undefined && cells[colIndices.date]) ? (cells[colIndices.date].v || 0) : 0; // For sorting
        const hours = getVal(colIndices.hours);
        const minutes = getVal(colIndices.minutes);
        let distanceVal = getVal(colIndices.distance);
        const parkRaw = getString(colIndices.park);
        const trail = getString(colIndices.trail);
        const region = getString(colIndices.region);
        const elevation = getVal(colIndices.elevation);
        const pace = getVal(colIndices.pace);

        // Combine Park and Region
        const park = region ? `${parkRaw} (${region})` : parkRaw;
        // Ensure it's a string before splitting
        const latLngStr = String(cells[colIndices.latLng]?.v || "");

        if (!latLngStr || !latLngStr.includes(',')) return;

        const [latStr, lngStr] = latLngStr.split(',');
        const lat = parseFloat(latStr.trim());
        const lng = parseFloat(lngStr.trim());

        if (isNaN(lat) || isNaN(lng)) return;

        // Format Duration
        let durationParts = [];
        if (hours > 0) durationParts.push(`${hours}h`);
        if (minutes > 0) durationParts.push(`${minutes}m`);
        const duration = durationParts.join(' ') || "0m";

        // Format Distance: Always use 1 decimal place (e.g., 5.0 mi)
        if (typeof distanceVal === 'string' && distanceVal.includes('mi')) {
            // Try to extract only the number to format it
            const match = distanceVal.match(/([\d.]+)/);
            if (match) {
                distanceVal = parseFloat(match[1]);
            }
        }

        // Ensure distanceVal is a number before formatting, fallback to original if not
        const formattedDistance = (typeof distanceVal === 'number' && !isNaN(distanceVal))
            ? `${distanceVal.toFixed(1)} mi`
            : `${distanceVal}`;

        // Pace formatting (e.g., to 1 decimal place if it's a number)
        const formattedPace = (typeof pace === 'number' && !isNaN(pace)) ? `${pace.toFixed(1)} mph` : pace;

        // Elevation formatting (no decimals generally needed)
        const formattedElevation = (typeof elevation === 'number' && !isNaN(elevation)) ? `${Math.round(elevation)} ft` : elevation;


        locations.push({
            lat,
            lng,
            title: park || "Location",
            date: date,
            duration: duration,
            distance: formattedDistance,
            park: park,
            trail: trail,
            elevation: formattedElevation,
            pace: formattedPace,
            rawDate: rawDate
        });
    });


    console.log("Parsed Locations:", locations);
    return locations;
}

async function initMap() {
    // Fetch data first
    const locations = await fetchSheetData();

    // Request needed libraries.
    const { Map, InfoWindow } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    // Center map on the SF Bay Area
    const center = { lat: 37.36, lng: -122.04 };

    map = new Map(document.getElementById("map"), {
        center: center,
        zoom: 11,
        mapId: "4504f8b37365c3d0",
        colorScheme: "FOLLOW_SYSTEM", // Use string literal due to import issue with ColorScheme
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false, // Disable native POI clicks
        mapTypeId: 'terrain',
    });

    const infoWindow = new InfoWindow();

    // Track currently displayed polyline
    let currentPolyline = null;
    let currentActiveMarkerElement = null;

    const deactivateCurrentMarker = () => {
        if (currentActiveMarkerElement) {
            currentActiveMarkerElement.classList.remove('marker-active');
            currentActiveMarkerElement = null;
        }
        if (currentPolyline) {
            currentPolyline.setMap(null);
            currentPolyline = null;
        }
    };

    // Close InfoWindow and deselect marker when clicking the map
    map.addListener('click', () => {
        infoWindow.close();
        deactivateCurrentMarker();
    });

    // Deselect marker when InfoWindow is closed via the 'x' button
    infoWindow.addListener('closeclick', () => {
        deactivateCurrentMarker();
    });

    // Group locations by lat/lng to combine multiple hikes at same trailhead
    const groupedLocations = {};
    locations.forEach(loc => {
        const key = `${loc.lat},${loc.lng}`;
        if (!groupedLocations[key]) {
            groupedLocations[key] = [];
        }
        groupedLocations[key].push(loc);
    });

    Object.values(groupedLocations).forEach((hikes) => {
        // Sort hikes by date descending (newest first)
        hikes.sort((a, b) => {
            if (typeof a.rawDate === 'number' && typeof b.rawDate === 'number') {
                return b.rawDate - a.rawDate;
            }
            return 0; // Fallback if regular sort not possible
        });

        // Use the most recent hike for the marker position and title
        const primaryLoc = hikes[0];

        // Marker content now reflects the group, but visually it's the same "Walking Person"
        const markerContent = buildMarkerContent(primaryLoc);

        const marker = new AdvancedMarkerElement({
            map,
            position: { lat: primaryLoc.lat, lng: primaryLoc.lng },
            content: markerContent,
            title: primaryLoc.park || primaryLoc.title,
        });

        // Add click listener
        marker.addListener('click', async () => {

            // Function to handle clicking on a specific hike in the list
            const handleHikeClick = async (hike) => {
                const gpxUrl = getGPXFilename(hike.date);
                if (gpxUrl) {
                    // Clear existing
                    if (currentPolyline) {
                        currentPolyline.setMap(null);
                        currentPolyline = null;
                    }

                    const pathData = await loadGPX(gpxUrl);
                    if (pathData && pathData.length > 0) {
                        currentPolyline = new google.maps.Polyline({
                            path: pathData,
                            geodesic: true,
                            strokeColor: "#1E90FF",
                            strokeOpacity: 0.75,
                            strokeWeight: 4,
                            map: map
                        });
                    }
                }
            };

            // Pass ALL hikes for this location to the info window builder
            // AND pass the click handler
            const content = buildInfoWindowContent(hikes, handleHikeClick);

            // Deactivate previous
            deactivateCurrentMarker();

            // Activate current
            if (marker.element) {
                marker.element.classList.add('marker-active');
                currentActiveMarkerElement = marker.element;
            }

            if (infoWindow.setHeaderContent) {
                // Always use Park Name (with Region) as the main header
                infoWindow.setHeaderContent(primaryLoc.park || "Location");
            }

            infoWindow.setContent(content);
            infoWindow.open({
                anchor: marker,
                map,
            });

            // Automatically load the primary (most recent) hike's path initially
            handleHikeClick(primaryLoc);
        });
    });
}

// Global cache for parsed GPX data
const gpxCache = {};

/**
 * Returns the relative path to the GPX file based on the date string.
 * Formats date to yyyymmdd.gpx
 */
function getGPXFilename(dateString) {
    if (!dateString) return null;

    // Try to parse the date string (e.g. "2/6/2026", "2026-02-06", "Feb 6, 2026")
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        console.warn("Invalid date for GPX filename:", dateString);
        return null;
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `gpx/${yyyy}${mm}${dd}.gpx`;
}

/**
 * Fetches and parses a GPX file.
 * Returns an array of {lat, lng} objects or null.
 */
async function loadGPX(url) {
    if (gpxCache[url]) {
        return gpxCache[url];
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status !== 404) {
                console.warn(`Failed to load GPX: ${url}`, response.status);
            }
            gpxCache[url] = null; // cached failure to avoid retry
            return null;
        }

        const str = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(str, "text/xml");
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        const path = [];
        for (let i = 0; i < trkpts.length; i++) {
            const lat = parseFloat(trkpts[i].getAttribute("lat"));
            const lon = parseFloat(trkpts[i].getAttribute("lon"));
            path.push({ lat, lng: lon });
        }

        gpxCache[url] = path;
        return path;
    } catch (err) {
        console.error("Error parsing GPX:", err);
        gpxCache[url] = null;
        return null;
    }
}

/**
 * Builds the minimal marker showing only distance
 */
function buildMarkerContent(data) {
    const container = document.createElement("div");
    container.className = "custom-marker";

    // Only showing emoji on the marker itself
    container.innerHTML = `
        <div class="marker-content">
            🚶
        </div>
    `;

    return container;
}


/**
 * Builds the HTML for the InfoWindow popup
 * Now accepts an array of hike objects
 */
/**
 * Builds the HTML for the InfoWindow popup
 * Now accepts an array of hike objects and a callback for clicks
 */
function buildInfoWindowContent(data, onHikeClick) {
    // Ensure data is an array
    const hikes = Array.isArray(data) ? data : [data];

    const div = document.createElement('div');
    div.className = 'info-window-content';

    hikes.forEach((hike, index) => {
        // Create container for each hike
        const entryDiv = document.createElement('div');
        entryDiv.className = 'hike-entry';

        // Add separator if not first (managed via CSS or check index)
        if (index > 0) {
            entryDiv.style.borderTop = "1px solid var(--border-color)";
            entryDiv.style.marginTop = "12px";
            entryDiv.style.paddingTop = "12px";
        }

        // Add click listener if callback provided
        if (onHikeClick) {
            entryDiv.style.cursor = "pointer";
            entryDiv.title = "Click to show this hike's path";
            entryDiv.addEventListener('click', (e) => {
                // Prevent bubbling if needed, though for now we want the row clickable
                onHikeClick(hike);

                // Visual feedback - highlight selected
                const allEntries = div.querySelectorAll('.hike-entry');
                allEntries.forEach(el => el.style.backgroundColor = 'transparent');
                entryDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            });
        }

        let html = '';

        // Date is now the primary label for each hike entry
        html += `<div style="font-weight: 700; color: var(--text-color); margin-bottom: 4px;">${hike.date}</div>`;

        // Trail Name (always show if exists)
        if (hike.trail) {
            html += `<div class="info-trail">${hike.trail}</div>`;
        }

        // Stats Grid
        html += `
            <div class="info-stats">
                <div class="info-stat">
                    <strong>Duration:</strong> 
                    <span>${hike.duration}</span>
                </div>
                <div class="info-stat">
                    <strong>Dist:</strong> 
                    <span>${hike.distance}</span>
                </div>
                <div class="info-stat">
                    <strong>Elev:</strong> 
                    <span>${hike.elevation}</span>
                </div>
                <div class="info-stat">
                    <strong>Pace:</strong> 
                    <span>${hike.pace}</span>
                </div>
            </div>
        `;

        entryDiv.innerHTML = html;
        div.appendChild(entryDiv);
    });

    return div;
}

initMap();
