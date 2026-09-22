(() => {
  'use strict';

  const workshop = {
    name: 'Curtin 137 St Georges Terrace',
    address: 'Curtin 137 St Georges Terrace, Perth WA 6000, Australia',
    lng: 115.85483,
    lat: -31.95441
  };

  const hotels = {
    holiday: {
      name: 'Holiday Inn Perth City Centre by IHG',
      shortName: 'Holiday Inn',
      marker: 'H',
      address: '778–788 Hay Street, Perth WA 6000',
      mapsAddress: 'Holiday Inn Perth City Centre by IHG, 778-788 Hay Street, Perth WA 6000, Australia',
      lng: 115.85598,
      lat: -31.95290,
      transitTime: '≈ 5–12 min*'
    },
    adina: {
      name: 'Adina Apartment Hotel Perth',
      shortName: 'Adina',
      marker: 'A',
      address: '33 Mounts Bay Road, Perth WA 6000',
      mapsAddress: 'Adina Apartment Hotel Perth, 33 Mounts Bay Road, Perth WA 6000, Australia',
      lng: 115.8528696,
      lat: -31.9557206,
      transitTime: '≈ 5–12 min*'
    },
    parmelia: {
      name: 'Parmelia Hilton Perth',
      shortName: 'Parmelia Hilton',
      marker: 'P',
      address: '14 Mill Street, Perth WA 6000',
      mapsAddress: 'Parmelia Hilton Perth, 14 Mill Street, Perth WA 6000, Australia',
      lng: 115.85284,
      lat: -31.954459,
      transitTime: '≈ 5–12 min*'
    },
    ibis: {
      name: 'Ibis Perth',
      shortName: 'Ibis Perth',
      marker: 'I',
      address: '334 Murray Street, Perth WA 6000',
      mapsAddress: 'Ibis Perth, 334 Murray Street, Perth WA 6000, Australia',
      lng: 115.85576,
      lat: -31.95168,
      transitTime: '≈ 5–12 min*'
    }
  };

  const defaultOrder = ['holiday', 'adina', 'ibis', 'parmelia'];
  const routeCache = new Map();
  const markerAnchors = {};
  let selectedHotelKey = 'holiday';
  let selectedTravelMode = 'walking';
  let selectedSortMode = '';
  let activeInfoTrigger = null;
  let offerPopoverPinned = false;
  let offerHideTimer = null;
  const offerPopover = document.createElement('div');
  offerPopover.className = 'offer-floating-popover';
  offerPopover.setAttribute('role', 'tooltip');
  document.body.appendChild(offerPopover);
  let map = null;
  let mapViewMode = 'selected';
  let currentRouteFeature = null;
  let routeRequestSerial = 0;
  let sortRequestSerial = 0;
  let scrollZoomActive = false;
  let scrollStateTimer = null;

  const cardsContainer = document.getElementById('recommended-hotels');
  const routeTabs = document.querySelector('.hotel-route-tabs');
  const sortStatus = document.querySelector('[data-sort-status]');
  const travelName = document.getElementById('travel-hotel-name');
  const travelAddress = document.getElementById('travel-address');
  const travelDistance = document.getElementById('travel-distance');
  const travelTime = document.getElementById('travel-time');
  const travelDistanceLabel = document.getElementById('travel-distance-label');
  const travelTimeLabel = document.getElementById('travel-time-label');
  const walkingTime = document.getElementById('mode-walking-time');
  const drivingTime = document.getElementById('mode-driving-time');
  const transitTime = document.getElementById('mode-transit-time');
  const modeDetail = document.getElementById('mode-detail');
  const googleRouteLink = document.getElementById('google-route-link');
  const routeStatus = document.getElementById('route-status');
  const mapHelpButton = document.getElementById('map-help-button');
  const mapHelpPanel = document.getElementById('map-help-panel');
  const mapViewButton = document.getElementById('map-view-button');
  const mapScrollState = document.getElementById('map-scroll-state');

  if (!cardsContainer || !routeTabs) return;

  const toRad = (value) => value * Math.PI / 180;

  function haversineKm(a, b) {
    const radius = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  function directMetres(hotel) {
    return haversineKm({ lng: hotel.lng, lat: hotel.lat }, { lng: workshop.lng, lat: workshop.lat }) * 1000;
  }

  function fallbackDistanceMetres(hotel, mode) {
    const factor = mode === 'driving' ? 1.55 : mode === 'walking' ? 1.35 : 1;
    return directMetres(hotel) * factor;
  }

  function fallbackDurationSeconds(hotel, mode) {
    const distanceKm = fallbackDistanceMetres(hotel, mode) / 1000;
    const speed = mode === 'driving' ? 18 : 4.6;
    return Math.max(180, Math.ceil(distanceKm / speed * 3600));
  }

  function formatDistance(metres) {
    if (!Number.isFinite(metres)) return '—';
    if (metres < 1000) return `${Math.max(1, Math.round(metres / 10) * 10)} m`;
    return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    return `≈ ${Math.max(1, Math.round(seconds / 60))} min`;
  }

  function googleDirectionsUrl(hotel, mode) {
    const params = new URLSearchParams({
      api: '1',
      origin: hotel.mapsAddress,
      destination: workshop.address,
      travelmode: mode,
      dir_action: 'navigate'
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  function routeProfile(mode) {
    if (mode === 'walking') return 'routed-foot';
    if (mode === 'driving') return 'routed-car';
    return null;
  }

  function exactRouteFeature(hotel, coordinates) {
    const cleaned = Array.isArray(coordinates) ? coordinates.slice() : [];
    cleaned.unshift([hotel.lng, hotel.lat]);
    cleaned.push([workshop.lng, workshop.lat]);
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: cleaned }
    };
  }

  async function fetchRoadRoute(hotelKey, mode) {
    const profile = routeProfile(mode);
    if (!profile) return null;
    const cacheKey = `${hotelKey}:${mode}`;
    if (routeCache.has(cacheKey)) return routeCache.get(cacheKey);

    const hotel = hotels[hotelKey];
    const url = `https://routing.openstreetmap.de/${profile}/route/v1/driving/${hotel.lng},${hotel.lat};${workshop.lng},${workshop.lat}?overview=full&geometries=geojson&steps=false`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors', signal: controller.signal });
      if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
      const data = await response.json();
      const candidate = data?.routes?.[0];
      if (data.code !== 'Ok' || !candidate?.geometry?.coordinates) throw new Error('No usable route returned');
      const route = {
        feature: exactRouteFeature(hotel, candidate.geometry.coordinates),
        distance: candidate.distance,
        duration: candidate.duration
      };
      routeCache.set(cacheKey, route);
      return route;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function positionOfferPopover(trigger) {
    const rect = trigger.getBoundingClientRect();
    const gap = 9;
    const margin = 12;
    offerPopover.style.left = '0px';
    offerPopover.style.top = '0px';
    offerPopover.classList.add('show');
    const popRect = offerPopover.getBoundingClientRect();
    let left = rect.left + (rect.width / 2) - (popRect.width / 2);
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    let top = rect.top - popRect.height - gap;
    if (top < margin) top = rect.bottom + gap;
    if (top + popRect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - popRect.height - margin);
    }
    offerPopover.style.left = `${Math.round(left)}px`;
    offerPopover.style.top = `${Math.round(top)}px`;
  }

  function showOfferPopover(trigger, pin = false) {
    window.clearTimeout(offerHideTimer);
    const source = document.getElementById(trigger.dataset.infoSource || '');
    if (!source) return;
    if (activeInfoTrigger && activeInfoTrigger !== trigger) {
      activeInfoTrigger.setAttribute('aria-expanded', 'false');
    }
    offerPopover.innerHTML = source.innerHTML;
    activeInfoTrigger = trigger;
    offerPopoverPinned = pin;
    trigger.setAttribute('aria-expanded', 'true');
    positionOfferPopover(trigger);
  }

  function hideOfferPopover(immediate = false, force = false) {
    window.clearTimeout(offerHideTimer);
    if (offerPopoverPinned && !force) return;
    const close = () => {
      offerPopover.classList.remove('show');
      if (activeInfoTrigger) activeInfoTrigger.setAttribute('aria-expanded', 'false');
      activeInfoTrigger = null;
      offerPopoverPinned = false;
    };
    if (immediate) close();
    else offerHideTimer = window.setTimeout(close, 120);
  }

  function resetHotelSort() {
    selectedSortMode = '';
    sortRequestSerial += 1;
    document.querySelectorAll('[data-sort-mode]').forEach((button) => button.classList.remove('active'));
    reorderHotelElements('recommended');
    if (sortStatus) sortStatus.textContent = '';
  }

  function metricForHotel(key, mode) {
    if (mode === 'recommended') return defaultOrder.indexOf(key);
    if (mode === 'transit') return directMetres(hotels[key]);
    const cached = routeCache.get(`${key}:${mode}`);
    return cached?.distance ?? fallbackDistanceMetres(hotels[key], mode);
  }

  function metricLabel(key, mode) {
    if (mode === 'recommended') return '';
    return formatDistance(metricForHotel(key, mode));
  }

  function reorderHotelElements(mode) {
    const order = [...defaultOrder].sort((a, b) => metricForHotel(a, mode) - metricForHotel(b, mode));
    order.forEach((key) => {
      const card = cardsContainer.querySelector(`[data-hotel-card="${key}"]`);
      if (card) cardsContainer.appendChild(card);
      const tab = routeTabs.querySelector(`[data-hotel="${key}"]`);
      if (tab) routeTabs.appendChild(tab);
    });

    document.querySelectorAll('[data-hotel-metric]').forEach((badge) => {
      const key = badge.dataset.hotelMetric;
      if (mode === 'recommended') {
        badge.hidden = true;
        badge.textContent = '';
      } else {
        badge.hidden = false;
        badge.textContent = metricLabel(key, mode);
      }
    });

    window.dispatchEvent(new Event('anshm:layoutchange'));
  }

  async function applySort(mode) {
    if (!['walking', 'driving', 'transit'].includes(mode)) return;
    if (selectedSortMode === mode) {
      resetHotelSort();
      return;
    }
    selectedSortMode = mode;
    const serial = ++sortRequestSerial;

    document.querySelectorAll('[data-sort-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.sortMode === mode);
    });

    if (mode === 'transit') {
      if (sortStatus) sortStatus.textContent = 'Sorted by proximity for public transport';
      reorderHotelElements(mode);
      return;
    }

    if (sortStatus) sortStatus.textContent = `Sorting by ${mode} distance…`;
    reorderHotelElements(mode);

    const results = await Promise.allSettled(defaultOrder.map((key) => fetchRoadRoute(key, mode)));
    if (serial !== sortRequestSerial || selectedSortMode !== mode) return;
    reorderHotelElements(mode);
    const liveCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    if (sortStatus) sortStatus.textContent = liveCount ? `Sorted by ${mode} route distance` : `Sorted by approximate ${mode} distance`;
  }

  function setRouteStatus(message, state = 'loading') {
    if (!routeStatus) return;
    routeStatus.textContent = message;
    routeStatus.dataset.state = state;
  }

  function setHelpOpen(open) {
    if (!mapHelpPanel || !mapHelpButton) return;
    mapHelpPanel.hidden = !open;
    mapHelpButton.setAttribute('aria-expanded', String(open));
  }

  function showScrollState() {
    if (!mapScrollState) return;
    mapScrollState.classList.add('show');
    window.clearTimeout(scrollStateTimer);
    scrollStateTimer = window.setTimeout(() => mapScrollState.classList.remove('show'), 1800);
  }

  function enableWheelZoom() {
    if (!map || scrollZoomActive) return;
    map.scrollZoom.enable();
    scrollZoomActive = true;
    showScrollState();
  }

  function disableWheelZoom() {
    if (!map || !scrollZoomActive) return;
    map.scrollZoom.disable();
    scrollZoomActive = false;
    mapScrollState?.classList.remove('show');
  }

  function emptyLine() {
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
  }

  function directConnector(hotel) {
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[hotel.lng, hotel.lat], [workshop.lng, workshop.lat]] }
    };
  }

  function setSourceData(sourceId, data) {
    const source = map?.getSource(sourceId);
    if (source) source.setData(data);
  }

  function setLayerVisible(layerId, visible) {
    if (!map?.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  function showFallbackDirection(hotel, message) {
    currentRouteFeature = directConnector(hotel);
    setSourceData('selected-route', emptyLine());
    setSourceData('fallback-direction', currentRouteFeature);
    setLayerVisible('route-casing', false);
    setLayerVisible('route-line', false);
    setLayerVisible('fallback-line', true);
    setLayerVisible('fallback-arrows', true);
    setRouteStatus(message, 'fallback');
  }

  function showRealRoute(feature, mode) {
    currentRouteFeature = feature;
    setSourceData('fallback-direction', emptyLine());
    setSourceData('selected-route', feature);
    setLayerVisible('fallback-line', false);
    setLayerVisible('fallback-arrows', false);
    setLayerVisible('route-casing', true);
    setLayerVisible('route-line', true);
    setRouteStatus(mode === 'walking' ? 'Walking route' : 'Driving route', 'ready');
  }

  function fitSelectedRoute(animated = true) {
    if (!map || typeof maplibregl === 'undefined') return;
    const hotel = hotels[selectedHotelKey];
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([hotel.lng, hotel.lat]);
    bounds.extend([workshop.lng, workshop.lat]);
    currentRouteFeature?.geometry?.coordinates?.forEach((coord) => bounds.extend(coord));
    mapViewMode = 'selected';
    if (mapViewButton) mapViewButton.textContent = 'Show all hotels';
    map.fitBounds(bounds, {
      padding: { top: 84, bottom: 76, left: 72, right: 72 },
      maxZoom: 17.4,
      duration: animated ? 520 : 0
    });
    updateMarkerStates();
  }

  function fitAllHotels(animated = true) {
    if (!map || typeof maplibregl === 'undefined') return;
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([workshop.lng, workshop.lat]);
    Object.values(hotels).forEach((hotel) => bounds.extend([hotel.lng, hotel.lat]));
    mapViewMode = 'all';
    if (mapViewButton) mapViewButton.textContent = 'Show selected route';
    map.fitBounds(bounds, {
      padding: { top: 78, bottom: 74, left: 64, right: 64 },
      maxZoom: 15.8,
      duration: animated ? 520 : 0
    });
    updateMarkerStates();
  }

  function toggleMapView() {
    setHelpOpen(false);
    if (mapViewMode === 'selected') fitAllHotels(true);
    else fitSelectedRoute(true);
  }

  function updateMarkerStates() {
    Object.entries(markerAnchors).forEach(([key, anchor]) => {
      anchor.classList.toggle('active', key === selectedHotelKey);
      anchor.classList.toggle('dimmed', mapViewMode === 'selected' && key !== selectedHotelKey);
    });
  }

  function updateMarkerZoomState() {
    if (!map) return;
    const low = map.getZoom() < 14.5;
    Object.values(markerAnchors).forEach((anchor) => anchor.classList.toggle('low-zoom', low));
  }

  function updateGoogleLink() {
    if (!googleRouteLink) return;
    const hotel = hotels[selectedHotelKey];
    googleRouteLink.href = googleDirectionsUrl(hotel, selectedTravelMode);
    const labels = { walking: 'walking', driving: 'driving', transit: 'public transport' };
    const label = googleRouteLink.querySelector('span:first-child');
    if (label) label.textContent = `Open ${labels[selectedTravelMode]} route in Google Maps`;
  }

  function setModeButtons() {
    document.querySelectorAll('.transport-mode').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === selectedTravelMode);
    });
  }

  function setHotelTabs() {
    document.querySelectorAll('.hotel-route-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.hotel === selectedHotelKey);
    });
  }

  function setFallbackStats(mode) {
    const hotel = hotels[selectedHotelKey];
    if (mode === 'walking') {
      travelDistanceLabel.textContent = 'Approx. walking distance';
      travelTimeLabel.textContent = 'Approx. time';
      travelDistance.textContent = formatDistance(fallbackDistanceMetres(hotel, 'walking'));
      travelTime.textContent = formatDuration(fallbackDurationSeconds(hotel, 'walking'));
      walkingTime.textContent = formatDuration(fallbackDurationSeconds(hotel, 'walking'));
      modeDetail.textContent = 'Walking is shown by default. If route geometry is unavailable, the map uses a subtle directional guide.';
    } else if (mode === 'driving') {
      travelDistanceLabel.textContent = 'Approx. driving distance';
      travelTimeLabel.textContent = 'Approx. time';
      travelDistance.textContent = formatDistance(fallbackDistanceMetres(hotel, 'driving'));
      travelTime.textContent = formatDuration(fallbackDurationSeconds(hotel, 'driving'));
      drivingTime.textContent = formatDuration(fallbackDurationSeconds(hotel, 'driving'));
      modeDetail.textContent = 'Driving time is non-live and may vary with CBD traffic, one-way streets and parking access.';
    } else {
      travelDistanceLabel.textContent = 'Direct distance';
      travelTimeLabel.textContent = 'Indicative transit';
      travelDistance.textContent = formatDistance(directMetres(hotel));
      travelTime.textContent = hotel.transitTime;
      transitTime.textContent = hotel.transitTime;
      modeDetail.textContent = 'Public transport varies by departure time. Use Google Maps or Transperth JourneyPlanner for the current service and stop details.';
    }
  }

  async function renderSelectedMode() {
    const hotel = hotels[selectedHotelKey];
    const requestId = ++routeRequestSerial;
    setFallbackStats(selectedTravelMode);
    updateGoogleLink();

    if (!map || !map.isStyleLoaded()) return;

    if (selectedTravelMode === 'transit') {
      showFallbackDirection(hotel, 'Public transport: open live planner for route details');
      fitSelectedRoute(true);
      return;
    }

    showFallbackDirection(hotel, selectedTravelMode === 'walking' ? 'Loading walking route…' : 'Loading driving route…');

    try {
      const route = await fetchRoadRoute(selectedHotelKey, selectedTravelMode);
      if (requestId !== routeRequestSerial || !route) return;
      showRealRoute(route.feature, selectedTravelMode);
      travelDistanceLabel.textContent = selectedTravelMode === 'walking' ? 'Walking distance' : 'Driving distance';
      travelTimeLabel.textContent = 'Approx. time';
      travelDistance.textContent = formatDistance(route.distance);
      travelTime.textContent = formatDuration(route.duration);
      if (selectedTravelMode === 'walking') {
        walkingTime.textContent = formatDuration(route.duration);
        modeDetail.textContent = 'Walking route based on OpenStreetMap foot-routing data. Open Google Maps for detailed navigation.';
      } else {
        drivingTime.textContent = formatDuration(route.duration);
        modeDetail.textContent = 'Driving route based on non-live OpenStreetMap road-routing data. Open Google Maps for traffic-aware navigation.';
      }
      fitSelectedRoute(true);
      if (selectedSortMode === selectedTravelMode) reorderHotelElements(selectedSortMode);
    } catch (error) {
      if (requestId !== routeRequestSerial) return;
      const label = selectedTravelMode === 'walking'
        ? 'Walking route unavailable — approximate direction shown'
        : 'Driving route unavailable — approximate direction shown';
      showFallbackDirection(hotel, label);
      fitSelectedRoute(true);
    }
  }

  function selectHotel(key) {
    if (!hotels[key]) return;
    selectedHotelKey = key;
    mapViewMode = 'selected';
    travelName.textContent = hotels[key].name;
    travelAddress.textContent = hotels[key].address;
    setHotelTabs();
    updateMarkerStates();
    renderSelectedMode();
  }

  function selectTravelMode(mode) {
    if (!['walking', 'driving', 'transit'].includes(mode)) return;
    selectedTravelMode = mode;
    setModeButtons();
    renderSelectedMode();
  }

  function createHotelMarker(key, hotel) {
    const anchor = document.createElement('div');
    anchor.className = 'map-marker-anchor';
    anchor.dataset.hotel = key;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-marker-dot';
    button.setAttribute('aria-label', `Select ${hotel.name}`);

    const marker = document.createElement('span');
    marker.textContent = hotel.marker;
    const label = document.createElement('span');
    label.className = 'map-marker-label';
    label.textContent = hotel.shortName;
    button.append(marker, label);

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setHelpOpen(false);
      selectHotel(key);
    });

    anchor.appendChild(button);
    markerAnchors[key] = anchor;
    new maplibregl.Marker({ element: anchor, anchor: 'center' })
      .setLngLat([hotel.lng, hotel.lat])
      .addTo(map);
  }

  function createWorkshopMarker() {
    const anchor = document.createElement('div');
    anchor.className = 'map-venue-anchor';
    const dot = document.createElement('div');
    dot.className = 'map-venue-dot';
    dot.setAttribute('aria-label', 'Workshop venue');
    const star = document.createElement('span');
    star.setAttribute('aria-hidden', 'true');
    star.textContent = '★';
    const label = document.createElement('span');
    label.className = 'map-venue-label';
    label.textContent = 'Workshop venue';
    dot.append(star, label);
    anchor.appendChild(dot);
    new maplibregl.Marker({ element: anchor, anchor: 'center' })
      .setLngLat([workshop.lng, workshop.lat])
      .addTo(map);
  }

  function hide3DLayers() {
    const style = map?.getStyle();
    if (!style?.layers) return;
    style.layers.forEach((layer) => {
      if (layer.type === 'fill-extrusion') {
        try {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        } catch (error) {
          return;
        }
      }
    });
  }

  function addRouteLayers() {
    map.addSource('selected-route', { type: 'geojson', data: emptyLine() });
    map.addSource('fallback-direction', { type: 'geojson', data: emptyLine() });

    map.addLayer({
      id: 'fallback-line',
      type: 'line',
      source: 'fallback-direction',
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#555555', 'line-width': 2, 'line-opacity': 0.30, 'line-dasharray': [2, 3] }
    });

    map.addLayer({
      id: 'fallback-arrows',
      type: 'symbol',
      source: 'fallback-direction',
      layout: {
        visibility: 'none',
        'symbol-placement': 'line',
        'symbol-spacing': 52,
        'text-field': '›',
        'text-size': 17,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-rotation-alignment': 'map',
        'text-keep-upright': false
      },
      paint: { 'text-color': '#555555', 'text-opacity': 0.42 }
    });

    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'selected-route',
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#111111', 'line-width': 6, 'line-opacity': 0.83 }
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'selected-route',
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffd54f', 'line-width': 3.3, 'line-opacity': 1 }
    });
  }

  function initMapInteractions() {
    const canvas = map.getCanvasContainer();
    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate?.disableRotation?.();

    canvas.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('.maplibregl-ctrl')) return;
      enableWheelZoom();
      setHelpOpen(false);
    });

    canvas.addEventListener('mouseleave', disableWheelZoom);
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      toggleMapView();
    });
    map.on('dragstart', () => setHelpOpen(false));
    map.on('zoomstart', () => setHelpOpen(false));
    map.on('zoom', updateMarkerZoomState);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
        disableWheelZoom();
      }
    });
  }

  function initTravelMap() {
    const mapContainer = document.getElementById('travel-map');
    const fallback = document.getElementById('travel-map-fallback');
    if (!mapContainer || !fallback) return;

    if (typeof maplibregl === 'undefined') {
      mapContainer.style.display = 'none';
      fallback.classList.add('show');
      setFallbackStats(selectedTravelMode);
      return;
    }

    try {
      map = new maplibregl.Map({
        container: 'travel-map',
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [115.85455, -31.95375],
        zoom: 15.6,
        pitch: 0,
        bearing: 0,
        minPitch: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: true
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true, visualizePitch: false }), 'bottom-right');
      createWorkshopMarker();
      Object.entries(hotels).forEach(([key, hotel]) => createHotelMarker(key, hotel));
      initMapInteractions();

      map.on('load', () => {
        hide3DLayers();
        addRouteLayers();
        updateMarkerZoomState();
        updateMarkerStates();
        renderSelectedMode();
      });

      map.on('styledata', hide3DLayers);
      map.on('error', () => {});
    } catch (error) {
      mapContainer.style.display = 'none';
      fallback.classList.add('show');
      setFallbackStats(selectedTravelMode);
    }
  }

  document.querySelectorAll('.info-trigger[data-info-source]').forEach((trigger) => {
    trigger.addEventListener('mouseenter', () => {
      if (!offerPopoverPinned || activeInfoTrigger === trigger) showOfferPopover(trigger, offerPopoverPinned && activeInfoTrigger === trigger);
    });
    trigger.addEventListener('mouseleave', () => hideOfferPopover());
    trigger.addEventListener('focus', () => {
      if (!offerPopoverPinned || activeInfoTrigger === trigger) showOfferPopover(trigger, offerPopoverPinned && activeInfoTrigger === trigger);
    });
    trigger.addEventListener('blur', () => hideOfferPopover());
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (offerPopoverPinned && activeInfoTrigger === trigger && offerPopover.classList.contains('show')) {
        hideOfferPopover(true, true);
      } else {
        showOfferPopover(trigger, true);
      }
    });
  });

  offerPopover.addEventListener('mouseenter', () => window.clearTimeout(offerHideTimer));
  offerPopover.addEventListener('mouseleave', () => hideOfferPopover());
  document.addEventListener('click', (event) => {
    if (activeInfoTrigger && !offerPopover.contains(event.target) && !activeInfoTrigger.contains(event.target)) {
      hideOfferPopover(true, true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideOfferPopover(true, true);
  });
  window.addEventListener('resize', () => {
    if (activeInfoTrigger && offerPopover.classList.contains('show')) positionOfferPopover(activeInfoTrigger);
  });
  window.addEventListener('scroll', () => {
    if (activeInfoTrigger && offerPopover.classList.contains('show')) positionOfferPopover(activeInfoTrigger);
  }, { passive: true });

  mapHelpButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setHelpOpen(mapHelpPanel.hidden);
  });

  mapViewButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleMapView();
  });

  document.querySelectorAll('.hotel-route-tab').forEach((button) => {
    button.addEventListener('click', () => {
      setHelpOpen(false);
      selectHotel(button.dataset.hotel);
    });
  });

  document.querySelectorAll('.transport-mode').forEach((button) => {
    button.addEventListener('click', () => {
      setHelpOpen(false);
      selectTravelMode(button.dataset.mode);
    });
  });

  document.querySelectorAll('[data-sort-mode]').forEach((button) => {
    button.addEventListener('click', () => applySort(button.dataset.sortMode));
  });

  setHotelTabs();
  setModeButtons();
  updateGoogleLink();
  setFallbackStats(selectedTravelMode);
  reorderHotelElements('recommended');
  initTravelMap();
})();
