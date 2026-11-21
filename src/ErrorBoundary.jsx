import React from 'react';

/**
 * Vangt een crash in de React-boom op (audit FRM-20).
 *
 * Zonder dit vervangt React de hele pagina door niets: de bezoeker houdt een
 * wit scherm over en weet niet of het aan hem ligt. Nu staat er een nette
 * melding in het Nederlands en het Engels, met een knop om te herladen.
 *
 * Twee dingen die hij verder doet:
 *
 * - **Een verouderd tabblad herlaadt één keer.** Na een uitrol krijgen de
 *   bundels een nieuwe hash; een tabblad dat al openstond vraagt dan om een
 *   bestand dat niet meer bestaat. Dat moet een herlaadbeurt worden, geen
 *   foutscherm. Komt de fout binnen dertig seconden terug, dan lost herladen
 *   het niet op en blijft het scherm staan -- anders wordt het een lus.
 *   De bewoordingen zijn dezelfde als in `src/utils/chunkFout.js` van ctfcrm;
 *   wissel je van bundelaar, kijk dan daar én hier.
 * - **Hij meldt de fout zelf.** Een fout die hier wordt gevangen bereikt de
 *   globale foutmelder in `index.html` niet meer, en dan verdwijnt juist deze
 *   crash uit beeld. Daarom een `ErrorEvent` op `window`: daar luistert die
 *   melder al naar. Bewust niet via `window.ctfMeldFout` zoals ctfopencall:
 *   dat vraagt een regel in het inline-script, en dan klopt de sha256 in de
 *   CSP niet meer (deploy/nginx/maak-headers.mjs in ctfbackend) en blokkeert
 *   de browser de hele melder. Zo ging het op 21-11-2026 bij de eerste uitrol.
 *
 * Gelijk aan ctfopencall, behalve dat een gewone fout hier níet vanzelf
 * herlaadt: deze apps slaan niet tussentijds op, dus herladen kan ingevuld
 * werk kosten. Dat beslist de bezoeker zelf met de knop.
 */

const CHUNK_BEWOORDINGEN = [
    /Loading chunk [\w-]+ failed/i,
    /Loading CSS chunk [\w-]+ failed/i,
    /ChunkLoadError/i,
    /Failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /Importing a module script failed/i,
];

const HERLAAD_SLEUTEL = 'ctf_chunk_reload_at';

function isChunkFout(error) {
    if (!error) return false;
    if (error.name === 'ChunkLoadError') return true;
    const tekst = error.message || String(error);

    return CHUNK_BEWOORDINGEN.some((r) => r.test(tekst));
}

function herlaadEenmalig() {
    try {
        const vorige = parseInt(sessionStorage.getItem(HERLAAD_SLEUTEL) || '0', 10);
        const nu = Date.now();
        if (vorige && (nu - vorige) <= 30000) return false;
        sessionStorage.setItem(HERLAAD_SLEUTEL, String(nu));
    } catch {
        // Geen sessionStorage (privémodus): dan maar zonder bewaking.
    }
    window.location.reload();

    return true;
}

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { gecrasht: false };
    }

    static getDerivedStateFromError() {
        return { gecrasht: true };
    }

    componentDidCatch(error) {
        if (isChunkFout(error) && herlaadEenmalig()) return;

        try {
            if (typeof window.ctfMeldFout === 'function') {
                window.ctfMeldFout(String(error && error.message), error && error.stack);
            } else {
                window.dispatchEvent(new ErrorEvent('error', { message: String(error && error.message), error }));
            }
        } catch {
            // Melden mag nooit een tweede crash geven.
        }
    }

    render() {
        if (!this.state.gecrasht) return this.props.children;

        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif', background: '#f7f6fa' }}>
                <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,.12)', padding: 24, maxWidth: 440, textAlign: 'center', color: '#1f2937' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Er ging iets mis op deze pagina</h2>
                    <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 16px' }}>
                        Herlaad de pagina om het opnieuw te proberen. Lukt het niet, mail dan naar info@cafetheaterfestival.nl.
                    </p>
                    <h2 lang="en" style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>Something went wrong on this page</h2>
                    <p lang="en" style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                        Reload the page to try again. If that does not help, email info@cafetheaterfestival.nl.
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{ marginTop: 20, border: 0, borderRadius: 8, background: '#9f4493', color: '#fff', padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                        Pagina herladen · Reload
                    </button>
                </div>
            </div>
        );
    }
}
