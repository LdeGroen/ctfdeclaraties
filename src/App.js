import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from 'ctf-ui/api';
import { AppShell, FormField, SubmitButton, StatusMessage } from 'ctf-ui/components';

const TOKEN_KEY = 'ctf_declaraties_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const auth = () => ({ Accept: 'application/json', Authorization: `Bearer ${getToken()}` });
const euro = (n) => Number(n).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const fmtDatum = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';

const STATUS_LABEL = {
    ingediend: ['In behandeling', 'text-amber-700 bg-amber-100'],
    goedgekeurd: ['Goedgekeurd', 'text-green-700 bg-green-100'],
    uitbetaald: ['Uitbetaald', 'text-blue-700 bg-blue-100'],
    afgewezen: ['Afgewezen', 'text-red-700 bg-red-100'],
};

const LEEG = { soort: 'declaratie', bedrag: '', omschrijving: '', datum: '', iban: '', iban_naam: '', bon_url: '' };

function App() {
    const [token, setToken] = useState(getToken());
    const [me, setMe] = useState(null);           // {name, email}
    const [prefill, setPrefill] = useState({});
    const [declaraties, setDeclaraties] = useState([]);
    const [form, setForm] = useState(LEEG);
    const [status, setStatus] = useState('idle');  // idle | submitting | success
    const [uploading, setUploading] = useState(false);
    const [foutmelding, setFoutmelding] = useState(null);
    const [authFout, setAuthFout] = useState(null);

    // Token / auth_error uit de OAuth-redirect halen en de URL opschonen.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('token');
        const err = params.get('auth_error');
        if (t) {
            localStorage.setItem(TOKEN_KEY, t);
            setToken(t);
            window.history.replaceState({}, '', window.location.pathname);
        } else if (err) {
            setAuthFout(err);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const login = () => {
        const returnTo = encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = `${API_URL}/auth/google?return_to=${returnTo}`;
    };
    const logout = () => { localStorage.removeItem(TOKEN_KEY); setToken(null); setMe(null); };

    const laad = useCallback(async () => {
        if (!token) return;
        try {
            const [meRes, mijnRes] = await Promise.all([
                fetch(`${API_URL}/api/me`, { headers: auth() }),
                fetch(`${API_URL}/api/declaraties/mine`, { headers: auth() }),
            ]);
            if (meRes.status === 401 || mijnRes.status === 401) { logout(); return; }
            const meJson = await meRes.json();
            // Alleen @cafetheaterfestival.nl-medewerkers.
            if (!String(meJson.email || '').endsWith('@cafetheaterfestival.nl')) {
                setAuthFout('Log in met je @cafetheaterfestival.nl-account.');
                logout();
                return;
            }
            setMe(meJson);
            const mijn = await mijnRes.json();
            setDeclaraties(mijn.declaraties || []);
            setPrefill(mijn.prefill || {});
            setForm((f) => ({ ...f, iban: mijn.prefill?.iban || '', iban_naam: mijn.prefill?.iban_naam || meJson.name || '' }));
        } catch (e) {
            setFoutmelding('Kon je gegevens niet laden. Probeer het later opnieuw.');
        }
    }, [token]);

    useEffect(() => { laad(); }, [laad]);

    const change = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
    };

    const uploadBon = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setFoutmelding(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API_URL}/api/declaraties/upload`, { method: 'POST', headers: auth(), body: fd });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setForm((f) => ({ ...f, bon_url: json.url }));
        } catch (err) {
            setFoutmelding('Uploaden van de bon mislukte.');
        } finally {
            setUploading(false);
        }
    };

    const verstuur = async (e) => {
        e.preventDefault();
        setFoutmelding(null);
        if (form.soort === 'declaratie' && !form.iban.trim()) {
            setFoutmelding('Vul je IBAN in — daar betalen we de declaratie op uit.');
            return;
        }
        setStatus('submitting');
        try {
            const res = await fetch(`${API_URL}/api/declaraties`, {
                method: 'POST',
                headers: { ...auth(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, bedrag: parseFloat(String(form.bedrag).replace(',', '.')) }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.message || `HTTP ${res.status}`);
            }
            setStatus('success');
            setForm({ ...LEEG, iban: form.iban, iban_naam: form.iban_naam });
            laad();
        } catch (err) {
            setFoutmelding(err.message || 'Versturen mislukte.');
            setStatus('idle');
        }
    };

    // --- Niet ingelogd: loginscherm ---
    if (!token || !me) {
        return (
            <AppShell title="Declaraties & bonnen">
                <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
                    <p className="text-gray-600 mb-6">Stuur je declaraties en bonnen in. Log in met je <strong>@cafetheaterfestival.nl</strong>-account.</p>
                    {authFout && <p className="text-red-600 text-sm mb-4">{authFout}</p>}
                    <button onClick={login} className="w-full py-3 px-6 bg-[#20747F] hover:bg-[#1a5f68] text-white font-semibold rounded-lg transition">
                        Inloggen met Google
                    </button>
                </div>
            </AppShell>
        );
    }

    // --- Ingelogd: formulier + eigen historie ---
    return (
        <AppShell title="Declaraties & bonnen">
            <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center text-white/90 text-sm mb-4">
                    <span>Ingelogd als {me.name}</span>
                    <button onClick={logout} className="underline hover:text-white">Uitloggen</button>
                </div>

                {status === 'success' && (
                    <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-4 text-sm">
                        ✓ Ingediend! Je ziet 'm hieronder terug. De zakelijk directeur beoordeelt 'm.
                    </div>
                )}

                <form onSubmit={verstuur} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Wat wil je insturen?</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setForm((f) => ({ ...f, soort: 'declaratie' }))}
                                className={`py-2 rounded-lg border text-sm font-medium ${form.soort === 'declaratie' ? 'bg-[#20747F] text-white border-[#20747F]' : 'border-gray-300 text-gray-600'}`}>
                                💶 Declaratie (uitbetalen)
                            </button>
                            <button type="button" onClick={() => setForm((f) => ({ ...f, soort: 'bon' }))}
                                className={`py-2 rounded-lg border text-sm font-medium ${form.soort === 'bon' ? 'bg-[#20747F] text-white border-[#20747F]' : 'border-gray-300 text-gray-600'}`}>
                                🧾 Bon (met de pas betaald)
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {form.soort === 'declaratie' ? 'Je hebt zelf betaald en krijgt het bedrag terug op je rekening.' : 'Al betaald met de festivalpas — alleen ter verantwoording.'}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Bedrag (€)" name="bedrag" type="text" inputMode="decimal" placeholder="bijv. 24,50" value={form.bedrag} onChange={change} required />
                        <FormField label="Datum" name="datum" type="date" value={form.datum} onChange={change} />
                    </div>

                    <FormField label="Omschrijving" name="omschrijving" textarea rows={3} placeholder="Waar was het voor? (bijv. materiaal, reiskosten, catering…)" value={form.omschrijving} onChange={change} required />

                    {form.soort === 'declaratie' && (
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="IBAN" name="iban" placeholder="NL00 BANK 0000 0000 00" value={form.iban} onChange={change} required />
                            <FormField label="Naam rekeninghouder" name="iban_naam" value={form.iban_naam} onChange={change} />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bon / factuur {form.soort === 'bon' ? '(verplicht als bewijs)' : '(aanrader)'}</label>
                        <input type="file" accept="image/*,application/pdf" onChange={uploadBon} className="text-sm" />
                        {uploading && <span className="text-xs text-gray-500 ml-2">Uploaden…</span>}
                        {form.bon_url && <span className="text-xs text-green-600 ml-2">✓ toegevoegd</span>}
                    </div>

                    {foutmelding && <p className="text-red-600 text-sm">{foutmelding}</p>}

                    <SubmitButton loading={status === 'submitting'} label="Insturen" loadingLabel="Bezig met insturen…"
                        className="w-full py-3 bg-[#20747F] hover:bg-[#1a5f68] text-white font-semibold rounded-lg transition disabled:opacity-50" />
                </form>

                <h2 className="text-white font-semibold mt-8 mb-3">Jouw declaraties</h2>
                {declaraties.length === 0 ? (
                    <StatusMessage>Je hebt nog niets ingestuurd.</StatusMessage>
                ) : (
                    <div className="space-y-2">
                        {declaraties.map((d) => {
                            const [label, cls] = STATUS_LABEL[d.status] || [d.status, 'text-gray-700 bg-gray-100'];
                            return (
                                <div key={d.id} className="bg-white rounded-lg p-3 flex items-center justify-between shadow">
                                    <div className="min-w-0">
                                        <div className="font-medium text-gray-800 truncate">{euro(d.bedrag)} · {d.soort === 'bon' ? 'bon' : 'declaratie'}</div>
                                        <div className="text-xs text-gray-500 truncate">{fmtDatum(d.datum || d.created_at)} — {d.omschrijving}</div>
                                        {d.status === 'afgewezen' && d.opmerking && <div className="text-xs text-red-600 mt-0.5">Reden: {d.opmerking}</div>}
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ml-3 ${cls}`}>{label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

export default App;
