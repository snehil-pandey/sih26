# SIH26237 – Decryption Provenance Simulation (local, offline)

**THIS IS A SIMULATION.** Post-quantum algorithms, the forensic watermark and the consensus protocol are simulated; see KNOWN_LIMITATIONS.md. Nothing here is production security.

    node --version            # needs >= 22.13 (uses built-in node:sqlite; there are NO npm dependencies)
    npm start                 # http://127.0.0.1:3000 ; data in ./data (override with SIH_DATA_DIR)
    npm test                  # 45 tests, ~60 s

Demo users (password `demo1234`, or `SIH_DEMO_PASSWORD`): `sender`, `aarav`, `riya`, `kabir`, `nisha`, `forensic`, `admin`. Set `SIH_DEMO_MODE=0` to disable loopback reset and the attack-simulation endpoint. `npm run reset` re-seeds the data directory.

## Demo path
1. `sender` → Documents (Operation Falcon: Aarav, Riya, Kabir authorized).
2. `aarav` → Decrypt; `riya` → Decrypt. Compare the two sessions (Sessions page: different session, watermark, transaction).
3. `nisha` → "Access test" → DOC-0001 → ACCESS DENIED, nothing created.
4. `riya` → Sessions → Simulate leak.
5. `forensic` → Investigations → run on the leak: watermark extracted, ledger searched, key resolved, signature/tx/block/chain/validators verified.
6. `admin` → Validators → apply an attack to one validator → divergence shown; investigation still verifies from the majority and warns; Resync repairs it. Security lab runs 32 checks.

## Layout
`src/pq.js` crypto primitives (all simulated PQ here) · `src/keystore.js` sealing · `src/ledger.js` validators, consensus, tx rules · `src/provenance.js` tx builders + evidence · `src/watermark.js` · `src/app.js` services · `src/http.js` API · `public/` UI · `test/` automated tests.

Docs: ARCHITECTURE.md, SECURITY_MODEL.md, THREAT_MODEL.md, API.md, SECURITY_AUDIT.md, TEST_RESULTS.md, KNOWN_LIMITATIONS.md.
