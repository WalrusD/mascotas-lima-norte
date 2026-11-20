import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase } from './supabase.js';
import { categories, districts, validatePet, validatePhoto, validateReport } from './validation.js';

const formatDate = (date) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(date));
const petInitial = { name: '', species: 'Perro', district: 'Los Olivos' };
const reportInitial = { district: 'Los Olivos', category: 'Heces', address: '', description: '', latitude: null, longitude: null };

function MapView({ points }) {
  const container = useRef(null);
  const map = useRef(null);
  useEffect(() => {
    if (!container.current || map.current) return;
    map.current = L.map(container.current).setView([-11.98, -77.07], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
    }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.layerGroup().addTo(map.current);
    points.forEach((point) => {
      // Leaflet escapes no HTML; use text nodes through a DOM element.
      const popup = document.createElement('div');
      popup.textContent = `${point.category} · ${point.district} · ${point.status}`;
      L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#174f50', fillColor: '#f1a84c', fillOpacity: .9 })
        .bindPopup(popup).addTo(layer);
    });
    return () => layer.remove();
  }, [points]);
  return <div ref={container} className="map" role="img" aria-label={`Mapa de Lima Norte con ${points.length} reportes ubicados`} />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [inspectorEmail, setInspectorEmail] = useState('');
  const [inspectorPassword, setInspectorPassword] = useState('');
  const [pet, setPet] = useState(petInitial);
  const [report, setReport] = useState(reportInitial);
  const [photo, setPhoto] = useState(null);
  const [attention, setAttention] = useState({});
  const [pets, setPets] = useState([]);
  const [reports, setReports] = useState([]);
  const [points, setPoints] = useState([]);
  const [filter, setFilter] = useState('Todos');
  const [tab, setTab] = useState('inicio');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const inspector = user?.app_metadata?.role === 'inspector';
  const inspectorDistrict = user?.app_metadata?.district;

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data: publicPoints, error: mapError } = await supabase.rpc('public_report_points');
    if (!mapError) setPoints(publicPoints ?? []);
    if (!user) return;
    const [petResult, reportResult] = await Promise.all([
      supabase.from('pets').select('id,owner_id,name,species,district,created_at').order('created_at', { ascending: false }),
      supabase.from('reports').select('id,district,category,address,description,status,created_at,resolution_note,photo_path,assigned_to,attention_photo_path,resolved_at').order('created_at', { ascending: false })
    ]);
    if (petResult.error || reportResult.error) setNotice('No se pudieron cargar los datos. Recarga la página.');
    else { setPets(petResult.data); setReports(reportResult.data); }
  }, [user]);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getUser().then(({ data }) => { setUser(data.user ?? null); setReady(true); });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => authListener.subscription.unsubscribe();
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function sendLink(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setNotice(error ? error.message : 'Revisa tu correo: enviamos un enlace para ingresar.'); setBusy(false);
  }
  async function signInInspector(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: inspectorEmail.trim(), password: inspectorPassword });
    setInspectorPassword(''); setBusy(false);
    if (error) return setNotice('No se pudo iniciar sesión. Revisa las credenciales.');
    if (data.user?.app_metadata?.role !== 'inspector') {
      await supabase.auth.signOut(); return setNotice('Esta cuenta no tiene permisos de inspector.');
    }
    setTab('panel');
  }
  async function savePet(event) {
    event.preventDefault(); const errorText = validatePet(pet);
    if (errorText) return setNotice(errorText);
    setBusy(true);
    const { error } = await supabase.from('pets').insert({ ...pet, name: pet.name.trim(), owner_id: user.id });
    setBusy(false); setNotice(error ? error.message : 'Mascota registrada correctamente.');
    if (!error) { setPet(petInitial); await refresh(); }
  }
  async function updatePet(item) {
    const name = window.prompt('Nuevo nombre de la mascota', item.name);
    if (name === null) return;
    const errorText = validatePet({ ...item, name }); if (errorText) return setNotice(errorText);
    const { error } = await supabase.from('pets').update({ name: name.trim() }).eq('id', item.id);
    setNotice(error ? error.message : 'Mascota actualizada.'); if (!error) await refresh();
  }
  async function saveReport(event) {
    event.preventDefault();
    const errorText = validateReport(report) || validatePhoto(photo);
    if (errorText) return setNotice(errorText);
    setBusy(true); let path = null;
    if (photo) {
      path = `${user.id}/${crypto.randomUUID()}.${photo.type.split('/')[1] === 'jpeg' ? 'jpg' : photo.type.split('/')[1]}`;
      const { error } = await supabase.storage.from('report-photos').upload(path, photo, { upsert: false });
      if (error) { setBusy(false); return setNotice(`No se pudo subir la foto: ${error.message}`); }
    }
    const { data, error } = await supabase.from('reports').insert({
      ...report, address: report.address.trim(), description: report.description.trim(),
      reporter_id: user.id, photo_path: path
    }).select('id').single();
    setBusy(false);
    if (error) { if (path) await supabase.storage.from('report-photos').remove([path]); return setNotice(`No se pudo registrar el reporte: ${error.message}`); }
    setNotice(`Reporte #${data.id} registrado. Guarda ese código para consultarlo.`);
    setReport(reportInitial); setPhoto(null); event.target.reset(); await refresh();
  }
  async function locate() {
    if (!navigator.geolocation) return setNotice('Tu navegador no admite ubicación. Puedes reportar con la dirección.');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setReport((previous) => ({ ...previous, latitude: coords.latitude, longitude: coords.longitude }));
      setNotice('Ubicación añadida. Confirma que corresponde al punto del reporte.');
    }, () => setNotice('No se obtuvo la ubicación. Puedes indicar la dirección manualmente.'), { enableHighAccuracy: false, timeout: 10000 });
  }
  async function assignReport(item) {
    if (!inspector || (inspectorDistrict && item.district !== inspectorDistrict)) return setNotice('No tienes autorización para asignar este distrito.');
    setBusy(true);
    const { data, error } = await supabase.from('reports').update({ status: 'En atención', assigned_to: user.id })
      .eq('id', item.id).eq('status', 'Pendiente').select('id').maybeSingle();
    setBusy(false); setNotice(error?.message ?? (data ? `Reporte #${item.id} asignado a tu cuenta.` : 'El reporte ya no está pendiente.'));
    if (data) await refresh();
  }
  async function closeReport(item) {
    const { note, file } = attention[item.id] ?? {};
    if (!inspector || item.assigned_to !== user.id) return setNotice('Solo el inspector responsable puede cerrar el reporte.');
    if (!note?.trim()) return setNotice('Escribe una nota de intervención.');
    const validation = validatePhoto(file);
    if (validation) return setNotice(validation);
    if (!file) return setNotice('Adjunta una foto de la atención realizada.');
    setBusy(true);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${user.id}/${item.id}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from('attention-evidence').upload(path, file, { upsert: false });
    if (uploaded.error) { setBusy(false); return setNotice(uploaded.error.message); }
    const { data, error } = await supabase.from('reports').update({ status: 'Resuelto', resolution_note: note.trim(),
      attention_photo_path: path, resolved_at: new Date().toISOString() })
      .eq('id', item.id).eq('status', 'En atención').eq('assigned_to', user.id).select('id').maybeSingle();
    if (error || !data) await supabase.storage.from('attention-evidence').remove([path]);
    setBusy(false); setNotice(error?.message ?? (data ? `Reporte #${item.id} resuelto con evidencia.` : 'El reporte cambió; vuelve a cargar.'));
    if (data) { setAttention((previous) => ({ ...previous, [item.id]: {} })); await refresh(); }
  }
  async function viewEvidence(item) {
    const { data, error } = await supabase.storage.from('attention-evidence').createSignedUrl(item.attention_photo_path, 60);
    if (error) return setNotice(error.message);
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const visiblePoints = filter === 'Todos' ? points : points.filter((point) => point.district === filter);
  return <div className="site">
    <header className="topbar"><a className="brand" href="#inicio" onClick={() => setTab('inicio')}><span className="brand-mark">✳</span> barrio<span>limpio</span></a><nav aria-label="Navegación principal"><button className={tab === 'inicio' ? 'active' : ''} onClick={() => setTab('inicio')}>Inicio</button><button className={tab === 'mapa' ? 'active' : ''} onClick={() => setTab('mapa')}>Mapa de reportes</button>{user && <button className={tab === 'panel' ? 'active' : ''} onClick={() => setTab('panel')}>Mi panel</button>}</nav><div className="account">{user ? <button className="outline" onClick={() => supabase.auth.signOut()}>Salir</button> : <button className="dark" onClick={() => setTab('acceso')}>Ingresar</button>}</div></header>
    {notice && <div role="status" aria-live="polite" className="toast">{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></div>}
    {!supabase && <p className="configuration">Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para activar los formularios.</p>}
    {tab === 'inicio' && <><main className="hero"><div className="hero-copy"><span className="pill">UN PROYECTO PARA LIMA NORTE</span><h1>Una ciudad más limpia empieza <em>en nuestro barrio.</em></h1><p>Registra a tu mascota y reporta puntos que necesitan atención. Pequeñas acciones para caminar por calles más agradables.</p><div className="hero-actions"><button className="primary" onClick={() => setTab(user ? 'panel' : 'acceso')}>Reportar un punto <span aria-hidden="true">↗</span></button><button className="quiet" onClick={() => setTab('mapa')}>Explorar el mapa <span aria-hidden="true">→</span></button></div><div className="trust"><span>01 · Reporta</span><span>02 · Visualiza</span><span>03 · Da seguimiento</span></div></div><div className="hero-art" role="img" aria-label="Ilustración de un vecindario con parque y mascotas"><div className="sun"/><div className="building b1"/><div className="building b2"/><div className="building b3"/><div className="park"><span>🌳</span><span>🐕</span><span>🌿</span></div><div className="art-caption">Nuestro espacio. Nuestra responsabilidad.</div></div></main><section className="steps"><div><span className="eyebrow">CÓMO FUNCIONA</span><h2>Una herramienta sencilla<br/>para cuidar lo que compartimos.</h2></div><div className="step-grid"><article><span>01</span><h3>Registra</h3><p>Guarda los datos básicos de tu mascota y mantén su información al día.</p></article><article><span>02</span><h3>Reporta</h3><p>Indica dónde hay residuos o mascotas sueltas. Añade una foto si la tienes.</p></article><article><span>03</span><h3>Consulta</h3><p>Revisa tus reportes y conoce los puntos marcados en el mapa.</p></article></div></section></>}
    {tab === 'acceso' && <main className="page narrow"><span className="eyebrow">ACCESO SEGURO</span><h1>Bienvenido a tu barrio.</h1><p>Te enviaremos un enlace de acceso. No necesitas recordar una contraseña.</p><form className="card" onSubmit={sendLink}><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"/><button className="primary" disabled={busy || !supabase}>{busy ? 'Enviando…' : 'Enviarme un enlace'}</button></form><form className="card" onSubmit={signInInspector}><h2>Acceso de inspector</h2><label htmlFor="inspector-email">Correo institucional</label><input id="inspector-email" type="email" autoComplete="username" required value={inspectorEmail} onChange={(e) => setInspectorEmail(e.target.value)} /><label htmlFor="inspector-password">Contraseña</label><input id="inspector-password" type="password" autoComplete="current-password" required value={inspectorPassword} onChange={(e) => setInspectorPassword(e.target.value)} /><button className="primary" disabled={busy || !supabase}>Ingresar como inspector</button></form></main>}
    {tab === 'mapa' && <main className="page"><span className="eyebrow">OBSERVATORIO CIUDADANO</span><h1>Mapa de puntos reportados.</h1><p>Se muestran ubicaciones aproximadas de reportes con coordenadas; no se publican datos de quienes reportaron.</p><label htmlFor="district-filter">Filtrar por distrito</label><select id="district-filter" className="filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option>Todos</option>{districts.map((district) => <option key={district}>{district}</option>)}</select><MapView points={visiblePoints}/><p className="muted">{visiblePoints.length} puntos visibles. Los reportes sin coordenadas siguen disponibles en el panel de su autor.</p></main>}
    {tab === 'panel' && <main className="page"><span className="eyebrow">{inspector ? 'GESTIÓN MUNICIPAL' : 'TU ESPACIO'}</span><h1>{inspector ? 'Atención de reportes.' : 'Cuidemos Lima Norte.'}</h1>{!ready ? <p>Cargando…</p> : !user ? <div className="card"><p>Inicia sesión para registrar mascotas y reportar incidencias.</p><button className="primary" onClick={() => setTab('acceso')}>Ingresar</button></div> : <><div className="panel-grid"><section className="card"><div className="card-heading"><span className="eyebrow">TENENCIA RESPONSABLE</span><h2>Mis mascotas</h2></div><form onSubmit={savePet}><label htmlFor="pet-name">Nombre</label><input id="pet-name" required maxLength="80" value={pet.name} onChange={(e) => setPet({ ...pet, name: e.target.value })}/><label htmlFor="species">Especie</label><select id="species" value={pet.species} onChange={(e) => setPet({ ...pet, species: e.target.value })}><option>Perro</option><option>Gato</option><option>Otro</option></select><label htmlFor="pet-district">Distrito</label><select id="pet-district" value={pet.district} onChange={(e) => setPet({ ...pet, district: e.target.value })}>{districts.map((d) => <option key={d}>{d}</option>)}</select><button className="primary" disabled={busy}>Registrar mascota</button></form><ul className="entries">{pets.filter((item) => item.owner_id === user.id).map((item) => <li key={item.id}><div><strong>{item.name}</strong><small>{item.species} · {item.district}</small></div><button className="text-button" onClick={() => updatePet(item)}>Editar</button></li>)}</ul></section><section className="card"><div className="card-heading"><span className="eyebrow">REPORTE CIUDADANO</span><h2>Nuevo reporte</h2></div><form onSubmit={saveReport}><label htmlFor="district">Distrito</label><select id="district" value={report.district} onChange={(e) => setReport({ ...report, district: e.target.value })}>{districts.map((d) => <option key={d}>{d}</option>)}</select><label htmlFor="category">¿Qué ocurre?</label><select id="category" value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select><label htmlFor="address">Dirección o referencia</label><input id="address" required minLength="3" maxLength="200" placeholder="Ej.: Parque frente a la avenida…" value={report.address} onChange={(e) => setReport({ ...report, address: e.target.value })}/><button type="button" className="outline" onClick={locate}>Usar mi ubicación (opcional)</button>{report.latitude && <small>Ubicación registrada: {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}</small>}<label htmlFor="description">Descripción</label><textarea id="description" required minLength="5" maxLength="1000" rows="3" value={report.description} onChange={(e) => setReport({ ...report, description: e.target.value })}/><label htmlFor="photo">Foto opcional (JPG, PNG o WebP; máximo 5 MB)</label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}/><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Enviar reporte'}</button></form></section></div><section className="card history"><div className="card-heading"><span className="eyebrow">SEGUIMIENTO</span><h2>{inspector ? 'Reportes de Lima Norte' : 'Mis reportes'}</h2></div>{(inspector && inspectorDistrict ? reports.filter((item) => item.district === inspectorDistrict) : reports).length ? <ul className="entries">{(inspector && inspectorDistrict ? reports.filter((entry) => entry.district === inspectorDistrict) : reports).map((item) => <li key={item.id}><div><strong>#{item.id} · {item.category}</strong><small>{item.address} · {item.district} · {formatDate(item.created_at)}</small>{item.resolution_note && <small>Atención: {item.resolution_note}</small>}{inspector && item.assigned_to && <small>Responsable: {item.assigned_to === user.id ? 'Tú' : item.assigned_to}</small>}{item.resolved_at && <small>Cierre: {formatDate(item.resolved_at)}</small>}</div><div className="report-actions"><span className={`status ${item.status === 'Resuelto' ? 'resolved' : ''}`}>{item.status}</span>{inspector && item.status === 'Pendiente' && <button className="text-button" disabled={busy} onClick={() => assignReport(item)}>Asignarme reporte</button>}{inspector && item.status === 'En atención' && item.assigned_to === user.id && <div className="attention-form"><label htmlFor={`note-${item.id}`}>Nota de intervención</label><textarea id={`note-${item.id}`} value={attention[item.id]?.note ?? ''} onChange={(e) => setAttention((previous) => ({ ...previous, [item.id]: { ...previous[item.id], note: e.target.value } }))} /><label htmlFor={`evidence-${item.id}`}>Foto de la atención</label><input id={`evidence-${item.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAttention((previous) => ({ ...previous, [item.id]: { ...previous[item.id], file: e.target.files?.[0] } }))} /><button className="text-button" disabled={busy} onClick={() => closeReport(item)}>Resolver con evidencia</button></div>}{inspector && item.attention_photo_path && <button className="text-button" onClick={() => viewEvidence(item)}>Ver evidencia</button>}</div></li>)}</ul> : <p className="muted">Todavía no hay reportes para mostrar.</p>}</section></>}</main>}
    <footer><strong>barrio<span>limpio</span></strong><span>Una iniciativa para Lima Norte · Los Olivos · Comas · SMP · Independencia</span></footer>
  </div>;
}
