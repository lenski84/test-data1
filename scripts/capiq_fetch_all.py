"""
Capital IQ Pro — umfassender Datenabruf
Unterstützt beide Methoden: offizielles SDK (SPGMICIQ) und direkte REST-API.

Verwendung:
    python capiq_fetch_all.py --username dein_user --password dein_pw \
        --identifiers "MSFT:NasdaqGS,AAPL:NasdaqGS" \
        --method sdk   # oder: --method rest
"""

import argparse
import json
import time
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import requests


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def save(df: pd.DataFrame, name: str, output_dir: str = "output") -> None:
    """Speichert einen DataFrame als CSV."""
    import os
    os.makedirs(output_dir, exist_ok=True)
    path = f"{output_dir}/{name}.csv"
    df.to_csv(path, index=False)
    print(f"  Gespeichert: {path}  ({len(df)} Zeilen)")


def print_section(title: str) -> None:
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


# ---------------------------------------------------------------------------
# SDK-Methode  (pip install SPGMICIQ)
# ---------------------------------------------------------------------------

class CapIQSDK:
    """Wrapper um das offizielle SPGMICIQ-SDK."""

    def __init__(self, username: str, password: str):
        from spgmi_api_sdk.ciq.services import SDKDataServices
        self.spg = SDKDataServices(username, password)

    def fetch_all(self, identifiers: list[str], output_dir: str = "output") -> dict[str, pd.DataFrame]:
        results: dict[str, pd.DataFrame] = {}
        today = datetime.today().strftime("%m/%d/%Y")
        ids = identifiers  # Kurzform für Lesbarkeit

        datasets = {
            # ── Income Statement ──────────────────────────────────────────
            "income_statement_pit": lambda: self.spg.get_income_statement_pit(
                identifiers=ids,
                properties={"asOfDate": today, "currencyId": "USD"},
            ),
            "income_statement_fy5": lambda: self.spg.get_income_statement_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FY-5", "currencyId": "USD"},
            ),
            "income_statement_fq4": lambda: self.spg.get_income_statement_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FQ-4", "currencyId": "USD"},
            ),

            # ── Balance Sheet ─────────────────────────────────────────────
            "balance_sheet_pit": lambda: self.spg.get_balance_sheet_pit(
                identifiers=ids,
                properties={"asOfDate": today, "currencyId": "USD"},
            ),
            "balance_sheet_fy5": lambda: self.spg.get_balance_sheet_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FY-5", "currencyId": "USD"},
            ),
            "balance_sheet_fq4": lambda: self.spg.get_balance_sheet_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FQ-4", "currencyId": "USD"},
            ),

            # ── Cash Flow ─────────────────────────────────────────────────
            "cash_flow_pit": lambda: self.spg.get_cash_flow_pit(
                identifiers=ids,
                properties={"asOfDate": today, "currencyId": "USD"},
            ),
            "cash_flow_fy5": lambda: self.spg.get_cash_flow_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FY-5", "currencyId": "USD"},
            ),
            "cash_flow_fq4": lambda: self.spg.get_cash_flow_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FQ-4", "currencyId": "USD"},
            ),

            # ── Market Data ───────────────────────────────────────────────
            "market_data": lambda: self.spg.get_market_data(
                identifiers=ids,
                properties={"asOfDate": today},
            ),

            # ── Ratios / KPIs ─────────────────────────────────────────────
            "ratios_pit": lambda: self.spg.get_ratios_pit(
                identifiers=ids,
                properties={"asOfDate": today, "currencyId": "USD"},
            ),
            "ratios_historical": lambda: self.spg.get_ratios_historical(
                identifiers=ids,
                properties={"periodType": "IQ_FY-5", "currencyId": "USD"},
            ),

            # ── Estimates (Konsensus) ─────────────────────────────────────
            "estimates": lambda: self.spg.get_estimates(
                identifiers=ids,
                properties={"periodType": "IQ_FY", "currencyId": "USD"},
            ),

            # ── Segment-Daten ─────────────────────────────────────────────
            "segment_data": lambda: self.spg.get_segment_data(
                identifiers=ids,
                properties={"periodType": "IQ_FY-3", "currencyId": "USD"},
            ),

            # ── People / Management ───────────────────────────────────────
            "people": lambda: self.spg.get_people(identifiers=ids),

            # ── Transactions (M&A) ────────────────────────────────────────
            "transactions": lambda: self.spg.get_transactions(identifiers=ids),

            # ── Capital Structure ─────────────────────────────────────────
            "capital_structure": lambda: self.spg.get_capital_structure(
                identifiers=ids,
                properties={"asOfDate": today},
            ),

            # ── Ownership ─────────────────────────────────────────────────
            "ownership": lambda: self.spg.get_ownership(
                identifiers=ids,
                properties={"asOfDate": today},
            ),
        }

        for name, fn in datasets.items():
            print_section(name)
            try:
                df = fn()
                if df is not None and not df.empty:
                    results[name] = df
                    save(df, name, output_dir)
                    print(df.head(3).to_string())
                else:
                    print("  Keine Daten zurückgegeben.")
            except Exception as exc:
                print(f"  FEHLER: {exc}")

        return results


# ---------------------------------------------------------------------------
# REST-API-Methode (kein SDK nötig)
# ---------------------------------------------------------------------------

BASE_URL = "https://api-ciq.marketintelligence.spglobal.com/api/v1"

# Vollständige Liste der wichtigsten Mnemonics nach Kategorie
MNEMONICS: dict[str, list[str]] = {
    "income_statement": [
        "IQ_TOTAL_REV", "IQ_GROSS_PROFIT", "IQ_EBITDA", "IQ_EBIT",
        "IQ_NET_INC", "IQ_EPS_BASIC", "IQ_EPS_DILUTED", "IQ_DIV_PER_SHR",
        "IQ_SGA", "IQ_RD_EXP", "IQ_DEPN_AMORT", "IQ_INTEREST_EXP",
        "IQ_PRETAX_INC", "IQ_INC_TAX", "IQ_MINORITY_INT",
        "IQ_NET_INC_AVAIL_EXCL", "IQ_NET_INC_AVAIL_INCL",
    ],
    "balance_sheet": [
        "IQ_CASH_EQUIV", "IQ_ST_INVEST", "IQ_TOTAL_CASH_ST",
        "IQ_ACCOUNTS_REC", "IQ_INVENTORY", "IQ_TOTAL_CA",
        "IQ_PP_NET", "IQ_GOODWILL", "IQ_INTANG", "IQ_TOTAL_ASSETS",
        "IQ_ACCOUNTS_PAY", "IQ_ACCRUED_EXP", "IQ_ST_DEBT",
        "IQ_TOTAL_CL", "IQ_LT_DEBT", "IQ_TOTAL_DEBT",
        "IQ_TOTAL_LIABILITIES", "IQ_COMMON_EQUITY", "IQ_TOTAL_EQUITY",
        "IQ_TOTAL_LIAB_AND_EQUITY",
    ],
    "cash_flow": [
        "IQ_NET_INC_CF", "IQ_DA_CF", "IQ_STOCK_BASED_COMP",
        "IQ_CHANGE_WC", "IQ_CF_OPERATIONS",
        "IQ_CAPEX", "IQ_CF_INVESTING",
        "IQ_DIV_PAID", "IQ_STK_REPURCH", "IQ_NET_DEBT_ISSUED",
        "IQ_CF_FINANCING", "IQ_FREE_CASH_FLOW", "IQ_NET_CHANGE_CASH",
    ],
    "market_data": [
        "IQ_CLOSEPRICE", "IQ_MARKETCAP", "IQ_ENTERPRISE_VALUE",
        "IQ_SHARES_OUT", "IQ_52_WK_HIGH", "IQ_52_WK_LOW",
        "IQ_VOLUME", "IQ_AVG_VOLUME_30D", "IQ_BETA",
        "IQ_TOTAL_RETURN_1YR", "IQ_TOTAL_RETURN_3YR",
        "IQ_FLOAT", "IQ_INSIDER_OWN_PCT",
    ],
    "valuation_multiples": [
        "IQ_PE_NTM", "IQ_PE_LTM", "IQ_EV_EBITDA_NTM", "IQ_EV_EBITDA_LTM",
        "IQ_EV_SALES_NTM", "IQ_EV_SALES_LTM", "IQ_EV_EBIT_NTM",
        "IQ_PB_RATIO", "IQ_PS_RATIO", "IQ_PCF_RATIO",
        "IQ_DIV_YIELD", "IQ_FCFF_YIELD",
    ],
    "ratios": [
        "IQ_GROSS_MARGIN", "IQ_EBITDA_MARGIN", "IQ_EBIT_MARGIN",
        "IQ_NET_MARGIN", "IQ_ROE", "IQ_ROA", "IQ_ROIC",
        "IQ_CURRENT_RATIO", "IQ_QUICK_RATIO", "IQ_DEBT_EQUITY",
        "IQ_NET_DEBT_EBITDA", "IQ_INTEREST_COV", "IQ_ASSET_TURNOVER",
        "IQ_INVENTORY_TURNOVER", "IQ_RECEIVABLES_TURNOVER",
    ],
    "estimates": [
        "IQ_EST_EPS", "IQ_EST_REVENUE", "IQ_EST_EBITDA",
        "IQ_EST_EBIT", "IQ_EST_NET_INC", "IQ_EST_DPS",
        "IQ_EST_CAPEX", "IQ_EST_FCF",
        "IQ_EPS_SURPRISE", "IQ_REV_SURPRISE",
    ],
    "credit": [
        "IQ_CREDIT_RATING_SP", "IQ_CREDIT_RATING_MOODYS",
        "IQ_CREDIT_RATING_FITCH", "IQ_NET_DEBT",
        "IQ_DEBT_CAPITAL", "IQ_ALTMAN_Z",
    ],
}


class CapIQREST:
    """Direkter REST-Zugriff auf die Capital IQ Pro API."""

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
        self._authenticate()

    # ── Authentifizierung ────────────────────────────────────────────────

    def _authenticate(self) -> None:
        url = f"{BASE_URL}/token"
        resp = requests.post(
            url,
            json={"username": self.username, "password": self.password},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        self.token = data["access_token"]
        self.token_expiry = datetime.now() + timedelta(seconds=data.get("expires_in", 3600) - 60)
        print("  Token erhalten, gültig bis:", self.token_expiry.strftime("%H:%M:%S"))

    def _ensure_token(self) -> None:
        if not self.token or datetime.now() >= self.token_expiry:
            print("  Token abgelaufen — erneuere …")
            self._authenticate()

    def _headers(self) -> dict:
        self._ensure_token()
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    # ── Roher API-Request ────────────────────────────────────────────────

    def _post(self, endpoint: str, payload: dict, retries: int = 3) -> dict:
        url = f"{BASE_URL}/{endpoint}"
        for attempt in range(retries):
            try:
                resp = requests.post(url, headers=self._headers(), json=payload, timeout=60)
                if resp.status_code == 401:
                    self._authenticate()
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                wait = 2 ** attempt
                print(f"  Fehler (Versuch {attempt+1}): {exc} — warte {wait}s")
                time.sleep(wait)
        raise RuntimeError(f"Alle {retries} Versuche fehlgeschlagen für {endpoint}")

    # ── Daten holen ──────────────────────────────────────────────────────

    def get_gdsp(
        self,
        identifiers: list[str],
        mnemonics: list[str],
        period_type: str = "IQ_FY",
        as_of_date: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        GDSP = Get Data Series Point — universelle Funktion für Fundamentaldaten.
        Liefert einen DataFrame mit Spalten: identifier, mnemonic, period, value.
        """
        inputs = []
        for identifier in identifiers:
            for mnemonic in mnemonics:
                req: dict = {
                    "function": "GDSP",
                    "identifier": identifier,
                    "mnemonic": mnemonic,
                    "properties": {"periodType": period_type, "currencyId": "USD"},
                }
                if as_of_date:
                    req["properties"]["asOfDate"] = as_of_date
                inputs.append(req)

        # API-Limit: max. 100 Requests pro Batch
        all_rows = []
        batch_size = 100
        for i in range(0, len(inputs), batch_size):
            batch = inputs[i : i + batch_size]
            raw = self._post("bulk", {"inputRequests": batch})
            for item in raw.get("GDSSDKResponse", []):
                identifier = item.get("Identifier", "")
                mnemonic = item.get("Mnemonic", "")
                for row in item.get("Rows", []):
                    values = row.get("Row", [])
                    all_rows.append({
                        "identifier": identifier,
                        "mnemonic": mnemonic,
                        "period": values[0] if len(values) > 0 else None,
                        "value": values[1] if len(values) > 1 else None,
                        "currency": values[2] if len(values) > 2 else None,
                    })

        return pd.DataFrame(all_rows)

    def get_historical(
        self,
        identifiers: list[str],
        mnemonics: list[str],
        period_type: str = "IQ_FY-5",
    ) -> pd.DataFrame:
        return self.get_gdsp(identifiers, mnemonics, period_type=period_type)

    def fetch_all(self, identifiers: list[str], output_dir: str = "output") -> dict[str, pd.DataFrame]:
        results: dict[str, pd.DataFrame] = {}
        today = datetime.today().strftime("%m/%d/%Y")

        fetch_configs = [
            # (Name, Kategorie, periodType)
            ("income_statement_fy5", "income_statement", "IQ_FY-5"),
            ("income_statement_fq4", "income_statement", "IQ_FQ-4"),
            ("balance_sheet_fy5", "balance_sheet", "IQ_FY-5"),
            ("balance_sheet_fq4", "balance_sheet", "IQ_FQ-4"),
            ("cash_flow_fy5", "cash_flow", "IQ_FY-5"),
            ("cash_flow_fq4", "cash_flow", "IQ_FQ-4"),
            ("market_data_latest", "market_data", "IQ_NTM"),
            ("valuation_multiples_ltm", "valuation_multiples", "IQ_LTM"),
            ("valuation_multiples_ntm", "valuation_multiples", "IQ_NTM"),
            ("ratios_fy5", "ratios", "IQ_FY-5"),
            ("estimates_fy2", "estimates", "IQ_FY+2"),
            ("credit_latest", "credit", "IQ_LTM"),
        ]

        for name, category, period_type in fetch_configs:
            print_section(f"{name}  [{period_type}]")
            try:
                mnems = MNEMONICS[category]
                df = self.get_historical(identifiers, mnems, period_type=period_type)
                if not df.empty:
                    results[name] = df
                    save(df, name, output_dir)
                    print(df.head(5).to_string())
                else:
                    print("  Keine Daten.")
            except Exception as exc:
                print(f"  FEHLER: {exc}")

        # Snapshot für alle Kategorien zum heutigen Datum
        print_section("snapshot_today (Point-in-Time)")
        all_mnems = [m for ms in MNEMONICS.values() for m in ms]
        try:
            df = self.get_gdsp(identifiers, all_mnems, as_of_date=today)
            if not df.empty:
                results["snapshot_today"] = df
                save(df, "snapshot_today", output_dir)
                print(df.head(10).to_string())
        except Exception as exc:
            print(f"  FEHLER: {exc}")

        return results


# ---------------------------------------------------------------------------
# Einstiegspunkt
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Capital IQ Pro — Daten-Fetcher")
    parser.add_argument("--username", required=True, help="Cap IQ Benutzername")
    parser.add_argument("--password", required=True, help="Cap IQ Passwort")
    parser.add_argument(
        "--identifiers",
        default="MSFT:NasdaqGS,AAPL:NasdaqGS,GOOGL:NasdaqGS",
        help="Komma-getrennte Identifiers (z.B. 'MSFT:NasdaqGS,AAPL:NasdaqGS')",
    )
    parser.add_argument(
        "--method",
        choices=["sdk", "rest"],
        default="rest",
        help="'sdk' = offizielles SPGMICIQ-Paket, 'rest' = direkte API (Standard)",
    )
    parser.add_argument("--output", default="output", help="Ausgabeverzeichnis für CSVs")
    args = parser.parse_args()

    identifiers = [i.strip() for i in args.identifiers.split(",")]
    print(f"\nIdentifiers: {identifiers}")
    print(f"Methode:     {args.method}")
    print(f"Ausgabe:     {args.output}/\n")

    if args.method == "sdk":
        client = CapIQSDK(args.username, args.password)
    else:
        client = CapIQREST(args.username, args.password)

    results = client.fetch_all(identifiers, output_dir=args.output)

    print(f"\n{'='*60}")
    print(f"Fertig. {len(results)} Datensätze gespeichert in '{args.output}/'")

    # Zusammenfassung
    summary = pd.DataFrame(
        [(k, len(v)) for k, v in results.items()],
        columns=["Dataset", "Zeilen"],
    )
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
