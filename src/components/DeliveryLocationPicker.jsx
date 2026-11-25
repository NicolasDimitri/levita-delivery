import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApi } from '../lib/useApi';
import { Button, ErrorMsg } from '../lib/ui';

export default function DeliveryLocationPicker({ address, city, state, onSelect }) {
  const { call } = useApi();
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = L.map(mapElement.current).setView([-7.224483, -35.868339], 13);
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on('click', (event) => {
      const { lat, lng } = event.latlng;
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.circleMarker([lat, lng], { radius: 8 }).addTo(map);
      onSelectRef.current({ latitude: lat, longitude: lng });
    });
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  async function search() {
    setError('');
    setLoading(true);
    try {
      const query = [address.trim(), city, state].filter(Boolean).join(', ');
      const data = await call('/api/ifood/store-hours-status?geocode=1', { body: { address: query } });
      setResults(data.results);
      if (!data.results.length) setError('Nenhum resultado encontrado. Ajuste a busca ou selecione o ponto no mapa.');
    } catch (e) {
      setResults([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function choose(result) {
    const point = [result.latitude, result.longitude];
    if (markerRef.current) markerRef.current.setLatLng(point);
    else markerRef.current = L.circleMarker(point, { radius: 8 }).addTo(mapRef.current);
    mapRef.current.setView(point, 17);
    onSelect({ latitude: result.latitude, longitude: result.longitude });
    setResults([]);
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={search} disabled={loading || !address.trim()}>
        {loading ? 'Buscando...' : 'Buscar endereço no mapa'}
      </Button>
      <ErrorMsg message={error} />
      {results.map((result, index) => (
        <button key={`${result.latitude}-${result.longitude}-${index}`} type="button"
          className="block w-full rounded-lg bg-white p-2 text-left text-xs text-gray-800"
          onClick={() => choose(result)}>{result.label}</button>
      ))}
      <p className="text-xs text-amber-800">Confira o resultado e clique no mapa para ajustar o ponto exato da entrega.</p>
      <div ref={mapElement} className="h-64 w-full rounded-lg" aria-label="Mapa para selecionar o destino" />
    </div>
  );
}
