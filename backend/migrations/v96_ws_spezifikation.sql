-- v96: WS-Spezifikation für Wechselschnitt-Szenen
ALTER TABLE dokument_szenen
  ADD COLUMN IF NOT EXISTS ws_spezifikation TEXT
    CHECK (ws_spezifikation IS NULL OR ws_spezifikation IN ('standard', 'splitscreen', 'telefonat'));
