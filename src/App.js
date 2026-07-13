import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from 'ctf-ui/api';
import { AppShell, FormField, SubmitButton, StatusMessage } from 'ctf-ui/components';

const TOKEN_KEY = 'ctf_declaraties_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const auth = () => ({ Accept: 'application/json', Authorization: `Bearer ${getToken()}` });
const euro = (n) => Number(n || 0).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
const fmtDatum = (d) => d ? new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';

const STATUS_LABEL = {
    ingediend: ['In behandeling', 'text-amber-700 bg-amber-100'],
    goedgekeurd: ['Goedgekeurd', 'text-green-700 bg-green-100'],
    uitbetaald: ['Uitbetaald', 'text-blue-700 bg-blue-100'],
    afgewezen: ['Afgewezen', 'text-red-700 bg-red-100'],
};

const LEEG_FORM = { soort: 'declaratie', datum: '', iban: '', iban_naam: '', straat: '', huisnummer: '', postcode: '', stad: '' };
const LEEG_ITEM = { omschrijving: '', bedrag: '', bon_url: '' };

function App() {
    const [token, setToken] = useState(getToken());
    const [me, setMe] = useState(null);
    const [declaraties, setDeclaraties] = useState([]);
    const [form, setForm] = useState(LEEG_FORM);
    const [items, setItems] = useState([{ ...LEEG_ITEM }]);
    const [status, setStatus] = useState('idle');
    const [uploadIdx, setUploadIdx] = useState(null);
    const [foutmelding, setFoutmelding] = useState(null);
    const [authFout, setAuthFout] = useState(null);

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
            if (!String(meJson.email || '').endsWith('@cafetheaterfestival.nl')) {
                setAuthFout('Log in met je @cafetheaterfestival.nl-account.');
                logout();
                return;
            }
            setMe(meJson);
            const mijn = await mijnRes.json();
            setDeclaraties(mijn.declaraties || []);
            const p = mijn.prefill || {};
            setForm((f) => ({
                ...f,
                iban: p.iban || '', iban_naam: p.iban_naam || meJson.name || '',
                straat: p.straat || '', huisnummer: p.huisnummer || '', postcode: p.postcode || '', stad: p.stad || '',
            }));
        } catch (e) {
            setFoutmelding('Kon je gegevens niet laden. Probeer het later opnieuw.');
        }
    }, [token]);

    useEffect(() => { laad(); }, [laad]);

    const change = (e) => {
        const { name, value } = e.target;
        setForm((f) => ({ ...f, [name]: value }));
    };
    const zetItem = (i, patch) => setItems((arr) => arr.map((it, j) => j === i ? { ...it, ...patch } : it));
    const voegItemToe = () => setItems((arr) => [...arr, { ...LEEG_ITEM }]);
    const verwijderItem = (i) => setItems((arr) => arr.length === 1 ? arr : arr.filter((_, j) => j !== i));

    const verwijder = async (id) => {
        if (!window.confirm('Deze inzending verwijderen? Dat kan alleen zolang die nog niet is beoordeeld.')) return;
        setFoutmelding(null);
        try {
            const res = await fetch(`${API_URL}/api/declaraties/mine/${id}`, { method: 'DELETE', headers: auth() });
            if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `HTTP ${res.status}`); }
            laad();
        } catch (err) { setFoutmelding(err.message || 'Verwijderen mislukte.'); }
    };

    const uploadBon = async (i, file) => {
        if (!file) return;
        setUploadIdx(i);
        setFoutmelding(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`${API_URL}/api/declaraties/upload`, { method: 'POST', headers: auth(), body: fd });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            zetItem(i, { bon_url: json.url });
        } catch (err) {
            setFoutmelding('Uploaden van de bon mislukte.');
        } finally {
            setUploadIdx(null);
        }
    };

    const totaal = items.reduce((s, it) => s + (parseFloat(String(it.bedrag).replace(',', '.')) || 0), 0);

    const verstuur = async (e) => {
        e.preventDefault();
        setFoutmelding(null);
        if (form.soort === 'declaratie' && !form.iban.trim()) {
            setFoutmelding('Vul je IBAN in — daar betalen we de declaratie op uit.');
            return;
        }
        if (items.some((it) => !it.omschrijving.trim() || !it.bedrag)) {
            setFoutmelding('Elke post heeft een omschrijving en bedrag nodig.');
            return;
        }
        if (form.soort === 'bon' && items.some((it) => !it.bon_url)) {
            setFoutmelding('Voeg bij een bon van elke post het bonnetje toe als bewijs.');
            return;
        }
        setStatus('submitting');
        try {
            const body = {
                ...form,
                items: items.map((it) => ({ omschrijving: it.omschrijving, bedrag: parseFloat(String(it.bedrag).replace(',', '.')), bon_url: it.bon_url || null })),
            };
            const res = await fetch(`${API_URL}/api/declaraties`, {
                method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.message || `HTTP ${res.status}`);
            }
            setStatus('success');
            setItems([{ ...LEEG_ITEM }]);
            laad();
        } catch (err) {
            setFoutmelding(err.message || 'Versturen mislukte.');
            setStatus('idle');
        }
    };

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

                    {/* Posten */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Posten</label>
                        {items.map((it, i) => (
                            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
                                {items.length > 1 && (
                                    <button type="button" onClick={() => verwijderItem(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-600 text-sm">✕</button>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <FormField label="Omschrijving" name={`oms_${i}`} placeholder="Waarvoor? (materiaal, reiskosten…)" value={it.omschrijving} onChange={(e) => zetItem(i, { omschrijving: e.target.value })} required />
                                    </div>
                                    <FormField label="Bedrag (€)" name={`bedrag_${i}`} type="text" inputMode="decimal" placeholder="24,50" value={it.bedrag} onChange={(e) => zetItem(i, { bedrag: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Bon / factuur {form.soort === 'bon' ? '(verplicht)' : '(aanrader)'}</label>
                                    <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadBon(i, e.target.files?.[0])} className="text-sm" />
                                    {uploadIdx === i && <span className="text-xs text-gray-500 ml-2">Uploaden…</span>}
                                    {it.bon_url && <span className="text-xs text-green-600 ml-2">✓ toegevoegd</span>}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center justify-between">
                            <button type="button" onClick={voegItemToe} className="text-sm text-[#20747F] font-medium hover:underline">+ Nog een post toevoegen</button>
                            <span className="text-sm text-gray-600">Totaal: <strong>{euro(totaal)}</strong></span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Datum" name="datum" type="date" value={form.datum} onChange={change} />
                    </div>

                    {/* Adres */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Jouw adres</label>
                        <p className="text-xs text-gray-400 mb-2">Voor op het declaratieformulier. Staat het al bij je contactgegevens, dan is het vast ingevuld.</p>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2"><FormField label="Straat" name="straat" placeholder="Straatnaam" value={form.straat} onChange={change} /></div>
                            <FormField label="Huisnr." name="huisnummer" placeholder="12A" value={form.huisnummer} onChange={change} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-2">
                            <FormField label="Postcode" name="postcode" placeholder="1234 AB" value={form.postcode} onChange={change} />
                            <div className="col-span-2"><FormField label="Stad" name="stad" placeholder="Woonplaats" value={form.stad} onChange={change} /></div>
                        </div>
                    </div>

                    {form.soort === 'declaratie' && (
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="IBAN" name="iban" placeholder="NL00 BANK 0000 0000 00" value={form.iban} onChange={change} required />
                            <FormField label="Naam rekeninghouder" name="iban_naam" value={form.iban_naam} onChange={change} />
                        </div>
                    )}

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
                            const aantalPosten = (d.items || []).length;
                            return (
                                <div key={d.id} className="bg-white rounded-lg p-3 flex items-center justify-between shadow">
                                    <div className="min-w-0">
                                        <div className="font-medium text-gray-800 truncate">{euro(d.bedrag)} · {d.soort === 'bon' ? 'bon' : 'declaratie'}{aantalPosten > 1 ? ` · ${aantalPosten} posten` : ''}</div>
                                        <div className="text-xs text-gray-500 truncate">{fmtDatum(d.datum || d.created_at)} — {d.omschrijving}</div>
                                        {d.status === 'afgewezen' && d.opmerking && <div className="text-xs text-red-600 mt-0.5">Reden: {d.opmerking}</div>}
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
                                        {d.status === 'ingediend' && (
                                            <button onClick={() => verwijder(d.id)} title="Verwijderen" className="text-gray-300 hover:text-red-600 text-sm">🗑</button>
                                        )}
                                    </div>
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
